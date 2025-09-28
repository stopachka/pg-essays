import puppeteer from "puppeteer";

import type { Book } from "./types";

export async function generateCover(outputPath: string, book: Book): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    const html = await coverHTML(book);

    await page.setContent(html, { waitUntil: "networkidle0" });

    // Set viewport to match the cover dimensions
    await page.setViewport({
      width: 1290, // Rounded up from 1289.472
      height: 888,
      deviceScaleFactor: 2, // Higher quality
    });

    // Generate PDF with exact dimensions
    await page.pdf({
      path: outputPath,
      width: "13.432in",
      height: "9.25in",
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

async function coverHTML(book: Book): Promise<string> {
  const bgColor = "#040C27";
  const textColor = "white";
  const spineTextColor = "#FB651F";

  // Dimensions from Lulu
  const totalWidth = 1289.472;
  const height = 888;
  const spineWidth = 113.472;
  const coverWidth = (totalWidth - spineWidth) / 2;

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
      font-size: 18px;
      margin-top: 30px;
      opacity: 0.8;
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
  </style>
</head>
<body>
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
</body>
</html>`;
}
