import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadEssayMeta, transformEssay, type EssayMeta } from "../main";

interface EssaySummary {
  index: number;
  slug: string;
  key: string;
}

const essayCache = new Map<string, ReturnType<typeof transformEssay>>();
const metaCache: { essays: EssayMeta[] | null } = { essays: null };
const staticDir = resolve(import.meta.dir, "static");
const indexHtml = readFileSync(join(staticDir, "index.html"));

async function getEssays(): Promise<EssayMeta[]> {
  if (!metaCache.essays) {
    metaCache.essays = await loadEssayMeta(false);
  }
  return metaCache.essays;
}

function toSummary(essays: EssayMeta[]): EssaySummary[] {
  return essays.map((essay) => ({ index: essay.index, slug: essay.slug, key: essay.key }));
}

async function getEssayResult(slugOrKey: string, force = false) {
  const essays = await getEssays();
  const meta = essays.find((essay) => essay.slug === slugOrKey || essay.key === slugOrKey);
  if (!meta) {
    return null;
  }
  const cacheKey = meta.slug;
  if (!force && essayCache.has(cacheKey)) {
    return { meta, result: await essayCache.get(cacheKey)! };
  }
  const resultPromise = transformEssay(meta, { force, cache: true });
  essayCache.set(cacheKey, resultPromise);
  try {
    const result = await resultPromise;
    return { meta, result };
  } catch (error) {
    essayCache.delete(cacheKey);
    throw error;
  }
}

const server = Bun.serve({
  port: 3080,
  fetch: async (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/") {
      return new Response(indexHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/api/essays") {
      const essays = await getEssays();
      return Response.json(toSummary(essays));
    }

    if (url.pathname.startsWith("/api/essay/")) {
      const slug = decodeURIComponent(url.pathname.replace("/api/essay/", ""));
      const force = url.searchParams.has("force");
      const result = await getEssayResult(slug, force);
      if (!result) {
        return new Response("Not found", { status: 404 });
      }
      const payload = {
        meta: result.meta,
        title: result.result.title,
        textBefore: result.result.textBefore,
        textAfter: result.result.textAfter,
        diff: result.result.diff,
        latex: result.result.latex,
        sanitizedHtml: result.result.sanitizedHtml,
      };
      return Response.json(payload);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Web app running at http://localhost:${server.port}`);
