import * as cheerio from "cheerio";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";

// ---------
// Config

const PG_URL = "https://paulgraham.com";

// ----------
// Articles

const ARTICLES_URL = `${PG_URL}/articles.html`;

const ignoredPosts = new Set([
  "https://paulgraham.com/prop62.html", 
  "https://paulgraham.com/nft.html",
  "https://paulgraham.com/foundervisa.html",
]);

type IndexEntry = { url: string; title: string; n: number };

async function loadArticleIndex(): Promise<IndexEntry[]> {
  const file = Bun.file(
    path.join(import.meta.dir, "..", "prep", "articles.json")
  );
  if (await file.exists()) {
    console.log("[articles] from disk");
    return JSON.parse(await file.text());
  }
  console.log("[articles] from network");

  const res = await fetch(ARTICLES_URL);
  const text = await res.text();

  const $ = cheerio.load(text);

  const entries = $("table:nth-of-type(2)")
    .find("a")
    .toArray()
    .reverse()
    .map((node, idx) => {
      const href = node.attribs?.href;
      if (!href) return;
      if (href.includes("http")) return;
      const fullURL = `${PG_URL}/${href}`;
      const title = $(node).text();
      return { url: fullURL, title, n: idx };
    })
    .filter((x: IndexEntry | undefined) => !!x)
    .filter((x) => !ignoredPosts.has(x.url));

  await Bun.write(file, JSON.stringify(entries, null, 2), { createPath: true });
  return entries;
}

// -------------
// processEntry

const keyFn = (entry: IndexEntry) => {
  const paddedIdx = entry.n.toString().padStart(3, "0");
  return `${paddedIdx}_${entry.title.replace(/[^a-zA-Z0-9]/g, "_")}`;
};

async function fetchHTMLText(entry: IndexEntry): Promise<string> {
  const key = keyFn(entry);
  const file = Bun.file(
    path.join(import.meta.dir, "..", "prep", key, `${key}.html`)
  );
  if (await file.exists()) {
    console.log(`[html] ${entry.title}: from disk`);
    return await file.text();
  }
  console.log(`[html] ${entry.title}: from network`);

  const res = await fetch(entry.url);
  const text = await res.text();

  await Bun.write(file, text, { createPath: true });
  return text;
}

async function prepareEntry(entry: IndexEntry): Promise<void> {
  const htmlText = await fetchHTMLText(entry);
  const $ = cheerio.load(htmlText);
  
  const mdFile = Bun.file(
    path.join(import.meta.dir, "..", "prep", keyFn(entry), `${keyFn(entry)}.md`)
  );
  if (await mdFile.exists()) {
    console.log(`[llm] ${entry.title}: already done`);
    return;
  })
  const plain = $("body").text();

  const key = keyFn(entry);

  console.log(`[txt] ${entry.title}: from network`);
  await Bun.write(file, plain);
}

// -------------
// main

async function main() {
  const index = await loadArticleIndex();
  await Promise.all(
    index.slice(0, 1).map(async (entry, idx) => {
      return prepareEntry(entry);
    })
  );
}

await main();
