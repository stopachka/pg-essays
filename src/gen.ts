import { fileURLToPath } from "bun";
import path, { dirname } from "path";
import fs from "fs";

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = dirname(__filename);

const GEN_DIR: string = `${__dirname}/../gen`;

export function readText(subdir: string, filename: string): string {
  return fs.readFileSync(fullPath(subdir, filename), "utf-8");
}

export function fullDirPath(subdir: string) {
  return path.join(GEN_DIR, subdir);
}

export function fullPath(subdir: string, filename: string) {
  return path.join(GEN_DIR, subdir, filename);
}

export function exists(subdir: string, filename: string) {
  return fs.existsSync(fullPath(subdir, filename));
}

export function save(subdir: string, filename: string, buf: any) {
  const dir = path.join(GEN_DIR, subdir);
  if (!fs.existsSync(dir)) {
    console.log("[dir] creating", dir);
    fs.mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buf);
}

export function saveText(subdir: string, filename: string, text: string) {
  save(subdir, filename, text);
}
