import test from "node:test";
import assert from "node:assert/strict";
import { UNDERSCORES_PANELS, getUnderscoresPanel, getNaturalPanelPlacement, matchesUnderscoresPanel } from "./panelRegistry.js";

test("every Underscores panel has a unique slash command", () => {
  const slashes = UNDERSCORES_PANELS.map(panel => panel.slash);
  assert.equal(new Set(slashes).size, slashes.length);
  assert.ok(slashes.every(slash => slash.startsWith("/")));
});

test("dock registry keeps the requested primary right and bottom tab order", () => {
  const rightDockOrder = UNDERSCORES_PANELS
    .filter(panel => panel.placements.includes("right"))
    .map(panel => panel.id);
  assert.deepEqual(rightDockOrder, [
    "outliner", "playlist", "properties", "iannix", "script", "grid", "physics", "mods", "synth", "media-input", "inputs", "holistic", "mapping", "collaboration", "chat", "history", "settings", "mixer", "info", "console",
  ]);
  assert.deepEqual(UNDERSCORES_PANELS
    .filter(panel => panel.naturalPlacement === "bottom")
    .map(panel => panel.id), ["transport", "mixer", "info", "console"]);
});

test("panel lookup and slash matching share one registry", () => {
  assert.equal(getUnderscoresPanel("mods")?.sidebarName, "modifiers-sidebar");
  assert.equal(matchesUnderscoresPanel(getUnderscoresPanel("transport"), "/trans"), true);
  assert.equal(getUnderscoresPanel("transport")?.label, "Timeline");
  assert.deepEqual(getUnderscoresPanel("grid")?.placements, ["left", "floating", "right"]);
  assert.equal(getUnderscoresPanel("synth")?.label, "Synth");
  assert.equal(getUnderscoresPanel("media-input")?.label, "Media");
  assert.equal(getUnderscoresPanel("inputs")?.label, "Inputs");
  assert.equal(getUnderscoresPanel("mods")?.label, "Brush");
  assert.equal(matchesUnderscoresPanel(getUnderscoresPanel("mods"), "/mods"), true);
  assert.equal(matchesUnderscoresPanel(getUnderscoresPanel("media-input"), "/media-input"), true);
  assert.equal(matchesUnderscoresPanel(getUnderscoresPanel("inputs"), "/signals"), true);
  assert.equal(getUnderscoresPanel("holistic")?.label, "MediaPipe Holistic");
  assert.equal(getUnderscoresPanel("mapping")?.slash, "/mapping");
  assert.equal(getUnderscoresPanel("collaboration")?.label, "Multiplayer");
  assert.equal(matchesUnderscoresPanel(getUnderscoresPanel("collaboration"), "/collaboration"), true);
  assert.equal(getNaturalPanelPlacement(getUnderscoresPanel("collaboration")), "right");
  assert.equal(matchesUnderscoresPanel(getUnderscoresPanel("physics"), "/relations"), true);
  assert.equal(getUnderscoresPanel("script")?.slash, "/script");
  assert.equal(getUnderscoresPanel("info")?.slash, "/info");
  assert.deepEqual(getUnderscoresPanel("info")?.placements, ["left", "floating", "right", "bottom"]);
  assert.equal(matchesUnderscoresPanel(getUnderscoresPanel("settings"), "midi"), false);
});

test("natural panel placement sends horizontal panels bottom and vertical panels right", () => {
  assert.equal(getNaturalPanelPlacement(getUnderscoresPanel("script")), "right");
  assert.equal(getNaturalPanelPlacement(getUnderscoresPanel("info")), "bottom");
  assert.equal(getNaturalPanelPlacement(getUnderscoresPanel("mixer")), "bottom");
  assert.equal(getNaturalPanelPlacement(getUnderscoresPanel("transport")), "bottom");
  assert.equal(getNaturalPanelPlacement(getUnderscoresPanel("console")), "bottom");
});
