const fetch = require('node-fetch');
const cheerio = require('cheerio');

const ROOT_PATH = 'http://www.paulgraham.com';
const ARTICLES_INDEX = `${ROOT_PATH}/articles.html`;

const BOOK_STARTER = `
  <html>
    <body>
    </body>
  </html>
`;

function toLinks($) {
  const essaysTable = $('img[alt=Essays]').closest('table').next('table');
  return essaysTable
    .find('a')
    .toArray()
    .map(node => node.attribs.href)
    .filter(href => href.indexOf('http') === -1) // if the link is relative then it's an essay PG wrote on the blog
    .map(path => `${ROOT_PATH}/${path}`);
}

fetch(ARTICLES_INDEX)
  .then(res => res.text())
  .then(text => cheerio.load(text))
  .then(toLinks)
  .then(links =>
    Promise.all(
      links.map(link =>
        fetch(link).then(res => res.text()).then(html => [link, html]))
    ))
  .then(linksWithHtml =>
    links.reverse().reduce(addChapter, cheerio.load(BOOK_STARTER)));
