import path from "node:path";

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
} as const;

interface DetailedReport {
  timestamp: string;
  summary: {
    total: number;
    successful: number;
    failed: number;
    withDifferences: number;
  };
  results: Array<{
    title: string;
    url: string;
    success: boolean;
    error?: string;
    processingTimeMs?: number;
    textComparison?: {
      originalLength: number;
      convertedLength: number;
      hasDifferences: boolean;
      similarityScore: number;
      contextualDifferences: Array<{
        type: 'added' | 'removed' | 'unchanged';
        value: string;
        contextBefore?: string;
        contextAfter?: string;
        position?: number;
      }>;
    };
  }>;
}

function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

function displayColorizedReport(report: DetailedReport): void {
  console.log();
  console.log(colorize("=".repeat(80), 'cyan'));
  console.log(colorize("📊 CONVERSION REPORT", 'bright'));
  console.log(colorize("=".repeat(80), 'cyan'));
  console.log();

  // Summary with colors
  console.log(colorize("📈 SUMMARY:", 'bright'));
  console.log(`   Total entries: ${colorize(report.summary.total.toString(), 'white')}`);
  console.log(`   ${colorize('✅', 'green')} Successful: ${colorize(report.summary.successful.toString(), 'green')}`);
  console.log(`   ${colorize('❌', 'red')} Failed: ${colorize(report.summary.failed.toString(), 'red')}`);
  console.log(`   ${colorize('⚠️', 'yellow')} With differences: ${colorize(report.summary.withDifferences.toString(), 'yellow')}`);
  
  // Show processing time info
  const successfulWithTime = report.results.filter(r => r.success && r.processingTimeMs);
  if (successfulWithTime.length > 0) {
    const avgTime = successfulWithTime.reduce((sum, r) => sum + (r.processingTimeMs || 0), 0) / successfulWithTime.length;
    console.log(`   ${colorize('⏱️', 'blue')} Avg processing time: ${colorize(Math.round(avgTime) + 'ms', 'blue')}`);
  }
  
  console.log(`   Generated: ${colorize(new Date(report.timestamp).toLocaleString(), 'cyan')}`);
  console.log();

  // Failed conversions
  const failed = report.results.filter(r => !r.success);
  if (failed.length > 0) {
    console.log(colorize("❌ FAILED CONVERSIONS:", 'red'));
    console.log(colorize("-".repeat(50), 'red'));
    failed.forEach(result => {
      console.log(`${colorize('•', 'red')} ${colorize(result.title, 'bright')}`);
      console.log(`  ${colorize('Error:', 'red')} ${result.error}`);
      console.log();
    });
  }

  // Entries with differences
  const withDifferences = report.results.filter(r => r.textComparison?.hasDifferences);
  if (withDifferences.length > 0) {
    console.log(colorize("⚠️  TEXT DIFFERENCES DETECTED:", 'yellow'));
    console.log(colorize("-".repeat(50), 'yellow'));
    
    withDifferences.forEach(result => {
      const comp = result.textComparison!;
      console.log(`${colorize('📄', 'blue')} ${colorize(result.title, 'bright')}`);
      
      const similarityColor = comp.similarityScore > 0.9 ? 'green' : comp.similarityScore > 0.7 ? 'yellow' : 'red';
      console.log(`   Similarity: ${colorize(`${(comp.similarityScore * 100).toFixed(1)}%`, similarityColor)}`);
      console.log(`   Original: ${colorize(comp.originalLength.toString(), 'white')} chars`);
      console.log(`   Converted: ${colorize(comp.convertedLength.toString(), 'white')} chars`);
      
      if (comp.contextualDifferences && comp.contextualDifferences.length > 0) {
        console.log(`   ${colorize('Key differences:', 'bright')}`);
        comp.contextualDifferences.slice(0, 3).forEach(diff => {
          const preview = diff.value.length > 50 ? diff.value.slice(0, 50) + '...' : diff.value;
          if (diff.type === 'removed') {
            console.log(`   ${colorize('🔴 REMOVED:', 'red')} "${colorize(preview, 'red')}"`);
          } else if (diff.type === 'added') {
            console.log(`   ${colorize('🟢 ADDED:', 'green')} "${colorize(preview, 'green')}"`);
          }
          
          if (diff.contextBefore || diff.contextAfter) {
            const context = `...${diff.contextBefore || ''} ${colorize('[CHANGE]', 'bright')} ${diff.contextAfter || ''}...`;
            console.log(`      ${colorize('Context:', 'cyan')} ${context}`);
          }
        });
      }
      console.log();
    });
  }

  // High quality conversions
  const highQuality = report.results.filter(r => 
    r.success && r.textComparison && r.textComparison.similarityScore > 0.95 && !r.textComparison.hasDifferences
  );
  
  if (highQuality.length > 0) {
    console.log(colorize("✅ HIGH QUALITY CONVERSIONS (>95% similarity):", 'green'));
    console.log(colorize("-".repeat(50), 'green'));
    highQuality.forEach(result => {
      const comp = result.textComparison!;
      console.log(`${colorize('•', 'green')} ${result.title} ${colorize(`(${(comp.similarityScore * 100).toFixed(1)}%)`, 'green')}`);
    });
    console.log();
  }

  console.log(colorize("=".repeat(80), 'cyan'));
}

