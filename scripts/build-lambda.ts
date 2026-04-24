import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const distDir = path.join(projectRoot, "dist");
const entryPoint = path.join(projectRoot, "src", "handler", "lambda.ts");
const zipPath = path.join(distDir, "lambda.zip");

// 1. Clean dist/
console.log("Cleaning dist/...");
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// 2. Run esbuild
console.log("Bundling with esbuild...");
await esbuild.build({
  entryPoints: [entryPoint],
  outfile: path.join(distDir, "index.js"),
  platform: "node",
  target: "node22",
  format: "cjs",
  bundle: true,
  minify: false,
  sourcemap: "external",
  external: ["@aws-sdk/*"],
});

// 3. Copy runtime assets that esbuild can't inline
// jsdom's XMLHttpRequest implementation loads xhr-sync-worker.js as a separate
// worker file via require.resolve(). esbuild bundles the referencing code but
// can't inline the worker itself, so we ship it next to index.js.
const xhrWorkerSrc = path.resolve(
  projectRoot,
  "node_modules/jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js"
);
const xhrWorkerDest = path.join(distDir, "xhr-sync-worker.js");
fs.copyFileSync(xhrWorkerSrc, xhrWorkerDest);
console.log("Copied xhr-sync-worker.js");

// 4. Zip dist/index.js, dist/index.js.map, and the worker
console.log("Creating dist/lambda.zip...");
try {
  execSync("zip lambda.zip index.js index.js.map xhr-sync-worker.js", {
    cwd: distDir,
    stdio: "inherit",
  });
} catch (err) {
  console.error("Failed to create zip:", err);
  process.exit(1);
}

// 4. Log success with file size
const { size } = fs.statSync(zipPath);
const sizeKB = (size / 1024).toFixed(1);
console.log(`Done! dist/lambda.zip — ${sizeKB} KB`);
