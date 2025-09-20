import _ from "lodash";
import type { CheerioAPI } from "cheerio";
import { load } from "cheerio";
import fs from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import path, { dirname, resolve } from "path";
import puppeteer from "puppeteer";
import prettier from "prettier";
import limitedFetch from "./limitedFetch";

// ------------------------------------------------------------
// Config

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = dirname(__filename);

const BOOK_TITLE: string = "Essays by Paul Graham";
const ROOT_PATH: string = "http://www.paulgraham.com";
const ARTICLES_INDEX: string = `${ROOT_PATH}/articles.html`;
const BOOK_DIR: string = `${__dirname}/../book`;
const HTML_FILENAME: string = "index.html";
const NCX_FILENAME: string = "toc.ncx";
const OPF_FILENAME: string = "index.opf";
const MOBI_FILENAME: string = "index.mobi";
const TOC_ID: string = "toc";
const PAGE_BREAK: string = '<div style="page-break-before: always;"></div>';
const GEN_DIR: string = `${BOOK_DIR}/gen`;
const ASSETS_DIR: string = `${GEN_DIR}/assets`;
const HTML_CACHE_DIR: string = `${GEN_DIR}/html_cache`;
const PDF_FILENAME: string = "index.pdf";
const COVER_FILENAME: string = "cover.jpg";

// ------------------------------------------------------------
// Types

interface Chapter {
  url: string;
  key: string;
  slug: string;
  $?: CheerioAPI;
}

// ------------------------------------------------------------
// Helpers

async function safeFormat(text: string, key: string, parser: string = "html"): Promise<string> {
  try {
    return await prettier.format(text, { parser });
  } catch (err) {
    console.warn(`Warning: Could not format ${key} with prettier, using original`);
    return text;
  }
}

async function loadHTMLText(url: string, cacheKey: string, skipFormat = false): Promise<string> {
  // Create cache directory if it doesn't exist
  if (!fs.existsSync(HTML_CACHE_DIR)) {
    fs.mkdirSync(HTML_CACHE_DIR, { recursive: true });
  }

  // Use the provided key for the cache filename
  const cachePath = path.join(HTML_CACHE_DIR, `${cacheKey}.html`);

  // Check if cached version exists
  if (fs.existsSync(cachePath)) {
    console.log(`Loading from cache: ${cacheKey} (${url})`);
    return fs.readFileSync(cachePath, "utf-8");
  }

  // Fetch and cache the HTML
  console.log(`Fetching and caching: ${cacheKey} (${url})`);
  const res = await limitedFetch(url);
  const text = await res.text();

  // Format with prettier before saving to cache
  const formatted = skipFormat ? text : await safeFormat(text, cacheKey);
  fs.writeFileSync(cachePath, formatted);

  return formatted;
}

function chapterId(link: string): string | undefined {
  return _.first(_.last(link.split("/"))?.split("."));
}

function chapterTitle(chapter: Chapter): string {
  if (!chapter.$) return "";
  return chapter
    .$(`#${chapterId(chapter.url)}`)
    .first()
    .text();
}

// ------------------------------------------------------------
// Build Chapters

function removeMenu($: CheerioAPI): CheerioAPI {
  // TODO(stopachka) -- best way to remove the first td
  const firstTd = $("td:first-child").toArray()[0];
  if (firstTd) {
    (firstTd as any).children = [];
  }
  return $;
}

function removeLogo($: CheerioAPI, link: string): CheerioAPI {
  $('a[href="index.html"]').remove();
  return $;
}

function removeHr($: CheerioAPI, link: string): CheerioAPI {
  $("hr").remove();
  return $;
}

function removeApplyYC($: CheerioAPI, link: string): CheerioAPI {
  $('font:contains("Want to start a startup")').last().closest("table").remove();
  return $;
}

function replaceChapterTitle($: CheerioAPI, link: string): CheerioAPI {
  const $firstImageWithAlt = $("img[alt]").first();
  const firstImg = $firstImageWithAlt.toArray()[0];
  if (firstImg && "attribs" in firstImg) {
    const title = (firstImg as any).attribs.alt;
    $firstImageWithAlt.parent().prepend(`<h1 id="${chapterId(link)}">${title}</h1>`);
    $firstImageWithAlt.remove();
  }
  return $;
}

