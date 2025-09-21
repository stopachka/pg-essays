# Essay Transformer Toolkit

This Bun workspace captures HTML from Paul Graham's essay index, applies HTML-only transformations, generates LaTeX, and gives you tools to review the changes.

## Prerequisites
- [Bun](https://bun.com) v1.2+
- Cached HTML under `../book/gen/html_cache` or network access to `paulgraham.com`
- Optional binaries for final artifacts: `tectonic`/`latexmk` (PDF), `pandoc` (EPUB), `kindlegen` (MOBI)

## CLI commands

```
bun run src/cli.ts list
bun run src/cli.ts diff <slug|key|index> [--force] [--no-cache]
bun run src/cli.ts transform <slug|key|index> [--force] [--no-cache]
bun run src/cli.ts build [--no-pdf] [--no-epub] [--no-mobi] [--force] [--no-cache] [--title "Custom"] [--output ./dir]
```

- `list` shows available essays.
- `diff` renders textual diffs (added, removed lines).
- `transform` writes sanitized HTML and LaTeX to `output/html` and `output/tex`.
- `build` aggregates every essay into `output/book/book.tex` and, when supporting binaries are present, produces PDF/EPUB/MOBI.

## Web reviewer

```
bun run src/web/server.ts
# open http://localhost:3000
```

The web app shows the original text, cleaned text, aggregated diff, LaTeX output, and sanitized HTML for any essay. Use the refresh button to force a refetch and re-transform.

## Generated artifacts
- Raw HTML cache: `cache/html/<key>.html`
- Sanitized HTML: `output/html/<key>.html`
- LaTeX per essay: `output/tex/<key>.tex`
- Combined book outputs: `output/book/`

## Notes
- Missing cached HTML triggers a fetch; in sandboxed environments without network access you must populate the caches manually.
- Transformation overrides live in `src/main.ts` and can be extended per-slug.
