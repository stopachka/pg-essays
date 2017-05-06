const fetch = require('node-fetch');
const cheerio = require('cheerio');
const fs = require('fs');

const ROOT_PATH = 'http://www.paulgraham.com';
const ARTICLES_INDEX = `${ROOT_PATH}/articles.html`;

const BOOK_STARTER = `
  <html>
    <body>
    </body>
  </html>
`;

function fetchHtml(articlesIndex) {
  return fetch(articlesIndex)
    .then(res => res.text())
    .then(text => cheerio.load(text));
}

function toLinks($) {
  return $('img[alt=Essays]')
    .closest('table')
    .next('table')
    .find('a')
    .toArray()
    .map(node => node.attribs.href)
    .filter(href => href.indexOf('http') === -1) // if the link is relative then it's an essay PG wrote on the blog
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

function toChapter($) {
  return [removeMenu, removeLogo].reduce(($, f) => f($), $);
}

function buildBook($book, $chapter) {
  $book('body').append('<hr />').append($chapter('body'));
  return $book;
}

function run(articlesIndex) {
  fetchArticles(articlesIndex)
    .then(toLinks)
    .then(links =>
      Promise.all(
        links.map(link => fetchHtml(link).then(html => [link, html]))
      ))
    .then(linksWithHtml =>
      linksWithHtml
        .map(([link, html]) => toChapter(html))
        .reduce(buildBook, cheerio.load(BOOK_STARTER)));
}

// ----------------------------------------------------------
// Dev

function writeChapters($) {
  fs.writeFileSync('chapters.html', $.html());
}
function writeLinks(xs) {
  fs.writeFileSync('links.json', JSON.stringify(xs, null, 2));
}

function readLinks() {
  return JSON.parse(fs.readFileSync('links.json', 'utf-8'));
}

const linksWithHtml = readLinks();

const bookHTML = linksWithHtml
  .map(([link, html]) => toChapter(cheerio.load(html)))
  .slice(0, 10)
  .reduce(buildBook, cheerio.load(BOOK_STARTER));

fs.writeFileSync('book.html', bookHTML.html());
