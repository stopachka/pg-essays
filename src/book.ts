import { $ } from "bun";
import { essayFiles } from "./essay";
import * as gen from "./gen";
import type { ProcessedEssay } from "./types";
import { latexToPDF } from "./pdf";
import { asBookLatex } from "./bookLatex";

type Book = {
  title: string;
  slug: string;
  dir: string;
  essays: ProcessedEssay[];
};

export async function processBook(book: Book): Promise<void> {
  const chapters = book.essays.map((essay) => {
    const chapter = gen.readText(essay.dir, essayFiles.xfTex).trim();
    return chapter;
  });

  const bookLatex = asBookLatex({ title: book.title, latexChapters: chapters });

  gen.save(book.dir, "01.tex", bookLatex);

  await $`pandoc --from=latex --to=html5 --standalone -o ${gen.fullPath(
    book.dir,
    "02.html"
  )} ${gen.fullPath(book.dir, "01.tex")}`;

  await latexToPDF(gen.fullPath(book.dir, "03.pdf"), bookLatex);
}
