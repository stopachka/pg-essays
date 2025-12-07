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
  coverType: CoverType = "paperback",
): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    const html = nicoleCoverHTML(coverType);

    await page.setContent(html, { waitUntil: "networkidle0" });

    const dimensions = getCoverDimensions(coverType);
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

function formatInches(value: number): string {
  return `${Number(value.toFixed(3))}in`;
}

function getCoverDimensions(coverType: CoverType): CoverDimensions {
  const base =
    coverType === "hardcover"
      ? {
          totalWidthInches: 21.125,
          totalHeightInches: 9.75,
          spineWidthInches: 1.375,
        }
      : {
          totalWidthInches: 13.139,
          totalHeightInches: 9.25,
          spineWidthInches: 0.889,
        };

  const coverWidthInches = (base.totalWidthInches - base.spineWidthInches) / 2;
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

function nicoleCoverHTML(coverType: CoverType): string {
  const dimensions = getCoverDimensions(coverType);
  const totalWidth = dimensions.totalWidthPx;
  const height = dimensions.totalHeightPx;
  const spineWidth = dimensions.spineWidthPx;
  const coverWidth = dimensions.coverWidthPx;
  const imageDataUrl = getImageBase64();

  // Position text on the front cover (right side)
  // Front cover starts after back cover + spine
  const frontCoverLeft = coverWidth + spineWidth;

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
      position: relative;
      overflow: hidden;
    }

    .background {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: url('${imageDataUrl}');
      background-size: 260%;
      background-position: 25% 10%;
    }

    .text-container {
      position: absolute;
      top: 50%;
      left: ${frontCoverLeft + coverWidth * 0.5}px;
      transform: translate(-50%, -50%);
      text-align: center;
      color: #1a1a1a;
    }

    .title {
      font-size: 64px;
      font-weight: normal;
      letter-spacing: 2px;
      margin-bottom: 8px;
    }

    .subtitle {
      font-size: 24px;
      font-style: italic;
      font-weight: normal;
    }
  </style>
</head>
<body>
  <div class="background"></div>
  <div class="text-container">
    <div class="title">PG Essays</div>
    <div class="subtitle">a special selection</div>
  </div>
</body>
</html>`;
}
