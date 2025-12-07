import { $ } from "bun";
import { essayFiles, processEssay } from "./essay";
import * as gen from "./gen";
import type { Book, ProcessedEssay } from "./types";
import { latexToPDF } from "./pdf";
import { asBookLatex } from "./bookLatex";
import { getInputEssays } from "./articleIndex";
import { generateCover } from "./cover";
import { generateNicoleCover } from "./coverNicole";

const essaysToSkip = new Set(["prop62", "rootsoflisp"]);

const nicoleSections = [
  { title: "Life", essaySlugs: ["hs", "vb"] },
  { title: "Philosophy", essaySlugs: ["say"] },
  { title: "Economics", essaySlugs: ["wealth", "gap"] },
  { title: "Writing", essaySlugs: ["essay"] },
  { title: "Art", essaySlugs: ["goodart", "taste"] },
  { title: "Work", essaySlugs: ["before", "marginal", "genius", "procrastination", "makersschedule"] },
  { title: "Startups", essaySlugs: ["start", "startupideas", "ds", "startuplessons"] },
];

export async function getInputBooks(): Promise<Book[]> {
  const inputs = await getInputEssays();
  const filtered = inputs.filter((x) => !essaysToSkip.has(x.slug));

  const allProcessed = await Promise.all(filtered.map(processEssay));

  const full: Book = {
    title: "Essays",
    essays: allProcessed,
    slug: "full",
    dir: "book/full",
  };

  const lastSym = "__last";
  const { vols } = [
    { slug: "bubble" },
    { slug: "mit" },
    { slug: "discover" },
    { slug: "disc" },
    { slug: lastSym },
  ].reduce(
    ({ vols, startIdx: prevIdx }, { slug }, i) => {
      const cutIdx =
        slug === lastSym ? allProcessed.length - 1 : allProcessed.findIndex((x) => x.slug === slug);

      if (cutIdx < 0) {
        throw new Error(`Could not find idx for ${String(slug)}`);
      }

      const essays = allProcessed.slice(prevIdx, cutIdx + 1);
      const volumeNum = i + 1;
      const volumeToNumeral = new Map([
        [1, "I"],
        [2, "II"],
        [3, "III"],
        [4, "IV"],
        [5, "V"],
      ]);
      const vol: Book = {
        title: `Essays, ${volumeToNumeral.get(volumeNum)}`,
        slug: `vol${volumeNum}`,
        dir: `book/vol${volumeNum}`,
        essays: essays,
      };
      const newVols = [...vols, vol];
      return { vols: newVols, startIdx: cutIdx + 1 };
    },
    { vols: [] as Book[], startIdx: 0 }
  );

  // Create Nicole's special volume
  const nicoleSlugs = nicoleSections.flatMap((s) => s.essaySlugs);
  const nicoleEssays = nicoleSlugs
    .map((slug) => allProcessed.find((e) => e.slug === slug))
    .filter((e): e is ProcessedEssay => e !== undefined);

  const volumenicole: Book = {
    title: "Essays, Nicole",
    slug: "volumenicole",
    dir: "book/volumenicole",
    essays: nicoleEssays,
    coverFn: generateNicoleCover,
    titlePageFn: () => [
      "\\vspace*{\\fill}",
      "\\begin{center}",
      "\\textit{For Nicole}",
      "\\end{center}",
      "\\vspace*{\\fill}",
      "\\clearpage",
    ].join("\n"),
  };

  return [full, ...vols, volumenicole];
}

export const bookFiles = {
  tex: "01.tex",
  html: "02.html",
  pdf: "03.pdf",
  epub: "04.epub",
  mobi: "05.mobi",
  coverPaperback: "cover-paperback.pdf",
  coverHardcover: "cover-hardcover.pdf",
};

export async function processBook(book: Book): Promise<void> {
  const chapters = book.essays.map((essay) => {
    const chapter = gen.readText(essay.dir, essayFiles.xfTex).trim();
    return chapter;
  });

  const bookLatex = asBookLatex({ title: book.title, latexChapters: chapters, titlePageFn: book.titlePageFn });

  gen.save(book.dir, bookFiles.tex, bookLatex);

  await $`pandoc --from=latex --to=html5 --standalone -o ${gen.fullPath(
    book.dir,
    bookFiles.html
  )} ${gen.fullPath(book.dir, bookFiles.tex)}`;

  await latexToPDF(gen.fullPath(book.dir, bookFiles.pdf), bookLatex);

  await $`pandoc --from=latex --to=epub --toc --toc-depth=1 -o ${gen.fullPath(
    book.dir,
    bookFiles.epub
  )} ${gen.fullPath(book.dir, bookFiles.tex)}`;

  await $`./lib/kindlegen ${gen.fullPath(book.dir, bookFiles.epub)} -o ${bookFiles.mobi}`.nothrow();

  // Generate both paperback and hardcover covers
  const coverFn = book.coverFn ?? generateCover;
  await coverFn(gen.fullPath(book.dir, bookFiles.coverPaperback), book, "paperback");
  await coverFn(gen.fullPath(book.dir, bookFiles.coverHardcover), book, "hardcover");
}
