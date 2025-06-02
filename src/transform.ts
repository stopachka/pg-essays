import * as cheerio from "cheerio";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
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
  processingTimeMs?: number;
};

type TextComparison = {
  originalLength: number;
  convertedLength: number;
  differences: ContextualDiff[];
  hasDifferences: boolean;
  similarityScore: number;
};

type ContextualDiff = {
  type: "added" | "removed" | "unchanged";
  value: string;
  contextBefore?: string;
  contextAfter?: string;
  position?: number;
};

// ---------
// Rate Limiting & Progress

class RateLimitedProcessor {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private maxConcurrent: number;
  private minDelayMs: number;
  private lastRequestTime = 0;

  constructor(maxConcurrent = 2, minDelayMs = 2000) {
    this.maxConcurrent = maxConcurrent;
    this.minDelayMs = minDelayMs;
  }

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          // Ensure minimum delay between requests
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;
          if (timeSinceLastRequest < this.minDelayMs) {
            await new Promise((resolve) =>
              setTimeout(resolve, this.minDelayMs - timeSinceLastRequest),
            );
          }

          this.lastRequestTime = Date.now();
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift()!;

    try {
      await task();
    } finally {
      this.running--;
      this.processQueue();
    }
  }
}

class ProgressTracker {
  private total: number;
  private completed = 0;
  private failed = 0;
  private current = "";

  constructor(total: number) {
    this.total = total;
  }

  start(title: string) {
    this.current = title;
    this.updateDisplay();
  }

  complete(success: boolean) {
    if (success) {
      this.completed++;
    } else {
      this.failed++;
    }
    this.updateDisplay();
  }

