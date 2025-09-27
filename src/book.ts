import { $ } from "bun";
import { essayFiles } from "./essay";
import * as gen from "./gen";
import type { ProcessedEssay } from "./types";

type Book = {
  title: string;
  slug: string;
  dir: string;
  essays: ProcessedEssay[];
};

export async function processBook(book: Book): Promise<void> {
  const chapters = book.essays.map((essay) => {
    const chapter = gen.readText(essay.dir, essayFiles.xfTex).trim();
    return chapter;
  });

  const latexDoc = [
    buildPreamble(book.title),
    chapters.join("\n"),
    "\\end{document}\n",
  ].join("\n\n");
  gen.save(book.dir, "01.tex", latexDoc);

  await $`pandoc --from=latex --to=html5 --standalone -o ${gen.fullPath(
    book.dir,
    "02.html"
  )} ${gen.fullPath(book.dir, "01.tex")}`;

  // Clean up any existing auxiliary files to avoid conflicts
  const outputDir = gen.fullDirPath(book.dir);
  // Only clean if directory exists
  await $`mkdir -p ${outputDir}`.quiet();
  await $`rm -f ${outputDir}/*.aux ${outputDir}/*.toc ${outputDir}/*.log ${outputDir}/*.out 2>/dev/null || true`.quiet();

  // First pass - generates .aux and .toc files with TOC entries
  console.log("[xelatex] First pass - generating TOC entries...");
  await $`cd ${outputDir} && xelatex -interaction=nonstopmode 01.tex`;

  // Second pass - uses .toc file to build actual table of contents
  console.log("[xelatex] Second pass - building table of contents...");
  await $`cd ${outputDir} && xelatex -interaction=nonstopmode 01.tex`;

  // Rename output to match expected filename
  await $`mv ${gen.fullPath(book.dir, "01.pdf")} ${gen.fullPath(
    book.dir,
    "03.pdf"
  )}`;

  console.log("[xelatex] PDF generated successfully with TOC");
}

function buildPreamble(title: string): string {
  return [
    "\\documentclass[12pt]{book}",
    "\\usepackage{fontspec}",
    "\\usepackage{microtype}",
    "\\usepackage{geometry}",
    "\\usepackage{hyperref}",
    "\\usepackage{graphicx}",
    "\\geometry{paperwidth=6.25in,paperheight=9.25in,inner=0.7in,outer=0.7in,top=0.7in,bottom=0.7in}",
    "\\setmainfont{Baskerville}",
    "\\setlength{\\parindent}{0pt}",
    "\\setlength{\\parskip}{0.6em}",
    "\\linespread{1.1}",
    "\\raggedbottom", // Prevent underfull vbox warnings
    "\\sloppy", // Allow more flexible word spacing to prevent overfull hbox
    "\\hfuzz=2pt", // Tolerate overfull hbox up to 2pt without warning
    "\\setcounter{secnumdepth}{1}",
    "\\setcounter{tocdepth}{1}",
    // Use tocloft for TOC customization
    "\\usepackage{tocloft}",
    "\\renewcommand{\\cftchapfont}{\\normalfont\\small}", // Smaller, non-bold font
    "\\renewcommand{\\cftchappagefont}{\\normalfont\\small}", // Same for page numbers
    "\\renewcommand{\\cftchapleader}{\\cftdotfill{\\cftdotsep}}", // Add dots
    "\\setlength{\\cftbeforechapskip}{0.5em}", // Reduce spacing between entries
    // Use fancyhdr for custom headers
    "\\usepackage{fancyhdr}",
    "\\setlength{\\headheight}{15pt}", // Fix headheight warning
    "\\pagestyle{fancy}",
    "\\fancyhf{}",
    "\\fancyhead[LE,RO]{\\thepage}",
    "\\fancyhead[RE,LO]{Chapter \\thechapter}", // Just "Chapter X"
    "\\renewcommand{\\headrulewidth}{0pt}",
    "\\renewcommand{\\chaptermark}[1]{\\markboth{Chapter \\thechapter}{Chapter \\thechapter}}",
    "\\makeatletter",
    "\\@addtoreset{footnote}{chapter}",
    "\\makeatother",
    "\\hypersetup{colorlinks=true,linkcolor=black,urlcolor=black}",
    "\\providecommand{\\pandocbounded}[1]{#1}",
    "\\let\\oldincludegraphics\\includegraphics",
    "\\renewcommand{\\includegraphics}[2][]{\\oldincludegraphics[width=\\textwidth,height=4cm,keepaspectratio,#1]{#2}}",
    `\\title{${title}}`,
    "\\author{Paul Graham}",
    "\\date{}",
    "\\begin{document}",
    "\\frontmatter",
    "\\maketitle",
    "\\tableofcontents",
    "\\clearpage",
    "\\mainmatter",
  ].join("\n");
}