function displayDifferencesForEntry(report: DetailedReport, entryTitle: string): void {
  const entry = report.results.find(r => r.title.toLowerCase().includes(entryTitle.toLowerCase()));
  
  if (!entry) {
    console.log(colorize(`❌ Entry not found: ${entryTitle}`, 'red'));
    return;
  }

  if (!entry.textComparison || !entry.textComparison.hasDifferences) {
    console.log(colorize(`✅ No differences found for: ${entry.title}`, 'green'));
    return;
  }

  if (!entry.textComparison.contextualDifferences || entry.textComparison.contextualDifferences.length === 0) {
    console.log(colorize(`✅ No contextual differences available for: ${entry.title}`, 'green'));
    return;
  }

  console.log();
  console.log(colorize(`📄 DETAILED DIFFERENCES: ${entry.title}`, 'bright'));
  console.log(colorize("-".repeat(60), 'cyan'));
  console.log();

  entry.textComparison.contextualDifferences.forEach((diff, index) => {
    console.log(colorize(`[${index + 1}] ${diff.type.toUpperCase()}:`, 'bright'));
    
    if (diff.type === 'removed') {
      console.log(colorize(`- ${diff.value}`, 'red'));
    } else if (diff.type === 'added') {
      console.log(colorize(`+ ${diff.value}`, 'green'));
    }
    
    if (diff.contextBefore || diff.contextAfter) {
      console.log(colorize(`   Context:`, 'cyan'));
      console.log(`   Before: ${colorize(diff.contextBefore || '(none)', 'white')}`);
      console.log(`   After: ${colorize(diff.contextAfter || '(none)', 'white')}`);
      if (diff.position !== undefined) {
        console.log(`   Position: ${colorize(diff.position.toString(), 'yellow')} chars`);
      }
    }
    console.log();
  });
}

async function loadAndDisplayReport(reportPath?: string): Promise<void> {
  const finalPath = reportPath || path.join(import.meta.dir, "..", "prep", "conversion_report.json");
  
  try {
    const file = Bun.file(finalPath);
    if (!(await file.exists())) {
      console.log(colorize(`❌ Report file not found: ${finalPath}`, 'red'));
      console.log(colorize("💡 Run the conversion first to generate a report", 'yellow'));
      return;
    }

    const report: DetailedReport = JSON.parse(await file.text());
    displayColorizedReport(report);
  } catch (error) {
    console.log(colorize(`❌ Error loading report: ${error}`, 'red'));
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'view' || !command) {
    await loadAndDisplayReport(args[1]);
  } else if (command === 'diff') {
    const entryTitle = args[1];
    if (!entryTitle) {
      console.log(colorize("❌ Please provide an entry title to show differences", 'red'));
      console.log(colorize("Usage: bun src/report-viewer.ts diff 'Essay Title'", 'yellow'));
      return;
    }
    
    const reportPath = path.join(import.meta.dir, "..", "prep", "conversion_report.json");
    const file = Bun.file(reportPath);
    if (!(await file.exists())) {
      console.log(colorize(`❌ Report file not found: ${reportPath}`, 'red'));
      return;
    }
    
    const report: DetailedReport = JSON.parse(await file.text());
    displayDifferencesForEntry(report, entryTitle);
  } else {
    console.log(colorize("📋 PG Essays Report Viewer", 'bright'));
    console.log();
    console.log("Usage:");
    console.log(colorize("  bun src/report-viewer.ts view [report-path]", 'green'), "  # View full report");
    console.log(colorize("  bun src/report-viewer.ts diff 'Title'", 'green'), "       # Show differences for specific entry");
    console.log();
  }
}

if (import.meta.main) {
  await main();
}

export { displayColorizedReport, loadAndDisplayReport, displayDifferencesForEntry };