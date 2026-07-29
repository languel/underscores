import test from "node:test";
import assert from "node:assert/strict";
import {
  convertFirstSvgSubpathToStraightLine,
  getEditableSvgPathNodes,
  getSvgPathEndpointConnections,
  getSvgNodeBounds,
  getSvgNodeWorldOutline,
  getSvgPathWorldControls,
  getSvgSubpathWorldAnchors,
  parseSvgPathCollection,
  parseSvgPathGeometry,
  removeExactDuplicateSvgPathSubpaths,
  replaceSvgPathSubpath,
  replaceSvgPathSubpathWithConnectedEndpoint,
  serializeSvgPathGeometry,
  svgPointToWorld,
  transformSvgPathGeometry,
  worldPointToSvg,
} from "./svgPathGeometry.js";

test("parses lines and cubic curves into editable anchors", () => {
  const parsed = parseSvgPathGeometry("M 10 20 L 30 40 C 40 50 60 50 70 40");
  assert.equal(parsed.valid, true);
  assert.equal(parsed.geometry.anchors.length, 3);
  assert.deepEqual(parsed.geometry.anchors[0], {
    x: 10, y: 20, in: null, out: null, mode: "corner",
  });
  assert.deepEqual(parsed.geometry.anchors[2].in, [-10, 10]);
});

test("supports relative, quadratic, smooth, and closed SVG commands", () => {
  const parsed = parseSvgPathGeometry("m 10 10 q 20 -10 40 0 t 40 0 z");
  assert.equal(parsed.valid, true);
  assert.equal(parsed.geometry.closed, true);
  assert.equal(parsed.geometry.anchors.length, 3);
  assert.match(serializeSvgPathGeometry(parsed.geometry), /^M 10 10 C /);
  assert.match(serializeSvgPathGeometry(parsed.geometry), / Z$/);
});

test("supports arcs and still rejects multiple subpaths in a single geometry", () => {
  const arc = parseSvgPathGeometry("M0 0 A10 10 0 0 1 20 20");
  assert.equal(arc.valid, true);
  assert.ok(arc.geometry.anchors.length >= 2);
  assert.match(parseSvgPathGeometry("M0 0 L10 0 M20 0 L30 0").error, /Multi-subpath/);
});

test("transforms selected SVG path geometry without changing its endpoint intent", () => {
  const geometry = parseSvgPathGeometry("M 0 0 C 10.24 20.76 30.26 20.74 40.25 0.24").geometry;
  const rounded = transformSvgPathGeometry(geometry, "round-integers");
  assert.deepEqual(rounded.anchors.map(anchor => [anchor.x, anchor.y]), [[0, 0], [40, 0]]);
  assert.deepEqual(rounded.anchors[0].out, [10, 21]);
  assert.deepEqual(rounded.anchors[1].in, [-10, 21]);

  const tenths = transformSvgPathGeometry(geometry, "round-tenths");
  assert.deepEqual(tenths.anchors[1].in, [-10, 20.5]);

  const straightened = transformSvgPathGeometry(geometry, "straighten");
  assert.equal(straightened.anchors.every(anchor => !anchor.in && !anchor.out), true);
  assert.deepEqual(straightened.anchors.map(anchor => [anchor.x, anchor.y]), [[0, 0], [40.25, 0.24]]);
});

test("smooth, resample, and simplify provide explicit editable path operations", () => {
  const polyline = parseSvgPathGeometry("M 0 0 L 10 20 L 20 0 L 30 20 L 40 0").geometry;
  const smoothed = transformSvgPathGeometry(polyline, "smooth");
  assert.deepEqual(smoothed.anchors.map(anchor => [anchor.x, anchor.y]), polyline.anchors.map(anchor => [anchor.x, anchor.y]));
  assert.ok(smoothed.anchors[1].in && smoothed.anchors[1].out);

  const resampled = transformSvgPathGeometry(smoothed, "resample");
  assert.equal(resampled.anchors.length, smoothed.anchors.length);
  assert.deepEqual([resampled.anchors[0].x, resampled.anchors[0].y], [0, 0]);
  assert.deepEqual([resampled.anchors.at(-1).x, resampled.anchors.at(-1).y], [40, 0]);
  assert.equal(resampled.anchors.every(anchor => !anchor.in && !anchor.out), true);

  const nearlyStraight = parseSvgPathGeometry("M 0 0 L 10 0.01 L 20 -0.01 L 30 0").geometry;
  const simplified = transformSvgPathGeometry(nearlyStraight, "simplify");
  assert.equal(simplified.anchors.length, 2);
  assert.deepEqual([simplified.anchors[0].x, simplified.anchors.at(-1).x], [0, 30]);
});

