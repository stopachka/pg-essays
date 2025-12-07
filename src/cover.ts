import puppeteer from "puppeteer";

import type { Book, CoverType } from "./types";

const CSS_DPI = 96;

type CoverDimensions = {
  totalWidthInches: number;
  totalHeightInches: number;
  spineWidthInches: number;
  coverWidthInches: number;
  flapWidthInches: number;
  hasFlaps: boolean;
  totalWidthPx: number;
  totalHeightPx: number;
  spineWidthPx: number;
  coverWidthPx: number;
  flapWidthPx: number;
  widthIn: string;
  heightIn: string;
  viewportWidth: number;
  viewportHeight: number;
};

export async function generateCover(
  outputPath: string,
  book: Book,
  coverType: CoverType = "paperback",
): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    const html = await coverHTML(book, coverType);

    await page.setContent(html, { waitUntil: "networkidle0" });

    // Set viewport to match the cover dimensions
    const dimensions = getCoverDimensions(coverType);
    await page.setViewport({
      width: dimensions.viewportWidth,
      height: dimensions.viewportHeight,
      deviceScaleFactor: 2, // Higher quality
    });

    // Generate PDF with exact dimensions
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

    console.log(`Generated cover: ${outputPath}`);
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

function buildDimensions(base: {
  totalWidthInches: number;
  totalHeightInches: number;
  spineWidthInches: number;
  flapWidthInches?: number;
  hasFlaps?: boolean;
}): CoverDimensions {
  const hasFlaps = Boolean(base.hasFlaps);
  const flapWidthInches = hasFlaps ? base.flapWidthInches ?? 0 : 0;
  const coverWidthInches =
    (base.totalWidthInches - base.spineWidthInches - flapWidthInches * (hasFlaps ? 2 : 0)) / 2;

  const totalWidthPx = inchesToPixels(base.totalWidthInches);
  const totalHeightPx = inchesToPixels(base.totalHeightInches);
  const spineWidthPx = inchesToPixels(base.spineWidthInches);
  const coverWidthPx = inchesToPixels(coverWidthInches);
  const flapWidthPx = inchesToPixels(flapWidthInches);

  return {
    totalWidthInches: base.totalWidthInches,
    totalHeightInches: base.totalHeightInches,
    spineWidthInches: base.spineWidthInches,
    coverWidthInches,
    flapWidthInches,
    hasFlaps,
    totalWidthPx,
    totalHeightPx,
    spineWidthPx,
    coverWidthPx,
    flapWidthPx,
    widthIn: formatInches(base.totalWidthInches),
    heightIn: formatInches(base.totalHeightInches),
    viewportWidth: Math.round(totalWidthPx),
    viewportHeight: Math.round(totalHeightPx),
  };
}

function getCoverDimensions(coverType: CoverType): CoverDimensions {
  if (coverType === "hardcover") {
    return buildDimensions({
      totalWidthInches: 21.125,
      totalHeightInches: 9.75,
      spineWidthInches: 1.375,
      flapWidthInches: 3.25,
      hasFlaps: true,
    });
  }

  return buildDimensions({
    totalWidthInches: 13.139,
    totalHeightInches: 9.25,
    spineWidthInches: 0.889,
  });
}

async function coverHTML(book: Book, coverType: CoverType): Promise<string> {
  const bgColor = "#040C27";
  const textColor = "white";
  const spineTextColor = "#FB651F";

  // Get dimensions based on cover type
  const dimensions = getCoverDimensions(coverType);
  const totalWidth = dimensions.totalWidthPx;
  const height = dimensions.totalHeightPx;
  const spineWidth = dimensions.spineWidthPx;
  const coverWidth = dimensions.coverWidthPx;
  const flapWidth = dimensions.flapWidthPx;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      width: ${totalWidth}px;
      height: ${height}px;
      display: flex;
      font-family: 'Baskerville', serif;
      background-color: ${bgColor};
      color: ${textColor};
      position: relative;
    }

    .back-cover {
      width: ${coverWidth}px;
      height: ${height}px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 60px;
    }

    .spine {
      width: ${spineWidth}px;
      height: ${height}px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background-color: ${bgColor};
      color: ${spineTextColor};
    }

    .spine-inner {
      transform: rotate(90deg);
      display: flex;
      align-items: center;
      gap: 34px;
    }

    .spine-text,
    .spine-author {
      font-size: 24px;
      letter-spacing: 2px;
      transform-origin: center;
      white-space: nowrap;
    }

    .front-cover {
      width: ${coverWidth}px;
      height: ${height}px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px;
    }

    .title {
      font-size: 72px;
      font-weight: 700;
      text-align: center;
      line-height: 1.1;
      margin-bottom: 20px;
      font-weight: normal;
    }

    .subtitle {
      font-size: 48px;
      font-weight: 400;
      text-align: center;
      margin-bottom: 40px;
    }

    .author {
      font-size: 32px;
      font-weight: 400;
      text-align: center;
      opacity: 0.9;
    }

    .back-description {
      font-size: 18px;
      line-height: 1.8;
      text-align: center;
      max-width: 80%;
    }
    ${
      dimensions.hasFlaps
        ? `
    .flap {
      width: ${flapWidth}px;
      height: ${height}px;
      background-color: ${bgColor};
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }

    .flap-text {
      font-size: 16px;
      line-height: 1.6;
      text-align: center;
      opacity: 0.7;
    }`
        : ""
    }
  </style>
</head>
<body>
  ${
    dimensions.hasFlaps
      ? `<div class="flap">
    <div class="flap-text"></div>
  </div>`
      : ""
  }

  <div class="back-cover">
    <div class="back-description">
    </div>
  </div>

  <div class="spine">
    <div class="spine-inner">
      <div class="spine-author">Paul Graham</div>
      <div class="spine-text">${book.title}</div>
    </div>
  </div>

  <div class="front-cover">
    <div class="title">${book.title}</div>
    <div class="author">Paul Graham</div>
  </div>

  ${
    dimensions.hasFlaps
      ? `<div class="flap">
    <div class="flap-text"></div>
  </div>`
      : ""
  }
</body>
</html>`;
}
