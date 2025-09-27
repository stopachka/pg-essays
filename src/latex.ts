import { $ } from "bun";
import type { InputEssay } from "./types";

export async function markdownToLatex(md: string): Promise<string> {
  const res = await $`echo ${md} | pandoc -t latex -o -`.quiet();
  return res.text();
}

export function transformLatex(essay: InputEssay, input: string): string {
  const transformers = [
    transformHyperRefs,
    transformFootnotes,
    removeEndNotes,
    addChapterTitle,
    removeNotesMessage,
  ];
  return transformers.reduce((input, f) => f(essay, input), input);
}

function removeNotesMessage(_essay: InputEssay, input: string): string {
  return input
    .split("\n")
    .filter((x) => x !== "\\textbf{Notes}")
    .join("\n");
}

function addChapterTitle(essay: InputEssay, input: string): string {
  const escapedTitle = escapeChapterTitle(essay.title);
  return `\\chapter{${escapedTitle}}\n\n` + input;
}

function escapeChapterTitle(title: string): string {
  return title.replace(/%/g, "\\%");
}

function removeEndNotes(essay: InputEssay, input: string): string {
  const lines = input.split("\n");
  let idx = lines.length - 1;
  while (idx >= 0) {
    const line = lines[idx]?.trim();
    if (
      !line ||
      line === "\\textbf{Notes}" ||
      line ===
        "\\textbf{New:} href{onlisptext.html}{Download On Lisp for Free}."
    ) {
      idx--;
      continue;
    }
    break;
  }
  return lines.slice(0, idx + 1).join("\n");
}

function transformFootnotes(essay: InputEssay, input: string): string {
  const citeRe = /\{\[\}(\d+)\{\]\}/g;
  const uniqueNums = new Set<string>();

  let match;
  while ((match = citeRe.exec(input)) !== null) {
    uniqueNums.add(match[1] as string);
  }

  type Replacement = {
    start: number;
    end: number;
    replacement: string;
  };

  const replacements: Replacement[] = [];

  for (const num of uniqueNums) {
    const pattern = new RegExp(`\\{\\[\\}${num}\\{\\]\\}`, "g");
    const matches = [...input.matchAll(pattern)];

    if (matches.length === 0) {
      continue;
    }

    if (matches.length === 1) {
      const [occurrence] = matches;
      const startIndex = occurrence.index!;

      if (!footnoteLooksLikeDefinition(input, startIndex)) {
        console.warn(
          `${essay.slug} Footnote ${num} only has one occurrence - skipping`
        );
        continue;
      }

      const defStart = startIndex + occurrence[0].length;
      const defEnd = findFootnoteEnd(input, defStart);
      const footnoteText = input.slice(defStart, defEnd).trim();

      replacements.push({
        start: startIndex,
        end: defEnd,
        replacement: `\\footnote{${footnoteText}}`,
      });

      continue;
    }

    if (matches.length > 2) {
      throw new Error(
        `${essay.slug} Footnote ${num} has ${matches.length} occurrences - expected exactly 2`
      );
    }

    const [firstOccurrence, secondOccurrence] = matches;
    if (!secondOccurrence) {
      throw new Error(
        `[footnote] ${essay.slug}  expected a second occurence for ${num}`
      );
    }

    const defStart = secondOccurrence.index! + secondOccurrence[0].length;
    const defEnd = findFootnoteEnd(input, defStart);
    const footnoteText = input.slice(defStart, defEnd).trim();

    replacements.push({
      start: firstOccurrence.index!,
      end: firstOccurrence.index! + firstOccurrence[0].length,
      replacement: `\\footnote{${footnoteText}}`,
    });

    replacements.push({
      start: secondOccurrence.index!,
      end: defEnd,
      replacement: "",
    });
  }

  replacements.sort((a, b) => a.start - b.start);

  let result = "";
  let lastPos = 0;

  for (const { start, end, replacement } of replacements) {
    if (start < lastPos) {
      continue;
    }
    result += input.slice(lastPos, start);
    result += replacement;
    lastPos = end;
  }

  result += input.slice(lastPos);

  result = result.replace(/\n\n\n+/g, "\n\n");

  return result;
}

function transformHyperRefs(essay: InputEssay, input: string): string {
  const hyperRefRe = /\{\[\}\\hyperref\[[^\]]+\]\{(\d+)\}\{\]\}/g;
  return input.replace(hyperRefRe, (_match, num) => `{[}${num}{]}`);
}

function findFootnoteEnd(input: string, defStart: number): number {
  const afterDef = input.slice(defStart);
  const boundaries: number[] = [];

  const nextFootnoteMatch = afterDef.match(/\{\[\}\d+\{\]\}/);
  if (nextFootnoteMatch?.index !== undefined) {
    boundaries.push(defStart + nextFootnoteMatch.index);
  }

  const thanksMatch = afterDef.match(/\n\s*\n\\textbf\{Thanks\}/);
  if (thanksMatch?.index !== undefined) {
    boundaries.push(defStart + thanksMatch.index);
  }

  return boundaries.length > 0 ? Math.min(...boundaries) : input.length;
}

// Treat as a definition only when the marker starts the line and has a blank
// line above it (matching the structure of the notes section).
function footnoteLooksLikeDefinition(input: string, index: number): boolean {
  const lastNewline = input.lastIndexOf("\n", index - 1);
  const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
  const prefix = input.slice(lineStart, index);

  if (prefix.trim().length > 0) {
    return false;
  }

  if (lineStart === 0) {
    return false;
  }

  const prevLineEnd = lineStart - 1;
  const prevNewline = input.lastIndexOf("\n", prevLineEnd - 1);
  const prevLineStart = prevNewline === -1 ? 0 : prevNewline + 1;
  const prevLine = input.slice(prevLineStart, prevLineEnd).trim();

  return prevLine.length === 0;
}
