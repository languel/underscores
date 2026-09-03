// Underscores-authored Play Core-style starter programs.
//
// These examples are original teaching material for the local runner. The
// runner and utility modules expose a small Play Core-compatible lifecycle,
// but the example sources do not copy or vendor examples from upstream.

const example = (id, category, name, source) => Object.freeze({
  id,
  category,
  name,
  source: String(source).trim(),
  origin: `src/programs/${category.toLowerCase()}/${id}.js`,
});

export const PLAY_CORE_EXAMPLES = Object.freeze([
  example("grid-cross", "Basics", "Grid cross", String.raw`
export function main({ x, y }, context) {
  const middleX = Math.floor(context.cols / 2);
  const middleY = Math.floor(context.rows / 2);
  return x === middleX || y === middleY ? "·" : " ";
}`),
  example("corner-mark", "Basics", "Corner mark", String.raw`
export function main({ x, y }) {
  const corner = (x === 0 || x === 1) && (y === 0 || y === 1);
  return corner ? "◆" : " ";
}`),
  example("cursor-beacon", "Interaction", "Cursor beacon", String.raw`
export function main({ x, y }, context, cursor) {
  const dx = x - cursor.x;
  const dy = (y - cursor.y) * 0.55;
  const distance = Math.hypot(dx, dy);
  const radius = 2 + Math.sin(context.time / 180) * 0.5;
  return distance < radius ? "●" : distance < radius + 1 ? "·" : " ";
}`),
  example("orbiting-spark", "Motion", "Orbiting spark", String.raw`
export function main({ x, y }, context) {
  const angle = context.time / 700;
  const cx = context.cols / 2 + Math.cos(angle) * context.cols * 0.28;
  const cy = context.rows / 2 + Math.sin(angle * 1.7) * context.rows * 0.24;
  return Math.hypot(x - cx, (y - cy) * 0.55) < 1.2 ? "✦" : " ";
}`),
  example("breathing-ring", "Shapes", "Breathing ring", String.raw`
export function main({ x, y }, context) {
  const dx = x - context.cols / 2;
  const dy = (y - context.rows / 2) * 2;
  const radius = 6 + Math.sin(context.time / 420) * 1.5;
  const distance = Math.hypot(dx, dy);
  return Math.abs(distance - radius) < 1.1 ? "○" : " ";
}`),
  example("rising-bars", "Motion", "Rising bars", String.raw`
export function main({ x, y }, context) {
  const phase = context.time / 260;
  const height = 2 + Math.floor((Math.sin(x * 0.65 + phase) * 0.5 + 0.5) * Math.max(2, context.rows - 4));
  return y >= context.rows - height ? "▮" : " ";
}`),
  example("mirror-maze", "Patterns", "Mirror maze", String.raw`
export function main({ x, y }, context) {
  const foldX = Math.min(x, context.cols - 1 - x);
  const foldY = Math.min(y, context.rows - 1 - y);
  const stripe = (foldX * 3 + foldY * 5 + Math.floor(context.time / 240)) % 11;
  return stripe < 2 ? "╱" : stripe === 5 ? "╲" : " ";
}`),
  example("ripple-field", "Patterns", "Ripple field", String.raw`
export function main({ x, y }, context) {
  const dx = x - context.cols / 2;
  const dy = (y - context.rows / 2) * 1.8;
  const radius = Math.hypot(dx, dy) - context.time / 95;
  const ring = Math.abs((radius % 9 + 9) % 9 - 4.5);
  return ring < 1.2 ? "·" : " ";
}`),
  example("hsv-bloom", "Color", "HSV bloom", String.raw`
import { colorFromHsv } from '/src/modules/color.js'

export const settings = { backgroundColor: "#101010" }

export function main({ x, y }, context) {
  const dx = (x - context.cols / 2) / Math.max(1, context.cols);
  const dy = (y - context.rows / 2) / Math.max(1, context.rows);
  const glow = Math.max(0, 1 - Math.hypot(dx, dy) * 3);
  return { char: glow > 0.15 ? "●" : "·", color: colorFromHsv((context.time / 20 + x * 8) % 360, 0.72, glow) };
}`),
  example("tide-lines", "Diagnostics", "Tide lines", String.raw`
import { drawInfo } from '/src/modules/drawbox.js'

export function main({ x, y }, context) {
  const wave = Math.sin(x * 0.34 + context.time / 380) + Math.cos(y * 0.52 - context.time / 510);
  return wave > 1.1 ? "≈" : wave < -1.1 ? "_" : " ";
}

export function post(context, cursor, buffer) {
  drawInfo(context, cursor, buffer);
}`),
]);

export const getPlayCoreExample = id => PLAY_CORE_EXAMPLES.find(example => example.id === id) || null;
