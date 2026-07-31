import test from "node:test";
import assert from "node:assert/strict";
import { DRAWERATOR_PANELS, getDraweratorPanel, getNaturalPanelPlacement, matchesDraweratorPanel } from "./panelRegistry.js";

test("every Drawerator panel has a unique slash command", () => {
  const slashes = DRAWERATOR_PANELS.map(panel => panel.slash);
  assert.equal(new Set(slashes).size, slashes.length);
  assert.ok(slashes.every(slash => slash.startsWith("/")));
});

test("dock registry keeps the requested primary right and bottom tab order", () => {
  const rightDockOrder = DRAWERATOR_PANELS
    .filter(panel => panel.placements.includes("right"))
    .map(panel => panel.id);
  assert.deepEqual(rightDockOrder, [
    "grid", "outliner", "properties", "iannix", "mods", "synth", "media-input", "holistic", "mapping", "script", "chat", "history", "console", "settings", "mixer", "info",
  ]);
  assert.deepEqual(DRAWERATOR_PANELS
    .filter(panel => panel.naturalPlacement === "bottom")
    .map(panel => panel.id), ["transport", "mixer", "info"]);
});

test("panel lookup and slash matching share one registry", () => {
  assert.equal(getDraweratorPanel("mods")?.sidebarName, "modifiers-sidebar");
  assert.equal(matchesDraweratorPanel(getDraweratorPanel("transport"), "/trans"), true);
  assert.equal(getDraweratorPanel("transport")?.label, "Timeline");
  assert.deepEqual(getDraweratorPanel("grid")?.placements, ["left", "floating", "right"]);
  assert.equal(getDraweratorPanel("synth")?.label, "Synth");
  assert.equal(getDraweratorPanel("media-input")?.label, "Media Input");
  assert.equal(getDraweratorPanel("holistic")?.label, "MediaPipe Holistic");
  assert.equal(getDraweratorPanel("mapping")?.slash, "/mapping");
  assert.equal(getDraweratorPanel("script")?.slash, "/script");
  assert.equal(getDraweratorPanel("info")?.slash, "/info");
  assert.deepEqual(getDraweratorPanel("info")?.placements, ["left", "floating", "right", "bottom"]);
  assert.equal(matchesDraweratorPanel(getDraweratorPanel("settings"), "midi"), false);
});

test("natural panel placement sends horizontal panels bottom and vertical panels right", () => {
  assert.equal(getNaturalPanelPlacement(getDraweratorPanel("script")), "right");
  assert.equal(getNaturalPanelPlacement(getDraweratorPanel("info")), "bottom");
  assert.equal(getNaturalPanelPlacement(getDraweratorPanel("mixer")), "bottom");
  assert.equal(getNaturalPanelPlacement(getDraweratorPanel("transport")), "bottom");
});
