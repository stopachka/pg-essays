import { $ } from "bun";
import { essayFiles, processEssay } from "./essay";
import * as gen from "./gen";
import type { Book, ProcessedEssay, Section } from "./types";
import { latexToPDF } from "./pdf";
import { asBookLatex, sectionDivider } from "./bookLatex";
import { getInputEssays } from "./articleIndex";
import { generateCover } from "./cover";

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

  // Stopa's Selection - curated essays with sections
  const stopasSections: Section[] = [
    {
      title: "Life",
      essaySlugs: ["hs", "vb"],
    },
    {
      title: "Philosophy",
      essaySlugs: ["say"],
    },
    {
      title: "Economics",
      essaySlugs: ["wealth", "gap"],
    },
    {
      title: "Writing",
      essaySlugs: ["essay"],
    },
    {
      title: "Art",
      essaySlugs: ["goodart", "taste"],
    },
    {
      title: "Work",
      essaySlugs: ["before", "marginal", "genius", "procrastination", "makersschedule"],
    },
    {
      title: "Startups",
      essaySlugs: ["start", "startupideas", "ds", "startuplessons"],
    },
  ];

  const allStopaSlugs = stopasSections.flatMap((s) => s.essaySlugs);
  const essayBySlug = new Map(allProcessed.map((e) => [e.slug, e]));
  const stopasEssays = allStopaSlugs
    .map((slug) => essayBySlug.get(slug))
    .filter((e): e is ProcessedEssay => e !== undefined);

  const stopasSelection: Book = {
    title: "Stopa's Selection",
    slug: "stopas-selection",
    dir: "book/stopas-selection",
    essays: stopasEssays,
    sections: stopasSections,
    dedication: "For my love, Nicole",
  };

  return [full, ...vols, stopasSelection];
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
  let chapters: string[];

  if (book.sections) {
    // Build chapters with section dividers
    chapters = [];
    const essayBySlug = new Map(book.essays.map((e) => [e.slug, e]));

    for (const section of book.sections) {
      // Add section divider
      chapters.push(sectionDivider(section.title));

      // Add essays in this section
      for (const slug of section.essaySlugs) {
        const essay = essayBySlug.get(slug);
        if (essay) {
          const chapter = gen.readText(essay.dir, essayFiles.xfTex).trim();
          chapters.push(chapter);
        }
      }
    }
  } else {
    // Standard book without sections
    chapters = book.essays.map((essay) => {
      const chapter = gen.readText(essay.dir, essayFiles.xfTex).trim();
      return chapter;
    });
  }

  const bookLatex = asBookLatex({
    title: book.title,
    latexChapters: chapters,
    dedication: book.dedication,
  });

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
  await generateCover(gen.fullPath(book.dir, bookFiles.coverPaperback), book, "paperback");
  await generateCover(gen.fullPath(book.dir, bookFiles.coverHardcover), book, "hardcover");
}
