import test from "node:test";
import assert from "node:assert/strict";
import { buildSvgTimingGraph, parseSvgClockValue } from "./svgAnimation.js";

test("parses SVG clock values", () => {
  assert.equal(parseSvgClockValue("500ms"), 0.5);
  assert.equal(parseSvgClockValue("2min"), 120);
  assert.equal(parseSvgClockValue("01:02.5"), 62.5);
  assert.equal(parseSvgClockValue("indefinite"), Infinity);
});

test("combines SMIL, CSS, and Looom timing without rewriting source", () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg">
    <style>
      #dot { animation-name: pulse; animation-duration: 2s; animation-iteration-count: infinite; }
      @keyframes pulse { from { opacity: 0 } 50% { opacity: 1 } to { opacity: 0 } }
    </style>
    <circle id="dot" cx="10" cy="10" r="5">
      <animate attributeName="cx" values="10;20;10" keyTimes="0;0.5;1" dur="3s" repeatCount="indefinite"/>
    </circle>
    <g id="t0" class="thread" style="--speed:10;--timeOffset:5;--playMode:1">
      <g id="f0" class="frame"><path d="M0 0L1 1"/></g>
      <g id="f1" class="frame"><path d="M1 1L2 2"/></g>
    </g>
  </svg>`;
  const graph = buildSvgTimingGraph(source);
  assert.equal(graph.valid, true);
  assert.deepEqual(graph.lanes.map(lane => lane.kind).sort(), ["css", "looom", "smil"]);
  assert.equal(graph.duration, 3);
  const looom = graph.lanes.find(lane => lane.kind === "looom");
  assert.equal(looom.duration, 0.2);
  assert.equal(looom.begin, 0.5);
  assert.equal(looom.keyframes.length, 2);
});
