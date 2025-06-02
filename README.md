# PG Essays to Markdown Converter

A tool that converts Paul Graham's essays from HTML to Markdown using Claude AI, with built-in text comparison and quality reporting.

## Features

- 🔄 **Automated Conversion**: Uses Claude AI to convert HTML essays to clean Markdown
- 📊 **Quality Checking**: Compares original HTML text with converted Markdown to detect differences
- 🎨 **Colorized Reports**: Beautiful, colorized terminal output showing conversion results
- 💾 **Smart Caching**: Caches both HTML downloads and AI conversions to avoid redundant work
- 📈 **Detailed Analytics**: Similarity scores, difference detection, and comprehensive reporting
- 🌊 **Streaming Responses**: LLM responses stream directly to files with real-time progress
- ⚡ **Smart Rate Limiting**: Automatic retry with exponential backoff and configurable delays
- 📍 **Contextual Diffs**: Shows surrounding text context for better understanding of changes
- 📊 **Progress Tracking**: Real-time progress bars and processing time analytics

## Setup

1. Install dependencies:
```bash
bun install
```

2. Set up your Anthropic API key:
```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

## Usage

### Convert Essays

#### Using npm scripts (recommended):
```bash
# Convert first 3 essays (for testing)
bun run convert:test

# Convert all essays
bun run convert:all

# Convert with default settings (3 essays)
bun run convert

# View latest report
bun run report

# Show differences for specific essay
bun run diff "Programming Bottom Up"

# Show help
bun run help
```

#### Using runner script directly:
```bash
# Convert with custom options
bun src/runner.ts --limit 10 --concurrency 3 --report

# Convert all essays
bun src/runner.ts --all

# View existing report
bun src/runner.ts --view

# Show differences
bun src/runner.ts --diff "Essay Title"
```

#### Using original script:
```bash
bun src/transform.ts
```

### View Reports

#### Full Report (Colorized)
```bash
bun run report
# or
bun src/report-viewer.ts view
```

#### Specific Entry Differences
```bash
bun run diff "Programming Bottom Up"
# or
bun src/report-viewer.ts diff "Programming Bottom Up"
```

#### Help
```bash
bun run help
# or
bun src/runner.ts --help
```

## Project Structure

```
pg-essays/
├── src/
│   ├── transform.ts      # Main conversion script
│   └── report-viewer.ts  # Colorized report viewer
├── prep/                 # Generated files
│   ├── articles.json     # Essay index cache
│   ├── conversion_report.json  # Detailed JSON report
│   └── [essay-folders]/  # Individual essay HTML + Markdown
└── package.json
```

## How It Works

1. **Index Loading**: Scrapes PG's articles page to get essay list
2. **HTML Fetching**: Downloads each essay's HTML (cached locally)
3. **AI Conversion**: Uses Claude to convert HTML to clean Markdown
4. **Text Comparison**: Extracts plaintext from both versions and compares
5. **Quality Analysis**: Generates similarity scores and difference reports
6. **Reporting**: Creates both JSON and colorized terminal reports

## Text Comparison

The tool performs sophisticated text comparison:

- **HTML → Plaintext**: Strips HTML tags and normalizes whitespace
- **Markdown → Plaintext**: Removes Markdown syntax and normalizes
- **Contextual Diff Analysis**: Uses word-level diffing with surrounding context
- **Similarity Scoring**: Calculates percentage similarity between versions
- **Position Tracking**: Shows exact character positions of changes
- **Smart Context**: Displays before/after text snippets for each difference

## Report Types

### Terminal Report
- Summary statistics
- Failed conversions with error details
- Entries with text differences
- High-quality conversions (>95% similarity)

### JSON Report
- Detailed metadata and timestamps
- Full difference arrays for programmatic analysis
- Similarity scores and character counts
- Error details for debugging

## Configuration

Configure via environment variables or runner options:

```bash
# Set concurrency (default: 2, max: 3 for safety)
bun src/runner.ts --concurrency 2

# Set minimum delay between requests (default: 3000ms)
# Edit RateLimitedProcessor in src/transform.ts

# Process specific number of essays
bun src/runner.ts --limit 10

# Process all essays
bun src/runner.ts --all
```

Or edit `src/transform.ts` to customize:

```typescript
// Rate limiting configuration
const processor = new RateLimitedProcessor(
  concurrency,     // Max concurrent requests
  3000            // Min delay between requests (ms)
);

// Essays to skip
const ignoredPosts = new Set([...]);
```

## Quality Metrics

- **Similarity Score**: Percentage of matching text between original and converted
- **Character Counts**: Length comparison between versions
- **Difference Types**: Added, removed, or unchanged text segments
- **Success Rate**: Percentage of successful conversions

## Troubleshooting

### Common Issues

1. **API Key Missing**: Ensure `ANTHROPIC_API_KEY` is set
2. **Rate Limits**: Reduce `--concurrency` (default: 2) or increase delay in `RateLimitedProcessor`
3. **Memory Issues**: Process essays in smaller batches using `--limit`
4. **Streaming Errors**: Check network connection; streaming will auto-retry with backoff
5. **Low Similarity Scores**: Review contextual diffs to identify conversion issues

### Debugging

Check the generated files:
- `prep/conversion_report.json` - Full details with contextual diffs
- `prep/[essay]/[essay].html` - Original HTML
- `prep/[essay]/[essay].md` - Converted Markdown (streamed in real-time)

Use the diff viewer for detailed analysis:
```bash
bun run diff "Essay Title"  # Shows contextual differences
```

Monitor processing in real-time with the progress bar and streaming dots.

## Dependencies

- **@anthropic-ai/sdk**: Claude AI integration
- **cheerio**: HTML parsing and manipulation
- **diff**: Text comparison and diffing
- **turndown**: Markdown conversion utilities
- **p-limit**: Concurrency control

## License

MIT