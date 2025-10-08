import puppeteer from "puppeteer";

import type { Book } from "./types";

export type CoverType = "paperback" | "hardcover";

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
      width: Math.ceil(dimensions.widthPx),
      height: Math.ceil(dimensions.heightPx),
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

function getCoverDimensions(coverType: CoverType) {
  if (coverType === "hardcover") {
    // Hardcover dimensions with flaps
    // Total width: 21.125" (includes front, spine, back, and two flaps)
    // Flap width: 3.25" each
    // Spine width: 1.375"
    // Available width for covers: 21.125 - 1.375 - (2 * 3.25) = 13.25"
    // Each cover width: 13.25 / 2 = 6.625"
    const widthIn = "21.125in";
    const heightIn = "9.75in";
    const widthPx = 2028; // 21.125 * 96 DPI
    const heightPx = 936; // 9.75 * 96 DPI
    const spineWidthPx = 132; // 1.375 * 96 DPI
    const flapWidthPx = 312; // 3.25 * 96 DPI
    // Correct calculation: (total - spine - 2*flaps) / 2
    const coverWidthPx = (widthPx - spineWidthPx - 2 * flapWidthPx) / 2;

    return {
      widthIn,
      heightIn,
      widthPx,
      heightPx,
      spineWidthPx,
      flapWidthPx,
      coverWidthPx,
      hasFlaps: true,
    };
  } else {
    // Paperback dimensions (existing)
    const widthIn = "13.432in";
    const heightIn = "9.25in";
    const widthPx = 1289.472;
    const heightPx = 888;
    const spineWidthPx = 113.472;
    const coverWidthPx = (widthPx - spineWidthPx) / 2;

    return {
      widthIn,
      heightIn,
      widthPx,
      heightPx,
      spineWidthPx,
      flapWidthPx: 0,
      coverWidthPx,
      hasFlaps: false,
    };
  }
}

async function coverHTML(book: Book, coverType: CoverType): Promise<string> {
  const bgColor = "#040C27";
  const textColor = "white";
  const spineTextColor = "#FB651F";

  // Get dimensions based on cover type
  const dimensions = getCoverDimensions(coverType);
  const totalWidth = dimensions.widthPx;
  const height = dimensions.heightPx;
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

    .spine-text {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-size: 24px;
      letter-spacing: 2px;
    }

    .spine-author {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-size: 24px;
      margin-top: 34px;
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
    <div class="spine-text">${book.title}</div>
    <div class="spine-author">Paul Graham</div>
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
