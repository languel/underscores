import React from "react";

// Keep the playback cursor's symbols visually aligned with Excalidraw's
// toolbar icons. These are the same compact Tabler-style paths used by the
// matching Excalidraw tools, rendered locally so playback does not depend on
// private library exports or a second DOM lookup.
const ICON_PROPS = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export default function SessionVirtualCursorIcon({ tool = "selection" }) {
  const normalizedTool = String(tool || "selection").toLowerCase();

  if (normalizedTool === "selection") {
    return <path className="underscores-session-virtual-cursor-arrow" d="M2 2v25l7-7 5 12 5-2-5-12h10L2 2z" />;
  }

  const shape = (() => {
    switch (normalizedTool) {
      case "rectangle":
      case "frame":
        return <rect x="4" y="4" width="16" height="16" rx="2" />;
      case "diamond":
        return <path d="m10.5 20.4-6.9-6.9c-.781-.781-.781-2.219 0-3l6.9-6.9c.781-.781 2.219-.781 3 0l6.9 6.9c.781.781.781 2.219 0 3l-6.9 6.9c-.781.781-2.219.781-3 0Z" />;
      case "ellipse":
        return <circle cx="12" cy="12" r="9" />;
      case "arrow":
        return <g>
          <line x1="5" y1="12" x2="19" y2="12" />
          <line x1="15" y1="16" x2="19" y2="12" />
          <line x1="15" y1="8" x2="19" y2="12" />
        </g>;
      case "line":
        return <path d="M4.167 10h11.666" strokeWidth="1.5" />;
      case "freedraw":
      case "pencil":
        return <g strokeWidth="1.25">
          <path clipRule="evenodd" d="m7.643 15.69 7.774-7.773a2.357 2.357 0 1 0-3.334-3.334L4.31 12.357a3.333 3.333 0 0 0-.977 2.357v1.953h1.953c.884 0 1.732-.352 2.357-.977Z" />
          <path d="m11.25 5.417 3.333 3.333" />
        </g>;
      case "text":
        return <g>
          <line x1="4" y1="20" x2="7" y2="20" />
          <line x1="14" y1="20" x2="21" y2="20" />
          <line x1="6.9" y1="15" x2="13.8" y2="15" />
          <line x1="10.2" y1="6.3" x2="16" y2="20" />
          <polyline points="5 20 11 4 13 4 20 20" />
        </g>;
      case "image":
        return <g strokeWidth="1.25">
          <path d="M12.5 6.667h.01" />
          <path d="M4.91 2.625h10.18a2.284 2.284 0 0 1 2.285 2.284v10.182a2.284 2.284 0 0 1-2.284 2.284H4.909a2.284 2.284 0 0 1-2.284-2.284V4.909a2.284 2.284 0 0 1 2.284-2.284Z" />
          <path d="m3.333 12.5 3.334-3.333c.773-.745 1.726-.745 2.5 0l4.166 4.166" />
          <path d="m11.667 11.667.833-.834c.774-.744 1.726-.744 2.5 0l1.667 1.667" />
        </g>;
      case "eraser":
        return <g>
          <path d="M19 20H8.5l-4.21-4.3a1 1 0 0 1 0-1.41l10-10a1 1 0 0 1 1.41 0l5 5a1 1 0 0 1 0 1.41l-9.2 9.3" />
          <path d="m18 13.3-6.3-6.3" />
        </g>;
      case "hand":
        return <g strokeWidth="1.25">
          <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12" />
          <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0V12" />
          <path d="M14 5.5a1.5 1.5 0 0 1 3 0V12" />
          <path d="M17 7.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2h.208a6 6 0 0 1-5.012-2.7l-.196-.3c-.312-.479-1.407-2.388-3.286-5.728a1.5 1.5 0 0 1 .536-2.022 1.867 1.867 0 0 1 2.28.28l1.47 1.47" />
        </g>;
      case "laser":
        // Underscores intentionally replaces Excalidraw's novelty laser
        // glyph with a quiet target dot. Keep that same visual language in
        // playback rather than reintroducing the stock pencil/rays icon.
        return <g className="underscores-session-virtual-cursor-laser" strokeWidth="1.35">
          <circle cx="10" cy="10" r="7" />
          <circle cx="10" cy="10" r="2.25" fill="currentColor" stroke="none" />
        </g>;
      case "embeddable":
        return <g strokeWidth="1.25">
          <polyline points="12 16 18 10 12 4" />
          <polyline points="8 4 2 10 8 16" />
        </g>;
      default:
        // Underscores-specific tools (physics, brush, and future tools) do
        // not have an Excalidraw equivalent yet. Retain the familiar pointer
        // until a tool-specific playback symbol is intentionally designed.
        return <path className="underscores-session-virtual-cursor-arrow" d="M2 2v25l7-7 5 12 5-2-5-12h10L2 2z" />;
    }
  })();

  return <g className="underscores-session-virtual-cursor-tool" transform="translate(2 2) scale(1.05)" {...ICON_PROPS}>{shape}</g>;
}

// Reuse the same tool paths in compact UI surfaces such as Screencast input.
// Keeping one source for these symbols prevents the overlay from drifting back
// to text glyphs when the canvas toolbar or playback cursor is updated.
export function CanvasToolIcon({ tool = "selection", className = "" }) {
  return <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <SessionVirtualCursorIcon tool={tool} />
  </svg>;
}
