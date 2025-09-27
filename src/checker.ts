import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { getInputEssays } from "./articleIndex";
import { essayFiles } from "./essay";
import * as gen from "./gen";

const MODEL = "claude-sonnet-4-20250514";
const CSV_FILE = "claude.csv";
const BATCH_SIZE = 10;

type ClaudeResult = {
  slug: string;
  essayTitle: string;
  good: boolean;
  reason: string;
};

const apiKey =
  process.env.ANTHROPIC_API_KEY ?? Bun.env.ANTHROPIC_API_KEY ?? undefined;

if (!apiKey) {
  throw new Error(
    "Missing ANTHROPIC_API_KEY environment variable. Please set it before running checker."
  );
}

const anthropic = new Anthropic({ apiKey });

function readFileOrNull(subdir: string, filename: string): string | null {
  if (!gen.exists(subdir, filename)) {
    return null;
  }
  return gen.readText(subdir, filename);
}

function loadExistingResults(): Map<string, ClaudeResult> {
  const csvPath = gen.fullPath("claude", CSV_FILE);
  const results = new Map<string, ClaudeResult>();

  if (!fs.existsSync(csvPath)) {
    return results;
  }

  try {
    const csvContent = fs.readFileSync(csvPath, "utf-8");
    const lines = csvContent.trim().split("\n");

    if (lines.length > 1) {
      for (let i = 1; i < lines.length; i++) {
        const [good, slug, essayTitle, ...reasonParts] = lines[i].split(",");
        if (slug && good !== undefined) {
          results.set(slug, {
            slug,
            essayTitle: essayTitle || "",
            good: good === "true",
            reason: reasonParts.join(",").replace(/^"|"$/g, ""),
          });
        }
      }
    }
  } catch (err) {
    console.warn(`[checker] unable to parse existing ${CSV_FILE}:`, err);
  }

  return results;
}

function saveResults(results: Map<string, ClaudeResult>) {
  let csvContent = "good,slug,essay_title,reason\n";
  for (const result of results.values()) {
    const escapedReason =
      result.reason.includes(",") || result.reason.includes("\n")
        ? `"${result.reason.replace(/"/g, '""')}"`
        : result.reason;
    const escapedTitle =
      result.essayTitle.includes(",") || result.essayTitle.includes("\n")
        ? `"${result.essayTitle.replace(/"/g, '""')}"`
        : result.essayTitle;
    csvContent += `${result.good},${result.slug},${escapedTitle},${escapedReason}\n`;
  }

  gen.saveText("claude", CSV_FILE, csvContent);
}

function buildPrompt(payload: {
  essaySlug: string;
  essayTitle: string;
  originalHtml: string;
  transformedHtml: string;
  originalMarkdown: string;
  transformedMarkdown: string;
  originalTex: string;
  transformedTex: string;
}) {
  const { essaySlug, essayTitle, originalHtml, transformedTex } = payload;
  const instructions =
    `You are verifying content transformations for an essay in a Paul Graham essay book project.\n\n` +
    `Compare the original HTML and the outputted Latex:\n` +
    `1. Stage01OriginalHTML: fetched from paulgraham.com\n` +
    `2. Stage02TransformedLaTeX: final LaTeX prepared for the book\n\n` +
    `Checks to perform:\n` +
    `- Confirm meaningful content from earlier stages survives through without duplication or loss in Stage02TransformedLaTeX.\n` +
    `- Pay close attention to footnotes in Stage02TransformedLaTeX: they should match references from the html content and use proper LaTeX syntax.\n` +
    `- Flag advertisements, newsletter/signup prompts, author navigation, translation links, or other non-essay content that should not appear in the book, which made it all the way to Stage02TransformedLaTeX.\n\n` +
    `Respond ONLY with minified JSON matching this schema:\n` +
    `{"status":"ok"|"issues","notes":String,"issues":string[]}\n` +
    `- Use status "ok" when no issues are found.\n` +
    `- Include each detected problem as a short bullet sentence in the issues array.\n` +
    `- If you suspect issues but are uncertain, list them anyway and explain briefly.\n` +
    `Do not add any other text.`;

  const userContent =
    `Essay slug: ${essaySlug}\n` +
    `Essay title: ${essayTitle}\n` +
    `\nStage01OriginalHTML:\n${originalHtml}\n` +
    `\nStage02TransformedLaTeX:\n${transformedTex}`;

  return { instructions, userContent };
}

async function checkEssay(
  essayDir: string,
  essaySlug: string,
  essayTitle: string,
  existingResults: Map<string, ClaudeResult>
): Promise<ClaudeResult | null> {
  const existing = existingResults.get(essaySlug);
  if (existing && existing.good) {
    console.log(`[checker] skip ${essaySlug} (already marked good)`);
    return null;
  }

  const originalHtml = readFileOrNull(essayDir, essayFiles.initHTML);
  const transformedHtml = readFileOrNull(essayDir, essayFiles.xfHTML);
  const originalMarkdown = readFileOrNull(essayDir, essayFiles.initMD);
  const transformedMarkdown = readFileOrNull(essayDir, essayFiles.xfMD);
  const originalTex = readFileOrNull(essayDir, essayFiles.initTex);
  const transformedTex = readFileOrNull(essayDir, essayFiles.xfTex);

  if (
    !originalHtml ||
    !transformedHtml ||
    !originalMarkdown ||
    !transformedMarkdown ||
    !originalTex ||
    !transformedTex
  ) {
    console.warn(`[checker] missing pipeline files for ${essaySlug}, skipping`);
    return null;
  }

  if (existing && !existing.good) {
    console.log(`[checker] rechecking ${essaySlug} (previous issues)`);
  } else {
    console.log(`[checker] checking ${essaySlug}`);
  }

  const { instructions, userContent } = buildPrompt({
    essaySlug,
    essayTitle,
    originalHtml,
    transformedHtml,
    originalMarkdown,
    transformedMarkdown,
    originalTex,
    transformedTex,
  });

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      system: instructions,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: userContent,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude response missing text block");
    }

    let parsed: { status: "ok" | "issues"; notes: string; issues: string[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch (err) {
      throw new Error(`Unable to parse Claude JSON: ${textBlock.text}`);
    }

    const good = parsed.status === "ok";
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.filter(
          (issue) => typeof issue === "string" && issue.trim().length > 0
        )
      : [];
    const noteText =
      typeof parsed.notes === "string"
        ? parsed.notes
        : good
        ? "No issues detected."
        : "Issues reported.";

    const reason = good ? noteText : `${noteText} Issues: ${issues.join("; ")}`;
    const result: ClaudeResult = {
      slug: essaySlug,
      essayTitle,
      good,
      reason,
    };

    console.log(
      `[checker] ${essaySlug} -> ${good ? "ok" : `issues (${issues.length})`}`
    );
    return result;
  } catch (err) {
    const result: ClaudeResult = {
      slug: essaySlug,
      essayTitle,
      good: false,
      reason: `Claude request failed: ${(err as Error).message}`,
    };
    console.error(`[checker] error checking ${essaySlug}`, err);
    return result;
  }
}

async function run() {
  const essays = await getInputEssays();
  const existingResults = loadExistingResults();

  for (let i = 0; i < essays.length; i += BATCH_SIZE) {
    const batch = essays.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((essay) =>
        checkEssay(essay.dir, essay.slug, essay.title, existingResults)
      )
    );

    for (const result of batchResults) {
      if (result) {
        existingResults.set(result.slug, result);
      }
    }

    saveResults(existingResults);
  }
}

await run();
