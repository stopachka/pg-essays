const _ = require('lodash');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const ROOT_PATH = 'http://www.paulgraham.com';
const ARTICLES_INDEX = `${ROOT_PATH}/articles.html`;

const BOOK_COVER = `
  <html>
    <body>
    </body>
  </html>
`;

function toBlogLinks($) {
  const essaysTable = $('img[alt=Essays]').closest('table').next('table');
  return essaysTable
    .find('a')
    .toArray()
    .map(node => node.attribs.href)
    .filter(href => href.indexOf('http') === -1) // if the link is relative then it's an essay PG wrote on the blog
    .map(path => `${ROOT_PATH}/${path}`);
}

function toLinksWithHtml(links) {
  return Promise.all(
    links.map(link =>
      fetch(link).then(res => res.text()).then(html => [link, html]))
  );
}

fetch(ARTICLES_INDEX)
  .then(res => res.text())
  .then(text => cheerio.load(text))
  .then(toBlogLinks)
  .then(toLinksWithHtml)
  .then(xs => console.log(xs));
