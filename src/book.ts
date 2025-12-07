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

  return [full, ...vols, createNicoleBook(allProcessed)];
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

function createNicoleBook(allProcessed: ProcessedEssay[]): Book {
  const sections = [
    { title: "Life", essaySlugs: ["hs", "vb"] },
    { title: "Philosophy", essaySlugs: ["say"] },
    { title: "Economics", essaySlugs: ["wealth", "gap"] },
    { title: "Writing", essaySlugs: ["essay"] },
    { title: "Art", essaySlugs: ["goodart", "taste"] },
    { title: "Work", essaySlugs: ["before", "marginal", "genius", "procrastination", "makersschedule"] },
    { title: "Startups", essaySlugs: ["start", "startupideas", "ds", "startuplessons"] },
  ];

  const slugs = sections.flatMap((s) => s.essaySlugs);
  const essays = slugs
    .map((slug) => allProcessed.find((e) => e.slug === slug))
    .filter((e): e is ProcessedEssay => e !== undefined);

  const sectionDivider = (title: string) =>
    [
      "\\clearpage",
      "\\thispagestyle{empty}",
      "\\vspace*{\\fill}",
      "\\begin{center}",
      `\\Large ${title}`,
      "\\end{center}",
      "\\vspace*{\\fill}",
      "\\clearpage",
    ].join("\n");

  return {
    title: "Essays, Nicole",
    slug: "volumenicole",
    dir: "book/volumenicole",
    essays,
    coverFn: generateNicoleCover,
    titlePageFn: () =>
      ["\\vspace*{\\fill}", "\\begin{center}", "\\textit{For Nicole}", "\\end{center}", "\\vspace*{\\fill}", "\\clearpage"].join("\n"),
    buildChaptersFn: (essays) => {
      const chapters: string[] = [];
      const essayMap = new Map(essays.map((e) => [e.slug, gen.readText(e.dir, essayFiles.xfTex).trim()]));
      for (const section of sections) {
        chapters.push(sectionDivider(section.title));
        for (const slug of section.essaySlugs) {
          const chapter = essayMap.get(slug);
          if (chapter) chapters.push(chapter);
        }
      }
      return chapters;
    },
  };
}

export async function processBook(book: Book): Promise<void> {
  const chapters = book.buildChaptersFn
    ? book.buildChaptersFn(book.essays)
    : book.essays.map((essay) => gen.readText(essay.dir, essayFiles.xfTex).trim());

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
