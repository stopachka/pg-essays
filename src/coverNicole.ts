import puppeteer from "puppeteer";
import { readFileSync } from "fs";
import { resolve } from "path";

import type { Book } from "./types";
import type { CoverType } from "./cover";

const CSS_DPI = 96;

type CoverDimensions = {
  totalWidthInches: number;
  totalHeightInches: number;
  spineWidthInches: number;
  coverWidthInches: number;
  totalWidthPx: number;
  totalHeightPx: number;
  spineWidthPx: number;
  coverWidthPx: number;
  widthIn: string;
  heightIn: string;
  viewportWidth: number;
  viewportHeight: number;
};

export async function generateNicoleCover(
  outputPath: string,
  _book: Book,
  // Right now, we only want Nicole's cover to be paperback
  _coverType: CoverType = "paperback",
): Promise<void> {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    const html = nicoleCoverHTML();

    await page.setContent(html, { waitUntil: "networkidle0" });

    const dimensions = getCoverDimensions();
    await page.setViewport({
      width: dimensions.viewportWidth,
      height: dimensions.viewportHeight,
      deviceScaleFactor: 2,
    });

    await page.pdf({
      path: outputPath,
      width: dimensions.widthIn,
      height: dimensions.heightIn,
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: false,
      margin: {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
    });

    console.log(`Generated Nicole cover: ${outputPath}`);
  } finally {
    // await new Promise((resolve) => setTimeout(resolve, 50000));
    await browser.close();
  }
}

function inchesToPixels(value: number): number {
  return value * CSS_DPI;
}

function formatInches(value: number): string {
  return `${Number(value.toFixed(3))}in`;
}

function getCoverDimensions(): CoverDimensions {
  const base = {
    totalWidthInches: 13.139,
    totalHeightInches: 9.25,
    spineWidthInches: 0.889,
  };

  const coverWidthInches = (base.totalWidthInches - base.spineWidthInches) / 2;

  // Use exact pixels (no rounding) for CSS - CSS handles fractional pixels fine
  const totalWidthPx = inchesToPixels(base.totalWidthInches);
  const totalHeightPx = inchesToPixels(base.totalHeightInches);
  const spineWidthPx = inchesToPixels(base.spineWidthInches);
  const coverWidthPx = inchesToPixels(coverWidthInches);

  return {
    ...base,
    coverWidthInches,
    totalWidthPx,
    totalHeightPx,
    spineWidthPx,
    coverWidthPx,
    // PDF uses exact inches
    widthIn: formatInches(base.totalWidthInches),
    heightIn: formatInches(base.totalHeightInches),
    // Viewport must be integers, use ceil to ensure it's large enough
    viewportWidth: Math.ceil(totalWidthPx),
    viewportHeight: Math.ceil(totalHeightPx),
  };
}

function getImageBase64(): string {
  const imagePath = resolve(process.cwd(), "resources/calder.png");
  const imageBuffer = readFileSync(imagePath);
  return `data:image/png;base64,${imageBuffer.toString("base64")}`;
}

function nicoleCoverHTML() {
  const dimensions = getCoverDimensions();
  const totalWidth = dimensions.totalWidthPx;
  const height = dimensions.totalHeightPx;
  const imageDataUrl = getImageBase64();

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @font-face {
      font-family: 'Baskerville';
      src: local('Baskerville');
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: ${totalWidth}px;
      height: ${height}px;
      font-family: 'Baskerville', serif;
      -webkit-font-smoothing: antialiased;
      position: relative;
      overflow: hidden;
      /* Background directly on body - can't be clipped */
      background-image: url('${imageDataUrl}');
      background-size: 260%;
      background-position: 24% 3%;
    }

    .text-container {
      position: absolute;
      top: 46%;
      left: 901px;
      color: #1a1a1a;
    }

    .title {
      font-size: 54px;
      font-weight: normal;
    }

    .subtitle {
      font-size: 24px;
      font-style: italic;
      font-weight: normal;
    }

  </style>
</head>
<body>
  <div class="text-container">
    <div class="title">PG Essays</div>
    <div class="subtitle">a special selection</div>
  </div>
</body>
</html>`;
}
