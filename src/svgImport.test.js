import assert from "node:assert/strict";
import test from "node:test";
import { attachDraweratorSvgMetadata, cleanSvgMarkup, extractDraweratorSvgMetadata, extractSvgMarkup, getSvgDrawableBounds, offsetSvgDrawableSpecs, parseSvgPath, parseSvgToDrawableSpecs } from "./svgImport.js";

test("imports native SVG primitives with inherited styles", () => {
  const specs = parseSvgToDrawableSpecs(`
    <svg viewBox="0 0 100 100"><g stroke="#00b8e8" stroke-width="3" fill="none">
      <rect x="10" y="20" width="30" height="40" />
      <ellipse cx="70" cy="30" rx="10" ry="15" />
      <line x1="0" y1="0" x2="10" y2="10" />
    </g></svg>
  `);
  assert.equal(specs.length, 3);
  assert.deepEqual(specs.map(spec => spec.type), ["rectangle", "ellipse", "line"]);
  assert.equal(specs[0].strokeColor, "#00b8e8");
  assert.equal(specs[0].strokeWidth, 3);
  assert.equal(specs[0].backgroundColor, "transparent");
  assert.deepEqual([specs[2].x, specs[2].y, specs[2].x2, specs[2].y2], [0, 0, 10, 10]);
});

test("imports SVG path curves as editable sampled paths", () => {
  const paths = parseSvgPath("M 0 0 C 10 0 10 10 20 10 L 30 20 Z");
  assert.equal(paths.length, 1);
  assert.ok(paths[0].length > 12);
  assert.deepEqual(paths[0][0], [0, 0]);
  assert.deepEqual(paths[0].at(-1), [0, 0]);
  const specs = parseSvgToDrawableSpecs("<svg><path d=\"M0 0 C10 0 10 10 20 10\" stroke=\"red\" fill=\"none\" /></svg>");
  assert.equal(specs.length, 1);
  assert.equal(specs[0].type, "freedraw");
  assert.equal(specs[0].strokeColor, "red");
});

test("uses the Drawerator foreground for unstyled SVG and preserves solid fills", () => {
  const specs = parseSvgToDrawableSpecs("<svg><rect x=\"0\" y=\"0\" width=\"20\" height=\"10\" fill=\"tomato\" /></svg>");
  assert.equal(specs.length, 1);
  assert.equal(specs[0].strokeColor, null);
  assert.equal(specs[0].backgroundColor, "tomato");
  assert.equal(specs[0].fillStyle, "solid");
});

