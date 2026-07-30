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
  script: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 84, y: 112, width: 440, height: 760 }),
  iannix: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 96, y: 120, width: 380, height: 760 }),
  mixer: Object.freeze({ placement: PANEL_PLACEMENTS.BOTTOM, x: 72, y: 120, width: 1040, height: 286 }),
  synth: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 120, y: 136, width: 360, height: 720 }),
  "video-input": Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 132, y: 144, width: 360, height: 680 }),
  "media-input": Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 144, y: 152, width: 380, height: 700 }),
  holistic: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 156, y: 160, width: 380, height: 720 }),
  info: Object.freeze({ placement: PANEL_PLACEMENTS.BOTTOM, x: 32, y: 520, width: 720, height: 240 }),
  console: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 96, y: 120, width: 340, height: 420 }),
  history: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 120, y: 136, width: 420, height: 720 }),
  properties: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 144, y: 152, width: 380, height: 720 }),
  outliner: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 168, y: 168, width: 340, height: 560 }),
  transport: Object.freeze({ placement: PANEL_PLACEMENTS.BOTTOM, x: 32, y: 32, width: 960, height: 114 }),
  grid: Object.freeze({ placement: PANEL_PLACEMENTS.RIGHT, x: 48, y: 88, width: 360, height: 720 }),
});

export const DEFAULT_DOCK_SIZES = Object.freeze({
  left: 380,
  right: 380,
  bottom: 286,
});

const clampDockSize = (value, fallback, minimum, maximum) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : fallback;
};

export const normalizeDockSizes = value => {
  const source = value && typeof value === "object" ? value : {};
  return {
    left: clampDockSize(source.left, DEFAULT_DOCK_SIZES.left, 280, 800),
    right: clampDockSize(source.right, DEFAULT_DOCK_SIZES.right, 280, 800),
    bottom: clampDockSize(source.bottom, DEFAULT_DOCK_SIZES.bottom, 112, 1200),
  };
};

const SIDEBAR_PLACEMENTS = new Set([
  PANEL_PLACEMENTS.LEFT,
  PANEL_PLACEMENTS.RIGHT,
  PANEL_PLACEMENTS.FLOATING,
]);

export const normalizePanelLayouts = value => {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_PANEL_LAYOUTS).map(([id, fallback]) => {
    const candidate = source[id] && typeof source[id] === "object" ? source[id] : {};
    const legacyHorizontalGrid = id === "grid" && (
      candidate.placement === PANEL_PLACEMENTS.BOTTOM ||
      (Number.isFinite(candidate.height) && candidate.height < 320) ||
      (Number.isFinite(candidate.width) && candidate.width > 640)
    );
    const allowed = id === "transport"
      ? new Set([PANEL_PLACEMENTS.BOTTOM, PANEL_PLACEMENTS.FLOATING])
      : id === "mixer" || id === "info"
        ? new Set([...SIDEBAR_PLACEMENTS, PANEL_PLACEMENTS.BOTTOM])
        : SIDEBAR_PLACEMENTS;
    return [id, {
      placement: !legacyHorizontalGrid && allowed.has(candidate.placement) ? candidate.placement : fallback.placement,
      x: Number.isFinite(candidate.x) ? candidate.x : fallback.x,
      y: Number.isFinite(candidate.y) ? candidate.y : fallback.y,
      width: !legacyHorizontalGrid && Number.isFinite(candidate.width) ? candidate.width : fallback.width,
      height: !legacyHorizontalGrid && Number.isFinite(candidate.height) ? candidate.height : fallback.height,
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