  private updateDisplay() {
    const progress = this.completed + this.failed;
    const percentage = Math.round((progress / this.total) * 100);
    const progressBar =
      "█".repeat(Math.floor(percentage / 5)) +
      "░".repeat(20 - Math.floor(percentage / 5));

    process.stdout.write(
      `\r[${progressBar}] ${percentage}% (${progress}/${this.total}) | ✅ ${this.completed} ❌ ${this.failed} | ${this.current.slice(0, 40)}...`,
    );

    if (progress === this.total) {
      console.log("\n");
    }
  }
}

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
  resource: CacheableResource<T>,
): Promise<T> {
  const file = Bun.file(resource.cachePath);

  if (await file.exists()) {
    const text = await file.text();
    return resource.deserialize ? resource.deserialize(text) : (text as T);
  }

  const data = await resource.fetch();

  const serialized = resource.serialize
    ? resource.serialize(data)
    : (data as string);
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
      console.log("📡 Fetching article index from paulgraham.com...");
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
// Text Processing with Context

function extractPlaintext(html: string): string {
  const $ = cheerio.load(html);

  // Remove scripts, styles, and other non-content elements
  $("script, style, noscript, iframe, object, embed").remove();

  // Get text content and normalize whitespace
  return $("body").text().replace(/\s+/g, " ").trim();
}

function markdownToPlaintext(markdown: string): string {
  return (
    markdown
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
      .replace(/\[?\^(\d+)\]?/g, "") // Footnote references
      .replace(/\n{2,}/g, "\n") // Multiple newlines
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim()
  );
}

function createContextualDiffs(
  originalText: string,
  convertedText: string,
): ContextualDiff[] {
  const differences = diff.diffWords(originalText, convertedText);
  const contextualDiffs: ContextualDiff[] = [];

  let position = 0;

  differences.forEach((part, index) => {
    if (part.added || part.removed) {
      // Find context before and after
      const contextLength = 30;
      const beforeStart = Math.max(0, position - contextLength);
      const contextBefore = originalText.slice(beforeStart, position);

      let afterPosition = position;
      if (!part.removed) {
        // For added text, we need to find where it would be in the original
        afterPosition = position;
      } else {
        afterPosition = position + part.value.length;
      }

      const contextAfter = originalText.slice(
        afterPosition,
        afterPosition + contextLength,
      );

      contextualDiffs.push({
        type: part.added ? "added" : "removed",
        value: part.value,
        contextBefore: contextBefore.trim(),
        contextAfter: contextAfter.trim(),
        position: position,
      });
    }

    if (!part.added) {
      position += part.value.length;
    }
  });

  return contextualDiffs;
}

function compareTexts(
  originalHtml: string,
  convertedMarkdown: string,
): TextComparison {
  const originalText = extractPlaintext(originalHtml);
  const convertedText = markdownToPlaintext(convertedMarkdown);

  const differences = createContextualDiffs(originalText, convertedText);
  const hasDifferences = differences.length > 0;

  // Calculate similarity score using simple diff
  const simpleDiffs = diff.diffWords(originalText, convertedText);
  const totalLength = Math.max(originalText.length, convertedText.length);
  let matchedLength = 0;

  simpleDiffs.forEach((part) => {
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
// Streaming LLM Processing

const keyFn = (entry: IndexEntry) => {
  const paddedIdx = entry.n.toString().padStart(3, "0");
  return `${paddedIdx}_${entry.title.replace(/[^a-zA-Z0-9]/g, "_")}`;
};

const ant = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function streamLLMResponse(
  htmlText: string,
  outputPath: string,
  onProgress?: (chunk: string) => void,
): Promise<string> {
  const $ = cheerio.load(htmlText);
  $("script").remove();

  const stream = await ant.messages.create({
    system: `
You are an expert with HTML and Markdown. You are tasked with converting Paul Graham's essays to markdown format.

**PRIMARY DIRECTIVE: CONVERT EVERY SINGLE WORD OF THE ESSAY. NO EXCEPTIONS.**

**ABSOLUTELY FORBIDDEN ACTIONS:**
- Writing "[Content continues...]" or "[Continues through all X sections...]"
- Writing "..." to indicate omitted content
- Summarizing, paraphrasing, or abbreviating ANY content
- Skipping ANY paragraphs, sentences, or sections
- Writing "See full essay for complete content" or similar
- Any form of content omission or summarization

**IF YOU WRITE ANYTHING LIKE "[Continues...]" OR SKIP CONTENT, YOU HAVE FAILED COMPLETELY.**

**REQUIRED ACTIONS:**
- Convert the ENTIRE essay word-for-word
- Include EVERY paragraph from the original
- Include EVERY sentence from the original
- Include EVERY word from the original
- If the essay has 50 paragraphs, include ALL 50
- If the essay has 12 numbered sections, include ALL 12 sections IN FULL
- Copy the exact text, just convert HTML formatting to Markdown

**What to ignore (ONLY these specific non-content elements):**
- Navigation links at top/bottom
- "Want to start a startup? Get funded by Y Combinator" ads
- Translation links
- Related links
- Copyright notices

**Formatting rules:**
- Use [^1] syntax for footnotes
- Convert HTML links to markdown links
- Keep paragraph structure intact
- Use # for main title, ## for subsections
- If you see a link _inside_ the essay that goes to a page on paulgraham.com, make sure the href _includes_ paulgraham.com

**Structure should be:**
# Essay Title
_Date_
[COMPLETE ESSAY CONTENT - EVERY WORD]
[FOOTNOTES IF ANY]

Return ONLY the complete markdown conversion.
`.trim(),
    messages: [
      {
        role: "user",
        content: htmlText,
      },
    ],
    model: "claude-4-sonnet-20250514",
    max_tokens: 8192,
    stream: true,
  });

  let fullContent = "";
  const writer = Bun.file(outputPath).writer();

  try {
    for await (const chunk of stream) {
      if (
        chunk.type === "content_block_delta" &&
        chunk.delta.type === "text_delta"
      ) {
        const text = chunk.delta.text;
        fullContent += text;
        await writer.write(text);
        onProgress?.(text);
      }
    }
  } finally {
    await writer.end();
  }

  return fullContent;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 1000,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if it's a rate limit error
      if (error instanceof Error && error.message.includes("rate_limit")) {
        const delayMs = initialDelayMs * Math.pow(2, attempt);
        console.log(`\n⏳ Rate limited, waiting ${delayMs}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      // For other errors, don't retry
      if (attempt === maxRetries) {
        throw lastError;
      }
    }
  }

  throw lastError!;
}

// ---------
// Entry Processing

async function processEntry(
  entry: IndexEntry,
  processor: RateLimitedProcessor,
  progress: ProgressTracker,
): Promise<ProcessingResult> {
  const startTime = Date.now();
  progress.start(entry.title);

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
    const mdPath = path.join(import.meta.dir, "..", "prep", key, `${key}.md`);
    const mdFile = Bun.file(mdPath);

    let markdownText: string;

    if (await mdFile.exists()) {
      markdownText = await mdFile.text();
    } else {
      // Stream LLM response with retry logic
      markdownText = await processor.add(() =>
        retryWithBackoff(() =>
          streamLLMResponse(htmlText, mdPath, (chunk) => {
            // Show streaming progress
            process.stdout.write(".");
          }),
        ),
      );
    }

    // Compare texts
    const textComparison = compareTexts(htmlText, markdownText);

    const result: ProcessingResult = {
      entry,
      success: true,
      textDifferences: textComparison,
      processingTimeMs: Date.now() - startTime,
    };

    progress.complete(true);
    return result;
  } catch (error) {
    const result: ProcessingResult = {
      entry,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs: Date.now() - startTime,
    };

    progress.complete(false);
    return result;
  }
}

// ---------
// Report Generation

function generateReport(results: ProcessingResult[]): string {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const withDifferences = successful.filter(
    (r) => r.textDifferences?.hasDifferences,
  );

  let report = "\n" + "=".repeat(80) + "\n";
  report += "CONVERSION REPORT\n";
  report += "=".repeat(80) + "\n\n";

  // Summary
  report += `📊 SUMMARY:\n`;
  report += `   Total entries: ${results.length}\n`;
  report += `   ✅ Successful: ${successful.length}\n`;
  report += `   ❌ Failed: ${failed.length}\n`;
  report += `   ⚠️  With text differences: ${withDifferences.length}\n`;

  if (successful.length > 0) {
    const avgTime =
      successful.reduce((sum, r) => sum + (r.processingTimeMs || 0), 0) /
      successful.length;
    report += `   ⏱️  Average processing time: ${Math.round(avgTime)}ms\n`;
  }
  report += "\n";

  // Failures
  if (failed.length > 0) {
    report += `❌ FAILED CONVERSIONS:\n`;
    report += "-".repeat(40) + "\n";
    failed.forEach((result) => {
      report += `• ${result.entry.title}\n`;
      report += `  Error: ${result.error}\n\n`;
    });
  }

  // Text differences with context
  if (withDifferences.length > 0) {
    report += `⚠️  TEXT DIFFERENCES DETECTED:\n`;
    report += "-".repeat(40) + "\n";

    withDifferences.forEach((result) => {
      const comp = result.textDifferences!;
      report += `📄 ${result.entry.title}\n`;
      report += `   Similarity: ${(comp.similarityScore * 100).toFixed(1)}%\n`;
      report += `   Original length: ${comp.originalLength} chars\n`;
      report += `   Converted length: ${comp.convertedLength} chars\n`;

      // Show first few significant differences with context
      const significantDiffs = comp.differences.slice(0, 3);
      if (significantDiffs.length > 0) {
        report += `   Key differences:\n`;
        significantDiffs.forEach((diff, idx) => {
          const preview =
            diff.value.length > 40
              ? diff.value.slice(0, 40) + "..."
              : diff.value;
          if (diff.type === "removed") {
            report += `   🔴 REMOVED: "${preview}"\n`;
          } else if (diff.type === "added") {
            report += `   🟢 ADDED: "${preview}"\n`;
          }

          if (diff.contextBefore || diff.contextAfter) {
            report += `      Context: ...${diff.contextBefore} [CHANGE] ${diff.contextAfter}...\n`;
          }
        });
      }
      report += "\n";
    });
  }

  // High similarity successes
  const highSimilarity = successful.filter(
    (r) =>
      r.textDifferences &&
      r.textDifferences.similarityScore > 0.95 &&
      !r.textDifferences.hasDifferences,
  );

  if (highSimilarity.length > 0) {
    report += `✅ HIGH QUALITY CONVERSIONS (>95% similarity):\n`;
    report += "-".repeat(40) + "\n";
    highSimilarity.forEach((result) => {
      const comp = result.textDifferences!;
      report += `• ${result.entry.title} (${(comp.similarityScore * 100).toFixed(1)}%)\n`;
    });
    report += "\n";
  }

  report += "=".repeat(80) + "\n";

  return report;
}

function saveDetailedReport(results: ProcessingResult[]): void {
  const reportPath = path.join(
    import.meta.dir,
    "..",
    "prep",
    "conversion_report.json",
  );

  const detailedReport = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      withDifferences: results.filter((r) => r.textDifferences?.hasDifferences)
        .length,
    },
    results: results.map((result) => ({
      title: result.entry.title,
      url: result.entry.url,
      success: result.success,
      error: result.error,
      processingTimeMs: result.processingTimeMs,
      textComparison: result.textDifferences
        ? {
            originalLength: result.textDifferences.originalLength,
            convertedLength: result.textDifferences.convertedLength,
            hasDifferences: result.textDifferences.hasDifferences,
            similarityScore: result.textDifferences.similarityScore,
            contextualDifferences: result.textDifferences.differences.map(
              (d) => ({
                type: d.type,
                value: d.value.slice(0, 200),
                contextBefore: d.contextBefore?.slice(0, 50),
                contextAfter: d.contextAfter?.slice(0, 50),
                position: d.position,
              }),
            ),
          }
        : null,
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
  console.log(`📚 Found ${index.length} essays\n`);

  // Process entries based on environment configuration
  const processLimit = process.env.PG_CONVERT_LIMIT;
  const entriesToProcess =
    processLimit === "all"
      ? index
      : index.slice(0, parseInt(processLimit || "3"));

  const concurrency = Math.min(
    parseInt(process.env.PG_CONVERT_CONCURRENCY || "2"),
    3,
  ); // Max 3 for safety
  console.log(
    `📝 Processing ${entriesToProcess.length} essays with concurrency ${concurrency}\n`,
  );

  const processor = new RateLimitedProcessor(concurrency, 3000); // 3 second minimum delay
  const progress = new ProgressTracker(entriesToProcess.length);

  const results: ProcessingResult[] = [];

  // Process entries sequentially but with controlled concurrency
  await Promise.all(
    entriesToProcess.map(async (entry) => {
      const result = await processEntry(entry, processor, progress);
      results.push(result);
    }),
  );

  // Generate and display report
  const report = generateReport(results);
  console.log(report);

  // Save detailed report
  saveDetailedReport(results);

  console.log("✨ Conversion complete!");
}

await main();
