import { $ } from "bun";
import path from "path";

export async function latexToPDF(outputPath: string, texContent: string): Promise<void> {
  const outputDir = path.dirname(outputPath);
  const tmpName = crypto.randomUUID();

  const cleanup = async () => {
    await $`cd ${outputDir} && rm -f ${tmpName}.*`;
  };

  try {
    await Bun.write(`${outputDir}/${tmpName}.tex`, texContent);

    await $`cd ${outputDir} && xelatex -interaction=nonstopmode ${tmpName}.tex`;
    await $`cd ${outputDir} && xelatex -interaction=nonstopmode ${tmpName}.tex`;

    await $`mv ${outputDir}/${tmpName}.pdf ${outputPath}`;
  } finally {
    cleanup();
  }
}
