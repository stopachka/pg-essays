import { $ } from "bun";
import { essayFiles, processEssay } from "./essay";
import * as gen from "./gen";
import type { ProcessedEssay } from "./types";
import { latexToPDF } from "./pdf";
import { asBookLatex } from "./bookLatex";
import { getInputEssays } from "./articleIndex";

type Book = {
  title: string;
  slug: string;
  dir: string;
  essays: ProcessedEssay[];
};

const essaysToSkip = new Set(["prop62"]);

export async function getInputBooks(): Promise<Book[]> {
  const inputs = await getInputEssays();
  const filtered = inputs.filter((x) => !essaysToSkip.has(x.slug));

  const allProcessed = await Promise.all(filtered.map(processEssay));

  const full = {
    title: "Essays by Paul Graham",
    essays: allProcessed,
    slug: "full",
    dir: "book/full",
  };

  const vol1Idx = allProcessed.findIndex((x) => x.slug === "mac");
  const vol1Processed = allProcessed.slice(0, vol1Idx + 1);

  const vol1 = {
    title: "Essays by Paul Graha",
    essays: vol1Processed,
    slug: "vol1",
    dir: "book/vol1",
  };

  return [full, vol1];
}

export const bookFiles = {
  tex: "01.tex",
  html: "02.html",
  pdf: "03.pdf",
};

export async function processBook(book: Book): Promise<void> {
  const chapters = book.essays.map((essay) => {
    const chapter = gen.readText(essay.dir, essayFiles.xfTex).trim();
    return chapter;
  });

  const bookLatex = asBookLatex({ title: book.title, latexChapters: chapters });

  gen.save(book.dir, bookFiles.tex, bookLatex);

  await $`pandoc --from=latex --to=html5 --standalone -o ${gen.fullPath(
    book.dir,
    bookFiles.html
  )} ${gen.fullPath(book.dir, bookFiles.tex)}`;

  await latexToPDF(gen.fullPath(book.dir, bookFiles.pdf), bookLatex);
}
