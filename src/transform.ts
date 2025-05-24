import pLimit from "p-limit";
import * as cheerio from "cheerio";
import path from "path";
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

function cleanEssayHTML($: cheerio.CheerioAPI): string {
  return $.html();
}

// -------------
// main

async function main() {
  const index = await loadArticleIndex();
  const with$ = await Promise.all(
    index.map(async (entry) => {
      const $ = await loadHTML(entry.url);
      return {
        ...entry,
        $,
      };
    })
  );
}

await main();
