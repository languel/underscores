import test from "node:test";
import assert from "node:assert/strict";
import { getDockTarget, getOpenPanelsForPlacement, normalizePanelLayouts, PANEL_PLACEMENTS, resolveActiveDockPanel } from "./panelLayout.js";

test("normalizes panel layout storage independently per panel", () => {
  const layouts = normalizePanelLayouts({
    mods: { placement: "left", x: 100, y: 80 },
    transport: { placement: "right", x: 4, y: 5 },
  });
  assert.deepEqual(layouts.mods, { placement: PANEL_PLACEMENTS.LEFT, x: 100, y: 80, width: 380, height: 760 });
  assert.equal(layouts.transport.placement, PANEL_PLACEMENTS.BOTTOM);
});

test("detects sidebar and transport drop zones", () => {
  assert.equal(getDockTarget(12, 300, 1200, 800), PANEL_PLACEMENTS.LEFT);
  assert.equal(getDockTarget(1190, 300, 1200, 800), PANEL_PLACEMENTS.RIGHT);
  assert.equal(getDockTarget(600, 790, 1200, 800, { allowBottom: true, transport: true }), PANEL_PLACEMENTS.BOTTOM);
  assert.equal(getDockTarget(600, 300, 1200, 800), PANEL_PLACEMENTS.FLOATING);
});

test("groups only open panels sharing the requested dock", () => {
  const panels = [{ id: "chat" }, { id: "mods" }, { id: "settings" }];
  const layouts = {
    chat: { placement: PANEL_PLACEMENTS.RIGHT },
    mods: { placement: PANEL_PLACEMENTS.RIGHT },
    settings: { placement: PANEL_PLACEMENTS.FLOATING },
  };
  assert.deepEqual(
    getOpenPanelsForPlacement(panels, { chat: true, mods: true, settings: true }, layouts, PANEL_PLACEMENTS.RIGHT),
    [{ id: "chat" }, { id: "mods" }],
  );
});

test("resolves the requested dock tab and falls back when it closes", () => {
  const tabs = [{ id: "chat" }, { id: "mods" }];
  assert.equal(resolveActiveDockPanel(tabs, "mods"), "mods");
  assert.equal(resolveActiveDockPanel(tabs, "settings"), "chat");
  assert.equal(resolveActiveDockPanel([], "mods"), null);
});
