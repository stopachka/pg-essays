# PG Essays to Markdown Converter

A tool that converts Paul Graham's essays from HTML to Markdown using Claude AI, with built-in text comparison and quality reporting.

## Features

- 🔄 **Automated Conversion**: Uses Claude AI to convert HTML essays to clean Markdown
- 📊 **Quality Checking**: Compares original HTML text with converted Markdown to detect differences
- 🎨 **Colorized Reports**: Beautiful, colorized terminal output showing conversion results
- 💾 **Smart Caching**: Caches both HTML downloads and AI conversions to avoid redundant work
- 📈 **Detailed Analytics**: Similarity scores, difference detection, and comprehensive reporting

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

Run the main conversion script:
```bash
bun src/transform.ts
```

This will:
- Download PG's essay index
- Process each essay (HTML → Markdown via Claude)
- Compare original vs converted text
- Generate a comprehensive report

### View Reports

#### Full Report (Colorized)
```bash
bun src/report-viewer.ts view
```

#### Specific Entry Differences
```bash
bun src/report-viewer.ts diff "Programming Bottom Up"
```

#### Help
```bash
bun src/report-viewer.ts
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
- **Diff Analysis**: Uses word-level diffing to identify changes
- **Similarity Scoring**: Calculates percentage similarity between versions

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

Edit `src/transform.ts` to customize:

```typescript
// Number of concurrent AI requests
const limit = pLimit(5);

// Essays to skip
const ignoredPosts = new Set([...]);

// Process subset for testing
index.slice(0, 3) // Remove slice() to process all
```

## Quality Metrics

- **Similarity Score**: Percentage of matching text between original and converted
- **Character Counts**: Length comparison between versions
- **Difference Types**: Added, removed, or unchanged text segments
- **Success Rate**: Percentage of successful conversions

## Troubleshooting

### Common Issues

1. **API Key Missing**: Ensure `ANTHROPIC_API_KEY` is set
2. **Rate Limits**: Adjust `pLimit(5)` to lower concurrency
3. **Memory Issues**: Process essays in smaller batches

### Debugging

Check the generated files:
- `prep/conversion_report.json` - Full details
- `prep/[essay]/[essay].html` - Original HTML
- `prep/[essay]/[essay].md` - Converted Markdown

## Dependencies

- **@anthropic-ai/sdk**: Claude AI integration
- **cheerio**: HTML parsing and manipulation
- **diff**: Text comparison and diffing
- **turndown**: Markdown conversion utilities
- **p-limit**: Concurrency control

## License

MIT