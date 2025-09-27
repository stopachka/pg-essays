# pg-essays

Ever wanted all of PG's essays into books that you could read or print? This tool parses PG's blog, converts essays to latex, and produces nice book versions.

You can check out the results in `gen/book`.

# Development

Make sure you install dependencies:

```bash
brew install basictex pandoc imagemagick
sudo tlmgr install tocloft fancyhdr
bun install
```

## Preview an essay

You can preview a particular essay with by asking for the essay's slug:

```bash
bun run cli.ts --slug progbot
```

## Build the books

Otherwise run the command as is and you'll generate a fresh copy of books.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

Run the automated transformation checker (requires `ANTHROPIC_API_KEY`):

```bash
ANTHROPIC_API_KEY=... bun run checker
```

This project was created using `bun init` in bun v1.2.21. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

Don't forget pandoc and basictex

eval "$(/usr/libexec/path_helper)"

ImageMagick
tlmgr install tocloft fancyhdr
