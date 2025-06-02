#!/usr/bin/env bun

import { parseArgs } from "node:util";
import path from "node:path";

// Main functions will be imported as needed

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h" },
    limit: { type: "string", short: "l", default: "3" },
    concurrency: { type: "string", short: "c", default: "5" },
    all: { type: "boolean", short: "a" },
    report: { type: "boolean", short: "r" },
    view: { type: "boolean", short: "v" },
    diff: { type: "string", short: "d" },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`
🔄 PG Essays Converter Runner

Usage: bun src/runner.ts [options] [command]

Options:
  -h, --help              Show this help message
  -l, --limit NUMBER      Limit number of essays to process (default: 3)
  -a, --all               Process all essays (ignores --limit)
  -c, --concurrency NUM   Set AI request concurrency (default: 5)
  -r, --report            Generate report after conversion
  -v, --view              View existing report
  -d, --diff TITLE        Show differences for specific essay

Commands:
  convert                 Run the conversion (default)
  report                  View the latest report
  diff "Essay Title"      Show differences for specific essay

Examples:
  bun src/runner.ts                           # Convert first 3 essays
  bun src/runner.ts --all                     # Convert all essays
  bun src/runner.ts --limit 10 --report       # Convert 10 essays and show report
  bun src/runner.ts --view                    # Just view the latest report
  bun src/runner.ts --diff "Programming"      # Show differences for essay
  bun src/runner.ts convert --limit 5         # Convert 5 essays
`);
  process.exit(0);
}

const command = positionals[0] || "convert";
const limit = values.all ? undefined : parseInt(values.limit || "3");
const concurrency = parseInt(values.concurrency || "5");

// Set environment variables for the main script
process.env.PG_CONVERT_LIMIT = limit?.toString() || "all";
process.env.PG_CONVERT_CONCURRENCY = concurrency.toString();

async function runCommand() {
  switch (command) {
    case "convert":
      console.log(`🚀 Converting essays (limit: ${limit || "all"}, concurrency: ${concurrency})...`);
      // Import and run the main conversion
      await import("./transform.ts");
      if (values.report || values.view) {
        // Show report after conversion
        const { loadAndDisplayReport } = await import("./report-viewer.ts");
        await loadAndDisplayReport();
      }
      break;
      
    case "report":
    case "view":
      const { loadAndDisplayReport } = await import("./report-viewer.ts");
      await loadAndDisplayReport();
      break;
      
    case "diff":
      const title = values.diff || positionals[1];
      if (!title) {
        console.error("❌ Please provide an essay title for diff command");
        process.exit(1);
      }
      const { displayDifferencesForEntry } = await import("./report-viewer.ts");
      const reportPath = path.join(import.meta.dir, "..", "prep", "conversion_report.json");
      const file = Bun.file(reportPath);
      if (!(await file.exists())) {
        console.error("❌ No report found. Run conversion first.");
        process.exit(1);
      }
      const report = JSON.parse(await file.text());
      displayDifferencesForEntry(report, title);
      break;
      
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log("Run with --help for usage information");
      process.exit(1);
  }
}

// Handle direct options
if (values.view) {
  const { loadAndDisplayReport } = await import("./report-viewer.ts");
  await loadAndDisplayReport();
} else if (values.diff) {
  const { displayDifferencesForEntry } = await import("./report-viewer.ts");
  const reportPath = path.join(import.meta.dir, "..", "prep", "conversion_report.json");
  const file = Bun.file(reportPath);
  if (!(await file.exists())) {
    console.error("❌ No report found. Run conversion first.");
    process.exit(1);
  }
  const report = JSON.parse(await file.text());
  displayDifferencesForEntry(report, values.diff);
} else {
  await runCommand();
}