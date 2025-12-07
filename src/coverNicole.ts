import puppeteer from "puppeteer";
import { readFileSync } from "fs";
import { resolve } from "path";

import type { Book, CoverType } from "./types";

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
    headless: true,
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
    await browser.close();
  }
}

function inchesToPixels(value: number): number {
  return value * CSS_DPI;
}

function formatInches(inches: number): string {
  return `${Number(inches.toFixed(3))}in`;
}

function getCoverDimensions(): CoverDimensions {
  const base = {
    totalWidthInches: 12.851, // Compensate for Puppeteer rounding (target: 12.864")
    totalHeightInches: 9.25,
    spineWidthInches: 0.614, // Thinner spine for fewer pages
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
    // PDF dimensions in inches
    widthIn: formatInches(base.totalWidthInches),
    heightIn: formatInches(base.totalHeightInches),
    viewportWidth: Math.round(totalWidthPx),
    viewportHeight: Math.round(totalHeightPx),
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
      background-position: 21% 3%;
    }

    .text-container {
      position: absolute;
      top: 46%;
      left: 936px;
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
