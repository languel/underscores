import test from "node:test";
import assert from "node:assert/strict";
import { UNDERSCORE_PANELS, getUnderscorePanel, getNaturalPanelPlacement, matchesUnderscorePanel } from "./panelRegistry.js";

test("every Underscore panel has a unique slash command", () => {
  const slashes = UNDERSCORE_PANELS.map(panel => panel.slash);
  assert.equal(new Set(slashes).size, slashes.length);
  assert.ok(slashes.every(slash => slash.startsWith("/")));
});

test("dock registry keeps the requested primary right and bottom tab order", () => {
  const rightDockOrder = UNDERSCORE_PANELS
    .filter(panel => panel.placements.includes("right"))
    .map(panel => panel.id);
  assert.deepEqual(rightDockOrder, [
    "grid", "outliner", "properties", "iannix", "physics", "mods", "synth", "media-input", "inputs", "holistic", "mapping", "script", "chat", "history", "settings", "mixer", "info", "console",
  ]);
  assert.deepEqual(UNDERSCORE_PANELS
    .filter(panel => panel.naturalPlacement === "bottom")
    .map(panel => panel.id), ["transport", "mixer", "info", "console"]);
});

test("panel lookup and slash matching share one registry", () => {
  assert.equal(getUnderscorePanel("mods")?.sidebarName, "modifiers-sidebar");
  assert.equal(matchesUnderscorePanel(getUnderscorePanel("transport"), "/trans"), true);
  assert.equal(getUnderscorePanel("transport")?.label, "Timeline");
  assert.deepEqual(getUnderscorePanel("grid")?.placements, ["left", "floating", "right"]);
  assert.equal(getUnderscorePanel("synth")?.label, "Synth");
  assert.equal(getUnderscorePanel("media-input")?.label, "Media");
  assert.equal(getUnderscorePanel("inputs")?.label, "Inputs");
  assert.equal(getUnderscorePanel("mods")?.label, "Brush");
  assert.equal(matchesUnderscorePanel(getUnderscorePanel("mods"), "/mods"), true);
  assert.equal(matchesUnderscorePanel(getUnderscorePanel("media-input"), "/media-input"), true);
  assert.equal(matchesUnderscorePanel(getUnderscorePanel("inputs"), "/signals"), true);
  assert.equal(getUnderscorePanel("holistic")?.label, "MediaPipe Holistic");
  assert.equal(getUnderscorePanel("mapping")?.slash, "/mapping");
  assert.equal(matchesUnderscorePanel(getUnderscorePanel("physics"), "/relations"), true);
  assert.equal(getUnderscorePanel("script")?.slash, "/script");
  assert.equal(getUnderscorePanel("info")?.slash, "/info");
  assert.deepEqual(getUnderscorePanel("info")?.placements, ["left", "floating", "right", "bottom"]);
  assert.equal(matchesUnderscorePanel(getUnderscorePanel("settings"), "midi"), false);
});

test("natural panel placement sends horizontal panels bottom and vertical panels right", () => {
  assert.equal(getNaturalPanelPlacement(getUnderscorePanel("script")), "right");
  assert.equal(getNaturalPanelPlacement(getUnderscorePanel("info")), "bottom");
  assert.equal(getNaturalPanelPlacement(getUnderscorePanel("mixer")), "bottom");
  assert.equal(getNaturalPanelPlacement(getUnderscorePanel("transport")), "bottom");
  assert.equal(getNaturalPanelPlacement(getUnderscorePanel("console")), "bottom");
});