test("imports Excalidraw fill-only paths as visible editable outlines", () => {
  const specs = parseSvgToDrawableSpecs(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <g stroke="none"><path fill="#1e1e1e" d="M -1 4 Q -2 3 -4 3 L -8 5 Z" /></g>
    </svg>
  `);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].type, "freedraw");
  assert.equal(specs[0].strokeColor, "#1e1e1e");
  assert.equal(specs[0].backgroundColor, "transparent");
  assert.equal(specs[0].simulatePressure, false);
  assert.equal("fillStyle" in specs[0], false);
  assert.ok(specs[0].points.length > 2);
});

test("imports arbitrary SVG path and polygon geometry as constant-width outlines", () => {
  const specs = parseSvgToDrawableSpecs(`
    <svg xmlns="http://www.w3.org/2000/svg">
      <path fill="#fefefe" stroke="#445566" stroke-width="3" d="M0 0 L20 0 L10 10 Z" />
      <polygon fill="tomato" points="30,0 50,0 40,10" />
    </svg>
  `);
  assert.equal(specs.length, 2);
  assert.deepEqual(specs.map(spec => spec.type), ["freedraw", "freedraw"]);
  assert.equal(specs[0].strokeColor, "#445566");
  assert.equal(specs[1].strokeColor, "tomato");
  for (const spec of specs) {
    assert.equal(spec.backgroundColor, "transparent");
    assert.equal(spec.simulatePressure, false);
    assert.equal("fillStyle" in spec, false);
  }
});

test("extracts SVG from HTML clipboard content and positions imported specs", () => {
  assert.match(extractSvgMarkup("<p>ignore</p><svg><line x1=\"1\" y1=\"2\" x2=\"5\" y2=\"8\" /></svg>"), /^<svg/);
  const specs = parseSvgToDrawableSpecs("<svg><polyline points=\"10,20 20,30 30,20\" /></svg>");
  const bounds = getSvgDrawableBounds(specs);
  assert.deepEqual(bounds, { minX: 10, minY: 20, maxX: 30, maxY: 30, width: 20, height: 10 });
  const shifted = offsetSvgDrawableSpecs(specs, 5, -10);
  assert.deepEqual(shifted[0].points[0], [15, 10]);
});

test("removes exported font baggage only when copied SVG contains no text", () => {
  const noText = cleanSvgMarkup(`<svg><defs><style class="style-fonts">@font-face { font-family: "Virgil"; src: url("https://example.test/Virgil.woff2"); }</style></defs><!-- svg-source:excalidraw --><path d="M0 0 L10 10" /></svg>`);
  assert.doesNotMatch(noText, /font-face|Virgil|<defs|svg-source/i);
  assert.match(noText, /<path\b/i);

  const withText = cleanSvgMarkup(`<svg><defs><style>@font-face { font-family: "Virgil"; }</style></defs><text x="0" y="0">Hello</text></svg>`);
  assert.match(withText, /font-face|Virgil/i);
  assert.match(withText, /<text\b/i);
});

test("preserves Drawerator elements in SVG metadata for exact editable round trips", () => {
  const elements = [{ id: "freehand-1", type: "freedraw", x: 10, y: 20, points: [[0, 0], [8, 3]], pressures: [0.1, 0.9], simulatePressure: true }];
  const svg = attachDraweratorSvgMetadata("<svg><path d=\"M0 0 L8 3\" /></svg>", elements);
  assert.match(svg, /<metadata\b[^>]*drawerator-editable-elements/i);
  assert.deepEqual(extractDraweratorSvgMetadata(svg), { version: 1, elements });
  assert.equal(extractDraweratorSvgMetadata("<svg><path d=\"M0 0 L8 3\" /></svg>"), null);
});

test("accepts real tldraw, Excalidraw, and Boxy SVG path exports", () => {
  const tldraw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="2190 2851 275 202"><g transform="matrix(1, 0, 0, 1, 2191.9154, 3015.996)"><path stroke-width="2" d="M 0 0 C 0.3996 -0.4491 75.6408 19.0832 105.518 -0.4491 C 135.0615 -19.3749 117.661 -59.5397 143.4765 -93.5977 M 0 0 C 0.5162 0.4019 75.7574 19.9342 105.6346 0.4019" stroke="#1d1d1d" fill="none"/></g></svg>`;
  const excalidraw = `<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(10 81.96484375)"><path d="M0 0 C17.42 10.05, 34.85 20.11, 77.79 44.88 M77.79 44.88 C107.93 2.39, 138.07 -40.11, 160.66 -71.96 M160.66 -71.96 C171.6 -48.77, 182.53 -25.58, 212.49 38" stroke="#1e1e1e" stroke-width="2" fill="none"/></g></svg>`;
  const boxy = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="132.026 94.315 159.303 140.1503"><path style="fill: none; stroke: rgb(0, 0, 0);" d="M 132.026 143.277 C 132.026 136.124 137.254 127.829 142.025 123.008 C 171.29 98.792 207.366 84.177 224.831 104.038 C 240.006 208.884 238.452 224.038 245.176 231.305"/></svg>`;
  const tldrawSpecs = parseSvgToDrawableSpecs(tldraw);
  const excalidrawSpecs = parseSvgToDrawableSpecs(excalidraw);
  const boxySpecs = parseSvgToDrawableSpecs(boxy);
  assert.equal(tldrawSpecs.length, 2);
  assert.equal(excalidrawSpecs.length, 3);
  assert.equal(boxySpecs.length, 1);
  assert.ok([...tldrawSpecs, ...excalidrawSpecs, ...boxySpecs].every(spec => spec.type === "freedraw" && spec.points.length > 2));
});
