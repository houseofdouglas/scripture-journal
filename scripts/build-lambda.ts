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

// 3. Zip dist/index.js and dist/index.js.map
console.log("Creating dist/lambda.zip...");
try {
  execSync("zip lambda.zip index.js index.js.map", {
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
