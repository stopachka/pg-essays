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
    title: "Essays, Full",
    essays: allProcessed,
    slug: "full",
    dir: "book/full",
  };
  const lastSym = Symbol.for("last");
  const { vols } = ["sfp", "angelinvesting", "pinch", lastSym].reduce(
    ({ vols, startIdx: prevIdx }, slug, i) => {
      const cutIdx =
        slug === lastSym ? allProcessed.length - 1 : allProcessed.findIndex((x) => x.slug === slug);

      if (cutIdx < 0) {
        throw new Error(`Could not find idx for ${String(slug)}`);
      }

      const essays = allProcessed.slice(prevIdx, cutIdx + 1);
      const volumeNum = i + 1;
      const vol: Book = {
        title: `Essays, Volume ${volumeNum}`,
        slug: `vol${volumeNum}`,
        dir: `book/vol${volumeNum}`,
        essays: essays,
      };
      const newVols = [...vols, vol];
      return { vols: newVols, startIdx: cutIdx + 1 };
    },
    { vols: [] as Book[], startIdx: 0 }
  );

  return [full, ...vols];
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
