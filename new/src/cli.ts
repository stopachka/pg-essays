import {
  buildBook,
  diffSummary,
  formatDiff,
  loadEssayMeta,
  transformEssay,
  type BuildBookOptions,
  type EssayMeta,
} from "./main";

interface ParsedArgs {
  flags: Set<string>;
  values: Record<string, string>;
  positional: string[];
}

function parseArgs(args: string[]): ParsedArgs {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [rawName, inlineValue] = arg.slice(2).split("=", 2);
    const name = rawName.toLowerCase();
    if (inlineValue !== undefined) {
      values[name] = inlineValue;
      continue;
    }
    if ((name === "title" || name === "output") && i + 1 < args.length && !args[i + 1].startsWith("--")) {
      values[name] = args[i + 1];
      i += 1;
      continue;
    }
    flags.add(name);
  }
  return { flags, values, positional };
}

async function resolveEssay(identifier: string, essays?: EssayMeta[]): Promise<{ essay: EssayMeta; essays: EssayMeta[] }> {
  const all = essays ?? (await loadEssayMeta());
  let essay: EssayMeta | undefined;
  const numeric = Number(identifier);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    const idx = Math.floor(numeric) - 1;
    if (idx >= 0 && idx < all.length) {
      essay = all[idx];
    }
  }
  if (!essay) {
    essay = all.find((item) => item.slug === identifier || item.key === identifier);
  }
  if (!essay) {
    throw new Error(`Could not find essay matching "${identifier}".`);
  }
  return { essay, essays: all };
}

function printHelp(): void {
  console.log(`Usage: bun run src/cli.ts <command> [options]\n\nCommands:\n  list                      List cached essays\n  diff <slug|key|#>         Render diff for a single essay\n  transform <slug|key|#>    Transform a single essay and cache outputs\n  build [options]           Build the full book (LaTeX/PDF/EPUB/MOBI)\n  help                      Show this message\n\nCommon options:\n  --force                   Refetch remote HTML instead of using cache\n  --no-cache                Skip writing transformed artifacts\n\nBuild options:\n  --no-pdf                  Skip PDF generation\n  --no-epub                 Skip EPUB generation\n  --no-mobi                 Skip MOBI generation\n  --title "Custom"          Override book title\n  --output ./dir            Override book output directory\n`);
}

async function handleList(): Promise<void> {
  const essays = await loadEssayMeta();
  essays.slice(0, 20).forEach((essay) => {
    console.log(`${String(essay.index + 1).padStart(3, "0")}: ${essay.slug} (${essay.url})`);
  });
  if (essays.length > 20) {
    console.log(`… and ${essays.length - 20} more`);
  }
}

async function handleDiff(parsed: ParsedArgs): Promise<void> {
  if (parsed.positional.length === 0) {
    throw new Error("diff requires a slug, key, or numeric index");
  }
  const { essay } = await resolveEssay(parsed.positional[0]);
  const result = await transformEssay(essay, {
    force: parsed.flags.has("force"),
    cache: !parsed.flags.has("no-cache"),
  });
  const summary = diffSummary(result.diff);
  console.log(formatDiff(result.diff));
  console.log("");
  console.log(`Removed: ${summary.removed}, Added: ${summary.added}`);
}

async function handleTransform(parsed: ParsedArgs): Promise<void> {
  if (parsed.positional.length === 0) {
    throw new Error("transform requires a slug, key, or numeric index");
  }
  const { essay } = await resolveEssay(parsed.positional[0]);
  const result = await transformEssay(essay, {
    force: parsed.flags.has("force"),
    cache: !parsed.flags.has("no-cache"),
  });
  console.log(`Title: ${result.title}`);
  console.log(`HTML cache: output/html/${result.meta.key}.html`);
  console.log(`LaTeX cache: output/tex/${result.meta.key}.tex`);
  const summary = diffSummary(result.diff);
  console.log(`Diff — removed ${summary.removed}, added ${summary.added}`);
}

async function handleBuild(parsed: ParsedArgs): Promise<void> {
  const options: BuildBookOptions = {
    force: parsed.flags.has("force"),
    cache: !parsed.flags.has("no-cache"),
    compilePdf: !parsed.flags.has("no-pdf"),
    compileEpub: !parsed.flags.has("no-epub"),
    compileMobi: !parsed.flags.has("no-mobi"),
  };
  if (parsed.values.title) {
    options.title = parsed.values.title;
  }
  if (parsed.values.output) {
    options.outputDir = parsed.values.output;
  }
  const result = await buildBook(options);
  result.logs.forEach((line) => console.log(line));
  console.log(`LaTeX: ${result.latexPath}`);
  if (result.pdfPath) {
    console.log(`PDF: ${result.pdfPath}`);
  }
  if (result.epubPath) {
    console.log(`EPUB: ${result.epubPath}`);
  }
  if (result.mobiPath) {
    console.log(`MOBI: ${result.mobiPath}`);
  }
}

async function main(): Promise<void> {
  const [, , rawCommand, ...rest] = process.argv;
  const command = (rawCommand || "help").toLowerCase();
  const parsed = parseArgs(rest);

  switch (command) {
    case "list":
      await handleList();
      break;
    case "diff":
      await handleDiff(parsed);
      break;
    case "transform":
      await handleTransform(parsed);
      break;
    case "build":
      await handleBuild(parsed);
      break;
    case "help":
    default:
      printHelp();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
