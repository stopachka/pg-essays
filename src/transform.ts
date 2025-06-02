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
const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const limit = pLimit(5);

async function prepareEntry(entry: IndexEntry): Promise<void> {
  const htmlText = await fetchHTMLText(entry);
  const $ = cheerio.load(htmlText);
  $("script").remove();

  const mdFile = Bun.file(
    path.join(import.meta.dir, "..", "prep", keyFn(entry), `${keyFn(entry)}.md`)
  );
  if (await mdFile.exists()) {
    console.log(`[llm] ${entry.title}: already done`);
    return;
  }

  console.log(`[llm] ${entry.title}: from network`);
  const res = await limit(async () => {
    return await ant.messages.create({
      system: `
You are an expert with HTML and Markdown. You are an assistant that is going to help create a book from Paul Graham's essays. 

I am going to give you the actual HTML of one of Paul Graham's essays. "

**Your goal is to return the markdown version of this essay.**

**IMPORTANT: Be _exact_: use the exact same text as in the essay.** 

Here are some of the things you can _ignore_: 
- At the beginning of the hmtl, sometimes you'll see an advertisement link: like to check out Hacker news, or to apply to YC. Don't include that in the markdown. 
- At the end of the html, sometimes you'll see advertisements (to check out book), or related links, or translation links. Do not include those in the markdown. 

**How to handle footnotes:**
- Keep track of footnotes. You can use the [^1] syntax for footnotes. 

**Spacing** 
- Paul Graham sometimes adds spaces between text lines. Don't do that in markdown. Keep the paragaraphs together. 

At the end, sometimes PG has a section he specifically calls "Notes". Don't include the "Notes" subtitle. Just include the footnotes. 

**Links** 
- If the essay contains a link to a page on paulgraham.com, make it an actual full paulgraham.com link. 

**General structure**

The general structure should look like: 

# Title 

_Date_ 

Content

Thanks note

Footnotes

Return _just_ the markdown. Nothing else. 

`.trim(),
      messages: [
        {
          role: "user",
          content: htmlText,
        },
      ],
      model: "claude-4-sonnet-20250514",
      max_tokens: 10000,
    });
  });
  const msg = res.content[res.content.length - 1];
  if (msg.type !== "text") {
    throw new Error("Unexpected message type");
  }
  const text = msg.text;
  await Bun.write(mdFile, text);
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
