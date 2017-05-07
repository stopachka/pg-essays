const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');
const cp = require('child_process');

const ROOT_PATH = 'http://www.paulgraham.com';
const ARTICLES_INDEX = `${ROOT_PATH}/articles.html`;

const BOOK_STARTER = `
<!doctype html>
  <html lang="en">
  <head>
  <meta charset="utf-8" />
  <title>Essays by Paul Graham</title>
  </head>
  <body>
  <!-- Your book goes here -->
  </body>
</html>
`;

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

function removeMenu($) {
  // TODO(stopachka) -- best way to remove the first td
  $('td:first-child').toArray()[0].children = [];
  return $;
}

function removeLogo($) {
  $('a[href="index.html"]').remove();
  return $;
}

function removeApplyYC($) {
  $link = $('a[href="http://ycombinator.com/apply.html"]').toArray()[0];
  $link && $link.closest('table').remove();
  return $;
}

function addPageBreak($) {
  $.append('<mbp:pagebreak />');
}

function toChapter($body) {
  return [removeMenu, removeLogo, removeApplyYC, addPageBreak].reduce(
    ($, f) => f($),
    $body
  );
}

function buildChapters($book, html) {
  $book('body').append(html);
  return $book;
}

function run(articlesIndex, bookStarter) {
  fetchHtml(articlesIndex)
    .then(toLinks)
    .then(links =>
      Promise.all(
        links
          .slice(0, 3)
          .map(link => fetchHtml(link).then($html => [link, $html('body')]))
      ))
    .then(linksWithHtml =>
      linksWithHtml
        .map(([link, $body]) => toChapter($body))
        .map($chapter => $chapter('body').html())
        .reduce(buildChapters, cheerio.load(bookStarter)))
    .then(writeChapters)
    .then(buildMobi);
}

// run(ARTICLES_INDEX, BOOK_STARTER);

// ----------------------------------------------------------
// Dev

function buildMobi(pathToHtml, pathToMobi) {
  cp.execSync(`~/kindlegen ${pathToHtml} -verbose -o ${pathToMobi}`);
}

buildMobi(`${__dirname}/chapters.html`, `chapters.mobi`);

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
