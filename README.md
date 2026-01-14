# pg-essays

Ever wanted all of PG's essays into books that you could read or print? This tool parses PG's blog, converts essays to latex, and produces nice book versions.

You can check out the results in `gen/book`.

## Development

### Quick Setup

Run the setup script to check and install all required dependencies:

```bash
./setup.sh
```

The script will check for all required dependencies and provide platform-specific installation instructions if anything is missing.

### Manual Setup

Alternatively, you can manually install dependencies:

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
