import pLimit from "p-limit";
import * as cheerio from "cheerio";
import path from "path";
import crypto from "node:crypto";
import prettier from "prettier";

// ----------------
// Utils

const limit = pLimit(10);
async function limitedFetch(...args: Parameters<typeof fetch>) {
  return await limit(async () => {
    return await fetch(...args);
  });
}

async function withCache(dir: string, key: string, fn: () => Promise<string>) {
  const filePath = path.join(import.meta.dir, "..", "cache", dir, key);
  const file = Bun.file(filePath);
  if (await file.exists()) {
    console.log("[cache] hit", dir, key);
    return await file.text();
  }
  console.log("[cache] miss", dir, key);
  const text = await fn();
  await Bun.write(file, text, { createPath: true });
  return text;
}

const stringifiedURL = (url: string) => url.replace(/\//g, "_");

async function loadHTML(url: string): Promise<cheerio.CheerioAPI> {
  const text = await withCache("html", stringifiedURL(url), async () => {
    const res = await limitedFetch(url);
    const text = await res.text();
    return text;
  });

  return cheerio.load(text);
}

// ----------
// Config

const PG_URL = "https://paulgraham.com";

const ARTICLES_URL = `${PG_URL}/articles.html`;

// ----------
// ArticlesIndex

const ignoredPosts = new Set(["https://paulgraham.com/prop62.html"]);

type IndexEntry = { url: string; title: string };

async function loadArticleIndex(): Promise<IndexEntry[]> {
  const entriesJSON = await withCache("articles", "index.json", async () => {
    const $ = await loadHTML(ARTICLES_URL);

    const entries = $("table:nth-of-type(2)")
      .find("a")
      .map((_, node) => {
        const href = node.attribs?.href;
        if (!href) return;
        if (href.includes("http")) return;
        const fullURL = `${PG_URL}/${href}`;
        const title = $(node).text();
        return { url: fullURL, title };
      })
      .toArray()
      .filter((x: IndexEntry | undefined) => !!x)
      .reverse()
      .filter((x) => !ignoredPosts.has(x.url));

    return JSON.stringify(entries, null, 2);
  });

  return JSON.parse(entriesJSON);
}

// -------------
// cleanEssayHTML

function removeMenu($: cheerio.CheerioAPI) {
  $("td:first-child").toArray()[0].children = [];
}

function removeLogo($: cheerio.CheerioAPI) {
  $('a[href="index.html"]').remove();
}

function removeHr($: cheerio.CheerioAPI) {
  $("hr").remove();
}

function removeApplyYC($: cheerio.CheerioAPI) {
  $('font:contains("Want to start a startup")')
    .last()
    .closest("table")
    .remove();
}

function removeTitleImage($: cheerio.CheerioAPI) {
  const $firstImageWithAlt = $("img[alt]").first();
  $firstImageWithAlt.remove();
}

function replaceTables($: cheerio.CheerioAPI) {
  const toDiv = (tag: string) =>
    $(tag)
      .toArray()
      .reverse()
      .forEach(function (x) {
        $(x).replaceWith(`<div>${$(x).html()}</div>`);
      });
  ["td", "td", "tbody", "thead", "table"].forEach(toDiv);
  return $;
}

function removeFooterLinks($: cheerio.CheerioAPI) {
  $("a:contains('Translation')").remove();
}

const urlToFilename = (url: string) => {
  return new URL(url).pathname.split("/").pop();
};

const ignoredFilenames = new Set([
  "spacer.gif",
  "trans_1x1.gif",
  "serious-2.gif",
  "japanese-translation-1.gif",
  "y18.gif",
  "the-reddits-2.gif",
  "how-to-get-new-ideas-5.gif",
]);

const fontImageToText = {
  "five-questions-about-language-design-18.gif": "Guiding Philosophy",
  "five-questions-about-language-design-22.gif": "Pitfalls and Gotchas",
  "five-questions-about-language-design-19.gif": "Open Problems",
  "five-questions-about-language-design-20.gif": "Little-Known Secrets",
  "five-questions-about-language-design-21.gif":
    "Ideas Whose Time Has Returned",
};

async function localiseImages($: cheerio.CheerioAPI) {
  await Promise.all(
    $("img[src]")
      .toArray()
      .filter((n) => n.attribs.src.includes("http"))
      .map(async (node) => {
        const remote = node.attribs.src;
        const filename = urlToFilename(remote);
        if (!filename) {
          throw new Error(`Unknown filename: ${remote}`);
        }
        if (ignoredFilenames.has(filename)) {
          console.log(`[asset-cache] ignore: ${remote}`);
          $(node).remove();
          return;
        }
        if (filename in fontImageToText) {
          const fontText =
            fontImageToText[filename as keyof typeof fontImageToText];
          console.log(`[asset-cache] font text: ${remote}, ${fontText}`);
          $(node).replaceWith(`<h2>${fontText}</h2>`);
          return;
        }
        const localFilename = `${crypto
          .createHash("md5")
          .update(remote)
          .digest("hex")}_${filename}`;
        const dest = path.join(
          import.meta.dir,
          "..",
          "cache",
          "assets",
          localFilename
        );
        const file = Bun.file(dest);
        const fileExists = await file.exists();
        if (!fileExists) {
          console.log(`[asset-cache] miss: ${remote}`);
          const res = await limitedFetch(remote);
          const buf = Buffer.from(await res.arrayBuffer());
          await Bun.write(file, buf);
        } else {
          console.log(`[asset-cache] hit: ${remote}`);
        }

        node.attribs.src = `../assets/${localFilename}`;
      })
  );
}

function removeFontTags($: cheerio.CheerioAPI) {
  $("font").each((_, el) => {
    const inner = $(el).html();
    $(el).replaceWith(inner || "");
  });
}

function removeOuterTags($: cheerio.CheerioAPI) {
  $("script").remove();
  $("head").remove();
  $("body").replaceWith($("body").html() || "");
  $("html").replaceWith($("html").html() || "");
}

function removeNewOnLispLink($: cheerio.CheerioAPI) {
  $("a[href='onlisptext.html']").each((_, el) => {
    const $el = $(el);
    const prev = $el.prev();
    if (prev.text() === "New:") {
      prev.remove();
    }
    const nextSib = el.nextSibling;
    if (nextSib && nextSib.type === "text" && nextSib.data === ".") {
      $(nextSib).remove();
    }
    $el.remove();
  });
}

async function replaceWithBBNTalk($: cheerio.CheerioAPI) {
  const $a = $("a:contains('BBN Talk Excerpts')").first();
  const url = $a.attr("href");
  if (!url) {
    throw new Error("No URL found for BBN Talk Excerpts");
  }
  const $bbn = await loadHTML(url);
  const txt = $bbn.text();
  const idx = txt.indexOf("(This is an excerpt");
  const bodyTxt = txt
    .slice(idx)
    .split(/\n\s*\n/)
    .filter((txt) => txt)
    .map((txt) => {
      const tag = txt.split(" ").length < 5 ? "h3" : "p";
      return `<${tag}>${txt}</${tag}>`;
    })
    .join("\n");
  $.root().empty().append(bodyTxt);
}

function fixNota($: cheerio.CheerioAPI) {
  $("nota").each((_, e) => {
    $(e).replaceWith($(e).html() || "");
  });
}

const pageSpecificCleanupFns: Record<string, CleanFn[]> = {
  "Programming Bottom-Up": [removeNewOnLispLink],
  "Lisp for Web-Based Applications": [replaceWithBBNTalk],
  "The Founder Visa": [fixNota],
};

type CleanFn =
  | (($: cheerio.CheerioAPI) => void)
  | (($: cheerio.CheerioAPI) => Promise<void>);

const stringifiedTitle = (title: string) => title.replace(/\//g, "_");

async function cleanEssayHTML(
  entry: IndexEntry,
  idx: number,
  $: cheerio.CheerioAPI
) {
  const paddedIdx = idx.toString().padStart(3, "0");

  return withCache(
    "cleanedEssayHTML",
    `${paddedIdx}_${stringifiedTitle(entry.title)}.html`,
    async () => {
      const baseFns: CleanFn[] = [
        removeMenu,
        removeLogo,
        removeTitleImage,
        removeApplyYC,
        removeHr,
        removeFontTags,
        replaceTables,
        removeOuterTags,
        localiseImages,
        removeFooterLinks,
      ];
      const extraFns = pageSpecificCleanupFns[entry.title] || [];
      if (extraFns.length) {
        console.log(
          `[clean] ${entry.title}: extra cleanups: ${extraFns.length}`
        );
      }
      const fns = [...baseFns, ...extraFns];
      for (const fn of fns) {
        await fn($);
      }
      return prettier.format($.html(), {
        parser: "html",
      });
    }
  );
}

// -------------
// main

async function main() {
  const index = await loadArticleIndex();
  await Promise.all(
    index.map(async (entry, idx) => {
      const $ = await loadHTML(entry.url);
      const cleanedHTMLString = await cleanEssayHTML(entry, idx, $);
      return {
        ...entry,
        $,
        cleanedHTMLString,
      };
    })
  );
}

await main();
