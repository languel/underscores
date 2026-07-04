import fs from "fs";
import path from "path";

const targets = [
  "node_modules/@excalidraw/excalidraw/dist/excalidraw.development.js",
  "node_modules/@excalidraw/excalidraw/dist/excalidraw.production.min.js",
  "node_modules/@excalidraw/excalidraw/dist/excalidraw-with-preact.development.js",
  "node_modules/@excalidraw/excalidraw/dist/excalidraw-with-preact.production.min.js"
];

let patched = false;

for (const target of targets) {
  if (fs.existsSync(target)) {
    console.log(`Checking ${target}...`);
    let content = fs.readFileSync(target, "utf8");
    let initialContent = content;

    // Replace hardcoded purple selection/highlight colors with desaturated gray
    content = content
      // Global case-insensitive RGB and RGBA color replacements
      .replace(/rgb\(105,\s*101,\s*219\)/gi, 'rgb(109, 115, 116)')
      .replace(/rgba\(105,\s*101,\s*219,\s*([\d.]+)\)/gi, 'rgba(109, 115, 116, $1)')
      .replace(/rgba\(134,\s*131,\s*226,\s*([\d.]+)\)/gi, 'rgba(109, 115, 116, $1)')
      .replace(/rgba\(177,\s*151,\s*252,\s*([\d.]+)\)/gi, 'rgba(141, 145, 146, $1)')
      // Global case-insensitive color hex replacements
      .replace(/6965db/gi, '6d7374')
      .replace(/a8a5ff/gi, 'a5a5a5')
      .replace(/3530c4/gi, '555555')
      .replace(/5e5ad8/gi, '6d7374')
      // Selection bounding box and frame highlight color overrides
      .replace(/rgb\(0,\s*118,\s*255\)/gi, 'rgb(120, 125, 126)');

    if (content !== initialContent) {
      fs.writeFileSync(target, content, "utf8");
      console.log(`Successfully patched ${target}!`);
      patched = true;
    } else {
      console.log(`${target} is already patched or colors not found.`);
    }
  }
}

// If we patched the files, delete Vite's dependency cache to force pre-bundling reload
if (patched) {
  const viteCache = "node_modules/.vite";
  if (fs.existsSync(viteCache)) {
    console.log(`Clearing Vite dependency cache at ${viteCache}...`);
    fs.rmSync(viteCache, { recursive: true, force: true });
    console.log("Vite dependency cache cleared successfully.");
  }
}
