export const DRAWERATOR_PANELS = Object.freeze([
  Object.freeze({ id: "chat", label: "AI Assistant", slash: "/chat", kind: "dockable", sidebarName: "ai-sidebar", placements: ["left", "floating", "right"] }),
  Object.freeze({ id: "mods", label: "Mods & FX", slash: "/mods", kind: "dockable", sidebarName: "modifiers-sidebar", placements: ["left", "floating", "right"] }),
  Object.freeze({ id: "script", label: "Script", slash: "/script", kind: "dockable", placements: ["left", "floating", "right"] }),
  Object.freeze({ id: "iannix", label: "IanniX", slash: "/iannix", kind: "dockable", placements: ["left", "floating", "right"] }),
  Object.freeze({ id: "mixer", label: "Mixer", slash: "/mixer", kind: "dockable", placements: ["left", "floating", "right", "bottom"], naturalPlacement: "bottom", dockedHeight: 286 }),
  Object.freeze({ id: "synth", label: "Synth", slash: "/synth", kind: "dockable", placements: ["left", "floating", "right"] }),
  Object.freeze({ id: "info", label: "Info", slash: "/info", kind: "dockable", placements: ["left", "floating", "right", "bottom"], naturalPlacement: "bottom", dockedHeight: 240 }),
  Object.freeze({ id: "settings", label: "Settings", slash: "/settings", kind: "dockable", sidebarName: "settings-sidebar", placements: ["left", "floating", "right"] }),
  Object.freeze({ id: "console", label: "Console", slash: "/console", kind: "dockable", placements: ["left", "floating", "right"] }),
  Object.freeze({ id: "history", label: "History", slash: "/history", kind: "dockable", placements: ["left", "floating", "right"] }),
  Object.freeze({ id: "properties", label: "Properties", slash: "/properties", kind: "dockable", placements: ["left", "floating", "right"] }),
  Object.freeze({ id: "outliner", label: "Outliner", slash: "/outliner", kind: "dockable", placements: ["left", "floating", "right"] }),
  Object.freeze({ id: "transport", label: "Timeline", slash: "/transport", kind: "dockable", placements: ["floating", "bottom"], naturalPlacement: "bottom", dockedHeight: 114 }),
  Object.freeze({ id: "grid", label: "Grid", slash: "/grid", kind: "dockable", placements: ["left", "floating", "right"] }),
]);

export const getDraweratorPanel = id => DRAWERATOR_PANELS.find(panel => panel.id === id) || null;

export const getNaturalPanelPlacement = panel => {
  const placements = Array.isArray(panel?.placements) ? panel.placements : [];
  if (panel?.naturalPlacement && placements.includes(panel.naturalPlacement)) return panel.naturalPlacement;
  if (placements.includes("right")) return "right";
  if (placements.includes("bottom")) return "bottom";
  return placements[0] || "right";
};

export const matchesDraweratorPanel = (panel, query) => {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return true;
  return panel.label.toLowerCase().includes(normalized) ||
    panel.slash.toLowerCase().includes(normalized) ||
    `panel ${panel.label}`.toLowerCase().includes(normalized);
};
