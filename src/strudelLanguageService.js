// Compact, browser-local Strudel documentation used by completion hover and
// the Info panel. Keep this curated and link out to the canonical Strudel
// workshop/reference pages rather than fetching documentation on every hover.
import { getUnderscoresCompletions, getUnderscoresHover } from "./underscoresLanguageService.js";

const strudelApi = (name, signature, description, example, referenceUrl) => Object.freeze({
  name,
  signature,
  description,
  example,
  referenceUrl,
  referenceSource: "Strudel documentation",
  type: "function",
});

export const STRUDEL_API = Object.freeze([
  strudelApi("note", "note(pattern)", "Create a melodic pattern from note names or MIDI numbers.", 'note("c3 e3 g3 b3")', "https://strudel.cc/workshop/first-notes/"),
  strudelApi("sound", "sound(pattern)", "Create a sample or synthesizer pattern. The short alias s() is equivalent.", 'sound("bd sd [~ bd] sd")', "https://strudel.cc/workshop/first-notes/"),
  strudelApi("s", "s(pattern)", "Short alias for sound().", 's("bd*4")', "https://strudel.cc/workshop/first-notes/"),
  strudelApi("stack", "stack(...patterns)", "Play several patterns in parallel as one pattern.", 'stack(s("bd*4"), note("c3 eb3 g3"))', "https://strudel.cc/workshop/recap/"),
  strudelApi("slow", "slow(factor)", "Stretch a pattern in time. slow(2) takes twice as long; fast(2) is its inverse.", '.slow(2)', "https://strudel.cc/workshop/first-effects/"),
  strudelApi("fast", "fast(factor)", "Speed a pattern up by a factor.", '.fast(2)', "https://strudel.cc/workshop/first-effects/"),
  strudelApi("setcpm", "setcpm(cyclesPerMinute)", "Set the tempo in cycles per minute.", "setcpm(45)", "https://strudel.cc/workshop/recap/"),
  strudelApi("setcps", "setcps(cyclesPerSecond)", "Set the tempo in cycles per second; one cycle is the pattern's base duration.", "setcps(0.75)", "https://strudel.cc/learn/getting-started/"),
  strudelApi("gain", "gain(value)", "Control pattern amplitude; signals can automate it over time.", '.gain(0.5)', "https://strudel.cc/workshop/first-effects/"),
  strudelApi("lpf", "lpf(value)", "Set a low-pass filter cutoff, optionally driven by a signal.", '.lpf(1200)', "https://strudel.cc/learn/effects/"),
  strudelApi("room", "room(value)", "Add reverberation to a sound pattern.", '.room(0.35)', "https://strudel.cc/workshop/first-effects/"),
  strudelApi("pan", "pan(value)", "Position a sound in the stereo field.", '.pan("0 1")', "https://strudel.cc/workshop/first-effects/"),
  strudelApi("rev", "rev()", "Reverse the order of events in a pattern.", '.rev()', "https://strudel.cc/workshop/recap/"),
  strudelApi("range", "range(min, max)", "Map a signal to a numeric range.", 'sine.range(200, 2000)', "https://strudel.cc/workshop/first-effects/"),
]);

const isIdentifierCharacter = character => /[A-Za-z0-9_$]/.test(character || "");

const identifierAt = (source, position) => {
  const text = String(source || "");
  const cursor = Math.max(0, Math.min(text.length, Number(position) || 0));
  const character = text[cursor] || "";
  const previous = text[cursor - 1] || "";
  if (!isIdentifierCharacter(character) && !isIdentifierCharacter(previous)) return null;
  let from = cursor;
  let to = cursor;
  while (from > 0 && isIdentifierCharacter(text[from - 1])) from -= 1;
  while (to < text.length && isIdentifierCharacter(text[to])) to += 1;
  if (from === to) return null;
  return { from, to, name: text.slice(from, to) };
};

export const getStrudelHover = (source, position, selectionEnd) => {
  const bridge = getUnderscoresHover(source, position, selectionEnd);
  if (bridge) return bridge;
  const token = identifierAt(source, position);
  const entry = STRUDEL_API.find(candidate => candidate.name === token?.name);
  if (!entry) return null;
  return { from: token.from, to: token.to, ...entry };
};

export const getStrudelReference = () => STRUDEL_API;

export const getStrudelBridgeCompletions = () => getUnderscoresCompletions();
