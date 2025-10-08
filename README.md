# pg-essays

Ever wanted all of PG's essays into books that you could read or print? This tool parses PG's blog, converts essays to latex, and produces nice book versions.

You can check out the results in `gen/book`.

## Development

Make sure you install dependencies:

```bash
brew install basictex pandoc imagemagick poppler
sudo tlmgr install tocloft fancyhdr titlesec
bun install
```

Then start building:

```bash
# A particular essay
bun run cli.ts --essay progbot
# A particular volume
bun run cli.ts --book vol1
# Check out a cover
bun run cli.ts --cover vol1
# Or run the process for all books
bun run cli.ts
```
