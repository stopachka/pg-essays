import type { CheerioAPI } from "cheerio";
import TurndownService from "turndown";

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

export function cheerioToMarkdown($: CheerioAPI) {
  const markdown = turndownService.turndown($.html());

  return markdown;
}

export function transformMarkdown(md: string): string {
  return clearEndMeta(removeAds(md));
}

function removeAds(md: string): string {
  return md
    .split("\n")
    .filter(
      (x) =>
        !(
          x.startsWith("**More Info:**") ||
          x.startsWith("You'll find this essay and 14 others in") ||
          x.startsWith("**Like to build things?** Try ") ||
          x.startsWith("**Notes:**") ||
          x.startsWith("If you liked this, you may also like ") ||
          x.startsWith(
            "[![](../../images/redditino.png)]"
          ) ||
          x.startsWith("[Comment](http://news.ycombinator") ||
          x.startsWith("**New:** [Download On Lisp") ||
          x.startsWith(
            "Image: Casey Muller: Trevor Blackwell at Rehearsal Day"
          ) ||
          x.startsWith(
            "There can't be more than a couple thousand people who know first-hand what happens"
          ) ||
          x.trim() === "**Founders at Work**" ||
          x.startsWith(
            "[![](../../images/faw-2.jpg)](http://www.amazon.com"
          )
        )
    )
    .join("\n");
}

function clearEndMeta(md: string): string {
  const lines = md.split("\n");
  let idx = lines.length - 1;
  while (idx >= 0) {
    const line = lines[idx]?.trim();
    if (
      !line ||
      line.startsWith("You'll find this essay and 14 others in") ||
      isLink(line)
    ) {
      idx--;
      continue;
    }
    break;
  }
  return lines.slice(0, idx + 1).join("\n");
}

const isLink = (line: string) => /^\[.*?\]\(.*?\)$/.test(line);
