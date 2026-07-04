import fs from "fs";
import path from "path";

const targets = [
  "node_modules/@excalidraw/excalidraw/dist/excalidraw.development.js",
  "node_modules/@excalidraw/excalidraw/dist/excalidraw.production.min.js"
];

let patched = false;

for (const target of targets) {
  if (fs.existsSync(target)) {
    console.log(`Checking ${target}...`);
    let content = fs.readFileSync(target, "utf8");
    let initialContent = content;

    // Replace hardcoded purple selection/highlight colors with desaturated gray
    content = content
      .replace(/"\s*rgb\(105,\s*101,\s*219\)"/g, '"rgb(109, 115, 116)"')
      .replace(/'\s*rgb\(105,\s*101,\s*219\)'/g, "'rgb(109, 115, 116)'")
      .replace(/"rgba\(105,\s*101,\s*219,\s*0\.4\)"/g, '"rgba(109, 115, 116, 0.4)"')
      .replace(/'rgba\(105,\s*101,\s*219,\s*0\.4\)'/g, "'rgba(109, 115, 116, 0.4)'")
      .replace(/"#5e5ad8"/g, '"#6d7374"')
      .replace(/'#5e5ad8'/g, "'#6d7374'")
      .replace(/"rgba\(134,\s*131,\s*226,\s*0\.9\)"/g, '"rgba(109, 115, 116, 0.9)"')
      .replace(/'rgba\(134,\s*131,\s*226,\s*0\.9\)'/g, "'rgba(109, 115, 116, 0.9)'")
      .replace(/"rgba\(177,\s*151,\s*252,\s*0\.7\)"/g, '"rgba(141, 145, 146, 0.7)"')
      .replace(/'rgba\(177,\s*151,\s*252,\s*0\.7\)'/g, "'rgba(141, 145, 146, 0.7)'");

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
