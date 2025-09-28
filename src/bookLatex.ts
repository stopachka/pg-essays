export function asBookLatex({ title, latexChapters }: { latexChapters: string[]; title: string }) {
  return [buildPreamble(title), latexChapters.join("\n"), "\\end{document}\n"].join("\n\n");
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
    // Customize chapter formatting with titlesec
    "\\usepackage{titlesec}",
    "\\titleformat{\\chapter}[display]",
    "  {\\normalfont\\bfseries}", // format for both
    "  {\\small\\chaptertitlename\\ \\thechapter}", // make "Chapter n" smaller
    "  {0.5em}", // separation between label and title
    "  {\\huge}", // make chapter title larger
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
    "\\fancyhead[RE,LO]{}", // Remove chapter header
    "\\renewcommand{\\headrulewidth}{0pt}",
    "\\renewcommand{\\chaptermark}[1]{}",
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
