import test from "node:test";
import assert from "node:assert/strict";
import { DRAWERATOR_PANELS, getDraweratorPanel, matchesDraweratorPanel } from "./panelRegistry.js";

test("every Drawerator panel has a unique slash command", () => {
  const slashes = DRAWERATOR_PANELS.map(panel => panel.slash);
  assert.equal(new Set(slashes).size, slashes.length);
  assert.ok(slashes.every(slash => slash.startsWith("/")));
});

test("panel lookup and slash matching share one registry", () => {
  assert.equal(getDraweratorPanel("mods")?.sidebarName, "modifiers-sidebar");
  assert.equal(matchesDraweratorPanel(getDraweratorPanel("transport"), "/trans"), true);
  assert.equal(getDraweratorPanel("transport")?.label, "Timeline");
  assert.deepEqual(getDraweratorPanel("grid")?.placements, ["left", "floating", "right"]);
  assert.equal(getDraweratorPanel("synth")?.label, "Synth");
  assert.equal(matchesDraweratorPanel(getDraweratorPanel("settings"), "midi"), false);
});
