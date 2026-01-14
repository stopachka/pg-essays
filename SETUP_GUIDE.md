# Setup Guide

This guide will help you set up and understand the pg-essays repository, or adapt it for similar projects.

## Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/stopachka/pg-essays.git
   cd pg-essays
   ```

2. **Run the setup script:**
   ```bash
   ./setup.sh
   ```

3. **Build essays:**
   ```bash
   # Build a specific essay
   bun run cli.ts --essay progbot
   
   # Build a specific volume
   bun run cli.ts --book vol1
   
   # Build all books
   bun run cli.ts
   ```

## Repository Structure

```
pg-essays/
├── cli.ts              # Main CLI entry point
├── src/
│   ├── essay.ts        # Essay processing logic
│   ├── book.ts         # Book compilation logic
│   ├── fetch.ts        # Fetching essays from the web
│   ├── latex.ts        # LaTeX generation
│   ├── pdf.ts          # PDF generation
│   ├── cover.ts        # Cover generation
│   └── types.ts        # TypeScript type definitions
├── gen/                # Generated output (essays, books, PDFs)
├── resources/          # Static resources (images, fonts, etc.)
├── overrides/          # Manual overrides for specific essays
└── setup.sh            # Automated setup script
```

## How It Works

1. **Fetch**: Essays are fetched from Paul Graham's website (paulgraham.com)
2. **Process**: HTML is converted to Markdown, then to LaTeX
3. **Compile**: LaTeX files are compiled into PDF books with custom covers
4. **Output**: Final PDFs are saved in `gen/book/`

## System Requirements

### Required Tools
- **bun**: JavaScript runtime and package manager
- **pandoc**: Universal document converter
- **ImageMagick**: Image processing
- **poppler**: PDF utilities (pdfinfo)
- **LaTeX**: For PDF generation (basictex on macOS, texlive on Linux)

### Required LaTeX Packages
- tocloft
- fancyhdr
- titlesec

All of these can be installed automatically using `./setup.sh`.

## Adapting for Other Projects

To adapt this repository for converting other web content to books:

### 1. Update the Content Source

Modify `src/fetch.ts` to fetch from your target website:
- Change the URL parsing logic
- Update the HTML structure extraction
- Adjust the article index generation

### 2. Customize the Book Structure

Edit `src/book.ts` to define your book volumes:
- Update `getInputBooks()` to return your book definitions
- Adjust essay grouping logic
- Modify book metadata (title, slug, etc.)

### 3. Adjust LaTeX Styling

Customize `src/bookLatex.ts` and `src/latex.ts`:
- Modify document class and packages
- Update fonts and typography
- Customize headers, footers, and margins

### 4. Create Custom Covers

Implement cover generation in `src/cover.ts`:
- Design custom cover layouts
- Add branding or imagery
- Adjust dimensions for print formats

## Development Workflow

1. **Test with a single essay:**
   ```bash
   bun run cli.ts --essay <slug>
   ```

2. **Preview covers:**
   ```bash
   bun run cli.ts --cover <volume>
   ```

3. **Build a complete volume:**
   ```bash
   bun run cli.ts --book <volume>
   ```

4. **Generate all books:**
   ```bash
   bun run cli.ts
   ```

## Troubleshooting

### LaTeX Compilation Errors
- Check that all LaTeX packages are installed: `tlmgr list --only-installed`
- Review LaTeX error logs in the `gen/` directory
- Verify special characters are properly escaped

### Image Processing Issues
- Ensure ImageMagick is installed: `convert --version`
- Check image paths in the LaTeX files
- Verify image formats are supported (PNG, JPEG, PDF)

### Missing Dependencies
- Run `./setup.sh` again to verify all dependencies
- Check system PATH includes all installed tools
- On macOS, ensure Homebrew is properly configured

## Contributing

When making changes:
1. Test with a single essay first
2. Verify PDF generation succeeds
3. Check cover generation for all formats (paperback/hardcover)
4. Ensure no breaking changes to existing books

## License

This project structure and code can be adapted for similar content compilation projects. Check the original repository for license details.
