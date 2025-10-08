import { getInputEssays } from "./src/articleIndex";
import { bookFiles, getInputBooks, processBook } from "./src/book";
import { essayFiles, processEssay } from "./src/essay";
import * as gen from "./src/gen";

import { $ } from "bun";

import { parseArgs } from "util";
import { latexToPDF } from "./src/pdf";
import { asBookLatex } from "./src/bookLatex";
import { generateCover } from "./src/cover";
import type { Book } from "./src/types";

await main();

async function main() {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      essay: {
        type: "string",
      },
      book: {
        type: "string",
      },
      cover: {
        type: "string",
      },
      count: {
        type: "boolean",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  const essaySlug = values.essay;
  if (essaySlug) {
    console.log(`Build Essay: ${essaySlug}`);
    await handleEssaySlug(essaySlug);
    return;
  }

  const bookSlug = values.book;
  if (bookSlug) {
    console.log(`Build Book: ${bookSlug}`);
    await handleBookSlug(bookSlug);
    return;
  }

  const coverSlug = values.cover;
  if (coverSlug) {
    console.log(`Build Cover: ${coverSlug}`);
    await handleCoverSlug(coverSlug);
    return;
  }
  const count = values.count;
  if (count != undefined) {
    console.log(`Counting pdf length`);
    const inputs = await getInputBooks();
    await countPages(inputs);
    return;
  }
  await handleAllBooks();
}

async function countPages(books: Book[]) {
  for (const book of books) {
    const pdfInfo =
      await $`pdfinfo ${gen.fullPath(book.dir, bookFiles.pdf)} | grep Pages | awk '/Pages/ {print $2}'`.text();
    console.log(`[${book.slug}] ${pdfInfo}`);
  }
}

async function handleAllBooks() {
  const inputs = await getInputBooks();
  await Promise.all(inputs.map(processBook));
  console.log(`Processed: ${inputs.map((x) => x.slug).join(",")}`);
  await countPages(inputs);
}

async function handleCoverSlug(slug: string) {
  const inputs = await getInputBooks();
  const book = inputs.find((x) => x.slug == slug);
  if (!book) {
    throw new Error(`Could not find ${slug}`);
  }

  await generateCover(gen.fullPath(book.dir, bookFiles.coverPaperback), book, "paperback");
  await generateCover(gen.fullPath(book.dir, bookFiles.coverHardcover), book, "hardcover");
  await $`open ${gen.fullPath(book.dir, bookFiles.coverPaperback)}`;
  await $`open ${gen.fullPath(book.dir, bookFiles.coverHardcover)}`;
}

async function handleBookSlug(slug: string) {
  const inputs = await getInputBooks();
  const book = inputs.find((x) => x.slug == slug);
  if (!book) {
    throw new Error(`Could not find ${slug}`);
  }
  await processBook(book);
  await $`open ${gen.fullPath(book.dir, bookFiles.pdf)}`;
}

async function handleEssaySlug(slug: string) {
  const inputs = await getInputEssays();
  const essay = inputs.find((x) => x.slug === slug);
  if (!essay) {
    throw new Error(`Could not find ${slug}`);
  }

  await processEssay(essay);

  await latexToPDF(
    gen.fullPath(essay.dir, essayFiles.pdf),
    asBookLatex({ title: essay.title, latexChapters: [gen.readText(essay.dir, essayFiles.xfTex)] }),
  );

  await $`open ${gen.fullPath(essay.dir, essayFiles.pdf)}`;
}
