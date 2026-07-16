export const PANEL_PLACEMENTS = Object.freeze({
  LEFT: "left",
  RIGHT: "right",
  FLOATING: "floating",
  BOTTOM: "bottom",
});

export const DEFAULT_PANEL_LAYOUTS = Object.freeze({
  chat: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 24, y: 72, width: 380, height: 760 }),
  settings: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 48, y: 88, width: 380, height: 760 }),
  mods: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 72, y: 104, width: 380, height: 760 }),
  console: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 96, y: 120, width: 340, height: 420 }),
  history: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 120, y: 136, width: 420, height: 720 }),
  transport: Object.freeze({ placement: PANEL_PLACEMENTS.BOTTOM, x: 32, y: 32, width: 960, height: 114 }),
});

const SIDEBAR_PLACEMENTS = new Set([
  PANEL_PLACEMENTS.LEFT,
  PANEL_PLACEMENTS.RIGHT,
  PANEL_PLACEMENTS.FLOATING,
]);

export const normalizePanelLayouts = value => {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_PANEL_LAYOUTS).map(([id, fallback]) => {
    const candidate = source[id] && typeof source[id] === "object" ? source[id] : {};
    const allowed = id === "transport"
      ? new Set([PANEL_PLACEMENTS.BOTTOM, PANEL_PLACEMENTS.FLOATING])
      : SIDEBAR_PLACEMENTS;
    return [id, {
      placement: allowed.has(candidate.placement) ? candidate.placement : fallback.placement,
      x: Number.isFinite(candidate.x) ? candidate.x : fallback.x,
      y: Number.isFinite(candidate.y) ? candidate.y : fallback.y,
      width: Number.isFinite(candidate.width) ? candidate.width : fallback.width,
      height: Number.isFinite(candidate.height) ? candidate.height : fallback.height,
    }];
  }));
};

export const getDockTarget = (clientX, clientY, viewportWidth, viewportHeight, options = {}) => {
  const edge = options.edge ?? 72;
  if (options.allowBottom && clientY >= viewportHeight - edge) return PANEL_PLACEMENTS.BOTTOM;
  if (!options.transport && clientX <= edge) return PANEL_PLACEMENTS.LEFT;
  if (!options.transport && clientX >= viewportWidth - edge) return PANEL_PLACEMENTS.RIGHT;
  return PANEL_PLACEMENTS.FLOATING;
};

export const getOpenPanelsForPlacement = (panels, openPanels, layouts, placement) =>
  panels.filter(panel => Boolean(openPanels?.[panel.id]) && layouts?.[panel.id]?.placement === placement);

export const resolveActiveDockPanel = (tabs, requestedPanelId) =>
  tabs.some(panel => panel.id === requestedPanelId) ? requestedPanelId : tabs[0]?.id || null;
