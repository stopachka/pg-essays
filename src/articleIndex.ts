import { load, type CheerioAPI } from "cheerio";
import { limitedFetch } from "./fetch";
import * as gen from "./gen";
import type { InputEssay } from "./types";

export async function getInputEssays(): Promise<InputEssay[]> {
  if (gen.exists("articleIndex", "inputEssays.json")) {
    const txt = gen.readText("articleIndex", "inputEssays.json");
    return JSON.parse(txt);
  }
  console.log("[articles] from fetch");
  const res = await limitedFetch("https://www.paulgraham.com/articles.html");
  const html = await res.text();
  const $ = load(html);
  const inputEssays = getEssays($);
  gen.saveText("articleIndex", "inputEssays.json", JSON.stringify(inputEssays, null, 2));
  return inputEssays;
}

function getEssays($: CheerioAPI): InputEssay[] {
  return $("table:nth-of-type(2)")
    .find("a")
    .toArray()
    .map((node: any, i) => {
      const href = node.attribs && node.attribs.href;
      if (typeof href !== "string" || href.indexOf("http") !== -1) {
        return;
      }

      const title = $(node).text() as string;
      const slug = href.split(".")[0] as string;
      const pad = `${i}`.padStart(3, "0");
      return {
        title,
        slug,
        url: `https://www.paulgraham.com/${href}`,
        dir: `essays/${pad}_${slug}`,
      };
    })
    .filter((x) => !!x)
    .reverse(); // earlier first
}
