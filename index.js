import _ from "lodash";
import cheerio from "cheerio";
import fs from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import puppeteer from "puppeteer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ------------------------------------------------------------
// Config

const BOOK_TITLE = "Essays by Paul Graham";
const ROOT_PATH = "http://www.paulgraham.com";
const ARTICLES_INDEX = `${ROOT_PATH}/articles.html`;
const BOOK_DIR = `${__dirname}/book`;
const JSON_FILENAME = "loaded-links.json";
const HTML_FILENAME = "index.html";
const NCX_FILENAME = "toc.ncx";
const OPF_FILENAME = "index.opf";
const MOBI_FILENAME = "index.mobi";
const TOC_ID = "toc";
const PAGE_BREAK = '<div style="page-break-before: always;"></div>';
const GEN_DIR = `${BOOK_DIR}/gen`;
const PDF_FILENAME = "index.pdf";
const COVER_FILENAME = "cover.jpg";

// ------------------------------------------------------------
// Helpers

async function loadHTMLText(url) {
  const res = await fetch(url);
  const text = await res.text();
  return text;
}

function chapterId(link) {
  return _.first(_.last(link.split("/")).split("."));
}

function chapterTitle(link, $chapter) {
  return $chapter(`#${chapterId(link)}`)
    .first()
    .text();
}

// ------------------------------------------------------------
// Build Chapters

function removeMenu($) {
  // TODO(stopachka) -- best way to remove the first td
  $("td:first-child").toArray()[0].children = [];
  return $;
}

function removeLogo($, link) {
  $('a[href="index.html"]').remove();
  return $;
}

function removeHr($, link) {
  $("hr").remove();
  return $;
}

function removeApplyYC($, link) {
  $('font:contains("Want to start a startup")')
    .last()
    .closest("table")
    .remove();
  return $;
}

function replaceChapterTitle($, link) {
  const $firstImageWithAlt = $("img[alt]").first();
  const title = $firstImageWithAlt.toArray()[0].attribs.alt;
  $firstImageWithAlt
    .parent()
    .prepend(`<h1 id="${chapterId(link)}">${title}</h1>`);
  $firstImageWithAlt.remove();
  return $;
}

function replaceTables($) {
  const toDiv = (tag) =>
    $(tag)
      .toArray()
      .reverse()
      .forEach(function (x) {
        $(x).replaceWith(`<div>${$(x).html()}</div>`);
      });
  ["td", "td", "tbody", "thead", "table"].forEach(toDiv);
  return $;
}

function toChapter(link, $html) {
  return [
    removeMenu,
    removeLogo,
    replaceChapterTitle,
    removeApplyYC,
    removeHr,
    replaceTables,
  ].reduce(($, f) => f($, link), $html);
}

// ------------------------------------------------------------
// Build Mobi

function buildOpf({ title }) {
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

function buildNcx(linksWithChapters) {
  const toNav = ([link, $chapter], idx) => `
    <navPoint id="${chapterId(link)}" playOrder="${2 + idx}">
      <navLabel>
        <text>${chapterTitle(link, $chapter)}</text>
      </navLabel>
      <content src="${HTML_FILENAME}#${chapterId(link)}" />
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
       ${linksWithChapters.map(toNav).join("")}
   </ncx>
  `;
}

function buildToc(linksWithChapters) {
  const toLi = ([link, $chapter], idx) => `
    <li><a href="#${chapterId(link)}">${chapterTitle(link, $chapter)}</a></li>
  `;
  return `
    <div id="${TOC_ID}">
      ${PAGE_BREAK}
      <h1>Table of Contents</h1>
      ${PAGE_BREAK}
      <ul>
        ${linksWithChapters.map(toLi).join("")}
      </ul>
    </div>
  `;
}

function buildHTML(linksWithChapters) {
  const chapters = linksWithChapters
    .map(([_, $chapter]) => $chapter("body").html())
    .join(PAGE_BREAK);

  return `
    <!doctype html>
    <html lang="en">
      <head>
      <meta charset="utf-8" />
      <title>${BOOK_TITLE}</title>
      </head>
      <body>
        ${buildToc(linksWithChapters)}
        ${PAGE_BREAK}
        ${chapters}
        <h1>THE END</h1>
        ${PAGE_BREAK}
      </body>
    </html>
  `;
}

function runKindleGen(opfPath, mobiPath) {
  spawnSync("./kindlegen", [opfPath, "-o", mobiPath, "-verbose"], {
    stdio: "inherit",
    encoding: "utf8",
  });
}

export async function htmlToPdf(htmlPath, pdfPath) {
  console.log(`Building PDF ${pdfPath}`);
  const browser = await puppeteer.launch({
    args: ["--no-sandbox"],
    headless: true,
  });
  const page = await browser.newPage(); // local file URI
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (type === "image") {
      return req.abort();
    }
    req.continue();
  });
  await page.goto(`file://${resolve(htmlPath)}`, {
    waitUntil: "domcontentloaded",
    timeout: 0,
  });
  await page.pdf({
    path: pdfPath,
    width: "6.125in",
    height: "9.25in",
    printBackground: true,
    margin: {
      top: "0.125in",
      bottom: "0.125in",
      left: "0.125in",
      right: "0.125in",
    },
  });
  await browser.close();
}

