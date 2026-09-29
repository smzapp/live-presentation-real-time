import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

// pdf.js renders PDF pages in a worker (see lib/slides/import.ts). Rather
// than rely on a bundler resolving a worker inside node_modules, the file is
// copied into public/ and served from a fixed path. Run before `dev` and
// `build`, so it always matches the installed pdfjs-dist.
const require = createRequire(import.meta.url);
const source = resolve(dirname(require.resolve("pdfjs-dist/package.json")), "build", "pdf.worker.min.mjs");
const targetDir = resolve(import.meta.dirname, "..", "public", "pdf");
const target = resolve(targetDir, "pdf.worker.min.mjs");

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log(`Copied the pdf.js worker to public/pdf/${"pdf.worker.min.mjs"}`);
