import { fileURLToPath } from "bun";
import path, { dirname } from "path";
import fs from "fs";

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = dirname(__filename);

const OVERRIDE_DIR: string = `${__dirname}/../overrides`;

export function readText(filename: string): string {
  return fs.readFileSync(path.join(OVERRIDE_DIR, filename), "utf-8");
}
