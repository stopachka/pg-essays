const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const cp = require('child_process');

const BOOK_TITLE = 'Essays by Paul Graham';
const ROOT_PATH = 'http://www.paulgraham.com';
const ARTICLES_INDEX = `${ROOT_PATH}/articles.html`;
const BOOK_DIR = 'book';
const COVER_PATH = `cover.jpg`;
const HTML_PATH = `index.html`;
const NCX_PATH = `ncx.xml`;
const OPF_PATH = `opf.xml`;
const TOC_ID = 'toc';

const BOOK_STARTER = `
  <!doctype html>
    <html lang="en">
    <head>
    <meta charset="utf-8" />
    <title>${BOOK_TITLE}</title>
    </head>
    <body>
    </body>
  </html>
`;

const OPF = `
  <?xml version="1.0" encoding="iso-8859-1"?>
  <package unique-identifier="uid" xmlns:opf="http://www.idpf.org/2007/opf" xmlns:asd="http://www.idpf.org/asdfaf">
    <metadata>
      <dc-metadata  xmlns:dc="http://purl.org/metadata/dublin_core" xmlns:oebpackage="http://openebook.org/namespaces/oeb-package/1.0/">
        <dc:Title>${BOOK_TITLE}</dc:Title>
        <dc:Language>en</dc:Language>
        <dc:Creator>Paul Graham</dc:Creator>
        <dc:Copyrights>Paul Graham</dc:Copyrights>
        <dc:Publisher>Stepan Parunashvili</dc:Publisher>
        <x-metadata>
          <EmbeddedCover>${COVER_PATH}</EmbeddedCover>
        </x-metadata>
      </dc-metadata>
    </metadata>
    <manifest>
        <item id="content" media-type="text/x-oeb1-document" href="${HTML_PATH}#${TOC_ID}"></item>
        <item id="ncx" media-type="application/x-dtbncx+xml" href="${NCX_PATH}"/>
    </manifest>
    <spine toc="ncx">
        <itemref idref="content"/>
    </spine>
  </package>
`;

function buildNcx(linksWithChapters) {
  const toNav = ([link, $chapter], idx) => `
    <navPoint id="${chapterId(link)}" playOrder="${2 + idx}">
      <navLabel>
        <text>${chapterTitle(link, $chapter)}</text>
      </navLabel>
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
         <content src="${HTML_PATH}#${TOC_ID}" />
       </navPoint>
       ${linksWithChapters.map(toNav)}
   </ncx>
  `;
}

function fetchHtml(url) {
  return fetch(url).then(res => res.text()).then(text => cheerio.load(text));
}

function toLinks($) {
  return $('img[alt=Essays]')
    .closest('table')
    .next('table')
    .find('a')
    .toArray()
    .map(node => node.attribs.href)
    .filter(href => href.indexOf('http') === -1)
    .map(path => `${ROOT_PATH}/${path}`)
    .reverse(); // earlier first
}

function chapterId(link) {
  return link;
}

function removeMenu(link, $body) {
  // TODO(stopachka) -- best way to remove the first td
  $('td:first-child').toArray()[0].children = [];
  return $;
}

function removeLogo(link, $body) {
  $('a[href="index.html"]').remove();
  return $;
}

function removeApplyYC(link, $body) {
  $link = $('a[href="http://ycombinator.com/apply.html"]').toArray()[0];
  $link && $link.closest('table').remove();
  return $;
}

function addPageBreak(link, $body) {
  $.append('<mbp:pagebreak />');
  return $;
}

function replaceChapterTitle($) {
  $firstImageWithAlt = $('img').toArray().find(x => x.attribs.alt);
  $firstImageWithAlt
    .parent()
    .append(
      `<h1 id={${chapterId($link)}}>${firstImageWithAlt.attribts.alt}</h1>`
    );
  $firstImageWithAlt.remove();
  return $;
}

function toChapter(link, $body) {
  return [
    removeMenu,
    removeLogo,
    removeApplyYC,
    addPageBreak,
    replaceChapterTitle
  ].reduce(($, f) => f(link, $), $body);
}

function chapterTitle(link, $chapter) {
  return $chapter(`#${chapterId($link)}`).toArray()[0].textContent;
}

function buildChapters($book, html) {
  return $book;
}

function buildBook(linksWithChapters) {}

function buildMobi(linksWithChapters) {
  const [ncx, toc, html] = [buildNcx(linksWithBody), buildToc, buildBook(linksWithBody)];
}

function run() {
  fetchHtml(ARTICLES_INDEX)
    .then(toLinks)
    .then(links =>
      Promise.all(
        links
          .slice(0, 3)
          .map(link =>
            fetchHtml(link).then($html => [
              link,
              toChapter(link, $html('body'))
            ]))
      ))
    .then(buildMobi);
}

// ----------------------------------------------------------
// Dev

// cp.execSync(`~/kindlegen ${pathToHtml} -verbose -o ${pathToMobi}`);
// buildMobi(`${__dirname}/chapters.html`, `chapters.mobi`);

function writeChapters($) {
  fs.writeFileSync('chapters.html', $.html());
}
function writeLinks(xs) {
  fs.writeFileSync('links.json', JSON.stringify(xs, null, 2));
}

function readLinks() {
  return JSON.parse(fs.readFileSync('links.json', 'utf-8'));
}
// const linksWithHtml = readLinks();
//
// const bookHTML = linksWithHtml
//   .map(([link, html]) => toChapter(cheerio.load(html)))
//   .map(chapt)
//   .slice(0, 10)
//   .reduce(buildBook, cheerio.load(BOOK_STARTER));
// fs.writeFileSync('book.html', bookHTML.html());
