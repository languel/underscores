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
      // Excalidraw renders freedraw marks at 4.25 times their stored stroke
      // width. Use half that rendered width as the laser outline radius so the
      // full laser mark matches the active pen brush.
      .replace(
        /path\.getStrokeOutline\(path\.options\.size \/ this\.app\.state\.zoom\.value\)/g,
        'path.getStrokeOutline((Number.parseFloat(getComputedStyle(this.container).getPropertyValue("--underscores-laser-width")) || (Number(this.app.state.currentItemStrokeWidth) || 1) * 4.25) / 2 / this.app.state.zoom.value)'
      )
      .replace(
        /path\.getStrokeOutline\(\(Number\(this\.app\.state\.currentItemStrokeWidth\) \|\| 1\)(?: \* 4\.25)? \/ 2 \/ this\.app\.state\.zoom\.value\)/g,
        'path.getStrokeOutline((Number.parseFloat(getComputedStyle(this.container).getPropertyValue("--underscores-laser-width")) || (Number(this.app.state.currentItemStrokeWidth) || 1) * 4.25) / 2 / this.app.state.zoom.value)'
      )
      .replace(
        /e\.getStrokeOutline\(e\.options\.size\/this\.app\.state\.zoom\.value\)/g,
        'e.getStrokeOutline((Number.parseFloat(getComputedStyle(this.container).getPropertyValue("--underscores-laser-width"))||(Number(this.app.state.currentItemStrokeWidth)||1)*4.25)/2/this.app.state.zoom.value)'
      )
      .replace(
        /e\.getStrokeOutline\(\(Number\(this\.app\.state\.currentItemStrokeWidth\)\|\|1\)(?:\*4\.25)?\/2\/this\.app\.state\.zoom\.value\)/g,
        'e.getStrokeOutline((Number.parseFloat(getComputedStyle(this.container).getPropertyValue("--underscores-laser-width"))||(Number(this.app.state.currentItemStrokeWidth)||1)*4.25)/2/this.app.state.zoom.value)'
      )
      // Global case-insensitive color hex replacements
      .replace(/6965db/gi, '6d7374')
      .replace(/a8a5ff/gi, 'a5a5a5')
      .replace(/3530c4/gi, '555555')
      .replace(/5e5ad8/gi, '6d7374')
      // Selection bounding box and frame highlight color overrides
      .replace(/rgb\(0,\s*118,\s*255\)/gi, 'rgb(120, 125, 126)')
      // Images and web embeds get their own theme-aware hover affordance in
      // Underscores. Keep Excalidraw's stock blue link glyph for other linked
      // elements, but avoid painting a second icon over media thumbnails.
      .replace(
        /if \(element\.link && !appState\.selectedElementIds\[element\.id\]\)/g,
        'if (element.link && !appState.selectedElementIds[element.id] && element.type !== "image" && element.type !== "embeddable")'
      )
      .replace(
        /oe=function\(e,t,n\)\{if\(e\.link&&!n\.selectedElementIds\[e\.id\]\)\{/g,
        'oe=function(e,t,n){if(e.link&&!n.selectedElementIds[e.id]&&"image"!==e.type&&"embeddable"!==e.type){'
      )
      // Underscores renders collaborator pointers in its own DOM overlay so
      // guest colors remain stable across clients. Keep Excalidraw's remote
      // selection rendering, but prevent its native canvas cursor from
      // painting a second pointer with the peer-id palette.
      .replace(
        /remotePointerViewportCoords: pointerViewportCoords/g,
        'remotePointerViewportCoords: {}'
      )
      .replace(
        /remotePointerViewportCoords:o/g,
        'remotePointerViewportCoords:{}'
      )
      // Excalidraw's one-step layer actions otherwise also match the macOS
      // Cmd+Option bracket chords. Their higher key priority then wins before
      // the corresponding Send to back / Bring to front action gets a chance
      // to run. Reserve Option for the all-the-way layer actions.
      .replace(
        /(keyTest: event => event\[_keys__WEBPACK_IMPORTED_MODULE_3__\.KEYS\.CTRL_OR_CMD\] && !event\.shiftKey) && (event\.code === _keys__WEBPACK_IMPORTED_MODULE_3__\.CODES\.BRACKET_(?:LEFT|RIGHT),)/g,
        '$1 && !event.altKey && $2'
      )
      .replace(
        /(keyTest:function\(e\)\{return e\[[A-Za-z_$][A-Za-z0-9_$]*\.tW\.CTRL_OR_CMD\]&&!e\.shiftKey)(&&e\.code===[A-Za-z_$][A-Za-z0-9_$]*\.aU\.BRACKET_(?:LEFT|RIGHT))/g,
        '$1&&!e.altKey$2'
      )
      // Replace deprecated unload event with pagehide to satisfy browser policies
      .replace(/(EVENT\\?\[\\?["']UNLOAD\\?["']\\?\]\s*=\s*)(\\?["'])unload\2/gi, '$1$2pagehide$2')
      .replace(/(\bUNLOAD\s*=\s*)(\\?["'])unload\2/gi, '$1$2pagehide$2');

    // Excalidraw 0.17.6 delivers its fallback MainMenu through an internal
    // tunnel-rat registration. The menu registers a freshly-created JSX child
    // on every app-state render; in a scene with live runtime/collaboration
    // updates its mount/unmount effects can recurse until React throws
    // "Maximum update depth exceeded" and blanks the app. Underscores owns the
    // command palette and shortcut surface, so omit only the fallback menu
    // while leaving the rest of Excalidraw's LayerUI intact. Keep this patch
    // here (rather than editing node_modules by hand) so dev and production
    // builds apply the same guarded workaround.
    const defaultMainMenuPatterns = [
      {
        search: 'children: [children, (0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_0__.jsx)(DefaultMainMenu, {\\n      UIOptions: UIOptions\\n    }),',
        replacement: 'children: [children,',
      },
      {
        search: 'children:[w,(0,P.jsx)(Kn,{UIOptions:g}),',
        replacement: 'children:[w,',
      },
    ];
    for (const { search, replacement } of defaultMainMenuPatterns) {
      if (content.includes(search)) content = content.replace(search, replacement);
    }

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
