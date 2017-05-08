const _ = require('lodash');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const cp = require('child_process');

// ------------------------------------------------------------
// Config

const BOOK_TITLE = 'Essays by Paul Graham';
const ROOT_PATH = 'http://www.paulgraham.com';
const ARTICLES_INDEX = `${ROOT_PATH}/articles.html`;
const BOOK_DIR = 'book';
const COVER_PATH = `cover.jpg`;
const HTML_PATH = `index.html`;
const NCX_PATH = `toc.ncx`;
const OPF_PATH = `index.opf`;
const MOBI_PATH = `pg_essays.mobi`;
const TOC_ID = 'toc';
const PAGE_BREAK = '<div style="page-break-before: always;"></div>';

// ------------------------------------------------------------
// Helpers

function fetchHtml(url) {
  return fetch(url).then(res => res.text()).then(text => cheerio.load(text));
}

function chapterId(link) {
  return _.first(_.last(link.split('/')).split('.'));
}

function chapterTitle(link, $chapter) {
  return $chapter(`#${chapterId(link)}`).first().text();
}

// ------------------------------------------------------------
// Build Chapters

function removeMenu($) {
  // TODO(stopachka) -- best way to remove the first td
  $('td:first-child').toArray()[0].children = [];
  return $;
}

function removeLogo($, link) {
  $('a[href="index.html"]').remove();
  return $;
}

function removeHr($, link) {
  $('hr').remove();
  return $;
}

function removeApplyYC($, link) {
  $link = $('font:contains("Want to start a startup")')
    .last()
    .closest('table')
    .remove();
  return $;
}

function replaceChapterTitle($, link) {
  $firstImageWithAlt = $('img[alt]').first();
  const title = $firstImageWithAlt.toArray()[0].attribs.alt;
  $firstImageWithAlt
    .parent()
    .prepend(`<h1 id="${chapterId(link)}">${title}</h1>`);
  $firstImageWithAlt.remove();
  return $;
}

function replaceTables($) {
  const toDiv = tag => $(tag).toArray().reverse().forEach(function(x) {
    $(x).replaceWith(`<div>${$(x).html()}</div>`);
  });
  ['td', 'td', 'tbody', 'thead', 'table'].forEach(toDiv);
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

function buildOpf() {
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
        <item id="content" media-type="text/x-oeb1-document" href="${HTML_PATH}" />
        <item id="ncx" media-type="application/x-dtbncx+xml" href="${NCX_PATH}" />
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
      <content src="${HTML_PATH}#${chapterId(link)}" />
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
       ${linksWithChapters.map(toNav).join('')}
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
        ${linksWithChapters.map(toLi).join('')}
      </ul>
    </div>
  `;
}

function buildHTML(linksWithChapters) {
  const chapters = linksWithChapters
    .map(([_, $chapter]) => $chapter('body').html())
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

function buildMobi(linksWithChapters) {
  const dir = `${__dirname}/${BOOK_DIR}`;
  fs.writeFileSync(`${dir}/${OPF_PATH}`, buildOpf());
  fs.writeFileSync(`${dir}/${NCX_PATH}`, buildNcx(linksWithChapters));
  fs.writeFileSync(`${dir}/${HTML_PATH}`, buildHTML(linksWithChapters));
  cp.exec(`~/kindlegen ${dir}/${OPF_PATH} -verbose -o ${MOBI_PATH}`);
}

// ------------------------------------------------------------
// Get Chapters

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

// ------------------------------------------------------------
// run

function run() {
  fetchHtml(ARTICLES_INDEX)
    .then(toLinks)
    .then(links =>
      Promise.all(
        links.map(link =>
          fetchHtml(link).then($html => [link, toChapter(link, $html)]))
      ))
    .then(buildMobi)
    .catch(e => console.error('err>', e, e.stack));
}

run();
