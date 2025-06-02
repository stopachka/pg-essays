import * as cheerio from "cheerio";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import pLimit from "p-limit";
import * as diff from "diff";
import TurndownService from "turndown";

// ---------
// Config

const PG_URL = "https://paulgraham.com";
const ARTICLES_URL = `${PG_URL}/articles.html`;

const ignoredPosts = new Set([
  "https://paulgraham.com/prop62.html",
  "https://paulgraham.com/nft.html",
  "https://paulgraham.com/foundervisa.html",
]);

// ---------
// Types

type IndexEntry = { url: string; title: string; n: number };

type ProcessingResult = {
  entry: IndexEntry;
  success: boolean;
  error?: string;
  textDifferences?: TextComparison;
};

type TextComparison = {
  originalLength: number;
  convertedLength: number;
  differences: diff.Change[];
  hasDifferences: boolean;
  similarityScore: number;
};

// ---------
// File Loading Abstraction

interface CacheableResource<T> {
  key: string;
  cachePath: string;
  fetch: () => Promise<T>;
  serialize?: (data: T) => string;
  deserialize?: (text: string) => T;
}

async function loadCachedResource<T>(
  resource: CacheableResource<T>
): Promise<T> {
  const file = Bun.file(resource.cachePath);
  
  if (await file.exists()) {
    console.log(`[cache] ${resource.key}: from disk`);
    const text = await file.text();
    return resource.deserialize ? resource.deserialize(text) : (text as T);
  }
  
  console.log(`[cache] ${resource.key}: from network`);
  const data = await resource.fetch();
  
  const serialized = resource.serialize ? resource.serialize(data) : (data as string);
  await Bun.write(file, serialized, { createPath: true });
  
  return data;
}

// ---------
// Articles Index

async function loadArticleIndex(): Promise<IndexEntry[]> {
  return loadCachedResource<IndexEntry[]>({
    key: "articles",
    cachePath: path.join(import.meta.dir, "..", "prep", "articles.json"),
    fetch: async () => {
      const res = await fetch(ARTICLES_URL);
      const text = await res.text();

      const $ = cheerio.load(text);

      return $("table:nth-of-type(2)")
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
    },
    serialize: (data) => JSON.stringify(data, null, 2),
    deserialize: (text) => JSON.parse(text),
  });
}

// ---------
// Text Processing

function extractPlaintext(html: string): string {
  const $ = cheerio.load(html);
  
  // Remove scripts, styles, and other non-content elements
  $("script, style, noscript, iframe, object, embed").remove();
  
  // Get text content and normalize whitespace
  return $("body").text()
    .replace(/\s+/g, " ")
    .trim();
}

