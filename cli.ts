import { getInputEssays } from "./src/articleIndex";
import { getInputBooks, processBook } from "./src/book";
import { essayFiles, processEssay } from "./src/essay";
import * as gen from "./src/gen";

import { $ } from "bun";

import { parseArgs } from "util";
import { latexToPDF } from "./src/pdf";
import { asBookLatex } from "./src/bookLatex";

await main();

async function main() {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      slug: {
        type: "string",
      },
      vol: {
        type: "string",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  const slug = values.slug;
  if (slug) {
    console.log(`Build Essay: ${slug}`);
    await handleEssaySlug(slug);
    return;
  }

  const vol = values.vol;
  if (vol) {
    console.log(`Preview Book: ${vol}`);
    await handleBookVol(vol);
    return;
  }

  await handleAllBooks();
}

async function handleAllBooks() {
  const inputs = await getInputBooks();
  await Promise.all(inputs.map(processBook));
  console.log(`Processed: ${inputs.map((x) => x.slug).join(",")}`);
}

async function handleBookVol(vol: string) {
  const inputs = await getInputBooks();
  const book = inputs.find((x) => x.slug == `vol${vol}`);
  if (!book) {
    throw new Error(`Could not find ${vol}`);
  }
  await processBook(book);
}

async function handleEssaySlug(slug: string) {
  const inputs = await getInputEssays();
  const essay = inputs.find((x) => x.slug === "spam");
  if (!essay) {
    throw new Error(`Could not find ${slug}`);
  }

  await processEssay(essay);

  await latexToPDF(
    gen.fullPath(essay.dir, essayFiles.pdf),
    asBookLatex({ title: essay.title, latexChapters: [gen.readText(essay.dir, essayFiles.xfTex)] })
  );

  await $`open ${gen.fullPath(essay.dir, essayFiles.pdf)}`;
}

async function produceBook() {
  // await processBook();

  await $`open ${gen.fullPath("book/full", "03.pdf")}`;
}

// --------
// All

// --------
// Single
