import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeSvgForInertRender, seekSvgDocument } from "./svgRuntime.js";

test("inert renderer removes executable and remote SVG content", () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg" onclick="evil()">
    <style>@import "https://evil.test/a.css"; .safe{fill:url(#paint)} .bad{fill:url(https://evil.test/a)}</style>
    <script>evil()</script>
    <foreignObject><div>HTML</div></foreignObject>
    <image href="https://evil.test/a.png"/>
    <use href="#safe"/>
  </svg>`;
  const sanitized = sanitizeSvgForInertRender(source);
  assert.doesNotMatch(sanitized, /onclick|<script|foreignObject|https:\/\/evil/);
  assert.match(sanitized, /url\(#paint\)/);
  assert.match(sanitized, /href="#safe"/);
});

test("transport seeking controls SMIL and Web Animations together", () => {
  const calls = [];
  const animation = {
    pause: () => calls.push("waapi-pause"),
    set currentTime(value) { calls.push(value); },
  };
  const svg = {
    pauseAnimations: () => calls.push("smil-pause"),
    setCurrentTime: value => calls.push(value),
    getAnimations: () => [animation],
  };
  const result = seekSvgDocument({ querySelector: () => svg }, 1.25);
  assert.deepEqual(result, { smil: true, animations: 1 });
  assert.deepEqual(calls, ["smil-pause", 1.25, "waapi-pause", 1250]);
});
