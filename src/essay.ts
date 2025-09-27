import * as gen from "./gen";
import { localiseImages } from "./image";
import { transformHTML } from "./html";
import { load } from "cheerio";
import { cheerioToMarkdown, transformMarkdown } from "./markdown";
import { markdownToLatex, transformLatex } from "./latex";
import { $ } from "bun";
import type { InputEssay, ProcessedEssay } from "./types";
import { limitedFetch } from "./fetch";

export const essayFiles = {
  initHTML: "01.html",
  xfHTML: "02.html",
  initMD: "03.md",
  xfMD: "04.md",
  initTex: "05.tex",
  xfTex: "06.tex",
  pdf: "07.pdf",
};

export async function processEssay(essay: InputEssay): Promise<ProcessedEssay> {
  // 01 -- get the original html
  const html = await fetchOriginalHTML(essay);

  // 02 -- transforms html: removes menu, script tag, localizes images, etc
  const transformedHTML = await localiseImages(transformHTML(load(html)));
  gen.save(essay.dir, essayFiles.xfHTML, transformedHTML.html());

  // 03 -- converts us to markdown
  const md = cheerioToMarkdown(transformedHTML);
  gen.save(essay.dir, essayFiles.initMD, md);

  // 04 -- transforms markdown -- removes the footer links, etc
  const transformedMD = transformMarkdown(md);
  gen.save(essay.dir, essayFiles.xfMD, transformedMD);

  // 05 -- convert to latex
  const tex = await markdownToLatex(transformedMD);
  gen.save(essay.dir, essayFiles.initTex, tex);

  // 06 -- transforms latex -- mainly makes footnotes work
  const transformedTex = transformLatex(essay, tex);
  gen.save(essay.dir, essayFiles.xfTex, transformedTex);

  // 07 -- create the pdf!

  // await $`pandoc --pdf-engine=xelatex \
  //     -V mainfont="Baskerville" \
  //     -V mainfontoptions="Ligatures=TeX" \
  //     -o ${gen.fullPath(essay.dir, "07.pdf")} \
  //     ${gen.fullPath(essay.dir, essayFiles.xfTex)}`;

  return { ...essay, processed: true };
}

async function fetchOriginalHTML(essay: InputEssay): Promise<string> {
  if (gen.exists(essay.dir, essayFiles.initHTML)) {
    console.log("[html] from cache", essay.slug);
    return gen.readText(essay.dir, essayFiles.initHTML);
  }
  console.log("[html] from fetch", essay.slug);
  const res = await limitedFetch(essay.url);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder("windows-1252").decode(buf);
  gen.save(essay.dir, essayFiles.initHTML, text);
  return text;
}
