#!/usr/bin/env node
/**
 * Enforce the guest camera's bundle budget.
 *
 * DESIGN.md non-negotiable #3: bundle size IS the product. A wedding cellar
 * with one bar of reception is the normal case. This check exists so that the
 * budget is a build failure rather than a good intention.
 *
 * Run: npm run size --workspace guest
 */

import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = join(HERE, "..", "guest", "dist");

// Budget in gzipped bytes across all JS + CSS on the entry page.
const BUDGET_BYTES = 30 * 1024;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

let files;
try {
  files = walk(DIST);
} catch {
  console.error(`No build output at ${DIST}. Run \`npm run build --workspace guest\` first.`);
  process.exit(1);
}

const assets = files
  .filter((f) => [".js", ".css"].includes(extname(f)))
  .map((f) => {
    const raw = readFileSync(f);
    return { file: f.replace(DIST + "/", ""), gzip: gzipSync(raw).length };
  })
  .sort((a, b) => b.gzip - a.gzip);

const total = assets.reduce((sum, a) => sum + a.gzip, 0);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

console.log("\nGuest camera bundle (gzipped)\n");
for (const asset of assets) {
  console.log(`  ${kb(asset.gzip).padStart(9)}  ${asset.file}`);
}
console.log(`  ${"─".repeat(9)}`);
console.log(`  ${kb(total).padStart(9)}  total`);
console.log(`  ${kb(BUDGET_BYTES).padStart(9)}  budget\n`);

if (total > BUDGET_BYTES) {
  console.error(
    `FAIL: bundle is ${kb(total - BUDGET_BYTES)} over budget.\n` +
      `The guest camera must load on a bad venue connection. Cut something.\n`,
  );
  process.exit(1);
}

console.log(`OK: ${kb(BUDGET_BYTES - total)} of headroom.\n`);