function replaceTables($: CheerioAPI): CheerioAPI {
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

const badImages = new Set<string>(["http://www.virtumundo.com/images/spacer.gif"]);

async function localiseImages($: CheerioAPI): Promise<CheerioAPI> {
  const toLocalName = (input: string): string => {
    const url = new URL(input);
    const res = url.hostname.split(".").join("_") + url.pathname.split("/").join("_");
    if (!res) {
      throw new Error("oi");
    }
    return res;
  };

  await Promise.all(
    $("img[src]")
      .toArray()
      .filter((n: any) => n.attribs?.src && /^https?:/.test(n.attribs.src))
      .map(async (node: any) => {
        const remote = node.attribs.src;
        if (badImages.has(remote)) {
          console.log(`Removing ${remote}`);
          $(node).remove();
          return;
        }
        // Create cache directory if it doesn't exist
        if (!fs.existsSync(ASSETS_DIR)) {
          fs.mkdirSync(ASSETS_DIR, { recursive: true });
        }

        const filename = toLocalName(remote);
        const dest = path.join(ASSETS_DIR, filename);

        if (!fs.existsSync(dest)) {
          const res = await limitedFetch(remote);
          const buf = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(dest, buf);
        }

        node.attribs.src = `${ASSETS_DIR}/${filename}`;
      }),
  );

  return $;
}

function removeFontTags($: CheerioAPI): CheerioAPI {
  $("font").each((_, el) => {
    $(el).replaceWith($(el).html() || "");
  });
  return $;
}

function removeOnLispDownload($: CheerioAPI): CheerioAPI {
  const bodyHtml = $("body").html();
  if (bodyHtml) {
    const cleaned = bodyHtml.replace(
      /<b>New:<\/b>\s*<a href="onlisptext\.html">Download On Lisp for Free<\/a>\.\s*(<br\s*\/?>)*/g,
      "",
    );
    $("body").html(cleaned);
  }

  return $;
}

function removeEndLinks($: CheerioAPI): CheerioAPI {
  // Find and remove sections containing these specific end-of-essay links
  const endLinkPatterns = [
    "More Technical Details",
    "Translation",
    "Orbitz Uses Lisp",
    "How To Become A Hacker",
    "A Scheme Story",
    "Hackers & Painters",
  ];

  // Find all links matching these patterns
  endLinkPatterns.forEach((pattern) => {
    $(`a:contains("${pattern}")`).each((_, el) => {
      const $link = $(el);
      // Navigate up to find the containing div structure
      let $parent = $link.parent();

      // Keep going up if parent is just a simple div wrapper
      while ($parent.is("div") && $parent.children().length <= 3) {
        const $grandparent = $parent.parent();
        if ($grandparent.is("div")) {
          $parent = $grandparent;
        } else {
          break;
        }
      }

      // Remove the entire containing structure
      $parent.remove();
    });
  });

  // Also remove centered serious-2.gif images and their containers
  $('img[src*="serious-2.gif"]').each((_, el) => {
    const $img = $(el);
    // These are typically in center tags within divs
    const $center = $img.closest("center");
    if ($center.length) {
      const $div = $center.parent();
      if ($div.is("div")) {
        $div.remove();
      }
    }
  });

  // Remove the "You'll find this essay" promotional section
  $('font:contains("You\'ll find this essay")').each((_, el) => {
    const $font = $(el);
    const $container = $font.closest("div");
    if ($container.length) {
      // Also remove surrounding br tags and parent divs
      let $parent = $container.parent();
      while ($parent.is("div") && $parent.children().length <= 3) {
        const $grandparent = $parent.parent();
        if ($grandparent.is("div")) {
          $parent = $grandparent;
        } else {
          break;
        }
      }
      $parent.remove();
    }
  });

  // Clean up spacer images only if they appear after we've removed end links
  // This is more conservative - only removes isolated spacers in empty divs
  // that come after the last paragraph of actual content
  const $lastParagraph = $("p").last();
  if ($lastParagraph.length) {
    $lastParagraph.nextAll("div").each((_, el) => {
      const $div = $(el);
      // Only remove divs that contain just a spacer image and nothing else
      if ($div.children().length === 1 && $div.find('img[src*="trans_1x1.gif"]').length === 1) {
        $div.remove();
      }
    });
  }

  return $;
}

async function replaceBBNTalk($: CheerioAPI, chapter: Chapter): Promise<CheerioAPI> {
  const bbnLink = $('a:contains("BBN Talk Excerpts (ASCII)")').first();

  const href = bbnLink.attr("href");
  if (!href) return $;

  const bbnKey = `${chapter.key}_bbn_talk`;
  const content = await loadHTMLText(href, bbnKey, true);
  const newHTML = `<div>${content}</div>`;

  return load(newHTML);
}

async function processChapter(chapter: Chapter, $html: CheerioAPI): Promise<CheerioAPI> {
  // Check for BBN Talk content first and replace if found
  const replacedHtml = await replaceBBNTalk($html, chapter);

  const ch$ = [
    removeMenu,
    removeLogo,
    replaceChapterTitle,
    removeApplyYC,
    removeHr,
    removeFontTags,
    removeOnLispDownload,
    replaceTables,
    removeEndLinks,
  ].reduce(($, f) => f($, chapter.url), replacedHtml);
  const $ = await localiseImages(ch$);
  const changed = $.html();
  const savedKey = chapter.key + "_transformed.html";
  fs.writeFileSync(HTML_CACHE_DIR + "/" + savedKey, await safeFormat(changed, savedKey));
  return $;
}

// ------------------------------------------------------------
// Build Mobi

function buildOpf({ title }: { title: string }): string {
  return `
    <?xml version="1.0" encoding="iso-8859-1"?>
    <package
      unique-identifier="uid"
      xmlns:opf="http://www.idpf.org/2007/opf"
      xmlns:asd="http://www.idpf.org/asdfaf"
    >
      <metadata>
        <dc-metadata
          xmlns:dc="http://purl.org/metadata/dublin_core"
          xmlns:oebpackage="http://openebook.org/namespaces/oeb-package/1.0/"
        >
          <dc:Title>${title}</dc:Title>
          <dc:Language>en</dc:Language>
          <dc:Creator>Paul Graham</dc:Creator>
          <dc:Copyrights>Paul Graham</dc:Copyrights>
          <dc:Publisher>Stepan Parunashvili</dc:Publisher>
          <x-metadata>
            <EmbeddedCover>${COVER_FILENAME}</EmbeddedCover>
          </x-metadata>
        </dc-metadata>
      </metadata>
      <manifest>
        <item id="content" media-type="text/x-oeb1-document" href="${HTML_FILENAME}" />
        <item id="ncx" media-type="application/x-dtbncx+xml" href="${NCX_FILENAME}" />
      </manifest>
      <spine toc="ncx"><itemref idref="content"/></spine>
    </package>
  `;
}

function buildNcx(chapters: Chapter[]): string {
  const toNav = (chapter: Chapter, idx: number) => `
    <navPoint id="${chapterId(chapter.url)}" playOrder="${2 + idx}">
      <navLabel>
        <text>${chapterTitle(chapter)}</text>
      </navLabel>
      <content src="${HTML_FILENAME}#${chapterId(chapter.url)}" />
    </navPoint>
  `;
  return `
    <?xml version="1.0"?>
    <!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN"
      "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
    <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
    <head>
    </head>
     <docTitle>
       <text>${BOOK_TITLE}</text>
     </docTitle>
     <navMap>
       <navPoint id="${TOC_ID}" playOrder="1">
         <navLabel><text>Table of Contents</text></navLabel>
         <content src="${HTML_FILENAME}#${TOC_ID}" />
       </navPoint>
       ${chapters.map(toNav).join("")}
   </ncx>
  `;
}

function buildToc(chapters: Chapter[]): string {
  const toLi = (chapter: Chapter) => `
    <li><a href="#${chapterId(chapter.url)}">${chapterTitle(chapter)}</a></li>
  `;
  return `
    <div id="${TOC_ID}">
      ${PAGE_BREAK}
      <h1>Table of Contents</h1>
      ${PAGE_BREAK}
      <ul>
        ${chapters.map(toLi).join("")}
      </ul>
    </div>
  `;
}

function buildHTML(chapters: Chapter[]): string {
  const chapterContents = chapters
    .map((chapter) => (chapter.$ ? chapter.$("body").html() : ""))
    .join(PAGE_BREAK);

  return `
    <!doctype html>
    <html lang="en">
      <head>
      <meta charset="utf-8" />
      <title>${BOOK_TITLE}</title>
      <style>
      body {
        font-family: "Baskerville", "Baskerville Old Face", "Hoefler Text", Garamond, "Times New Roman", serif;
      }
      </style>
      </head>
      <body>
        ${buildToc(chapters)}
        ${PAGE_BREAK}
        ${chapterContents}
        <h1>THE END</h1>
        ${PAGE_BREAK}
      </body>
    </html>
  `;
}

function runKindleGen(opfPath: string, mobiPath: string): void {
  spawnSync("./kindlegen", [opfPath, "-o", mobiPath, "-verbose"], {
    stdio: "inherit",
    encoding: "utf8",
  });
}

export async function htmlToPdf(htmlPath: string, pdfPath: string): Promise<void> {
  console.log(`Building PDF ${pdfPath}`);
  const widthIn = 6 + 0.125 * 2;
  const heightIn = 9 + 0.125 * 2;
  const browser = await puppeteer.launch({
    args: ["--no-sandbox"],
    headless: true,
  });
  const page = await browser.newPage();
  await page.goto(`file://${resolve(htmlPath)}`, {
    waitUntil: "domcontentloaded",
    timeout: 0,
  });
  await page.pdf({
    path: pdfPath,
    width: `${widthIn}in`,
    height: `${heightIn}in`,
    printBackground: true,
    margin: {
      top: "0.7in",
      bottom: "0.7in",
      left: "0.7in",
      right: "0.7in",
    },
  });
  await browser.close();
}

interface BuildBookParams {
  chapters: Chapter[];
  subDir: string;
  title: string;
}

async function buildBook({ chapters, subDir, title }: BuildBookParams): Promise<void> {
  const dir = `${GEN_DIR}/${subDir}`;
  fs.writeFileSync(
    `${dir}/${OPF_FILENAME}`,
    buildOpf({
      title,
    }),
  );
  fs.writeFileSync(`${dir}/${NCX_FILENAME}`, buildNcx(chapters));
  const htmlContent = buildHTML(chapters);
  const formattedHtml = await safeFormat(htmlContent, `${subDir}/${HTML_FILENAME}`);
  fs.writeFileSync(`${dir}/${HTML_FILENAME}`, formattedHtml);
  await htmlToPdf(`${dir}/${HTML_FILENAME}`, `${dir}/${PDF_FILENAME}`);
  runKindleGen(`${dir}/${OPF_FILENAME}`, MOBI_FILENAME);
}

// ------------------------------------------------------------
// Get Chapters

function toLinks($: CheerioAPI): string[] {
  return $("table:nth-of-type(2)")
    .find("a")
    .toArray()
    .map((node: any) => node.attribs && node.attribs.href)
    .filter((href): href is string => href && href.indexOf("http") === -1)
    .map((path) => `${ROOT_PATH}/${path}`)
    .reverse(); // earlier first
}

async function loadChapters(): Promise<Chapter[]> {
  console.log("Loading articles index...");
  const articles = await loadHTMLText(ARTICLES_INDEX, "00_articles_index");
  const $articles = load(articles);
  const links = toLinks($articles);
  console.log(`Found ${links.length} articles`);

  return links.map((url, index) => {
    const slug = chapterId(url) || `chapter_${index}`;
    const key = `${String(index + 1).padStart(3, "0")}_${slug}`;
    return {
      url,
      key,
      slug,
    };
  });
}

// ------------------------------------------------------------
// run

const ignoredLinks = new Set<string>(["http://www.paulgraham.com/prop62.html"]);

async function run(): Promise<void> {
  const chapters = await loadChapters();
  const processedChapters = await Promise.all(
    chapters
      .filter((chapter) => !ignoredLinks.has(chapter.url))
      .map(async (chapter): Promise<Chapter> => {
        const html = await loadHTMLText(chapter.url, chapter.key);
        const $ = await processChapter(chapter, load(html));
        return {
          ...chapter,
          $,
        };
      }),
  );

  const pt1 = processedChapters.slice(0, 45);
  const pt2 = processedChapters.slice(45, 95);
  const pt3 = processedChapters.slice(95, 175);
  const pt4 = processedChapters.slice(175);

  [pt1, pt2, pt3, pt4].forEach((chunk, idx) =>
    buildBook({
      chapters: chunk,
      title: `Essays by Paul Graham, Part ${idx + 1}`,
      subDir: `pt_${idx + 1}`,
    }),
  );
}

await run();
