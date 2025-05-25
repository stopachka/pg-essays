import pLimit from "p-limit";
import * as cheerio from "cheerio";
import path from "path";
import crypto from "node:crypto";

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

const badImages = new Set(["http://www.virtumundo.com/images/spacer.gif"]);
async function localiseImages($: cheerio.CheerioAPI) {
  const toLocalName = (url: string) => {
    const ext = path.extname(new URL(url).pathname) || ".jpg";
    const key = crypto.createHash("md5").update(url).digest("hex");
    return `${key}${ext}`;
  };

  await Promise.all(
    $("img[src]")
      .toArray()
      .filter((n) => n.attribs.src.includes("http"))
      .map(async (node) => {
        const remote = node.attribs.src;
        if (badImages.has(remote)) {
          console.log(`[asset-cache] remove: ${remote}`);
          $(node).remove();
          return;
        }
        const filename = toLocalName(remote);

        const dest = path.join(
          import.meta.dir,
          "..",
          "cache",
          "assets",
          filename
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

        node.attribs.src = `../assets/${filename}`;
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

const stringifiedTitle = (title: string) => title.replace(/\//g, "_");

async function cleanEssayHTML(
  entry: IndexEntry,
  idx: number,
  $: cheerio.CheerioAPI
) {
  return withCache(
    "cleanedEssayHTML",
    `${idx}_${stringifiedTitle(entry.title)}.html`,
    async () => {
      removeMenu($);
      removeLogo($);
      removeTitleImage($);
      removeApplyYC($);
      removeHr($);
      removeFontTags($);
      replaceTables($);
      removeOuterTags($);
      await localiseImages($);
      return $.html();
    }
  );
}

// -------------
// main

async function main() {
  const index = await loadArticleIndex();
  const with$ = await Promise.all(
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