test("relax reduces a curve without moving open endpoints", () => {
  const curve = parseSvgPathGeometry("M 0 0 C 0 100 100 100 100 0").geometry;
  const relaxed = transformSvgPathGeometry(curve, "relax");
  assert.deepEqual([relaxed.anchors[0].x, relaxed.anchors[0].y], [0, 0]);
  assert.deepEqual([relaxed.anchors[1].x, relaxed.anchors[1].y], [100, 0]);
  assert.deepEqual(relaxed.anchors[0].out, [0, 65]);
  assert.deepEqual(relaxed.anchors[1].in, [0, 65]);

  const cornered = parseSvgPathGeometry("M 0 0 L 20 40 L 40 0").geometry;
  const relaxedCorner = transformSvgPathGeometry(cornered, "relax");
  assert.deepEqual([relaxedCorner.anchors[1].x, relaxedCorner.anchors[1].y], [20, 26]);
});

test("parses and replaces ordered subpaths without changing their siblings", () => {
  const source = "M0 0 C10 0 20 10 30 10 M40 40 L50 50 Z";
  const collection = parseSvgPathCollection(source);
  assert.equal(collection.valid, true);
  assert.equal(collection.subpaths.length, 2);
  assert.equal(collection.subpaths[0].geometry.closed, false);
  assert.equal(collection.subpaths[1].geometry.closed, true);

  const moved = {
    ...collection.subpaths[0].geometry,
    anchors: collection.subpaths[0].geometry.anchors.map(anchor => ({ ...anchor, x: anchor.x + 5 })),
  };
  const replaced = replaceSvgPathSubpath(source, 0, moved);
  assert.match(replaced, /^M 5 0 C /);
  assert.match(replaced, /M40 40 L50 50 Z$/);
});

test("removes only exact duplicate exporter subpaths", () => {
  const duplicate = "M0 0 C10 0 20 10 30 10 M0 0   C10 0 20 10 30 10";
  assert.equal(
    removeExactDuplicateSvgPathSubpaths(duplicate),
    "M0 0 C10 0 20 10 30 10",
  );
  const compound = "M0 0 L10 10 M0 0 L10 11";
  assert.equal(removeExactDuplicateSvgPathSubpaths(compound), compound);
});

test("reduces a two-point Excalidraw rough export to one semantic line", () => {
  const exported = "M0 0 C38.5 -31.2, 77 -62.4, 107.5 -87.1 M0 0 C28.93 -23.44, 57.86 -46.88, 107.5 -87.1";
  assert.equal(
    convertFirstSvgSubpathToStraightLine(exported),
    "M 0 0 L 107.5 -87.1",
  );
});

test("moves every coincident compound-path endpoint as one joint", () => {
  const source = "M0 0 L20 20 M40 0 L20 20 M20 20 C30 30 40 30 50 20 M20 20 L20 50";
  assert.deepEqual(getSvgPathEndpointConnections(source, 0, 1), [
    { subpathIndex: 0, anchorIndex: 1 },
    { subpathIndex: 1, anchorIndex: 1 },
    { subpathIndex: 2, anchorIndex: 0 },
    { subpathIndex: 3, anchorIndex: 0 },
  ]);
  const selected = parseSvgPathCollection(source).subpaths[0].geometry;
  const moved = {
    ...selected,
    anchors: selected.anchors.map((anchor, index) => index === 1 ? { ...anchor, x: 25, y: 30 } : anchor),
  };
  const result = replaceSvgPathSubpathWithConnectedEndpoint(source, 0, 1, moved);
  const collection = parseSvgPathCollection(result);
  assert.deepEqual(collection.subpaths.map(subpath => {
    const connections = [1, 1, 0, 0];
    const endpoint = subpath.geometry.anchors[connections[subpath.index]];
    return [endpoint.x, endpoint.y];
  }), [[25, 30], [25, 30], [25, 30], [25, 30]]);
});

test("moving an unconnected or interior anchor preserves unrelated subpath source", () => {
  const source = "M0 0 L10 10 L20 20 M30 30 L40 40";
  assert.deepEqual(getSvgPathEndpointConnections(source, 0, 1), []);
  const selected = parseSvgPathCollection(source).subpaths[0].geometry;
  const moved = {
    ...selected,
    anchors: selected.anchors.map((anchor, index) => index === 1 ? { ...anchor, x: 12 } : anchor),
  };
  const result = replaceSvgPathSubpathWithConnectedEndpoint(source, 0, 1, moved);
  assert.match(result, /M30 30 L40 40$/);
});

