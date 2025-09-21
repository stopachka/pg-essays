import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { Element } from "domhandler";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");
const CACHE_ROOT = join(PROJECT_ROOT, "cache");
const HTML_CACHE_DIR = join(CACHE_ROOT, "html");
const OUTPUT_ROOT = join(PROJECT_ROOT, "output");
const OUTPUT_HTML_DIR = join(OUTPUT_ROOT, "html");
const OUTPUT_LATEX_DIR = join(OUTPUT_ROOT, "tex");
const BOOK_OUTPUT_DIR = join(OUTPUT_ROOT, "book");
const BOOK_TEX_FILENAME = "book.tex";
const BOOK_PDF_FILENAME = "book.pdf";
const BOOK_EPUB_FILENAME = "book.epub";
const BOOK_MOBI_FILENAME = "book.mobi";
const DEFAULT_BOOK_TITLE = "Essays by Paul Graham";
const ESSAY_META_CACHE_PATH = join(CACHE_ROOT, "essays.json");
const LEGACY_CACHE_DIR = resolve(PROJECT_ROOT, "../book/gen/html_cache");

const ROOT_URL = "http://www.paulgraham.com";
const ARTICLES_INDEX = `${ROOT_URL}/articles.html`;
const ARTICLES_CACHE_KEY = "00_articles_index";

export interface EssayMeta {
  index: number;
  slug: string;
  url: string;
  key: string;
}

export type DiffSegmentType = "equal" | "add" | "remove";

export interface DiffSegment {
  type: DiffSegmentType;
  lines: string[];
}

export interface EssayResult {
  meta: EssayMeta;
  title: string;
  originalHtml: string;
  sanitizedHtml: string;
  latex: string;
  textBefore: string[];
  textAfter: string[];
  diff: DiffSegment[];
}

type HtmlTransform = ($: CheerioAPI, essay: EssayMeta) => void | Promise<void>;

const BASE_TRANSFORMS: HtmlTransform[] = [
  isolatePrimaryColumn,
  removeScripts,
  dropMenuArtifacts,
  convertTitleFromImage,
  unwrapFonts,
  stripTrackingImages,
  flattenLayoutTables,
  trimBodyBreaks,
  unwrapRedundantDivs,
  focusOnMainContent,
  hoistTopLevelDiv,
  convertBreaksToParagraphs,
  dropAdvertisements,
  dropFooterLinks,
  hoistTopLevelDiv,
  trimBodyBreaks,
  removeEmptyNodes,
];

const TRANSFORM_OVERRIDES: Record<string, HtmlTransform[]> = {};

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
function cachePathFor(key: string, dir = HTML_CACHE_DIR): string {
  return join(dir, `${key}.html`);
}

