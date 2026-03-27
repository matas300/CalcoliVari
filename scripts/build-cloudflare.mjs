import { access, copyFile, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, ".cloudflare-dist");

const requiredFiles = [
  "index.html",
  "style.css",
  "app.js",
  "firebase-sync.js",
  "tax-engine.js"
];

const optionalFiles = [
  "favicon.ico",
  "robots.txt",
  "manifest.webmanifest"
];

const optionalDirs = [
  "assets",
  "img",
  "images",
  "fonts"
];

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensurePresent(fileName) {
  const fullPath = path.join(root, fileName);
  if (!(await exists(fullPath))) {
    throw new Error(`Missing required runtime file: ${fileName}`);
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const fileName of requiredFiles) {
  await ensurePresent(fileName);
  await copyFile(path.join(root, fileName), path.join(outDir, fileName));
}

for (const fileName of optionalFiles) {
  const source = path.join(root, fileName);
  if (await exists(source)) {
    await copyFile(source, path.join(outDir, fileName));
  }
}

for (const dirName of optionalDirs) {
  const source = path.join(root, dirName);
  if (await exists(source)) {
    await cp(source, path.join(outDir, dirName), { recursive: true });
  }
}

console.log(`Cloudflare assets staged in ${outDir}`);
