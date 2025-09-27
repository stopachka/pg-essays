import { getInputEssays } from "./articleIndex";
import { processBook } from "./book";
import { essayFiles, processEssay } from "./essay";
import * as gen from "./gen";

import { $ } from "bun";

const inputs = await getInputEssays();

// --------
// All

const processedEssays = await Promise.all(inputs.map(processEssay));

await processBook({
  title: "Essays by Paul Graham",
  essays: processedEssays,
  slug: "full",
  dir: "book/full",
});

await $`open ${gen.fullPath("book/full", "03.pdf")}`;

// --------
// Single

// const essay = inputs.find((x) => x.slug === "spam");

// if (!essay) {
//   throw new Error("not found!");
// }

// await processEssay(essay);

// await $`open ${gen.fullPath(essay.dir, essayFiles.pdf)}`;
