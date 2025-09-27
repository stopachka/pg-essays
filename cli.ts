import { getInputEssays } from "./src/articleIndex";
import { processBook } from "./src/book";
import { essayFiles, processEssay } from "./src/essay";
import * as gen from "./src/gen";

import { $ } from "bun";

import { parseArgs } from "util";

await main();

async function main() {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      slug: {
        type: "string",
      },
    },
    strict: true,
    allowPositionals: true,
  });

  const slug = values.slug;

  if (slug) {
    console.log(`Preview: ${slug}`);
    await produceEssay(slug);
    return;
  }

  console.log(`Build: book`);

  await produceBook();
}

async function produceEssay(slug: string) {
  const inputs = await getInputEssays();
  const essay = inputs.find((x) => x.slug === "spam");
  if (!essay) {
    throw new Error("not found!");
  }
  await processEssay(essay);

  await $`pandoc --pdf-engine=xelatex \
      -V mainfont="Baskerville" \
      -V mainfontoptions="Ligatures=TeX" \
      -o ${gen.fullPath(essay.dir, essayFiles.pdf)} \
      ${gen.fullPath(essay.dir, essayFiles.xfTex)}`;

  await $`open ${gen.fullPath(essay.dir, essayFiles.pdf)}`;
}

async function produceBook() {
  const inputs = await getInputEssays();
  const processedEssays = await Promise.all(inputs.map(processEssay));
  await processBook({
    title: "Essays by Paul Graham",
    essays: processedEssays,
    slug: "full",
    dir: "book/full",
  });

  await $`open ${gen.fullPath("book/full", "03.pdf")}`;
}

// --------
// All

// --------
// Single
