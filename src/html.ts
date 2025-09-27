import type { CheerioAPI } from "cheerio";
import * as gen from "./gen";

export function transformHTML($html: CheerioAPI): CheerioAPI {
  const ch$ = [
    removeMenu,
    removeLogo,
    removeChapterTitle,
    removeApplyYC,
    removeHr,
    replaceBBNTalkExcerpts,
    convertCourierFontsToPre,
    removeFontTags,
    replaceTables,
    replaceSayNotesLink,
    removeScriptTags,
  ].reduce(($, f) => f($), $html);

  return ch$;
}

function removeMenu($: CheerioAPI): CheerioAPI {
  // TODO(stopachka) -- best way to remove the first td
  const firstTd = $("td:first-child").toArray()[0];
  if (firstTd) {
    (firstTd as any).children = [];
  }
  return $;
}

function removeLogo($: CheerioAPI): CheerioAPI {
  $('a[href="index.html"]').remove();
  return $;
}

function removeHr($: CheerioAPI): CheerioAPI {
  $("hr").remove();
  return $;
}

function removeApplyYC($: CheerioAPI): CheerioAPI {
  $('font:contains("Want to start a startup")')
    .last()
    .closest("table")
    .remove();
  return $;
}

function removeChapterTitle($: CheerioAPI): CheerioAPI {
  const $firstImageWithAlt = $("img[alt]").first();
  const firstImg = $firstImageWithAlt.toArray()[0];
  if (firstImg && "attribs" in firstImg) {
    $firstImageWithAlt.remove();
  }
  const $title = $("title");
  $title.remove();
  return $;
}

function replaceTables($: CheerioAPI): CheerioAPI {
  const toDiv = (tag: string) =>
    $(tag)
      .toArray()
      .reverse()
      .forEach(function (x) {
        $(x).replaceWith(`<div>${$(x).html()}</div>`);
      });
  ["td", "td", "tbody", "thead", "table"].forEach(toDiv);
  return $;
}

function convertCourierFontsToPre($: CheerioAPI): CheerioAPI {
  $("font[face]").each((_, el) => {
    const $el = $(el);
    const face = $el.attr("face");
    if (!face || !/courier/i.test(face)) {
      return;
    }
    $el.replaceWith(`<pre><code>${$el.text()}</code></pre>`);
  });

  return $;
}

function removeFontTags($: CheerioAPI): CheerioAPI {
  $("font").each((_, el) => {
    $(el).replaceWith($(el).html() || "");
  });
  return $;
}

const sayNotesHTML = gen.readText("custom", "sayNotes.html");
const bbnHTML = gen.readText("custom", "bbn.html");

function replaceSayNotesLink($: CheerioAPI): CheerioAPI {
  $('a[href="http://www.paulgraham.com/saynotes.html"]').each((_, el) => {
    $(el).replaceWith(sayNotesHTML);
  });
  return $;
}

function replaceBBNTalkExcerpts($: CheerioAPI): CheerioAPI {
  if ($('a[href*="bbnexcerpts.txt"]').length === 0) {
    return $;
  }
  $.root().html(bbnHTML);
  return $;
}

function removeScriptTags($: CheerioAPI): CheerioAPI {
  $("script").remove();
  return $;
}
