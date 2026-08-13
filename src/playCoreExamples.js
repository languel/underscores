// Curated starter programs adapted from ertdfgcvb/play.core (Apache-2.0).
// Source repository: https://github.com/ertdfgcvb/play.core
// These are kept local so a saved Underscore scene does not depend on a network
// request. Examples requiring camera/canvas modules are intentionally omitted
// until those modules have a portable Underscore implementation.

const example = (id, category, name, source) => Object.freeze({
  id, category, name, source: String(source).trim(),
  origin: `src/programs/${category.toLowerCase()}/${id}.js`,
});

export const PLAY_CORE_EXAMPLES = Object.freeze([
  example("simple_output", "Basics", "Simple output", String.raw`
export function main(coord) {
  if (coord.x === 0 && coord.y === 0) return "Hello, play.core!";
}`),
  example("coordinates_xy", "Basics", "Coordinates (x/y)", String.raw`
export function main(coord) {
  return coord.x === 0 || coord.y === 0 ? "+" : " ";
}`),
  example("cursor", "Basics", "Cursor", String.raw`
import { drawInfo } from '/src/modules/drawbox.js'

export function main(coord, context, cursor) {
  const dx = coord.x - cursor.x
  const dy = coord.y - cursor.y
  const d = Math.sqrt(dx * dx + dy * dy)
  return d < 3 ? "@" : " "
}

export function post(context, cursor, buffer) {
  drawInfo(context, cursor, buffer)
}`),
  example("how_to_draw_a_circle", "Basics", "How to draw a circle", String.raw`
import { drawBox } from '/src/modules/drawbox.js'

export function main(coord, context) {
  const m = Math.min(context.cols, context.rows)
  const aspect = context.metrics.aspect
  const x = (coord.x - context.cols / 2) / m * aspect
  const y = (coord.y - context.rows / 2) / m
  return Math.sqrt(x * x + y * y) < 0.2 ? "@" : " "
}

export function post(context, cursor, buffer) {
  drawBox('', { x: 1, y: 1, width: context.cols - 2, height: context.rows - 2, borderStyle: "round" }, buffer, context.cols, context.rows)
}`),
  example("time_frames", "Basics", "Time frames", String.raw`
import { drawInfo } from '/src/modules/drawbox.js'

export function main(coord, context) {
  const x = Math.floor((context.time / 80) % Math.max(1, context.cols))
  return coord.x === x ? "|" : " "
}

export function post(context, cursor, buffer) {
  drawInfo(context, cursor, buffer)
}`),
  example("two_circles", "SDF", "Two circles", String.raw`
import { sdCircle, opSmoothUnion } from '/src/modules/sdf.js'
import { sub, vec2 } from '/src/modules/vec2.js'

const density = '#WX?*:÷×+=-· '

export function main(coord, context, cursor) {
  const m = Math.min(context.cols, context.rows)
  const a = context.metrics.aspect
  const st = vec2(
    2.0 * (coord.x - context.cols / 2) / m * a,
    2.0 * (coord.y - context.rows / 2) / m
  )
  const pointer = vec2(
    2.0 * (cursor.x - context.cols / 2) / m * a,
    2.0 * (cursor.y - context.rows / 2) / m
  )
  const d = opSmoothUnion(sdCircle(st, 0.2), sdCircle(sub(st, pointer), 0.2), 0.7)
  const index = Math.floor((1.0 - Math.exp(-5 * Math.abs(d))) * density.length)
  return density[index]
}`),
  example("balls", "SDF", "Balls", String.raw`
import { sdCircle, opSmoothUnion } from '/src/modules/sdf.js'
import { vec2 } from '/src/modules/vec2.js'

const density = ' .:-=+*#%@'

export function main(coord, context) {
  const m = Math.min(context.cols, context.rows)
  const a = context.metrics.aspect
  const st = vec2(
    2.0 * (coord.x - context.cols / 2) / m * a,
    2.0 * (coord.y - context.rows / 2) / m
  )
  const t = context.time / 900
  let d = sdCircle(vec2(st.x + Math.sin(t) * 0.34, st.y), 0.23)
  d = opSmoothUnion(d, sdCircle(vec2(st.x - Math.sin(t) * 0.34, st.y), 0.23), 0.25)
  return density[Math.min(density.length - 1, Math.floor((1 - Math.exp(-6 * Math.abs(d))) * density.length))]
}`),
  example("donut", "Demos", "Donut", String.raw`
import { drawInfo } from '/src/modules/drawbox.js'

const shades = '.,-~:;=!*#$@'

export function main(coord, context) {
  const x = coord.x - context.cols / 2
  const y = (coord.y - context.rows / 2) * 2
  const t = context.time / 850
  const a = Math.atan2(y, x) + t
  const r = Math.sqrt(x * x + y * y)
  const tube = Math.abs(r - 11 - Math.sin(a * 3) * 1.6)
  const light = Math.max(0, 1 - tube / 6)
  return shades[Math.min(shades.length - 1, Math.floor(light * shades.length))]
}

export function post(context, cursor, buffer) {
  drawInfo(context, cursor, buffer)
}`),
  example("plasma", "Demos", "Plasma", String.raw`
import { map } from '/src/modules/num.js'
import { colorFromHsv } from '/src/modules/color.js'

export const settings = { color: '#fff', backgroundColor: '#101010' }

export function main(coord, context) {
  const x = map(coord.x, 0, context.cols, -1, 1)
  const y = map(coord.y, 0, context.rows, -1, 1)
  const t = context.time / 1000
  const v = Math.sin(x * 5 + t) + Math.sin(y * 5 - t) + Math.sin((x + y) * 4 + t)
  const hue = (v * 30 + t * 40 + 220) % 360
  return { char: '█', color: colorFromHsv(hue, 0.7, 1) }
}`),
  example("game_of_life", "Contributed", "Game of Life", String.raw`
let cells = []
let lastStep = -1

export function main(coord, context) {
  if (cells.length !== context.cols * context.rows) cells = Array.from({ length: context.cols * context.rows }, (_, i) => (i * 17 + Math.floor(i / context.cols) * 11) % 13 < 4 ? 1 : 0)
  const step = Math.floor(context.time / 180)
  if (step !== lastStep) {
    lastStep = step
    const previous = cells.slice()
    for (let y = 0; y < context.rows; y++) for (let x = 0; x < context.cols; x++) {
      let neighbours = 0
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (ox || oy) {
        const nx = (x + ox + context.cols) % context.cols
        const ny = (y + oy + context.rows) % context.rows
        neighbours += previous[ny * context.cols + nx]
      }
      const index = y * context.cols + x
      cells[index] = neighbours === 3 || (previous[index] && neighbours === 2) ? 1 : 0
    }
  }
  return cells[coord.y * context.cols + coord.x] ? '●' : ' '
}`),
  example("color_waves", "Contributed", "Color waves", String.raw`
import { map } from '/src/modules/num.js'
import { colorFromHsv } from '/src/modules/color.js'

export function main(coord, context) {
  const t = context.time / 650
  const wave = Math.sin(coord.x * 0.28 + t) + Math.cos(coord.y * 0.3 - t)
  const hue = map(wave, -2, 2, 180, 330)
  return { char: '●', color: colorFromHsv(hue, 0.7, 1) }
}`),
]);

export const getPlayCoreExample = id => PLAY_CORE_EXAMPLES.find(example => example.id === id) || null;