function loadFromDisk(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

async function fetchRemote(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

async function loadHtml(cacheKey: string, url: string, force = false): Promise<string> {
  ensureDir(HTML_CACHE_DIR);
  const dest = cachePathFor(cacheKey);
  if (!force) {
    const cached = loadFromDisk(dest);
    if (cached) {
      return cached;
    }
  }

  const legacy = cachePathFor(cacheKey, LEGACY_CACHE_DIR);
  const legacyHtml = loadFromDisk(legacy);
  if (legacyHtml) {
    writeFileSync(dest, legacyHtml);
    return legacyHtml;
  }

  const remote = await fetchRemote(url);
  writeFileSync(dest, remote);
  return remote;
}

function chapterKey(idx: number, slug: string): string {
  return `${String(idx + 1).padStart(3, "0")}_${slug}`;
}

function slugFromUrl(url: string): string {
  const [last] = url.split("?")[0]?.split("/").slice(-1) ?? ["chapter"];
  const [slug] = last.split(".");
  return slug || "chapter";
}

function extractLinks($: CheerioAPI): string[] {
  return $("table:nth-of-type(2)")
    .find("a")
    .toArray()
    .map((node) => (node.attribs?.href ? node.attribs.href : ""))
    .filter(Boolean)
    .filter((href) => !href.startsWith("http"))
    .map((href) => `${ROOT_URL}/${href}`)
    .reverse();
}

export async function loadEssayMeta(force = false): Promise<EssayMeta[]> {
  ensureDir(CACHE_ROOT);
  if (!force && existsSync(ESSAY_META_CACHE_PATH)) {
    const cached = readFileSync(ESSAY_META_CACHE_PATH, "utf-8");
    const parsed: EssayMeta[] = JSON.parse(cached);
    return parsed;
  }

  const indexHtml = await loadHtml(ARTICLES_CACHE_KEY, ARTICLES_INDEX, force);
  const $index = load(indexHtml);
  const links = extractLinks($index);
  const essays = links.map((url, index) => {
    const slug = slugFromUrl(url);
    return {
      index,
      slug,
      url,
      key: chapterKey(index, slug),
    } satisfies EssayMeta;
  });

  writeFileSync(ESSAY_META_CACHE_PATH, JSON.stringify(essays, null, 2));
  return essays;
}

function cloneForWork(html: string): {
  original$: CheerioAPI;
  working$: CheerioAPI;
} {
  const original$ = load(html);
  const working$ = load(html);
  return { original$, working$ };
}

function isolatePrimaryColumn($: CheerioAPI): void {
  const body = $("body");
  if (!body.children().length) return;

  const mainTables = body.children("table");
  let contentHtml = "";

  mainTables.each((_, table) => {
    const row = $(table).find("> tr").first();
    if (!row.length) return;
    const candidate = row.children("td").filter((_, td) => {
      const cell = $(td);
      const hasParagraph = cell.find("p, div, font, h1, h2, h3").length > 0;
      return hasParagraph;
    }).last();
    if (candidate.length) {
      contentHtml = candidate.html() ?? "";
      return false;
    }
    return undefined;
  });

  if (contentHtml) {
    body.html(contentHtml);
  }
}

function removeScripts($: CheerioAPI): void {
  $("script").remove();
}

function dropMenuArtifacts($: CheerioAPI): void {
  $("map").remove();
  $("a[href='index.html']").remove();
  $("a[href='articles.html']").remove();
  $("img[src*='essays-6.gif']").remove();
  $("img[src*='essays-5.gif']").remove();
  $("img[src*='trans_1x1.gif']").remove();
}

function convertTitleFromImage($: CheerioAPI, essay: EssayMeta): void {
  const firstImage = $("img[alt]").first();
  if (!firstImage.length) return;
  const alt = firstImage.attr("alt")?.trim();
  if (!alt) return;
  firstImage.replaceWith(`<h1>${alt}</h1>`);
}

function unwrapFonts($: CheerioAPI): void {
  $("font, xfont").each((_, el) => {
    const node = $(el);
    node.replaceWith(node.html() ?? "");
  });
}

function stripTrackingImages($: CheerioAPI): void {
  const badSources = new Set([
    "http://www.virtumundo.com/images/spacer.gif",
    "https://s.turbifycdn.com/aah/paulgraham/serious-2.gif",
    "https://sep.turbifycdn.com/ca/Img/trans_1x1.gif",
  ]);
  $("img[src]").each((_, img) => {
    const src = $(img).attr("src");
    if (src && badSources.has(src)) {
      $(img).remove();
    }
  });
}

function removeSmallContainer($: CheerioAPI, node: Cheerio, maxLength = 360): void {
  let current = node;
  while (
    current.parent().length &&
    current.parent()[0] &&
    current.parent()[0].tagName &&
    current.parent()[0].tagName.toLowerCase() !== 'body'
  ) {
    const parent = current.parent();
    const text = collapseWhitespace(parent.text());
    if (!text || text.length > maxLength) {
      break;
    }
    current = parent;
  }
  const currentText = collapseWhitespace(current.text());
  if (currentText && currentText.length <= maxLength) {
    current.remove();
  } else {
    const nodeText = collapseWhitespace(node.text());
    if (nodeText && nodeText.length <= maxLength) {
      node.remove();
    }
  }
}
function flattenLayoutTables($: CheerioAPI): void {
  const flatten = (selector: string, wrap = false): boolean => {
    let changed = false;
    $(selector).each((_, el) => {
      const node = $(el);
      if (wrap) {
        node.replaceWith(`<div>${node.html() ?? ''}</div>`);
      } else {
        node.replaceWith(node.html() ?? '');
      }
      changed = true;
    });
    return changed;
  };

  let changed = true;
  while (changed) {
    changed = false;
    if (flatten('td', true)) changed = true;
    if (flatten('tr', true)) changed = true;
    if (flatten('tbody', true)) changed = true;
    if (flatten('thead', true)) changed = true;
    if (flatten('table', true)) changed = true;
  }
}

function trimBodyBreaks($: CheerioAPI): void {
  const body = $('body');
  let adjusted = true;
  while (adjusted) {
    adjusted = false;
    const first = body.contents().first();
    if (first && first[0] && first[0].type === 'tag' && first[0].name === 'br') {
      first.remove();
      adjusted = true;
      continue;
    }
    const last = body.contents().last();
    if (last && last[0] && last[0].type === 'tag' && last[0].name === 'br') {
      last.remove();
      adjusted = true;
    }
  }
}

function unwrapRedundantDivs($: CheerioAPI): void {
  let changed = true;
  while (changed) {
    changed = false;
    $('div').each((_, el) => {
      const node = $(el);
      const attribs = node[0]?.attribs ?? {};
      if (Object.keys(attribs).length > 0) return;
      const children = node.contents();
      const hasText = children.filter((_, child) => {
        if (child.type !== 'text') return false;
        return collapseWhitespace($(child).text()) !== '';
      }).length > 0;
      if (hasText) return;
      if (children.length === 1 && children.first().is('div')) {
        node.replaceWith(children.first());
        changed = true;
      }
    });
  }
}

function focusOnMainContent($: CheerioAPI): void {
  const body = $('body');
  const candidates = body
    .find('div')
    .toArray()
    .map((el) => $(el))
    .filter((node) => {
      if (node.parents('body').length === 0) return false;
      const textLength = collapseWhitespace(node.text()).length;
      const hasHeading = node.find('h1, h2').length > 0;
      return hasHeading || textLength > 400;
    });
  if (candidates.length === 0) {
    return;
  }
  const best = candidates.reduce((prev, current) => {
    const prevScore = collapseWhitespace(prev.text()).length;
    const currScore = collapseWhitespace(current.text()).length;
    return currScore > prevScore ? current : prev;
  });
  const clone = best.clone();
  body.empty();
  const contents = clone.contents();
  if (contents.length) {
    body.append(contents);
  } else {
    body.append(clone);
  }
}

function hoistTopLevelDiv($: CheerioAPI): void {
  const body = $('body');
  let changed = true;
  while (changed) {
    changed = false;
    trimBodyBreaks($);
    const children = body.children();
    if (children.length === 1 && children.first().is('div') && Object.keys(children.first()[0]?.attribs ?? {}).length === 0) {
      body.html(children.first().html() ?? '');
      changed = true;
      continue;
    }
    body.children('div').each((_, el) => {
      const node = $(el);
      if (Object.keys(node[0]?.attribs ?? {}).length > 0) return;
      const meaningful = node.contents().filter((_, child) => {
        if (child.type === 'tag' && child.name === 'br') return false;
        if (child.type === 'text') {
          return collapseWhitespace($(child).text()) !== '';
        }
        return true;
      });
      if (meaningful.length === 0) {
        node.remove();
        changed = true;
      }
    });
  }
  trimBodyBreaks($);
}

function convertBreaksToParagraphs($: CheerioAPI): void {
  const body = $('body');
  const newChildren: Cheerio<any>[] = [];
  let current: any[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const paragraph = $('<p></p>');
    current.forEach((node) => paragraph.append(node));
    newChildren.push(paragraph);
    current = [];
  };

  body.contents().each((_, node) => {
    if (node.type === 'tag' && (node.name === 'h1' || node.name === 'h2')) {
      flush();
      newChildren.push($(node));
      return;
    }
    if (node.type === 'tag' && node.name === 'br') {
      flush();
      return;
    }
    if (node.type === 'text') {
      const text = collapseWhitespace(node.data || '');
      if (!text) return;
      current.push($(node));
      return;
    }
    current.push($(node));
  });
  flush();

  if (newChildren.length === 0) return;
  body.empty();
  newChildren.forEach((child) => body.append(child));
}


const AD_PATTERNS = [
  /Want to start a startup/i,
  /Apply to Y Combinator/i,
  /Subscribe to my newsletter/i,
];

const AD_LINK_PATTERNS = [/onlisptext\.html/i];

function dropAdvertisements($: CheerioAPI): void {
  $('a[href]').each((_, el) => {
    const href = el.attribs?.href || '';
    if (AD_LINK_PATTERNS.some((pattern) => pattern.test(href))) {
      removeSmallContainer($, $(el));
    }
  });
  $('body *').each((_, el) => {
    const node = $(el);
    const copy = collapseWhitespace(node.text());
    if (!copy) return;
    if (copy.length <= 320 && AD_PATTERNS.some((pattern) => pattern.test(copy))) {
      removeSmallContainer($, node);
    }
  });
  $('b').each((_, el) => {
    const bold = $(el);
    if (!/^new:?$/i.test(collapseWhitespace(bold.text()))) return;
    const toNuke: Element[] = [el];
    let pointer: any = el.next;
    while (pointer) {
      if (pointer.type === 'tag' && pointer.name === 'br') {
        toNuke.push(pointer);
        pointer = pointer.next;
        continue;
      }
      if (pointer.type === 'tag' && pointer.name === 'a') {
        const href = pointer.attribs?.href || '';
        if (AD_LINK_PATTERNS.some((pattern) => pattern.test(href))) {
          toNuke.push(pointer);
          pointer = pointer.next;
          continue;
        }
      }
      if (pointer.type === 'text') {
        const content = collapseWhitespace(pointer.data || '');
        if (!content || content === '.' || content === ':') {
          toNuke.push(pointer);
          pointer = pointer.next;
          continue;
        }
      }
      break;
    }
    toNuke.forEach((node) => $(node).remove());
  });
}

const FOOTER_PATTERNS = [
  /You'?ll find this essay/i,
  /Return to/i,
  /Back to top/i,
  /New:/i,
  /Prev:/i,
  /Next:/i,
  /Reader comments/i,
  /Follow me on/i,
  /Thanks to/i,
];

function dropFooterLinks($: CheerioAPI): void {
  const body = $("body");
  let removed = false;
  do {
    removed = false;
    const lastChild = body.children().last();
    if (!lastChild.length) break;
    const text = collapseWhitespace(lastChild.text());
    if (!text) {
      lastChild.remove();
      removed = true;
      continue;
    }
    if (lastChild.is("hr")) {
      lastChild.remove();
      removed = true;
      continue;
    }
    if (text.length <= 240 && FOOTER_PATTERNS.some((pattern) => pattern.test(text))) {
      lastChild.remove();
      removed = true;
      continue;
    }
    const links = lastChild.find("a[href]");
    if (
      links.length &&
      text.length < 200 &&
      links.toArray().every((link) => {
        const href = link.attribs?.href || "";
        return href.startsWith("http") || href.endsWith(".html");
      })
    ) {
      lastChild.remove();
      removed = true;
      continue;
    }
  } while (removed);
}

function collapseBreakRuns($: CheerioAPI): void {
  $("br + br").each((_, el) => {
    $(el).remove();
  });
}

function removeEmptyNodes($: CheerioAPI): void {
  $("body *").each((_, el) => {
    const node = $(el);
    if (node.children().length) return;
    if ((node.text() || "").trim()) return;
    if (node.is("br")) return;
    node.remove();
  });
}

function applyTransforms($: CheerioAPI, essay: EssayMeta): void {
  const transforms = [...BASE_TRANSFORMS, ...(TRANSFORM_OVERRIDES[essay.slug] ?? [])];
  const debugTarget = typeof process !== 'undefined' ? process.env.DEBUG_TRANSFORM : undefined;
  transforms.forEach((transform, index) => {
    transform($, essay);
    if (debugTarget && (debugTarget === '*' || debugTarget === essay.slug || debugTarget === essay.key)) {
      const name = transform.name || `transform_${index}`;
      const snapshot = $('body').html() ?? '';
      console.log(`[transform:${index}] ${name}`);
      console.log(snapshot.slice(0, 400));
    }
  });
}

function extractTextLines($: CheerioAPI): string[] {
  const plain = htmlBodyToPlainText($);
  return plain
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function determineTitle($: CheerioAPI, essay: EssayMeta): string {
  const firstHeading = $("h1, h2").first();
  if (firstHeading.length) {
    const text = firstHeading.text().replace(/\s+/g, " ").trim();
    if (text) {
      firstHeading.remove();
      return text;
    }
  }
  return essay.slug.replace(/_/g, " ");
}

function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([{}_#%&$])/g, "\\$1")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\u00A0/g, " ")
    .replace(/\u2014/g, "---")
    .replace(/\u2013/g, "--");
}


function resolveHref(href: string): string {
  if (!href) return href;
  if (/^(?:https?:|mailto:|tel:)/i.test(href)) {
    return href;
  }
  if (href.startsWith('#')) {
    return href;
  }
  if (href.startsWith('//')) {
    return `https:${href}`;
  }
  if (href.startsWith('/')) {
    return `${ROOT_URL}${href}`;
  }
  return `${ROOT_URL}/${href}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nodeChildrenPlainText($: CheerioAPI, el: Element): string {
  let buffer = '';
  $(el)
    .contents()
    .each((_, child) => {
      buffer += nodeToPlainText($, child);
    });
  return buffer;
}

function nodeToPlainText($: CheerioAPI, node: any): string {
  if (!node) return '';
  if (node.type === 'text') {
    return (node.data || '').replace(/\s+/g, ' ');
  }
  if (node.type === 'tag') {
    const name = node.name.toLowerCase();
    switch (name) {
      case 'br':
        return '\n';
      case 'p':
      case 'div':
      case 'blockquote':
        return `${nodeChildrenPlainText($, node)}\n`;
      case 'li':
        return `- ${nodeChildrenPlainText($, node)}\n`;
      case 'ul':
      case 'ol':
        return `${nodeChildrenPlainText($, node)}\n`;
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
        return `${nodeChildrenPlainText($, node)}\n`;
      default:
        return nodeChildrenPlainText($, node);
    }
  }
  return '';
}

function htmlBodyToPlainText($: CheerioAPI): string {
  const body = $('body').get(0);
  if (!body) return '';
  let buffer = '';
  $(body)
    .contents()
    .each((_, node) => {
      buffer += nodeToPlainText($, node);
    });
  return buffer;
}


function nodeChildrenLatex($: CheerioAPI, el: Element): string {
  const parts: string[] = [];
  $(el)
    .contents()
    .each((_, child) => {
      parts.push(nodeToLatex($, child));
    });
  return parts.join("");
}

function wrapBlock(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}

function nodeToLatex($: CheerioAPI, node: any): string {
  if (!node) return "";
  if (node.type === "text") {
    return escapeLatex(node.data || "");
  }

  if (node.type === "tag") {
    const name = node.name.toLowerCase();
    switch (name) {
      case "br":
        return "\n";
      case "p":
        return wrapBlock(`${nodeChildrenLatex($, node)}\n`);
      case "div":
      case "span":
        return nodeChildrenLatex($, node);
      case "em":
      case "i":
        return `\\emph{${nodeChildrenLatex($, node)}}`;
      case "strong":
      case "b":
        return `\\textbf{${nodeChildrenLatex($, node)}}`;
      case "u":
        return `\\underline{${nodeChildrenLatex($, node)}}`;
      case "a": {
        const rawHref = $(node).attr("href") || "";
        const text = nodeChildrenLatex($, node) || escapeLatex(rawHref);
        if (!rawHref) return text;
        const resolved = resolveHref(rawHref);
        return `\\href{${escapeLatex(resolved)}}{${text}}`;
      }
      case "blockquote":
        return wrapBlock(`\\begin{quote}\n${nodeChildrenLatex($, node)}\n\\end{quote}\n`);
      case "ul": {
        const items = $(node)
          .children("li")
          .toArray()
          .map((li) => `\\item ${nodeChildrenLatex($, li)}\n`)
          .join("");
        return wrapBlock(`\\begin{itemize}\n${items}\\end{itemize}\n`);
      }
      case "ol": {
        const items = $(node)
          .children("li")
          .toArray()
          .map((li) => `\\item ${nodeChildrenLatex($, li)}\n`)
          .join("");
        return wrapBlock(`\\begin{enumerate}\n${items}\\end{enumerate}\n`);
      }
      case "li":
        return `\\item ${nodeChildrenLatex($, node)}\n`;
      case "h1":
        return wrapBlock(`\\section*{${nodeChildrenLatex($, node)}}\n`);
      case "h2":
        return wrapBlock(`\\subsection*{${nodeChildrenLatex($, node)}}\n`);
      case "h3":
        return wrapBlock(`\\subsubsection*{${nodeChildrenLatex($, node)}}\n`);
      case "hr":
        return "\\bigskip\\hrule\\bigskip\n";
      case "table":
      case "tbody":
      case "thead":
      case "tr":
      case "td":
        return nodeChildrenLatex($, node);
      default:
        return nodeChildrenLatex($, node);
    }
  }

  return "";
}

function htmlBodyToLatex($: CheerioAPI): string {
  const body = $("body").get(0);
  if (!body) return "";
  const parts: string[] = [];
  $(body)
    .contents()
    .each((_, node) => {
      parts.push(nodeToLatex($, node));
    });
  return parts.join("");
}

function buildSanitizedBodyHtml($: CheerioAPI): string {
  const body = $('body');
  const originalHtml = body.html() ?? '';
  if (!originalHtml.trim()) return '';

  const clone = load(`<body>${originalHtml}</body>`, null, false);
  const cloneBody = clone('body');
  let headingHtml = '';
  const heading = cloneBody.find('h1').first();
  if (heading.length) {
    headingHtml = clone.html(heading);
    heading.remove();
  }

  const out = load('<body></body>', null, false);
  const outBody = out('body');
  if (headingHtml) {
    outBody.append(headingHtml);
  }

  const blob = cloneBody.html() ?? '';
  const segments = blob
    .split(/(?:\s*<br\s*\/?>(?:&nbsp;)?\s*){2,}/i)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    if (typeof process !== 'undefined' && process.env.DEBUG_SANITIZED) {
      console.log('[sanitize] fallback to original HTML');
    }
    return originalHtml;
  }

  segments.forEach((segment) => {
    const cleaned = segment.replace(/(?:\s*<br\s*\/?>(?:&nbsp;)?\s*)+/gi, '<br />');
    outBody.append(`<p>${cleaned}</p>`);
  });

  return outBody.html() ?? '';
}

function computeDiff(before: string[], after: string[]): DiffSegment[] {
  const m = before.length;
  const n = after.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (before[i] === after[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;

  const pushSegment = (type: DiffSegmentType, line: string) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) {
      last.lines.push(line);
    } else {
      segments.push({ type, lines: [line] });
    }
  };

  while (i < m && j < n) {
    if (before[i] === after[j]) {
      pushSegment("equal", before[i]);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushSegment("remove", before[i]);
      i += 1;
    } else {
      pushSegment("add", after[j]);
      j += 1;
    }
  }

  while (i < m) {
    pushSegment("remove", before[i]);
    i += 1;
  }

  while (j < n) {
    pushSegment("add", after[j]);
    j += 1;
  }

  return segments;
}

function cacheTransformed(meta: EssayMeta, html: string, latex: string): void {
  ensureDir(OUTPUT_ROOT);
  ensureDir(OUTPUT_HTML_DIR);
  ensureDir(OUTPUT_LATEX_DIR);
  writeFileSync(join(OUTPUT_HTML_DIR, `${meta.key}.html`), html);
  writeFileSync(join(OUTPUT_LATEX_DIR, `${meta.key}.tex`), latex);
}

export async function transformEssay(meta: EssayMeta, options?: { force?: boolean; cache?: boolean }): Promise<EssayResult> {
  const html = await loadHtml(meta.key, meta.url, options?.force ?? false);
  const { original$, working$ } = cloneForWork(html);
  const beforeLines = extractTextLines(original$);
  applyTransforms(working$, meta);
  const afterLines = extractTextLines(working$);
  const title = determineTitle(working$, meta);
  const latexBody = htmlBodyToLatex(working$);
  const latex = `\\chapter{${escapeLatex(title)}}\n\n${latexBody}`;
  const diff = computeDiff(beforeLines, afterLines);
  const sanitizedBody = buildSanitizedBodyHtml(working$);
  const sanitizedHtml = `<!doctype html>\n<html>\n  <head>\n    <meta charset="utf-8" />\n    <title>${escapeHtml(title)}</title>\n  </head>\n  <body>\n${sanitizedBody}\n  </body>\n</html>\n`;
  if (options?.cache) {
    cacheTransformed(meta, sanitizedHtml, latex);
  }
  return {
    meta,
    title,
    originalHtml: original$.html(),
    sanitizedHtml,
    latex,
    textBefore: beforeLines,
    textAfter: afterLines,
    diff,
  };
}

export async function transformAll(options?: { force?: boolean; cache?: boolean }): Promise<EssayResult[]> {
  const essays = await loadEssayMeta(options?.force ?? false);
  const results: EssayResult[] = [];
  for (const essay of essays) {
    results.push(await transformEssay(essay, options));
  }
  return results;
}

export function diffSummary(diff: DiffSegment[]): { removed: number; added: number } {
  return diff.reduce(
    (acc, segment) => {
      if (segment.type === "remove") {
        acc.removed += segment.lines.length;
      }
      if (segment.type === "add") {
        acc.added += segment.lines.length;
      }
      return acc;
    },
    { removed: 0, added: 0 },
  );
}

export function formatDiff(diff: DiffSegment[]): string {
  return diff
    .map((segment) => {
      const prefix = segment.type === "equal" ? " " : segment.type === "add" ? "+" : "-";
      return segment.lines.map((line) => `${prefix} ${line}`).join("\n");
    })
    .join("\n");
}



function composeLatexBook(results: EssayResult[], title: string): string {
  const body = results.map((result) => result.latex.trim()).join("\n\n");
  return [
    "\\documentclass[11pt]{book}",
    "\\usepackage[margin=1in]{geometry}",
    "\\usepackage{hyperref}",
    "\\usepackage{enumitem}",
    "\\usepackage{titlesec}",
    "\\usepackage{setspace}",
    "\\setstretch{1.15}",
    `\\title{${escapeLatex(title)}}`,
    "\\author{Paul Graham}",
    "\\date{}",
    "\\begin{document}",
    "\\frontmatter",
    "\\maketitle",
    "\\tableofcontents",
    "\\mainmatter",
    body,
    "\\end{document}",
    "",
  ].join("\n");
}

interface CommandOutcome {
  path: string;
  command: string;
  stdout: string;
  stderr: string;
}

interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
}

function findCommand(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate.startsWith('/')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    if (candidate.startsWith('.')) {
      const abs = resolve(PROJECT_ROOT, candidate);
      if (existsSync(abs)) return abs;
      continue;
    }
    if (candidate.includes('/')) {
      const abs = resolve(PROJECT_ROOT, candidate);
      if (existsSync(abs)) return abs;
    }
    const resolved = Bun.which(candidate);
    if (resolved) return resolved;
  }
  return undefined;
}

async function runCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
  const proc = Bun.spawn({ cmd: [command, ...args], cwd, stdout: "pipe", stderr: "pipe" });
  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  const stdout = await stdoutPromise;
  const stderr = await stderrPromise;
  return { success: exitCode === 0, stdout, stderr, exitCode, command: [command, ...args].join(' ') };
}

async function compilePdf(latexPath: string): Promise<CommandOutcome | undefined> {
  const command = findCommand(["tectonic", "latexmk", "pdflatex", "xelatex", "lualatex"]);
  if (!command) return undefined;
  const dir = dirname(latexPath);
  const base = basename(latexPath);
  const pdfName = base.replace(/\.tex$/i, ".pdf");
  if (existsSync(join(dir, pdfName))) {
    unlinkSync(join(dir, pdfName));
  }
  let args: string[];
  if (command.endsWith("tectonic")) {
    args = [base, "--outdir", ".", "--keep-logs"];
  } else if (command.endsWith("latexmk")) {
    args = ["-pdf", "-interaction=nonstopmode", base];
  } else {
    args = ["-interaction=nonstopmode", base];
  }
  const result = await runCommand(command, args, dir);
  if (!result.success) return undefined;
  const path = join(dir, pdfName);
  if (!existsSync(path)) return undefined;
  return { path, command: result.command, stdout: result.stdout, stderr: result.stderr };
}

async function compileEpub(latexPath: string): Promise<CommandOutcome | undefined> {
  const command = findCommand(["pandoc"]);
  if (!command) return undefined;
  const dir = dirname(latexPath);
  const base = basename(latexPath);
  const outputName = BOOK_EPUB_FILENAME;
  const target = join(dir, outputName);
  if (existsSync(target)) {
    unlinkSync(target);
  }
  const args = [base, "-o", outputName, "--from=latex"];
  const result = await runCommand(command, args, dir);
  if (!result.success) return undefined;
  if (!existsSync(target)) return undefined;
  return { path: target, command: result.command, stdout: result.stdout, stderr: result.stderr };
}

async function compileMobi(epubPath: string): Promise<CommandOutcome | undefined> {
  const command = findCommand(["kindlegen", "../kindlegen"]);
  if (!command) return undefined;
  const dir = dirname(epubPath);
  const outputName = BOOK_MOBI_FILENAME;
  const target = join(dir, outputName);
  if (existsSync(target)) {
    unlinkSync(target);
  }
  const args = [basename(epubPath), "-o", outputName];
  const result = await runCommand(command, args, dir);
  if (!result.success) return undefined;
  if (!existsSync(target)) return undefined;
  return { path: target, command: result.command, stdout: result.stdout, stderr: result.stderr };
}

export interface BuildBookOptions {
  force?: boolean;
  cache?: boolean;
  compilePdf?: boolean;
  compileEpub?: boolean;
  compileMobi?: boolean;
  title?: string;
  outputDir?: string;
}

export interface BuildBookResult {
  latexPath: string;
  pdfPath?: string;
  epubPath?: string;
  mobiPath?: string;
  results: EssayResult[];
  logs: string[];
}

export async function buildBook(options: BuildBookOptions = {}): Promise<BuildBookResult> {
  const title = options.title ?? DEFAULT_BOOK_TITLE;
  const results = await transformAll({ force: options.force ?? false, cache: options.cache ?? true });
  const latexDoc = composeLatexBook(results, title);
  const bookDir = options.outputDir ? resolve(PROJECT_ROOT, options.outputDir) : BOOK_OUTPUT_DIR;
  ensureDir(bookDir);
  const latexPath = join(bookDir, BOOK_TEX_FILENAME);
  writeFileSync(latexPath, latexDoc);
  const logs: string[] = [`LaTeX saved to ${latexPath}`];

  const wantPdf = options.compilePdf !== false;
  const wantEpub = options.compileEpub !== false;
  const wantMobi = options.compileMobi !== false;

  let pdfPath: string | undefined;
  let epubPath: string | undefined;
  let mobiPath: string | undefined;

  if (wantPdf) {
    const pdf = await compilePdf(latexPath);
    if (pdf) {
      pdfPath = pdf.path;
      logs.push(`PDF generated via ${pdf.command}`);
    } else {
      logs.push("PDF skipped (no LaTeX compiler available).");
    }
  }

  if (wantEpub) {
    const epub = await compileEpub(latexPath);
    if (epub) {
      epubPath = epub.path;
      logs.push(`EPUB generated via ${epub.command}`);
    } else {
      logs.push("EPUB skipped (pandoc not available).");
    }
  }

  if (wantMobi && epubPath) {
    const mobi = await compileMobi(epubPath);
    if (mobi) {
      mobiPath = mobi.path;
      logs.push(`MOBI generated via ${mobi.command}`);
    } else {
      logs.push("MOBI skipped (kindlegen not available).");
    }
  } else if (wantMobi) {
    logs.push("MOBI skipped (EPUB not generated).");
  }

  return { latexPath, pdfPath, epubPath, mobiPath, results, logs };
}