function markdownToPlaintext(markdown: string): string {
  const turndownService = new TurndownService();
  
  // Convert markdown back to HTML then extract text to normalize
  const tempHtml = markdown
    // Remove markdown syntax
    .replace(/#{1,6}\s+/g, "") // Headers
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Bold
    .replace(/\*([^*]+)\*/g, "$1") // Italic
    .replace(/`([^`]+)`/g, "$1") // Inline code
    .replace(/```[\s\S]*?```/g, "") // Code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links
    .replace(/>\s+/g, "") // Blockquotes
    .replace(/^\s*[-*+]\s+/gm, "") // List items
    .replace(/^\s*\d+\.\s+/gm, "") // Numbered lists
    .replace(/\n{2,}/g, "\n") // Multiple newlines
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
    
  return tempHtml;
}

function compareTexts(originalHtml: string, convertedMarkdown: string): TextComparison {
  const originalText = extractPlaintext(originalHtml);
  const convertedText = markdownToPlaintext(convertedMarkdown);
  
  const differences = diff.diffWords(originalText, convertedText);
  const hasDifferences = differences.some(part => part.added || part.removed);
  
  // Calculate similarity score
  const totalLength = Math.max(originalText.length, convertedText.length);
  let matchedLength = 0;
  
  differences.forEach(part => {
    if (!part.added && !part.removed) {
      matchedLength += part.value.length;
    }
  });
  
  const similarityScore = totalLength > 0 ? matchedLength / totalLength : 1;
  
  return {
    originalLength: originalText.length,
    convertedLength: convertedText.length,
    differences,
    hasDifferences,
    similarityScore,
  };
}

// ---------
// Entry Processing

const keyFn = (entry: IndexEntry) => {
  const paddedIdx = entry.n.toString().padStart(3, "0");
  return `${paddedIdx}_${entry.title.replace(/[^a-zA-Z0-9]/g, "_")}`;
};

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const concurrency = parseInt(process.env.PG_CONVERT_CONCURRENCY || "5");
const limit = pLimit(concurrency);

async function processEntry(entry: IndexEntry): Promise<ProcessingResult> {
  try {
    const key = keyFn(entry);
    
    // Load HTML
    const htmlText = await loadCachedResource<string>({
      key: `html-${entry.title}`,
      cachePath: path.join(import.meta.dir, "..", "prep", key, `${key}.html`),
      fetch: async () => {
        const res = await fetch(entry.url);
        return await res.text();
      },
    });

    // Check if markdown already exists
    const mdFile = Bun.file(
      path.join(import.meta.dir, "..", "prep", key, `${key}.md`)
    );
    
    let markdownText: string;
    
    if (await mdFile.exists()) {
      console.log(`[llm] ${entry.title}: already done`);
      markdownText = await mdFile.text();
    } else {
      console.log(`[llm] ${entry.title}: from network`);
      
      // Clean HTML for processing
      const $ = cheerio.load(htmlText);
      $("script").remove();
      
      const res = await limit(async () => {
        return await ant.messages.create({
          system: `
You are an expert with HTML and Markdown. You are an assistant that is going to help create a book from Paul Graham's essays. 

I am going to give you the actual HTML of one of Paul Graham's essays.

**Your goal is to return the markdown version of this essay.**

**IMPORTANT: Be _exact_: use the exact same text as in the essay.** 

Here are some of the things you can _ignore_: 
- At the beginning of the html, sometimes you'll see an advertisement link: like to check out Hacker news, or to apply to YC. Don't include that in the markdown. 
- At the end of the html, sometimes you'll see advertisements (to check out book), or related links, or translation links. Do not include those in the markdown. 

**How to handle footnotes:**
- Keep track of footnotes. You can use the [^1] syntax for footnotes. 

**Spacing** 
- Paul Graham sometimes adds spaces between text lines. Don't do that in markdown. Keep the paragraphs together. 

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
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 8192,
        });
      });
      
      const msg = res.content[res.content.length - 1];
      if (msg.type !== "text") {
        throw new Error("Unexpected message type");
      }
      
      markdownText = msg.text;
      await Bun.write(mdFile, markdownText);
    }

    // Compare texts
    const textComparison = compareTexts(htmlText, markdownText);

    return {
      entry,
      success: true,
      textDifferences: textComparison,
    };
    
  } catch (error) {
    console.error(`[error] ${entry.title}:`, error);
    return {
      entry,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------
// Report Generation

function generateReport(results: ProcessingResult[]): string {
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const withDifferences = successful.filter(r => r.textDifferences?.hasDifferences);
  
  let report = "\n" + "=".repeat(80) + "\n";
  report += "CONVERSION REPORT\n";
  report += "=".repeat(80) + "\n\n";
  
  // Summary
  report += `📊 SUMMARY:\n`;
  report += `   Total entries: ${results.length}\n`;
  report += `   ✅ Successful: ${successful.length}\n`;
  report += `   ❌ Failed: ${failed.length}\n`;
  report += `   ⚠️  With text differences: ${withDifferences.length}\n\n`;
  
  // Failures
  if (failed.length > 0) {
    report += `❌ FAILED CONVERSIONS:\n`;
    report += "-".repeat(40) + "\n";
    failed.forEach(result => {
      report += `• ${result.entry.title}\n`;
      report += `  Error: ${result.error}\n\n`;
    });
  }
  
  // Text differences
  if (withDifferences.length > 0) {
    report += `⚠️  TEXT DIFFERENCES DETECTED:\n`;
    report += "-".repeat(40) + "\n";
    
    withDifferences.forEach(result => {
      const comp = result.textDifferences!;
      report += `📄 ${result.entry.title}\n`;
      report += `   Similarity: ${(comp.similarityScore * 100).toFixed(1)}%\n`;
      report += `   Original length: ${comp.originalLength} chars\n`;
      report += `   Converted length: ${comp.convertedLength} chars\n`;
      
      // Show first few significant differences
      const significantDiffs = comp.differences.filter(d => (d.added || d.removed) && d.value.trim().length > 0);
      if (significantDiffs.length > 0) {
        report += `   Key differences:\n`;
        significantDiffs.slice(0, 3).forEach(diff => {
          if (diff.removed) {
            report += `   🔴 REMOVED: "${diff.value.slice(0, 50)}${diff.value.length > 50 ? '...' : ''}"\n`;
          } else if (diff.added) {
            report += `   🟢 ADDED: "${diff.value.slice(0, 50)}${diff.value.length > 50 ? '...' : ''}"\n`;
          }
        });
      }
      report += "\n";
    });
  }
  
  // High similarity successes
  const highSimilarity = successful.filter(r => 
    r.textDifferences && r.textDifferences.similarityScore > 0.95 && !r.textDifferences.hasDifferences
  );
  
  if (highSimilarity.length > 0) {
    report += `✅ HIGH QUALITY CONVERSIONS (>95% similarity):\n`;
    report += "-".repeat(40) + "\n";
    highSimilarity.forEach(result => {
      const comp = result.textDifferences!;
      report += `• ${result.entry.title} (${(comp.similarityScore * 100).toFixed(1)}%)\n`;
    });
    report += "\n";
  }
  
  report += "=".repeat(80) + "\n";
  
  return report;
}

function saveDetailedReport(results: ProcessingResult[]): void {
  const reportPath = path.join(import.meta.dir, "..", "prep", "conversion_report.json");
  
  const detailedReport = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      withDifferences: results.filter(r => r.textDifferences?.hasDifferences).length,
    },
    results: results.map(result => ({
      title: result.entry.title,
      url: result.entry.url,
      success: result.success,
      error: result.error,
      textComparison: result.textDifferences ? {
        originalLength: result.textDifferences.originalLength,
        convertedLength: result.textDifferences.convertedLength,
        hasDifferences: result.textDifferences.hasDifferences,
        similarityScore: result.textDifferences.similarityScore,
        significantDifferences: result.textDifferences.differences
          .filter(d => (d.added || d.removed) && d.value.trim().length > 0)
          .slice(0, 10)
          .map(d => ({
            type: d.added ? 'added' : d.removed ? 'removed' : 'unchanged',
            value: d.value.slice(0, 200),
          })),
      } : null,
    })),
  };
  
  Bun.write(reportPath, JSON.stringify(detailedReport, null, 2));
  console.log(`\n📋 Detailed report saved to: ${reportPath}`);
}

// ---------
// Main

async function main() {
  console.log("🚀 Starting PG Essays conversion...\n");
  
  const index = await loadArticleIndex();
  console.log(`📚 Found ${index.length} essays to process\n`);
  
  // Process entries based on environment configuration
  const processLimit = process.env.PG_CONVERT_LIMIT;
  const entriesToProcess = processLimit === "all" ? index : index.slice(0, parseInt(processLimit || "3"));
  
  console.log(`📝 Processing ${entriesToProcess.length} essays with concurrency ${concurrency}\n`);
  
  const results = await Promise.all(
    entriesToProcess.map(async (entry) => {
      return processEntry(entry);
    })
  );
  
  // Generate and display report
  const report = generateReport(results);
  console.log(report);
  
  // Save detailed report
  saveDetailedReport(results);
  
  console.log("✨ Conversion complete!");
}

await main();