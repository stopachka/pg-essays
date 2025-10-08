import { $ } from "bun";
import type { CheerioAPI } from "cheerio";
import * as gen from "./gen";
import { limitedFetch } from "./fetch";

const contentTypeToExtension: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
};

const badImages = new Set<string>([
  "http://www.virtumundo.com/images/spacer.gif",
  "https://s.turbifycdn.com/aah/paulgraham/serious-2.gif",
  "https://sep.turbifycdn.com/ca/Img/trans_1x1.gif",
  "https://s.turbifycdn.com/aah/paulgraham/how-to-get-new-ideas-5.gif",
  "https://s.turbifycdn.com/aah/paulgraham/japanese-translation-1.gif",
  "https://s.turbifycdn.com/aah/paulgraham/the-reddits-2.gif",
]);

const fontImageToText = {
  "five-questions-about-language-design-18.gif": "Guiding Philosophy",
  "five-questions-about-language-design-22.gif": "Pitfalls and Gotchas",
  "five-questions-about-language-design-19.gif": "Open Problems",
  "five-questions-about-language-design-20.gif": "Little-Known Secrets",
  "five-questions-about-language-design-21.gif": "Ideas Whose Time Has Returned",
};

const urlToFilename = (url: string): string => {
  return new URL(url).pathname.split("/").pop() as string;
};

export async function localiseImages($html: CheerioAPI): Promise<CheerioAPI> {
  await Promise.all(
    $html("img[src]")
      .toArray()
      .filter((n: any) => n.attribs?.src && /^https?:/.test(n.attribs.src))
      .map(async (node: any) => {
        const remote = node.attribs.src;
        if (badImages.has(remote)) {
          $html(node).remove();
          return;
        }
        const f = urlToFilename(remote);
        if (f in fontImageToText) {
          const fontText = fontImageToText[f as keyof typeof fontImageToText];
          $html(node).replaceWith(`<h2>${fontText}</h2>`);
          return;
        }

        const res = await limitedFetch(remote);
        if (!res.ok) {
          $html(node).remove();
          return;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const url = new URL(remote);
        let extension = extensionFromResponse(res.headers.get("content-type"), url);

        // Convert GIF to JPEG
        let finalBuf = buf;
        if (extension === ".gif") {
          extension = ".jpg";
          const tempGifPath = `/tmp/temp_${Date.now()}.gif`;
          const tempJpgPath = `/tmp/temp_${Date.now()}.jpg`;

          // Save GIF temporarily
          await Bun.write(tempGifPath, buf);

          // Convert GIF to JPEG using ImageMagick
          await $`convert ${tempGifPath} ${tempJpgPath}`.quiet();

          // Read the converted JPEG
          finalBuf = await Bun.file(tempJpgPath).arrayBuffer().then(Buffer.from);

          // Clean up temp files
          await $`rm -f ${tempGifPath} ${tempJpgPath}`.quiet();
        }

        const filename = toLocalName(url, extension);
        if (!gen.exists("images", filename)) {
          gen.save("images", filename, finalBuf);
        }
        // Use relative path from book directory to avoid overfull hbox in LaTeX
        node.attribs.src = `../../images/${filename}`;
      }),
  );

  return $html;
}

const toLocalBaseName = (url: URL): string => {
  // Extract just the filename from the URL path (no host part)
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1] || "";

  // Remove extension from filename
  const base = lastSegment.replace(/\.[^.]+$/, "");

  // If no base name found, create a hash-based name
  if (!base) {
    const crypto = require("crypto");
    const hash = crypto.createHash("md5").update(url.toString()).digest("hex");
    return `img_${hash.substring(0, 8)}`;
  }

  return base;
};

const toLocalName = (url: URL, extension: string): string => {
  const base = toLocalBaseName(url);
  const normalizedExtension = normalizeExtension(extension);
  return `${base}${normalizedExtension}`;
};

const extensionFromContentType = (contentType: string | null): string | null => {
  if (!contentType) {
    return null;
  }
  const [rawType] = contentType.split(";");
  if (!rawType) {
    return null;
  }
  const trimmed = rawType.trim().toLowerCase();
  return contentTypeToExtension[trimmed] ?? null;
};

const normalizeExtension = (extension: string): string => {
  if (!extension) {
    return ".bin";
  }
  return extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
};

const extensionFromResponse = (contentType: string | null, url: URL): string => {
  const fromContentType = extensionFromContentType(contentType);
  if (fromContentType) {
    return fromContentType;
  }
  const fromPath = url.pathname.match(/\.[^.]+$/)?.[0];
  if (fromPath) {
    return fromPath;
  }
  return ".bin";
};