test("maps SVG viewBox coordinates through the host transform", () => {
  const element = { x: 100, y: 200, width: 320, height: 180, angle: 0 };
  const svg = { viewBox: [0, 0, 320, 180] };
  const world = svgPointToWorld(element, svg, [20, 90]);
  assert.deepEqual(world, [120, 290]);
  assert.deepEqual(worldPointToSvg(element, svg, world), [20, 90]);
});

test("matches SVG's default meet aspect ratio inside a differently shaped host", () => {
  const element = { x: 100, y: 200, width: 200, height: 300, angle: 0 };
  const svg = { viewBox: [0, 0, 100, 100] };
  // Default xMidYMid meet centers a 200 × 200 SVG viewport vertically.
  assert.deepEqual(svgPointToWorld(element, svg, [0, 0]), [100, 250]);
  assert.deepEqual(svgPointToWorld(element, svg, [100, 100]), [300, 450]);
  assert.deepEqual(worldPointToSvg(element, svg, [100, 250]), [0, 0]);
});

test("extracts editable path nodes with invertible nested transforms", () => {
  const nodes = getEditableSvgPathNodes(`
    <svg viewBox="0 0 100 100">
      <path id="plain" d="M0 0 L10 10"/>
      <g transform="translate(10 10)"><path id="moved" d="M0 0 L10 10"/></g>
    </svg>
  `);
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].valid, true);
  assert.equal(nodes[1].valid, true);
  const controls = getSvgPathWorldControls(
    { x: 0, y: 0, width: 100, height: 100, angle: 0 },
    { viewBox: [0, 0, 100, 100] },
    nodes[1].subpaths[0].geometry,
    nodes[1].transform,
  );
  assert.deepEqual(controls.map(control => control.anchor), [[10, 10], [20, 20]]);
  assert.deepEqual(
    worldPointToSvg(
      { x: 0, y: 0, width: 100, height: 100, angle: 0 },
      { viewBox: [0, 0, 100, 100] },
      [20, 20],
      nodes[1].inverseTransform,
    ),
    [10, 10],
  );
});

test("exposes compound path subpaths as ordered editable children", () => {
  const [path] = getEditableSvgPathNodes(`
    <svg viewBox="0 0 200 200">
      <path id="compound" d="M0 0 L20 20 M40 40 C50 30 60 50 70 40 M80 80 A10 10 0 0 1 100 100"/>
    </svg>
  `);
  assert.equal(path.valid, true);
  assert.equal(path.subpaths.length, 3);
  assert.equal(path.subpaths[0].valid, true);
  assert.equal(path.subpaths[1].valid, true);
  assert.equal(path.subpaths[2].valid, true);
  assert.ok(path.subpaths[2].geometry.anchors.length >= 2);
});

test("computes source-tree bounds for primitive nodes and groups", () => {
  const source = `
    <svg viewBox="0 0 100 80">
      <g id="pair">
        <rect id="box" x="10" y="12" width="20" height="8"/>
        <circle id="dot" cx="50" cy="30" r="5"/>
      </g>
    </svg>
  `;
  assert.deepEqual(getSvgNodeBounds(source, 0), [0, 0, 100, 80]);
  assert.deepEqual(getSvgNodeBounds(source, 1), [10, 12, 55, 35]);
  assert.deepEqual(getSvgNodeBounds(source, 2), [10, 12, 30, 20]);
  assert.deepEqual(getSvgNodeBounds(source, 3), [45, 25, 55, 35]);
});

test("maps selected SVG node bounds through the host frame", () => {
  const source = `<svg viewBox="0 0 100 50"><rect x="10" y="5" width="20" height="10"/></svg>`;
  const outline = getSvgNodeWorldOutline(
    { x: 200, y: 100, width: 400, height: 200, angle: 0 },
    { viewBox: [0, 0, 100, 50] },
    source,
    1,
  );
  assert.deepEqual(outline, [[240, 120], [320, 120], [320, 160], [240, 160]]);
});

test("maps a subpath's anchors and handles into canonical world-space anchors", () => {
  const geometry = parseSvgPathGeometry("M10 10 C20 0 30 20 40 10").geometry;
  const anchors = getSvgSubpathWorldAnchors(
    { x: 100, y: 200, width: 200, height: 100, angle: 0 },
    { viewBox: [0, 0, 100, 50] },
    geometry,
  );
  assert.deepEqual(anchors[0], {
    x: 120, y: 220, in: null, out: [20, -20], mode: "corner",
  });
  assert.deepEqual(anchors[1].in, [-20, 20]);
});