async function buildBook({ linksWithChapters, subDir, title }) {
  const dir = `${GEN_DIR}/${subDir}`;
  fs.writeFileSync(
    `${dir}/${OPF_FILENAME}`,
    buildOpf({
      title,
    })
  );
  fs.writeFileSync(`${dir}/${NCX_FILENAME}`, buildNcx(linksWithChapters));
  fs.writeFileSync(`${dir}/${HTML_FILENAME}`, buildHTML(linksWithChapters));
  await htmlToPdf(`${dir}/${HTML_FILENAME}`, `${dir}/${PDF_FILENAME}`);
  runKindleGen(`${dir}/${OPF_FILENAME}`, MOBI_FILENAME);
}

// ------------------------------------------------------------
// Get Chapters

function toLinks($) {
  return $("table:nth-of-type(2)")
    .find("a")
    .toArray()
    .map((node) => node.attribs && node.attribs.href)
    .filter((href) => href.indexOf("http") === -1)
    .map((path) => `${ROOT_PATH}/${path}`)
    .reverse(); // earlier first
}

async function loadLinksWithHTML() {
  const jsonPath = `${BOOK_DIR}/gen/${JSON_FILENAME}`;
  const fromDisk = fs.existsSync(jsonPath);

  if (fromDisk) {
    console.log("Loading from disk...");
    console.log(`If you'd like to refetch, delete ${jsonPath}`);
    return JSON.parse(fs.readFileSync(jsonPath));
  }

  console.log("Loading articles index...");
  const articles = await loadHTMLText(ARTICLES_INDEX);
  const $articles = cheerio.load(articles);
  const links = toLinks($articles);
  console.log(`Found ${links.length} articles`);

  const linkAndHTML = await Promise.all(
    links.map(async (link) => {
      console.log(`Loading ${link}`);
      const html = await loadHTMLText(link);
      return [link, html];
    })
  );

  console.log(`Saving to disk...`);

  fs.writeFileSync(jsonPath, JSON.stringify(linkAndHTML, null, 2));

  return linkAndHTML;
}

// ------------------------------------------------------------
// run

const ignoredLinks = new Set(["http://www.paulgraham.com/prop62.html"]);

async function run() {
  const linksWithHTML = await loadLinksWithHTML();
  const linksWithChapters = linksWithHTML
    .filter(([link]) => !ignoredLinks.has(link))
    .map(([link, html]) => [link, toChapter(link, cheerio.load(html))]);
  const listLength = linksWithChapters.length;
  const chunks = _.chunk(linksWithChapters, listLength / 3);
  chunks.forEach((chunk, idx) =>
    buildBook({
      linksWithChapters: chunk,
      title: `Essays by Paul Graham, Part ${idx + 1}`,
      subDir: `pt_${idx + 1}`,
    })
  );
}

await run();
