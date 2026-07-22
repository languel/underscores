// Force rebuild timestamp: 2026-07-06T11:15:00
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Excalidraw, MainMenu, exportToSvg, exportToCanvas, loadFromBlob, serializeAsJSON, viewportCoordsToSceneCoords, sceneCoordsToViewportCoords } from "@excalidraw/excalidraw/dist/excalidraw.production.min.js";
import "./App.css";
import { composePreviewTracks, composeRuntimeCursorTracks, inferAxisFlipSign, isDrawableTrack, mapTrackPointToElement, removeModifierAt, replaceModifierBrushAt, resampleStrokeByDistance, resolveBakedTracks, resolveBrushId, resolveDrawingModifiers, resolveHideOriginalControl } from "./modifierStack.js";
import { advanceScoreCollisionState, allocateIannixRoleLabels, dampCursorTransform, enforceRuntimeCursorHostVisibility, evaluateScoreFrame, getElementCenter, getElementCorePaths, getObjectTimeState, isRuntimeCursor, normalizeIannixData, reconcileRuntimeCursorHosts, snapCursorHostToCurveStart, transformPaths } from "./iannixEngine.js";
import { createIannixMidiVoiceTracker, describeIannixMidiMessage, getIannixMidiTemplatePattern, getIannixTriggerMidiContext, IANNIX_MIDI_TEMPLATES, parseIannixMidiPattern, selectIannixTriggerCursor } from "./iannixMidi.js";
import { expandIndexedLabelTemplate } from "./iannixBulkEdit.js";
import NumberInputController from "./NumberInputController.jsx";
import InspectorSection from "./InspectorSection.jsx";
import { attachDraweratorExchangeMetadata, getSelectionExchangeElements, parseDraweratorExchange, remapSelectionForImport } from "./sceneExchange.js";
import { DRAWERATOR_PANELS } from "./panelRegistry.js";
import { getDockTarget, getOpenPanelsForPlacement, normalizePanelLayouts, PANEL_PLACEMENTS, resolveActiveDockPanel } from "./panelLayout.js";
import { advanceMidiClockReceiver, createMidiClockReceiverState, formatTimelinePosition, MIDI_REALTIME, midiClockIntervalMs, normalizeTimeSignature, parseTimelinePosition, secondsToFrame, songPositionToSeconds } from "./transport.js";
import DraweratorPanel from "./DraweratorPanel.jsx";
import TransportTimeline from "./TransportTimeline.jsx";
import HistoryPanel from "./HistoryPanel.jsx";
import EventConsole from "./EventConsole.jsx";
import PropertiesPanel from "./PropertiesPanel.jsx";
import OutlinerPanel from "./OutlinerPanel.jsx";
import IannixDataPanel from "./IannixDataPanel.jsx";
import { DraweratorCommandRegistry, DraweratorEventBus, DraweratorInputBus, parseGenericCommandSlash } from "./commandSystem.js";
import { autoKeyElement, collectAutomationKeys, evaluateElementAutomation } from "./automation.js";
import { createDraweratorMacro, DRAWERATOR_MACRO_TYPE, DraweratorLibraryStore, DraweratorSessionController, instantiateDraweratorMacro, mergeSceneMutation, parseDraweratorSession } from "./sessionHistory.js";
import { buildIannixObjectModel, executeTrustedIannixScript, getIannixCursorCanvasLength, getIannixCursorDuration, getIannixCursorLoopMode, getIannixCurveStartAngle, serializeBezierElementToIannixCommands, tokenizeIannixCommand } from "./iannixScript.js";
import { bezierWorldPointToLocal, createBezierGeometryFromElement, createBezierHostGeometry, findNearestBezierLocation, getBezierWorldAnchors, getBezierWorldPath, hasCubicBezierGeometry, normalizeBezierGeometry, normalizeBezierHostElement, reframeBezierElement, removeBezierAnchor, setBezierAnchorMode, setElementBezierGeometry, splitBezierSegment, updateBezierAnchor } from "./bezierGeometry.js";
import { getScriptParameterValues, parseScriptParameters } from "./scriptParameters.js";
import { GM_PROGRAMS, isPercussionChannel, normalizeGmPrograms } from "./generalMidi.js";
import { createInternalMidiSynth, disposeInternalMidiSynth, isInternalMidiSynthSupported, resumeInternalMidiSynth } from "./internalMidiSynth.js";
import { playWebAudioTestTone } from "./audioDiagnostics.js";
import { INTERNAL_MIDI_SYNTH_ID, MIDI_PORT_ALL, MIDI_PORT_NONE, resolveExternalMidiOutputs, resolveMidiOutputRoute } from "./midiOutputRouting.js";
import GlobalGridCanvas from "./GlobalGridCanvas.jsx";
import GridPanel from "./GridPanel.jsx";
import ShortcutsPanel from "./ShortcutsPanel.jsx";
import { quantizeGridElement, sharedGridSnapDelta, translateGridElement } from "./gridElementQuantization.js";
import { DEFAULT_SHORTCUTS, findShortcutAction, normalizeShortcutBindings, SHORTCUT_STORAGE_KEY } from "./shortcutSystem.js";
import { getStrokeWidthShortcut, stepStrokeWidth } from "./strokeWidthShortcuts.js";
import { DEFAULT_SELECTION_FILTER, filterSelectedElementIds, normalizeSelectionFilter, selectionFilterAllowsElement, selectionMapsEqual, SELECTION_FILTER_STORAGE_KEY, toggleSelectionFilter } from "./selectionFilter.js";
import {
  DEFAULT_GLOBAL_GRID,
  GRID_STORAGE_KEY,
  gridUnitsToSeconds,
  mergeGridPatch,
  normalizeGlobalGrid,
  secondsToGridUnits,
  snapPointToGrid,
} from "./gridSystem.js";

// System Prompt guiding the local LLM on drawing tools
const SYSTEM_PROMPT = `You are "Drawerator", an autonomous, high-performance drawing assistant.
You drive a collaborative sketchboard (Excalidraw) programmatically by issuing precise XML tool tags inside your markdown responses.

CRITICAL: You MUST write your text explanation FIRST, then output any tool XML tags.

Available Drawing XML tags:
1. Draw Rectangle:
   <rect x="[coord]" y="[coord]" w="[width]" h="[height]" color="[hex_color]" fill="[hex_color/transparent]"/>
2. Draw Circle/Ellipse:
   <circle x="[center_x]" y="[center_y]" r="[radius]" color="[hex_color]" fill="[hex_color/transparent]"/>
3. Draw Straight Line:
   <line x1="[start_x]" y1="[start_y]" x2="[end_x]" y2="[end_y]" color="[hex_color]"/>
4. Draw Freehand Path:
   <path points="x1,y1 x2,y2 x3,y3 ..." color="[hex_color]"/>
5. Erase Element by ID:
   <erase id="[element_id]"/>
6. Clear Entire Canvas:
   <clear/>
7. Execute any registered Drawerator command:
   <drawerator-command id="[stable_command_id]">{"argument":"value"}</drawerator-command>

Guidelines:
- All shapes should be sized logically (typical screen coords range from 0 to 1000).
- If the user selected a shape or path, you will receive its coordinates in the context. Use this context to duplicate, resize, move, or offset the shape.
- To move a shape, you can erase the old id using <erase id="[id]"/> and redraw it at the new coordinates!
- Keep your conversational text responses extremely concise and to the point.
`;

const INITIAL_GREETING = "Hello! I am your drawing assistant powered by local AI. You can write prompts like \"draw a flow chart\", \"sketch a house\", or \"clear the canvas\" and I will execute the drawing tools programmatically!";

const resolveMidiInputs = (access, portId) => {
  if (!access || portId === MIDI_PORT_NONE) return [];
  if (portId === MIDI_PORT_ALL) return [...access.inputs.values()];
  const input = access.inputs.get(portId);
  return input ? [input] : [];
};

function createBaseElement(type, x, y, width, height, strokeColor = "#f8fafc") {
  return {
    id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor,
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: Math.floor(Math.random() * 1000000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 1000000),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false
  };
}

const isColorTransparent = (color) => {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  if (c === "transparent") return true;
  if (c.startsWith("#") && c.length === 9 && c.endsWith("00")) return true;
  if (c.startsWith("#") && c.length === 5 && c.endsWith("0")) return true;
  if (c.startsWith("rgba")) {
    const parts = c.split(",");
    if (parts.length === 4) {
      const alpha = parseFloat(parts[3].replace(")", ""));
      return alpha === 0;
    }
  }
  return false;
};

const makeColorTransparent = (color) => {
  if (!color) return "transparent";
  const c = color.trim();
  const cLower = c.toLowerCase();
  if (cLower.startsWith("#")) {
    if (c.length === 7) return c + "00";
    if (c.length === 4) {
      const r = c[1], g = c[2], b = c[3];
      return `#${r}${r}${g}${g}${b}${b}00`;
    }
  } else if (cLower.startsWith("rgb(")) {
    return cLower.replace("rgb(", "rgba(").replace(")", ", 0)");
  }
  return "transparent";
};

const makeColorOpaque = (color, fallback) => {
  if (!color) return fallback;
  const c = color.trim();
  const cLower = c.toLowerCase();
  if (cLower === "transparent") return fallback;
  if (cLower.startsWith("#")) {
    if (c.length === 9 && cLower.endsWith("00")) {
      return c.slice(0, 7);
    }
    if (c.length === 5 && cLower.endsWith("0")) {
      return c.slice(0, 4);
    }
  } else if (cLower.startsWith("rgba(")) {
    const parts = c.split(",");
    if (parts.length === 4) {
      return parts.slice(0, 3).join(",").replace(/rgba\(/i, "rgb(") + ")";
    }
  }
  return fallback;
};

const cleanApiUrl = (url, provider) => {
  if (!url) return "";
  let clean = url.trim().replace(/\/+$/, "");
  if (provider === "lmstudio" || provider === "openai") {
    if (clean.endsWith("/v1")) {
      clean = clean.slice(0, -3);
    }
  }
  return clean;
};

const colorWithOpacity = (hex, opacity) => {
  const value = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
  const channels = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
  return `rgba(${channels.join(", ")}, ${Math.min(100, Math.max(0, Number(opacity))) / 100})`;
};

const DEFAULT_ROLE_THEME = {
  enabled: false,
  curveActive: { color: "#333333", opacity: 100 },
  curveInactive: { color: "#888888", opacity: 35 },
  cursorActive: { color: "#ff3b0a", opacity: 100 },
  cursorInactive: { color: "#888888", opacity: 35 },
  triggerActive: { color: "#00b8e8", opacity: 100 },
  triggerInactive: { color: "#888888", opacity: 35 },
  triggerPulse: { color: "#ff8a3d", opacity: 85 },
};

const ScriptActionIcon = ({ type }) => {
  const paths = {
    run: <><path d="m9 6 9 6-9 6V6Z"/></>,
    save: <><path d="M5 4h12l2 2v14H5V4Z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5H5v11h3"/></>,
    add: <><path d="M12 5v14M5 12h14"/></>,
    remove: <><path d="M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13"/></>,
    import: <><path d="M4 19h16M12 4v10M8 10l4 4 4-4"/></>,
  };
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[type]}</svg>;
};

const PRESET_BRUSHES = {
  simple: {
    id: "simple",
    name: "Simple Line",
    code: `// @param strokeWidth = 2 (1..20, step: 0.5)
(points, globals) => {
  return [points];
}`
  },
  hairy: {
    id: "hairy",
    name: "Hairy Brush (Calligraphy)",
    code: `// @param hairLength = 20 (5..100, step: 1)
// @param spacing = 2 (1..10, step: 1)
// @param skipEnds = 0 (0..1, step: 1)
(points) => {
  const lines = [];
  // 1. Draw the primary line
  lines.push(points);
  
  // 2. Draw perpendicular hatching strokes along the path
  const stepVal = Math.max(1, Math.round(spacing));
  const skip = typeof skipEnds !== 'undefined' ? skipEnds > 0.5 : false;
  
  for (let i = 1; i < points.length; i += stepVal) {
    if (skip) {
      if (i === 1) continue;
      if (i + stepVal >= points.length) continue;
    }
    const p1 = points[i - 1];
    const p2 = points[i];
    if (!p1 || !p2) continue;
    const [x1, y1] = p1;
    const [x2, y2] = p2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const nx = -dy / len * hairLength;
      const ny = dx / len * hairLength;
      lines.push([[x2, y2], [x2 + nx, y2 + ny]]);
    }
  }
  return lines;
}`
  },
  growingHairy: {
    id: "growingHairy",
    name: "Growing Hairy Brush (Collision Stop)",
    code: `// @param maxHairLength = 80 (5..200, step: 1)
// @param growthRate = 45 (5..200, step: 1)
// @param spacing = 3 (1..12, step: 1)
// @param collisionPadding = 1 (0..8, step: 0.5)
// @param globalClock = 0 (0..1, step: 1)
(points, globals) => {
  const lines = [points];
  if (!points || points.length < 2) return lines;

  const elapsedMs = Math.max(0, globalClock > 0.5
    ? (globals.globalElapsedMs || 0)
    : (globals.elapsedMs || 0));
  const samples = globals.resampleStrokeByDistance(points, Math.max(0.1, spacing));
  const intersect = (a, b, c, d) => {
    const rX = b[0] - a[0];
    const rY = b[1] - a[1];
    const sX = d[0] - c[0];
    const sY = d[1] - c[1];
    const denominator = rX * sY - rY * sX;
    if (Math.abs(denominator) < 0.000001) return null;
    const qX = c[0] - a[0];
    const qY = c[1] - a[1];
    const t = (qX * sY - qY * sX) / denominator;
    const u = (qX * rY - qY * rX) / denominator;
    if (t > 0.001 && t <= 1 && u >= 0 && u <= 1) return t;
    return null;
  };

  for (let i = 1; i < samples.length; i++) {
    const origin = samples[i];
    const sourceSegmentIndex = Math.max(0, Math.min(
      points.length - 2,
      origin.sourceSegmentIndex || 0
    ));
    const previous = points[sourceSegmentIndex];
    const segmentEnd = points[sourceSegmentIndex + 1];
    if (!previous || !origin) continue;
    const dx = segmentEnd[0] - previous[0];
    const dy = segmentEnd[1] - previous[1];
    const tangentLength = Math.hypot(dx, dy);
    if (tangentLength < 0.0001) continue;

    const birthMs = origin.strokeTime || 0;
    const ageSeconds = Math.max(0, elapsedMs - birthMs) / 1000;
    const desiredLength = Math.min(maxHairLength, growthRate * ageSeconds);
    if (desiredLength <= 0.05) continue;

    const normalX = -dy / tangentLength;
    const normalY = dx / tangentLength;
    const target = [
      origin[0] + normalX * desiredLength,
      origin[1] + normalY * desiredLength
    ];
    let nearestT = 1;

    for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex++) {
      if (segmentIndex === sourceSegmentIndex) continue;
      const hitT = intersect(origin, target, points[segmentIndex], points[segmentIndex + 1]);
      if (hitT !== null && hitT < nearestT) nearestT = hitT;
    }
    const paddingT = desiredLength > 0 ? collisionPadding / desiredLength : 0;
    const clampedT = Math.max(0, nearestT - paddingT);
    const end = [
      origin[0] + (target[0] - origin[0]) * clampedT,
      origin[1] + (target[1] - origin[1]) * clampedT
    ];
    if (Math.hypot(end[0] - origin[0], end[1] - origin[1]) > 0.05) {
      const hair = [[origin[0], origin[1]], end];
      lines.push(hair);
    }
  }
  return lines;
}`
  },
  ribbon: {
    id: "ribbon",
    name: "Ribbon Brush (Double Track)",
    code: `// @param width = 12 (2..50, step: 0.5)
(points) => {
  const lines = [];
  const leftSide = [];
  const rightSide = [];
  
  // Calculate parallel offsets on both sides of the line
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      const nx = -dy / len * width;
      const ny = dx / len * width;
      leftSide.push([x2 + nx, y2 + ny]);
      rightSide.push([x2 - nx, y2 - ny]);
    }
  }
  lines.push(points);
  if (leftSide.length > 0) lines.push(leftSide);
  if (rightSide.length > 0) lines.push(rightSide);
  return lines;
}`
  },
  sketchy: {
    id: "sketchy",
    name: "Sketchy Multi-line",
    code: `// @param jitter = 3 (1..15, step: 0.5)
(points) => {
  const lines = [];
  // Overlay 3 parallel lines with random/offset coordinates
  lines.push(points);
  lines.push(points.map(([x, y]) => [x + jitter, y + jitter * 0.7]));
  lines.push(points.map(([x, y]) => [x - jitter * 0.7, y - jitter]));
  return lines;
}`
  },
  pressure: {
    id: "pressure",
    name: "Calligraphy Pencil (Pressure-Sensitive)",
    code: `// @param baseWidth = 3.5 (1..15, step: 0.1)
// @param speedSensitivity = 0.12 (0..0.5, step: 0.01)
// @param stabilizerDamping = 0.12 (0.01..0.5, step: 0.01)
(points, globals) => {
  if (points.length < 2) return [points];
  const lines = [];
  
  // Calculate distances between consecutive points to estimate drawing speed
  const dists = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i-1][0];
    const dy = points[i][1] - points[i-1][1];
    dists.push(Math.sqrt(dx * dx + dy * dy));
  }
  
  // Smooth the speed values using a moving average window
  const smoothDists = [];
  const windowSize = 3;
  for (let i = 0; i < points.length; i++) {
    let sum = 0;
    let count = 0;
    for (let w = -windowSize; w <= windowSize; w++) {
      const idx = i + w;
      if (idx >= 0 && idx < dists.length) {
        sum += dists[idx];
        count++;
      }
    }
    smoothDists.push(count > 0 ? sum / count : 8);
  }

  // Draw 3 offsets relative to the normal vectors that merge at high speed
  const centerTrack = [];
  const leftTrack = [];
  const rightTrack = [];

  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    centerTrack.push([x, y]);

    let nx = 0;
    let ny = 0;
    if (i < points.length - 1) {
      const dx = points[i+1][0] - x;
      const dy = points[i+1][1] - y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) { nx = -dy / len; ny = dx / len; }
    } else if (i > 0) {
      const dx = x - points[i-1][0];
      const dy = y - points[i-1][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) { nx = -dy / len; ny = dx / len; }
    }

    // Map drawing speed and pen pressure to normal offset:
    const speedVal = smoothDists[i];
    const pressureVal = points[i].pressure !== undefined ? points[i].pressure : 0.5;
    
    // Wider if moving slow, wider if pressing hard
    const offsetAmount = Math.max(0.1, (baseWidth * pressureVal * 2) - (speedVal * speedSensitivity));

    leftTrack.push([x + nx * offsetAmount, y + ny * offsetAmount]);
    rightTrack.push([x - nx * offsetAmount, y - ny * offsetAmount]);
  }

  lines.push(centerTrack);
  lines.push(leftTrack);
  lines.push(rightTrack);
  return lines;
}`
  },
  walking: {
    id: "walking",
    name: "Walking Brush (Time-Oscillated)",
    code: `// @param speed = 5 (1..20, step: 0.5)
// @param amplitude = 15 (2..50, step: 1)
// @param stabilizerDamping = 0.12 (0.01..0.5, step: 0.01)
(points) => {
  const lines = [];
  const waveTrack = [];
  
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    if (len > 0) {
      // Use point.strokeTime (time in ms since stroke start) to oscillate the wave!
      const timeMs = points[i].strokeTime || 0;
      const offset = Math.sin(timeMs * 0.001 * speed) * amplitude;
      
      const nx = -dy / len * offset;
      const ny = dx / len * offset;
      
      waveTrack.push([x2 + nx, y2 + ny]);
    }
  }
  
  lines.push(points);
  if (waveTrack.length > 0) lines.push(waveTrack);
  return lines;
}`
  },
  rake: {
    id: "rake",
    name: "Rake Brush (Variable Teeth)",
    code: `// @param teeth = 5 (2..12, step: 1)
// @param spacing = 4 (1..15, step: 0.5)
// @param speedSensitivity = 0.12 (0..0.5, step: 0.01)
// @param stabilizerDamping = 0.12 (0.01..0.5, step: 0.01)
(points, globals) => {
  if (points.length < 2) return [points];
  const lines = [];
  
  // Calculate distances between consecutive points to estimate drawing speed
  const dists = [];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i-1][0];
    const dy = points[i][1] - points[i-1][1];
    dists.push(Math.sqrt(dx * dx + dy * dy));
  }
  
  // Smooth the speed values using a moving average window
  const smoothDists = [];
  const windowSize = 3;
  for (let i = 0; i < points.length; i++) {
    let sum = 0;
    let count = 0;
    for (let w = -windowSize; w <= windowSize; w++) {
      const idx = i + w;
      if (idx >= 0 && idx < dists.length) {
        sum += dists[idx];
        count++;
      }
    }
    smoothDists.push(count > 0 ? sum / count : 8);
  }

  // Initialize tracks for each tooth
  const tracks = Array.from({ length: teeth }, () => []);

  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];

    let nx = 0;
    let ny = 0;
    if (i < points.length - 1) {
      const dx = points[i+1][0] - x;
      const dy = points[i+1][1] - y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) { nx = -dy / len; ny = dx / len; }
    } else if (i > 0) {
      const dx = x - points[i-1][0];
      const dy = y - points[i-1][1];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) { nx = -dy / len; ny = dx / len; }
    }

    // Map drawing speed and pen pressure to scale factor:
    const speedVal = smoothDists[i];
    const pressureVal = points[i].pressure !== undefined ? points[i].pressure : 0.5;
    
    // Teeth spread wider if pressing hard, narrow down if moving fast
    const scale = Math.max(0.1, (pressureVal * 2.0) - (speedVal * speedSensitivity));

    for (let t = 0; t < teeth; t++) {
      const offset = (t - (teeth - 1) / 2) * spacing * scale;
      tracks[t].push([x + nx * offset, y + ny * offset]);
    }
  }

  // Push all teeth tracks into the lines array
  for (let t = 0; t < teeth; t++) {
    if (tracks[t].length > 0) {
      lines.push(tracks[t]);
    }
  }
  return lines;
}`
  },
  zenRake: {
    id: "zenRake",
    name: "Zen Garden Rake (Parallel Grooves)",
    code: `// @param grooves = 5 (2..12, step: 1)
// @param spacing = 8 (2..20, step: 0.5)
// @param smoothing = 8 (0..24, step: 1)
// @param tangentWindow = 4 (1..12, step: 1)
// @param cornerSafety = 0.8 (0.45..0.95, step: 0.05)
(points, globals) => {
  if (!points || points.length < 2) return [points];

  // Smooth the gesture without the shrinkage of repeated averaging, then
  // sample by distance so normals are independent of pointer event density.
  const smoothPasses = Math.max(0, Math.round(smoothing));
  const smoothed = smoothPasses > 0
    ? globals.smoothPathTaubin(points, 0.45, -0.5, smoothPasses, false)
    : points;
  const sampleStep = Math.max(1.5, spacing * 0.3);
  const center = globals.resampleStrokeByDistance(smoothed, sampleStep)
    .map(point => [point[0], point[1]]);
  if (center.length < 2) return [center];

  // A windowed central tangent keeps neighboring groove normals aligned at
  // hand-drawn corners instead of letting each raw point choose a direction.
  const windowSize = Math.max(1, Math.round(tangentWindow));
  const normals = center.map((point, index) => {
    const before = center[Math.max(0, index - windowSize)];
    const after = center[Math.min(center.length - 1, index + windowSize)];
    let dx = after[0] - before[0];
    let dy = after[1] - before[1];
    let length = Math.hypot(dx, dy);
    if (length < 0.0001 && index > 0) {
      dx = point[0] - center[index - 1][0];
      dy = point[1] - center[index - 1][1];
      length = Math.hypot(dx, dy);
    }
    return length < 0.0001 ? [0, 0] : [-dy / length, dx / length];
  });

  // Perfect parallel offsets cannot exist when the requested half-width is
  // larger than an inside turn radius. Compress the complete groove bundle
  // together only at those impossible bends, preserving equal lane spacing.
  const halfWidth = Math.max(0.001, ((grooves - 1) * spacing) / 2);
  let widthScale = center.map((point, index) => {
    const before = center[Math.max(0, index - windowSize)];
    const after = center[Math.min(center.length - 1, index + windowSize)];
    const ab = Math.hypot(point[0] - before[0], point[1] - before[1]);
    const bc = Math.hypot(after[0] - point[0], after[1] - point[1]);
    const ac = Math.hypot(after[0] - before[0], after[1] - before[1]);
    const cross = Math.abs(
      (point[0] - before[0]) * (after[1] - before[1]) -
      (point[1] - before[1]) * (after[0] - before[0])
    );
    if (cross < 0.0001 || ab < 0.0001 || bc < 0.0001 || ac < 0.0001) return 1;
    const radius = (ab * bc * ac) / (2 * cross);
    return Math.max(0.12, Math.min(1, (radius * cornerSafety) / halfWidth));
  });

  // Feather width changes so the grooves converge like a designed track,
  // rather than pinching abruptly at a single sample.
  for (let pass = 0; pass < 4; pass++) {
    widthScale = widthScale.map((scale, index, values) => {
      const previous = values[Math.max(0, index - 1)];
      const next = values[Math.min(values.length - 1, index + 1)];
      return previous * 0.25 + scale * 0.5 + next * 0.25;
    });
  }

  const segmentIntersection = (a, b, c, d) => {
    const rX = b[0] - a[0];
    const rY = b[1] - a[1];
    const sX = d[0] - c[0];
    const sY = d[1] - c[1];
    const denominator = rX * sY - rY * sX;
    if (Math.abs(denominator) < 0.000001) return null;
    const qX = c[0] - a[0];
    const qY = c[1] - a[1];
    const t = (qX * sY - qY * sX) / denominator;
    const u = (qX * rY - qY * rX) / denominator;
    const epsilon = 0.001;
    if (t <= epsilon || t >= 1 - epsilon || u <= epsilon || u >= 1 - epsilon) return null;
    return [a[0] + rX * t, a[1] + rY * t];
  };

  // Remove the loop between the oldest and newest crossing of a single
  // groove. This is a final safety net for very tight scribbles.
  const eraseSelfLoops = (track) => {
    if (track.length < 4) return track;
    let result = [track[0]];
    for (let index = 1; index < track.length; index++) {
      const previous = result[result.length - 1];
      const current = track[index];
      let crossingIndex = -1;
      let crossingPoint = null;
      for (let segment = 0; segment < result.length - 2; segment++) {
        const hit = segmentIntersection(
          result[segment],
          result[segment + 1],
          previous,
          current
        );
        if (hit) {
          crossingIndex = segment;
          crossingPoint = hit;
          break;
        }
      }
      if (crossingIndex >= 0) {
        result = result.slice(0, crossingIndex + 1);
        result.push(crossingPoint);
      }
      result.push(current);
    }
    return result;
  };

  const tracks = [];
  for (let groove = 0; groove < grooves; groove++) {
    const laneOffset = (groove - (grooves - 1) / 2) * spacing;
    const track = center.map((point, index) => [
      point[0] + normals[index][0] * laneOffset * widthScale[index],
      point[1] + normals[index][1] * laneOffset * widthScale[index]
    ]);
    const cleaned = eraseSelfLoops(track);
    if (cleaned.length >= 2) tracks.push(cleaned);
  }
  return tracks;
}`
  },
  rdp: {
    id: "rdp",
    name: "Simplify (RDP)",
    code: `// @param epsilon = 3 (0.5..15, step: 0.1)
(points, globals) => {
  return [globals.simplifyRDP(points, epsilon)];
}`
  },
  vw: {
    id: "vw",
    name: "Simplify (VW)",
    code: `// @param minArea = 5 (0.5..50, step: 0.5)
(points, globals) => {
  return [globals.simplifyVW(points, minArea)];
}`
  },
  smooth: {
    id: "smooth",
    name: "Laplacian Smooth",
    code: `// @param iterations = 10 (1..40, step: 1)
// @param weight = 0.4 (0.1..0.9, step: 0.05)
(points, globals) => {
  return [globals.smoothPathLaplacian(points, weight, iterations)];
}`
  },
  taubin: {
    id: "taubin",
    name: "Taubin Smooth",
    code: `// @param iterations = 10 (1..40, step: 1)
// @param weight = 0.5 (0.1..0.9, step: 0.05)
(points, globals) => {
  return [globals.smoothPathTaubin(points, weight, -0.53, iterations, false)];
}`
  },
  resample: {
    id: "resample",
    name: "Resample Uniformly",
    code: `// @param targetCount = 100 (5..500, step: 5)
// @param usePercent = 0 (0..1, step: 1)
// @param percent = 100 (5..200, step: 5)
(points, globals) => {
  let count = targetCount;
  if (usePercent > 0.5) {
    count = Math.max(3, Math.round(points.length * (percent / 100)));
  }
  return [globals.resampleUniform(points, count)];
}`
  },
  joint: {
    id: "joint",
    name: "Close & Smooth Joint",
    code: `// @param smoothJoint = 1 (0..1, step: 1)
(points, globals) => {
  return [globals.closeAndSmoothJoint(points, "freedraw", smoothJoint > 0.5)];
}`
  },
  snap: {
    id: "snap",
    name: "Snap to Grid",
    code: `// @param size = 20 (5..100, step: 5)
(points, globals) => {
  return [points.map(p => {
    const sx = Math.round(p[0] / size) * size;
    const sy = Math.round(p[1] / size) * size;
    const copy = [sx, sy];
    if (p.pressure !== undefined) copy.pressure = p.pressure;
    if (p.time !== undefined) copy.time = p.time;
    if (p.strokeTime !== undefined) copy.strokeTime = p.strokeTime;
    if (p.speed !== undefined) copy.speed = p.speed;
    return copy;
  })];
}`
  },
  hobby: {
    id: "hobby",
    name: "Hobby Spline",
    code: `// @param tension = 1 (0.5..3, step: 0.1)
(points, globals) => {
  return [globals.solveHobbySpline(points, tension)];
}`
  }
};

const perpendicularDistance = (pt, lineStart, lineEnd) => {
  const [x, y] = pt;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;
  
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  
  if (lenSq === 0) {
    return Math.sqrt((x - x1) * (x - x1) + (y - y1) * (y - y1));
  }
  
  const t = ((x - x1) * dx + (y - y1) * dy) / lenSq;
  const clampedT = Math.max(0, Math.min(1, t));
  const projX = x1 + clampedT * dx;
  const projY = y1 + clampedT * dy;
  
  return Math.sqrt((x - projX) * (x - projX) + (y - projY) * (y - projY));
};

const simplifyRDP = (points, epsilon) => {
  if (points.length <= 2) return points;
  
  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;
  
  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[end]);
    if (dist > maxDist) {
      index = i;
      maxDist = dist;
    }
  }
  
  if (maxDist > epsilon) {
    const results1 = simplifyRDP(points.slice(0, index + 1), epsilon);
    const results2 = simplifyRDP(points.slice(index), epsilon);
    return results1.slice(0, results1.length - 1).concat(results2);
  } else {
    return [points[0], points[end]];
  }
};

const getTriangleArea = (a, b, c) => {
  return 0.5 * Math.abs(
    a[0] * (b[1] - c[1]) +
    b[0] * (c[1] - a[1]) +
    c[0] * (a[1] - b[1])
  );
};

const simplifyVW = (points, minArea) => {
  if (points.length <= 2) return points;
  
  const pts = points.map((p, idx) => ({ x: p[0], y: p[1], index: idx }));
  
  while (pts.length > 2) {
    let minAreaVal = Infinity;
    let minIndex = -1;
    
    for (let i = 1; i < pts.length - 1; i++) {
      const area = getTriangleArea(
        [pts[i-1].x, pts[i-1].y],
        [pts[i].x, pts[i].y],
        [pts[i+1].x, pts[i+1].y]
      );
      if (area < minAreaVal) {
        minAreaVal = area;
        minIndex = i;
      }
    }
    
    if (minAreaVal < minArea) {
      pts.splice(minIndex, 1);
    } else {
      break;
    }
  }
  
  return pts.map(p => [p.x, p.y]);
};

const resampleUniform = (points, count) => {
  if (points.length <= 2 || count <= 2) return points;
  
  const cumulativeDists = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i][0] - points[i-1][0];
    const dy = points[i][1] - points[i-1][1];
    const dist = Math.sqrt(dx * dx + dy * dy);
    cumulativeDists.push(cumulativeDists[i-1] + dist);
  }
  
  const totalLength = cumulativeDists[cumulativeDists.length - 1];
  if (totalLength === 0) return points;
  
  const step = totalLength / (count - 1);
  const newPoints = [points[0]];
  
  let originalIdx = 0;
  for (let i = 1; i < count - 1; i++) {
    const targetDist = i * step;
    
    while (originalIdx < cumulativeDists.length - 1 && cumulativeDists[originalIdx + 1] < targetDist) {
      originalIdx++;
    }
    
    const d0 = cumulativeDists[originalIdx];
    const d1 = cumulativeDists[originalIdx + 1];
    const t = (d1 - d0 === 0) ? 0 : (targetDist - d0) / (d1 - d0);
    
    const p0 = points[originalIdx];
    const p1 = points[originalIdx + 1];
    
    const x = p0[0] + t * (p1[0] - p0[0]);
    const y = p0[1] + t * (p1[1] - p0[1]);
    newPoints.push([x, y]);
  }
  
  newPoints.push(points[points.length - 1]);
  return newPoints;
};

const smoothAbsolutePointsExponentially = (points, beta = 0.12) => {
  if (points.length <= 2) return points;
  const smoothed = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = smoothed[smoothed.length - 1];
    const curr = points[i];
    const x = prev[0] + (curr[0] - prev[0]) * beta;
    const y = prev[1] + (curr[1] - prev[1]) * beta;
    smoothed.push([x, y]);
  }
  return smoothed;
};

const smoothPathLaplacian = (points, factor = 0.4, iterations = 3) => {
  if (points.length <= 2) return points;
  
  let currentPoints = points.map(p => [...p]);
  
  for (let iter = 0; iter < iterations; iter++) {
    const nextPoints = currentPoints.map(p => [...p]);
    for (let i = 1; i < currentPoints.length - 1; i++) {
      const prev = currentPoints[i - 1];
      const curr = currentPoints[i];
      const next = currentPoints[i + 1];
      
      const avgX = (prev[0] + next[0]) / 2;
      const avgY = (prev[1] + next[1]) / 2;
      
      nextPoints[i][0] = curr[0] * (1 - factor) + avgX * factor;
      nextPoints[i][1] = curr[1] * (1 - factor) + avgY * factor;
    }
    currentPoints = nextPoints;
  }
  
  return currentPoints;
};

const smoothPathTaubin = (points, lambda = 0.5, mu = -0.53, iterations = 10, periodic = false) => {
  if (points.length < 3) return points.map(p => [...p]);
  
  // 1. Calculate original bounding box bounds
  const origX = points.map(p => p[0]);
  const origY = points.map(p => p[1]);
  const minX_orig = Math.min(...origX);
  const maxX_orig = Math.max(...origX);
  const minY_orig = Math.min(...origY);
  const maxY_orig = Math.max(...origY);
  const w_orig = maxX_orig - minX_orig;
  const h_orig = maxY_orig - minY_orig;

  // 2. Perform standard stable Laplacian smoothing (convex combination of neighbors)
  let current = points.map(p => [...p]);
  const n = current.length;

  for (let iter = 0; iter < iterations; iter++) {
    const next = current.map(p => [...p]);
    for (let i = 0; i < n; i++) {
      if (periodic) {
        const numUnique = n - 1;
        if (i === n - 1) continue;

        const prevIdx = (i - 1 + numUnique) % numUnique;
        const nextIdx = (i + 1) % numUnique;

        const avgX = (current[prevIdx][0] + current[nextIdx][0]) / 2;
        const avgY = (current[prevIdx][1] + current[nextIdx][1]) / 2;
        
        next[i][0] = current[i][0] * 0.6 + avgX * 0.4;
        next[i][1] = current[i][1] * 0.6 + avgY * 0.4;
      } else {
        if (i === 0 || i === n - 1) continue;
        
        const avgX = (current[i - 1][0] + current[i + 1][0]) / 2;
        const avgY = (current[i - 1][1] + current[i + 1][1]) / 2;
        
        next[i][0] = current[i][0] * 0.6 + avgX * 0.4;
        next[i][1] = current[i][1] * 0.6 + avgY * 0.4;
      }
    }
    if (periodic) {
      next[n - 1] = [...next[0]];
    }
    current = next;
  }

  // 3. Rescale smoothed points back to the original bounding box exactly
  const smoothX = current.map(p => p[0]);
  const smoothY = current.map(p => p[1]);
  const minX_smooth = Math.min(...smoothX);
  const maxX_smooth = Math.max(...smoothX);
  const minY_smooth = Math.min(...smoothY);
  const maxY_smooth = Math.max(...smoothY);
  const w_smooth = maxX_smooth - minX_smooth;
  const h_smooth = maxY_smooth - minY_smooth;

  const scaleX = w_smooth > 0.01 ? (w_orig / w_smooth) : 1;
  const scaleY = h_smooth > 0.01 ? (h_orig / h_smooth) : 1;

  const result = current.map(([sx, sy]) => {
    const rx = minX_orig + (sx - minX_smooth) * scaleX;
    const ry = minY_orig + (sy - minY_smooth) * scaleY;
    return [rx, ry];
  });

  return result;
};

const solveHobbySpline = (points, tension = 1.0) => {
  if (points.length < 3) return points.map(p => [...p]);
  
  const n = points.length - 1;
  const d = [];
  const alpha = [];
  for (let i = 0; i < n; i++) {
    const dx = points[i+1][0] - points[i][0];
    const dy = points[i+1][1] - points[i][1];
    d.push(Math.sqrt(dx * dx + dy * dy));
    alpha.push(Math.atan2(dy, dx));
  }
  
  const psi = [0];
  for (let i = 1; i < n; i++) {
    let diff = alpha[i] - alpha[i-1];
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    psi.push(diff);
  }
  psi.push(0);
  
  const A = new Array(n + 1).fill(0);
  const B = new Array(n + 1).fill(0);
  const C = new Array(n + 1).fill(0);
  const D = new Array(n + 1).fill(0);
  
  const T = tension;
  const curl = 1.0;
  
  B[0] = curl + (3 - 1/T);
  C[0] = curl * (3 - 1/T) + 1;
  D[0] = -C[0] * psi[1];
  
  for (let i = 1; i < n; i++) {
    A[i] = 1 / (T * T * d[i-1]);
    C[i] = 1 / (T * T * d[i]);
    B[i] = (3 - 1/T) / (T * T * d[i-1]) + (3 - 1/T) / (T * T * d[i]);
    D[i] = - (3 - 1/T) / (T * T * d[i-1]) * psi[i] - 1 / (T * T * d[i]) * psi[i+1];
  }
  
  A[n] = curl * (3 - 1/T) + 1;
  B[n] = curl + (3 - 1/T);
  D[n] = 0;
  
  const c_prime = new Array(n + 1).fill(0);
  const d_prime = new Array(n + 1).fill(0);
  
  c_prime[0] = C[0] / B[0];
  d_prime[0] = D[0] / B[0];
  
  for (let i = 1; i <= n; i++) {
    const denom = B[i] - A[i] * c_prime[i-1];
    if (denom !== 0) {
      c_prime[i] = C[i] / denom;
      d_prime[i] = (D[i] - A[i] * d_prime[i-1]) / denom;
    } else {
      c_prime[i] = 0;
      d_prime[i] = 0;
    }
  }
  
  const theta = new Array(n + 1).fill(0);
  theta[n] = d_prime[n];
  for (let i = n - 1; i >= 0; i--) {
    theta[i] = d_prime[i] - c_prime[i] * theta[i+1];
  }
  
  const phi = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    phi[i+1] = -psi[i+1] - theta[i+1];
  }
  
  const resultPoints = [];
  const steps = 15;
  
  function hobbyVelocity(th, ph) {
    const a = Math.sqrt(2);
    const b = 1 / 16;
    const c = (3 - Math.sqrt(5)) / 2;
    const num = 2 + a * (Math.sin(th) - b * Math.sin(ph)) * (Math.sin(ph) - b * Math.sin(th)) * (Math.cos(th) - Math.cos(ph));
    const den = 3 * (1 + 0.5 * (Math.sqrt(5) - 1) * Math.cos(th) + 0.5 * (3 - Math.sqrt(5)) * Math.cos(ph));
    return num / den;
  }
  
  for (let i = 0; i < n; i++) {
    const p0 = points[i];
    const p3 = points[i+1];

    const th = theta[i];
    const ph = phi[i+1];
    
    const rho = hobbyVelocity(th, ph) / T;
    const sig = hobbyVelocity(ph, th) / T;
    
    const cp0_x = p0[0] + (d[i] / 3) * rho * Math.cos(alpha[i] + th);
    const cp0_y = p0[1] + (d[i] / 3) * rho * Math.sin(alpha[i] + th);
    
    const cp1_x = p3[0] - (d[i] / 3) * sig * Math.cos(alpha[i] - ph);
    const cp1_y = p3[1] - (d[i] / 3) * sig * Math.sin(alpha[i] - ph);
    
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const mt = 1 - t;
      const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * cp0_x + 3 * mt * t * t * cp1_x + t * t * t * p3[0];
      const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * cp0_y + 3 * mt * t * t * cp1_y + t * t * t * p3[1];
      
      const pt = [x, y];
      if (p0.pressure !== undefined && p3.pressure !== undefined) {
        pt.pressure = p0.pressure + (p3.pressure - p0.pressure) * t;
      }
      resultPoints.push(pt);
    }
  }
  
  resultPoints.push(points[n]);
  return resultPoints;
};

const closeAndSmoothJoint = (points, elType, roundness) => {
  if (points.length < 3) return points.map(p => [...p]);

  let current = points.map(p => [...p]);
  const n = current.length;

  // 1. Ensure path is closed
  const first = current[0];
  const last = current[n - 1];
  const dist = Math.sqrt((first[0] - last[0]) ** 2 + (first[1] - last[1]) ** 2);
  if (dist > 0.01) {
    current.push([...first]);
  }

  // 2. Structured lines/polygons or sharp paths should not be smoothed at all
  if (elType === "line" || !roundness) {
    return current;
  }

  const numPoints = current.length;
  if (numPoints < 4) {
    return current;
  }

  // 3. Dynamic joint-smoothing window
  // Clamped to 1 vertex for short paths, allowing up to 2 vertices for longer paths.
  const actualWindow = Math.min(2, Math.floor((numPoints - 3) / 2));
  
  const moveableIndices = new Set();
  moveableIndices.add(0);
  for (let i = 1; i <= actualWindow; i++) {
    moveableIndices.add(i);
  }
  for (let i = numPoints - 1 - actualWindow; i <= numPoints - 2; i++) {
    moveableIndices.add(i);
  }

  const lambda = 0.5;
  const mu = -0.53;
  const iterations = 8;

  for (let iter = 0; iter < iterations; iter++) {
    const step = (iter % 2 === 0) ? lambda : mu;
    const next = current.map(p => [...p]);

    for (const i of moveableIndices) {
      let prevIdx, nextIdx;
      if (i === 0) {
        prevIdx = numPoints - 2;
        nextIdx = 1;
      } else {
        prevIdx = i - 1;
        nextIdx = (i + 1) % numPoints;
      }

      const avgX = (current[prevIdx][0] + current[nextIdx][0]) / 2;
      const avgY = (current[prevIdx][1] + current[nextIdx][1]) / 2;

      next[i][0] = current[i][0] + step * (avgX - current[i][0]);
      next[i][1] = current[i][1] + step * (avgY - current[i][1]);
    }

    next[numPoints - 1] = [...next[0]];
    current = next;
  }

  return current;
};

const updateElementGeometry = (el, newAbsolutePoints) => {
  if (newAbsolutePoints.length < 2) return el;
  
  let startX, startY;
  if (el.type === "freedraw") {
    startX = Math.min(...newAbsolutePoints.map(p => p[0]));
    startY = Math.min(...newAbsolutePoints.map(p => p[1]));
  } else {
    startX = newAbsolutePoints[0][0];
    startY = newAbsolutePoints[0][1];
  }

  const relativePoints = newAbsolutePoints.map((p) => {
    const relPt = [p[0] - startX, p[1] - startY];
    if (p.pressure !== undefined) relPt.pressure = p.pressure;
    if (p.time !== undefined) relPt.time = p.time;
    if (p.strokeTime !== undefined) relPt.strokeTime = p.strokeTime;
    if (p.speed !== undefined) relPt.speed = p.speed;
    return relPt;
  });

  const xCoords = relativePoints.map(p => p[0]);
  const yCoords = relativePoints.map(p => p[1]);
  const minX = Math.min(...xCoords);
  const maxX = Math.max(...xCoords);
  const minY = Math.min(...yCoords);
  const maxY = Math.max(...yCoords);

  const nextElement = {
    ...el,
    x: startX,
    y: startY,
    points: relativePoints,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    version: el.version + 1,
    versionNonce: Math.floor(Math.random() * 1000000),
    updated: Date.now()
  };

  if (el.type === "freedraw") {
    const fallbackPressure = 0.5;
    nextElement.pressures = newAbsolutePoints.map((point, index) => {
      const pointPressure = Number(point?.pressure);
      if (Number.isFinite(pointPressure)) return pointPressure;
      const existingPressure = Number(el.pressures?.[index]);
      return Number.isFinite(existingPressure) ? existingPressure : fallbackPressure;
    });
    nextElement.simulatePressure = false;
  }

  return nextElement;
};

const getElementAbsolutePoints = (element) => element.points.map(point => {
  const absolutePoint = [element.x + point[0], element.y + point[1]];
  if (point.pressure !== undefined) absolutePoint.pressure = point.pressure;
  if (point.time !== undefined) absolutePoint.time = point.time;
  if (point.strokeTime !== undefined) absolutePoint.strokeTime = point.strokeTime;
  if (point.speed !== undefined) absolutePoint.speed = point.speed;
  return absolutePoint;
});

const pointsToSmoothSvgPath = (points) => {
  if (!Array.isArray(points) || points.length < 2) return "";
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index++) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const following = points[Math.min(points.length - 1, index + 2)];
    const control1 = [
      current[0] + (next[0] - previous[0]) / 6,
      current[1] + (next[1] - previous[1]) / 6
    ];
    const control2 = [
      next[0] - (following[0] - current[0]) / 6,
      next[1] - (following[1] - current[1]) / 6
    ];
    path += ` C ${control1[0]} ${control1[1]}, ${control2[0]} ${control2[1]}, ${next[0]} ${next[1]}`;
  }
  return path;
};

const parseParameters = code => parseScriptParameters(code);

const updateCodeWithParamValues = (code, params) => {
  let updatedCode = code;
  params.forEach(p => {
    const regex = new RegExp(`(//\\s*@param\\s+${p.name}\\s*=\\s*)[0-9.-]+`, "g");
    updatedCode = updatedCode.replace(regex, `$1${p.value}`);
  });
  return updatedCode;
};

const compileUserBrush = (code, params = []) => {
  try {
    const keys = params.map(p => p.name);
    const values = params.map(p => p.value);
    const maker = new Function(...keys, "return (" + code + ")");
    const fn = maker(...values);
    if (typeof fn === "function") {
      return { generator: fn, error: "" };
    }
    return { generator: null, error: "Code must return a function." };
  } catch (err) {
    return { generator: null, error: err.message || "Compilation error." };
  }
};

function App() {
  console.log("Drawerator version: 1.8.0 (rebuilt at 2026-07-08T22:25:00)");
  // App States
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const runtimeCallbacksRef = useRef({
    restoreBaseline: async () => {},
    applyAction: async () => {},
    historyStart: () => {},
    historyPause: () => {},
    historyStop: () => {},
    historyPlay: () => {},
    historySeek: () => {},
    macroSave: () => {},
    macroInsert: () => {},
    sceneCommand: () => {},
    iannixImport: () => {},
    transportUpdate: () => {},
    transportSeek: () => {},
    panelStateUpdate: () => {},
    boardSettingsUpdate: () => {},
    globalGridUpdate: () => {},
    globalGridReset: () => {},
    gridQuantizeSelection: () => {},
  });
  const draweratorRuntimeRef = useRef(null);
  if (!draweratorRuntimeRef.current) {
    const eventBus = new DraweratorEventBus();
    const inputBus = new DraweratorInputBus({ eventBus });
    const commandRegistry = new DraweratorCommandRegistry({ eventBus });
    const historyController = new DraweratorSessionController({
      restoreBaseline: baseline => runtimeCallbacksRef.current.restoreBaseline(baseline),
      applyAction: (action, options) => runtimeCallbacksRef.current.applyAction(action, options),
    });
    draweratorRuntimeRef.current = {
      eventBus,
      inputBus,
      commandRegistry,
      historyController,
      library: new DraweratorLibraryStore(),
    };
  }
  const { eventBus, inputBus, commandRegistry, historyController, library: historyLibrary } = draweratorRuntimeRef.current;
  const [historySnapshot, setHistorySnapshot] = useState(() => historyController.snapshot());
  const [historyMacros, setHistoryMacros] = useState([]);
  const [historyIncludePresentation, setHistoryIncludePresentation] = useState(true);
  const [historyMidiArmed, setHistoryMidiArmed] = useState(() => localStorage.getItem("drawerator_history_midi_armed") === "true");
  const [historyShowPointer, setHistoryShowPointer] = useState(true);
  const [historyClockMode, setHistoryClockMode] = useState(() => localStorage.getItem("drawerator_history_clock_mode") || "realtime");
  const [historyRecordFilter, setHistoryRecordFilter] = useState(() => localStorage.getItem("drawerator_history_record_filter") || "all");
  const [autoKeyEnabled, setAutoKeyEnabled] = useState(false);
  const [sessionPlaybackOverlay, setSessionPlaybackOverlay] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem("drawerator_theme") || "dark");
  const [globalGrid, setGlobalGrid] = useState(() => {
    try {
      return normalizeGlobalGrid(JSON.parse(localStorage.getItem(GRID_STORAGE_KEY) || "null"));
    } catch {
      return normalizeGlobalGrid(null);
    }
  });
  const [selectionFilter, setSelectionFilter] = useState(() => {
    try {
      return normalizeSelectionFilter(JSON.parse(localStorage.getItem(SELECTION_FILTER_STORAGE_KEY) || "null"));
    } catch {
      return { ...DEFAULT_SELECTION_FILTER };
    }
  });
  const [shortcutBindings, setShortcutBindings] = useState(() => {
    try {
      return normalizeShortcutBindings(JSON.parse(localStorage.getItem(SHORTCUT_STORAGE_KEY) || "null"));
    } catch {
      return normalizeShortcutBindings(null);
    }
  });
  const [accentColor, setAccentColor] = useState(() => localStorage.getItem("drawerator_accent_color") || "#6b7173");
  const [accentOpacity, setAccentOpacity] = useState(() => Number(localStorage.getItem("drawerator_accent_opacity") || 100));
  const [highlightColor, setHighlightColor] = useState(() => localStorage.getItem("drawerator_highlight_color") || (theme === "dark" ? "#33323b" : "#f1f0ff"));
  const [highlightOpacity, setHighlightOpacity] = useState(() => Number(localStorage.getItem("drawerator_highlight_opacity") || 100));
  const [roleTheme, setRoleTheme] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("drawerator_role_theme") || "null");
      return { ...DEFAULT_ROLE_THEME, ...(saved || {}) };
    } catch {
      return DEFAULT_ROLE_THEME;
    }
  });
  const [panelLayouts, setPanelLayouts] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("drawerator_panel_layout_v1") || "null");
      const layouts = normalizePanelLayouts(saved);
      const legacyTransport = JSON.parse(localStorage.getItem("drawerator_transport_position") || "null");
      if (!saved && Number.isFinite(legacyTransport?.x) && Number.isFinite(legacyTransport?.y)) {
        layouts.transport = { placement: PANEL_PLACEMENTS.FLOATING, x: legacyTransport.x, y: legacyTransport.y };
      }
      return layouts;
    } catch {
      return normalizePanelLayouts(null);
    }
  });
  const [openPanels, setOpenPanels] = useState(() => {
    try {
      return { chat: false, settings: false, mods: true, iannix: false, console: false, history: false, properties: false, outliner: false, grid: true, ...JSON.parse(localStorage.getItem("drawerator_panel_visibility_v1") || "null") };
    } catch {
      return { chat: false, settings: false, mods: true, iannix: false, console: false, history: false, properties: false, outliner: false, grid: true };
    }
  });
  const [activeDockPanels, setActiveDockPanels] = useState(() => {
    try {
      return { left: "mods", right: "mods", bottom: "transport", ...JSON.parse(localStorage.getItem("drawerator_panel_dock_tabs_v1") || "null") };
    } catch {
      return { left: "mods", right: "mods", bottom: "transport" };
    }
  });
  const [collapsedDocks, setCollapsedDocks] = useState(() => {
    try {
      return { left: false, right: false, ...JSON.parse(localStorage.getItem("drawerator_collapsed_docks_v1") || "null") };
    } catch {
      return { left: false, right: false };
    }
  });
  const [draggingPanelId, setDraggingPanelId] = useState(null);
  const [dockPreview, setDockPreview] = useState(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [satoriMode, setSatoriMode] = useState(true);
  const [zenMode, setZenMode] = useState(false);
  const [showToolbarHints, setShowToolbarHints] = useState(() => {
    const saved = localStorage.getItem("drawerator_show_toolbar_hints");
    return saved === "true";
  });
  const [showBottomNotifications, setShowBottomNotifications] = useState(() => {
    const saved = localStorage.getItem("drawerator_show_bottom_notifications");
    return saved === "true";
  });
  const [forceDesktopLayout, setForceDesktopLayout] = useState(() => {
    const saved = localStorage.getItem("drawerator_force_desktop_layout");
    return saved !== "false";
  });
  const [defaultStabilizerDamping, setDefaultStabilizerDamping] = useState(() => {
    const saved = localStorage.getItem("drawerator_default_stabilizer_damping");
    return saved ? parseFloat(saved) : 0.12;
  });
  const [activeSettingsTab, setActiveSettingsTab] = useState("ai");
  const [modsPanelTab, setModsPanelTab] = useState("stack");
  const [iannixPanelTab, setIannixPanelTab] = useState("data");
  const [iannixScriptSource, setIannixScriptSource] = useState("");
  const [iannixCommandSource, setIannixCommandSource] = useState("");
  const [iannixScripts, setIannixScripts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("drawerator_iannix_scripts") || "[]");
    } catch {
      return [];
    }
  });
  const [activeIannixScriptId, setActiveIannixScriptId] = useState("");
  const [scoreTime, setScoreTime] = useState(0);
  const [scorePlaying, setScorePlaying] = useState(false);
  const [scoreRate, setScoreRate] = useState(() => {
    const saved = Number(localStorage.getItem("drawerator_iannix_rate"));
    return Number.isFinite(saved) && saved > 0 ? saved : 1;
  });
  const [scoreTempo, setScoreTempo] = useState(() => {
    const saved = Number(localStorage.getItem("drawerator_iannix_tempo"));
    return Number.isFinite(saved) && saved >= 20 && saved <= 400 ? saved : 120;
  });
  const [scoreTempoDraft, setScoreTempoDraft] = useState(() => String(scoreTempo));
  const [scoreTimeSignature, setScoreTimeSignature] = useState(() => {
    try {
      return normalizeTimeSignature(JSON.parse(localStorage.getItem("drawerator_time_signature") || "null"));
    } catch {
      return { numerator: 4, denominator: 4 };
    }
  });
  const [transportDisplayMode, setTransportDisplayMode] = useState(() => {
    const saved = localStorage.getItem("drawerator_transport_display");
    return ["frame", "timecode", "beats"].includes(saved) ? saved : "timecode";
  });
  const [transportFps, setTransportFps] = useState(() => {
    const saved = Number(localStorage.getItem("drawerator_transport_fps"));
    return [24, 25, 30, 50, 60].includes(saved) ? saved : 30;
  });
  const [transportLoopEnabled, setTransportLoopEnabled] = useState(() =>
    localStorage.getItem("drawerator_transport_loop") === "true"
  );
  const [transportLoopStart, setTransportLoopStart] = useState(() => Math.max(0, Number(localStorage.getItem("drawerator_transport_loop_start")) || 0));
  const [transportLoopEnd, setTransportLoopEnd] = useState(() => Math.max(1, Number(localStorage.getItem("drawerator_transport_loop_end")) || 10));
  const updateTransportLoop = useCallback((start, end) => {
    setTransportLoopStart(Math.max(0, start));
    setTransportLoopEnd(Math.max(start + 0.001, end));
  }, []);
  const [midiClockMode, setMidiClockMode] = useState(() => {
    const saved = localStorage.getItem("drawerator_midi_clock_mode");
    return ["send", "receive"].includes(saved) ? saved : "internal";
  });
  const [followMidiClockTempo, setFollowMidiClockTempo] = useState(() =>
    localStorage.getItem("drawerator_follow_midi_clock_tempo") === "true"
  );
  const [followMidiTransport, setFollowMidiTransport] = useState(() =>
    localStorage.getItem("drawerator_follow_midi_transport") !== "false"
  );
  const [latchTriggersAcrossCursors, setLatchTriggersAcrossCursors] = useState(() =>
    localStorage.getItem("drawerator_latch_triggers_across_cursors") !== "false"
  );
  const [midiInputs, setMidiInputs] = useState([]);
  const [midiInputId, setMidiInputId] = useState(() => localStorage.getItem("drawerator_iannix_midi_input") || "");
  const [midiClockStatus, setMidiClockStatus] = useState("Internal clock");
  const [transportDragging, setTransportDragging] = useState(false);
  const [showIannixLabels, setShowIannixLabels] = useState(() => {
    return localStorage.getItem("drawerator_iannix_show_labels") === "true";
  });
  const [showIannixTransport, setShowIannixTransport] = useState(() => {
    return localStorage.getItem("drawerator_iannix_transport_visible") !== "false";
  });
  const [scoreEvents, setScoreEvents] = useState([]);
  const [midiAccess, setMidiAccess] = useState(null);
  const [midiOutputs, setMidiOutputs] = useState([]);
  const [midiOutputId, setMidiOutputId] = useState(() =>
    localStorage.getItem("drawerator_iannix_midi_output") || ""
  );
  const [midiFallbackEnabled, setMidiFallbackEnabled] = useState(() =>
    localStorage.getItem("drawerator_midi_internal_fallback") !== "false"
  );
  const [internalGmPrograms, setInternalGmPrograms] = useState(() => {
    try {
      return normalizeGmPrograms(JSON.parse(localStorage.getItem("drawerator_internal_gm_programs") || "null"));
    } catch {
      return normalizeGmPrograms(null);
    }
  });
  const [internalProgramsExpanded, setInternalProgramsExpanded] = useState(false);
  const [internalSynthStatus, setInternalSynthStatus] = useState(() => (
    midiOutputId === INTERNAL_MIDI_SYNTH_ID
    || (midiFallbackEnabled && midiOutputId !== MIDI_PORT_NONE && midiOutputId !== MIDI_PORT_ALL)
      ? "Audio suspended"
      : "Off"
  ));
  const [internalSynthError, setInternalSynthError] = useState("");
  const [midiStatus, setMidiStatus] = useState(() =>
    typeof navigator !== "undefined" && navigator.requestMIDIAccess
      ? "MIDI not connected"
      : "Web MIDI is unavailable in this browser"
  );
  const [sceneExchangeStatus, setSceneExchangeStatus] = useState("");
  const [, setScoreRuntimeNonce] = useState(0);
  const previousCursorStatesRef = useRef(new Map());
  const visualCursorTransformsRef = useRef(new Map());
  const activeScoreCollisionsRef = useRef(new Set());
  const triggerCollisionLockoutsRef = useRef(new Map());
  const triggerPulseUntilRef = useRef(new Map());
  const midiAccessRef = useRef(null);
  const globalGridRef = useRef(globalGrid);
  const selectionFilterRef = useRef(selectionFilter);
  selectionFilterRef.current = selectionFilter;
  const gridQuantizingRef = useRef(false);
  const gridInteractionRef = useRef({ moving: false, resizing: false, pointEditing: false, pointIndices: null });
  const editingLinearGridRef = useRef(null);
  const multiElementGridRef = useRef(null);
  const activeGridToolRef = useRef(null);
  const midiOutputIdRef = useRef(midiOutputId);
  const midiFallbackEnabledRef = useRef(midiFallbackEnabled);
  const internalGmProgramsRef = useRef(internalGmPrograms);
  const internalSynthRef = useRef(null);
  const midiInputIdRef = useRef(midiInputId);
  const midiClockTempoRef = useRef(scoreTempo);
  const midiClockReceiverRef = useRef(createMidiClockReceiverState(scoreTempo));
  const midiClockRunningRef = useRef(false);
  const scorePlayingRef = useRef(scorePlaying);
  const midiVoiceTrackerRef = useRef(null);
  if (!midiVoiceTrackerRef.current) midiVoiceTrackerRef.current = createIannixMidiVoiceTracker();
  const tapTempoTimesRef = useRef([]);
  const transportDragRef = useRef(null);
  const panelDragRef = useRef(null);
  const sceneImportInputRef = useRef(null);
  const iannixImportInputRef = useRef(null);
  const excalidrawAPIRef = useRef(null);
  const scoreTimeRef = useRef(scoreTime);
  const historySuppressSceneRef = useRef(0);
  const lastSceneElementsRef = useRef(new Map());
  const pendingSceneMutationRef = useRef(null);
  const sceneMutationTimerRef = useRef(null);
  const lastPresentationStateRef = useRef(null);
  const pendingPresentationRef = useRef(null);
  const presentationTimerRef = useRef(null);
  const autoKeyApplyingRef = useRef(false);
  const strokeInputSamplesRef = useRef([]);
  const strokeRecordingSuppressedRef = useRef(false);
  const passiveStrokeCaptureRef = useRef(null);
  const nativeLineGridPointsRef = useRef(null);
  const pendingNativeLineFinalizeRef = useRef(null);
  const passiveGridFreedrawRef = useRef(false);
  const transportStateRecordingRef = useRef(null);
  const panelStateRecordingRef = useRef(null);
  const boardSettingsRecordingRef = useRef(null);
  const applyingRecordedUiStateRef = useRef(false);
  const commandActionsRef = useRef(new Map());
  const [selectedElementIds, setSelectedElementIds] = useState({});
  const selectedElementIdsRef = useRef(selectedElementIds);
  selectedElementIdsRef.current = selectedElementIds;
  const runtimeCursorSelectionRef = useRef({});
  const [modifierUpdateNonce, setModifierUpdateNonce] = useState(0);
  const [bezierEditElementId, setBezierEditElementId] = useState(null);
  const [bezierSelectedAnchor, setBezierSelectedAnchor] = useState(null);
  const bezierDragRef = useRef(null);
  const lastBezierPointerDownRef = useRef(null);
  useEffect(() => {
    localStorage.setItem("drawerator_role_theme", JSON.stringify(roleTheme));
    if (!excalidrawAPI) return;
    let changed = false;
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted().map(element => {
      const role = element.customData?.score?.role || element.customData?.iannix?.role;
      if (!["curve", "cursor", "trigger"].includes(role)) return element;
      const savedColor = element.customData?.roleThemeSourceStrokeColor;
      if (!roleTheme.enabled) {
        if (role === "cursor" && isRuntimeCursor(element)) {
          const data = normalizeIannixData(element.customData?.iannix);
          const sourceStrokeColor = savedColor || data.cursor.sourceStrokeColor || element.strokeColor;
          if (element.strokeColor === "transparent" && data.cursor.sourceStrokeColor === sourceStrokeColor && !savedColor) return element;
          changed = true;
          const customData = { ...(element.customData || {}) };
          delete customData.roleThemeSourceStrokeColor;
          customData.iannix = {
            ...data,
            cursor: { ...data.cursor, sourceStrokeColor },
          };
          return { ...element, strokeColor: "transparent", customData, version: element.version + 1, versionNonce: Math.floor(Math.random() * 1000000), updated: Date.now() };
        }
        if (!savedColor) return element;
        changed = true;
        const customData = { ...(element.customData || {}) };
        delete customData.roleThemeSourceStrokeColor;
        return { ...element, strokeColor: savedColor, customData, version: element.version + 1, versionNonce: Math.floor(Math.random() * 1000000), updated: Date.now() };
      }
      const active = element.customData?.score?.active ?? normalizeIannixData(element.customData?.iannix).active;
      const key = `${role}${active ? "Active" : "Inactive"}`;
      const palette = roleTheme[key];
      if (!palette) return element;
      const strokeColor = colorWithOpacity(palette.color, palette.opacity);
      if (role === "cursor" && isRuntimeCursor(element)) {
        const data = normalizeIannixData(element.customData?.iannix);
        if (element.strokeColor === "transparent" && data.cursor.sourceStrokeColor === strokeColor) return element;
        changed = true;
        return {
          ...element,
          strokeColor: "transparent",
          customData: {
            ...(element.customData || {}),
            roleThemeSourceStrokeColor: savedColor || data.cursor.sourceStrokeColor || element.strokeColor,
            iannix: {
              ...data,
              cursor: { ...data.cursor, sourceStrokeColor: strokeColor },
            },
          },
          version: element.version + 1,
          versionNonce: Math.floor(Math.random() * 1000000),
          updated: Date.now(),
        };
      }
      if (element.strokeColor === strokeColor && savedColor) return element;
      changed = true;
      return {
        ...element,
        strokeColor,
        customData: { ...(element.customData || {}), roleThemeSourceStrokeColor: savedColor || element.strokeColor },
        version: element.version + 1,
        versionNonce: Math.floor(Math.random() * 1000000),
        updated: Date.now(),
      };
    });
    if (changed) excalidrawAPI.updateScene({ elements, commitToHistory: false });
  }, [excalidrawAPI, modifierUpdateNonce, roleTheme]);
  const cameraRef = useRef({ scrollX: 0, scrollY: 0, zoom: 1 });
  const [showContextDropdown, setShowContextDropdown] = useState(false);
  const [contextMenuTab, setContextMenuTab] = useState("main");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteSearch, setAutocompleteSearch] = useState("");
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [showDebugLayer, setShowDebugLayer] = useState(() => {
    return localStorage.getItem("drawerator_show_debug_layer") === "true";
  });

  useEffect(() => {
    excalidrawAPIRef.current = excalidrawAPI;
    if (excalidrawAPI) {
      lastSceneElementsRef.current = new Map(
        excalidrawAPI.getSceneElementsIncludingDeleted().map(element => [element.id, element])
      );
    }
  }, [excalidrawAPI]);

  useEffect(() => {
    scoreTimeRef.current = scoreTime;
  }, [scoreTime]);

  const panicMidi = useCallback(() => {
    midiVoiceTrackerRef.current?.panic();
    internalSynthRef.current?.clear?.();
  }, []);

  const getScoreMidiRoute = useCallback(() => resolveMidiOutputRoute({
    midiAccess: midiAccessRef.current,
    selectedOutputId: midiOutputIdRef.current,
    fallbackEnabled: midiFallbackEnabledRef.current,
    internalOutput: internalSynthRef.current?.getState?.() !== "off" ? internalSynthRef.current : null,
  }), []);

  const ensureInternalSynth = useCallback(async () => {
    if (!isInternalMidiSynthSupported()) {
      setInternalSynthStatus("Unavailable");
      setInternalSynthError("Web Audio is unavailable in this browser.");
      return null;
    }
    try {
      setInternalSynthError("");
      if (!internalSynthRef.current) {
        internalSynthRef.current = createInternalMidiSynth({ programs: internalGmProgramsRef.current });
      }
      const output = internalSynthRef.current;
      output.setPrograms(internalGmProgramsRef.current);
      const state = await resumeInternalMidiSynth(output);
      if (state === "closed") throw new Error("The internal audio context is closed. Reset audio to create a new one.");
      setInternalSynthStatus(state === "running" ? "Ready" : "Audio suspended");
      return output;
    } catch (error) {
      setInternalSynthStatus("Error");
      setInternalSynthError(error?.message || "Internal synth initialization failed.");
      return null;
    }
  }, []);

  const resetInternalSynth = useCallback(async () => {
    panicMidi();
    const previous = internalSynthRef.current;
    internalSynthRef.current = null;
    setInternalSynthStatus("Resetting…");
    setInternalSynthError("");
    try {
      await disposeInternalMidiSynth(previous);
    } catch {
      // A broken AudioContext must not prevent a clean replacement.
    }
    const replacement = await ensureInternalSynth();
    if (replacement) setMidiStatus("Internal synth reset and ready.");
    return replacement;
  }, [ensureInternalSynth, panicMidi]);

  const testInternalSynthAudio = useCallback(async () => {
    const output = await ensureInternalSynth();
    if (!output) return;
    try {
      const now = performance.now();
      output.send([0x90, 60, 100], now);
      output.send([0x80, 60, 0], now + 350);
      setMidiStatus("Sent internal synth test note C4.");
    } catch (error) {
      setMidiStatus(error?.message || "Internal synth test failed.");
    }
  }, [ensureInternalSynth]);

  const testRawWebAudio = useCallback(async () => {
    try {
      setMidiStatus("Playing raw Web Audio test tone…");
      const result = await playWebAudioTestTone();
      setMidiStatus(`Raw Web Audio rendered (${result.sampleRate || "unknown"} Hz, ${result.channels || "unknown"} ch).`);
    } catch (error) {
      setMidiStatus(error?.message || "Raw Web Audio test failed.");
    }
  }, []);

  useEffect(() => {
    scorePlayingRef.current = scorePlaying;
    if (!scorePlaying) panicMidi();
  }, [panicMidi, scorePlaying]);

  useEffect(() => () => {
    panicMidi();
    void disposeInternalMidiSynth(internalSynthRef.current);
    internalSynthRef.current = null;
  }, [panicMidi]);

  useEffect(() => historyController.subscribe((snapshot, eventName) => {
    setHistorySnapshot(snapshot);
    if (["playback.start", "playback.pause", "playback.stop", "playback.complete", "playback.error", "playback.seek"].includes(eventName)) {
      panicMidi();
    }
    eventBus.emit(`history.${eventName}`, {
      status: snapshot.status,
      playhead: snapshot.playhead,
      duration: snapshot.duration,
      actions: snapshot.session?.actions?.length || 0,
    }, { source: "history", time: performance.now() });
    if (eventName === "playback.tick" || eventName === "playback.seek" || eventName === "playback.start") {
      const active = (snapshot.session?.actions || []).filter(action =>
        action.enabled && action.kind === "stroke" && snapshot.playhead >= action.at && snapshot.playhead < action.at + action.duration
      ).map(action => {
        const samples = action.args?.samples || [];
        const progress = action.duration > 0 ? Math.min(1, Math.max(0, (snapshot.playhead - action.at) / action.duration)) : 1;
        const count = Math.max(1, Math.ceil(samples.length * progress));
        const visibleSamples = samples.slice(0, count);
        const finalElements = action.args?.finalElements || [];
        const sourceElement = finalElements.find(element => !element.customData?.isModifierGenerated) || finalElements[0];
        const sourcePoints = visibleSamples.map(sample => {
          const point = [sample.scene.x, sample.scene.y];
          point.pressure = sample.pressure;
          point.time = sample.time;
          point.strokeTime = sample.data?.strokeTime ?? sample.time;
          point.speed = sample.data?.speed ?? 0;
          return point;
        });
        let paths = sourcePoints.length >= 2 ? [sourcePoints] : [];
        const modifiers = sourceElement?.customData?.modifiers || [];
        if (sourcePoints.length >= 2 && modifiers.length > 0 && !sourceElement.customData?.muteModifiers) {
          const elapsedMs = visibleSamples.at(-1)?.time || 0;
          const evaluation = evaluateModifierStack(sourcePoints, modifiers, getElementBrushGlobals(sourceElement, {
            elapsedMs,
            globalElapsedMs: elapsedMs,
            isPointerDown: true,
            strokeColor: sourceElement.strokeColor,
            strokeWidth: sourceElement.strokeWidth,
            opacity: sourceElement.opacity ?? 100,
          }));
          paths = composePreviewTracks({
            ...evaluation,
            hideOriginal: Boolean(sourceElement.customData?.hideOriginal),
          });
        }
        return {
          id: action.id,
          samples: visibleSamples,
          pointer: samples[Math.max(0, count - 1)] || null,
          strokeColor: sourceElement?.strokeColor || "#e9ecef",
          strokeWidth: sourceElement?.strokeWidth || 2,
          paths,
        };
      });
      setSessionPlaybackOverlay(active);
    } else if (eventName === "playback.complete" || eventName === "playback.stop") {
      setSessionPlaybackOverlay([]);
    }
  }), [eventBus, historyController, panicMidi]);

  useEffect(() => {
    historyController.setRecordFilter(historyRecordFilter);
  }, [historyController, historyRecordFilter]);

  useEffect(() => commandRegistry.subscribe(detail => {
    historyController.recordCommand(detail);
  }), [commandRegistry, historyController]);

  const refreshHistoryMacros = useCallback(async () => {
    setHistoryMacros(await historyLibrary.list(DRAWERATOR_MACRO_TYPE));
  }, [historyLibrary]);

  useEffect(() => {
    refreshHistoryMacros();
  }, [refreshHistoryMacros]);

  useEffect(() => () => {
    window.clearTimeout(sceneMutationTimerRef.current);
    window.clearTimeout(presentationTimerRef.current);
    window.clearTimeout(transportStateRecordingRef.current?.timer);
    window.clearTimeout(panelStateRecordingRef.current?.timer);
    window.clearTimeout(boardSettingsRecordingRef.current?.timer);
  }, []);
  const [brushPalette, setBrushPalette] = useState(() => {
    const saved = localStorage.getItem("drawerator_brush_palette");
    let palette = [];
    if (saved) {
      try {
        palette = JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse brush palette", e);
      }
    }
    
    const defaultPresets = [
      { id: "simple", name: "Simple Line", code: PRESET_BRUSHES.simple.code, isPreset: true, type: "brush" },
      { id: "hairy", name: "Hairy Brush (Calligraphy)", code: PRESET_BRUSHES.hairy.code, isPreset: true, type: "brush" },
      { id: "growingHairy", name: "Growing Hairy Brush (Collision Stop)", code: PRESET_BRUSHES.growingHairy.code, isPreset: true, type: "brush" },
      { id: "pressure", name: "Calligraphy Pencil (Pressure-Sensitive)", code: PRESET_BRUSHES.pressure.code, isPreset: true, type: "brush" },
      { id: "ribbon", name: "Ribbon Brush (Double Track)", code: PRESET_BRUSHES.ribbon.code, isPreset: true, type: "brush" },
      { id: "sketchy", name: "Sketchy Multi-line", code: PRESET_BRUSHES.sketchy.code, isPreset: true, type: "brush" },
      { id: "walking", name: "Walking Brush (Time-Oscillated)", code: PRESET_BRUSHES.walking.code, isPreset: true, type: "brush" },
      { id: "rake", name: "Rake Brush (Variable Teeth)", code: PRESET_BRUSHES.rake.code, isPreset: true, type: "brush" },
      { id: "zenRake", name: "Zen Garden Rake (Parallel Grooves)", code: PRESET_BRUSHES.zenRake.code, isPreset: true, type: "brush" },
      { id: "rdp", name: "Simplify (RDP)", code: PRESET_BRUSHES.rdp.code, isPreset: true, type: "filter" },
      { id: "vw", name: "Simplify (VW)", code: PRESET_BRUSHES.vw.code, isPreset: true, type: "filter" },
      { id: "smooth", name: "Laplacian Smooth", code: PRESET_BRUSHES.smooth.code, isPreset: true, type: "filter" },
      { id: "taubin", name: "Taubin Smooth", code: PRESET_BRUSHES.taubin.code, isPreset: true, type: "filter" },
      { id: "resample", name: "Resample Uniformly", code: PRESET_BRUSHES.resample.code, isPreset: true, type: "filter" },
      { id: "joint", name: "Close & Smooth Joint", code: PRESET_BRUSHES.joint.code, isPreset: true, type: "filter" },
      { id: "snap", name: "Snap to Grid", code: PRESET_BRUSHES.snap.code, isPreset: true, type: "filter" },
      { id: "hobby", name: "Hobby Spline", code: PRESET_BRUSHES.hobby.code, isPreset: true, type: "filter" }
    ];

    if (!palette || palette.length === 0) {
      return defaultPresets;
    }

    // Merge/update presets
    defaultPresets.forEach(preset => {
      const idx = palette.findIndex(b => b.id === preset.id);
      if (idx === -1) {
        palette.push(preset);
      } else {
        // Automatically sync latest preset code
        palette[idx] = { ...palette[idx], code: preset.code, name: preset.name, isPreset: true, type: preset.type };
      }
    });

    return palette;
  });

  const [activeBrushId, setActiveBrushId] = useState(() => {
    const saved = localStorage.getItem("drawerator_active_brush_id");
    return saved && saved !== "normal" ? saved : "simple";
  });

  const [globalModifiers, setGlobalModifiers] = useState([]);
  const [globalMuteStack, setGlobalMuteStack] = useState(false);
  const [nextStrokeHideOriginal, setNextStrokeHideOriginal] = useState(false);
  const [globalRoundness, setGlobalRoundness] = useState(true);

  const updatePanelLayout = useCallback((panelId, nextLayout) => {
    setPanelLayouts(previous => ({
      ...previous,
      [panelId]: { ...previous[panelId], ...nextLayout },
    }));
  }, []);

  const setPanelPlacement = useCallback((panelId, placement) => {
    updatePanelLayout(panelId, { placement });
    if (placement === PANEL_PLACEMENTS.LEFT || placement === PANEL_PLACEMENTS.RIGHT) {
      setActiveDockPanels(previous => ({ ...previous, [placement]: panelId }));
      setCollapsedDocks(previous => ({ ...previous, [placement]: false }));
    }
    if (placement === PANEL_PLACEMENTS.BOTTOM) {
      setActiveDockPanels(previous => ({ ...previous, bottom: panelId }));
    }
  }, [updatePanelLayout]);

  const startSidebarPanelDrag = useCallback((panelId, event) => {
    if (event.button !== 0) return;
    const panel = event.currentTarget.closest(".drawerator-panel-shell");
    const rect = panel?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    panelDragRef.current = {
      panelId,
      started: false,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    setDraggingPanelId(panelId);
  }, []);

  const startHorizontalPanelDrag = useCallback((panelId, event) => {
    if (event.button !== 0) return;
    const panel = event.currentTarget.closest(".drawerator-panel-shell");
    const rect = panel?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.stopPropagation();
    const layout = panelLayouts[panelId];
    const width = Math.min(Math.max(layout?.width || 980, 720), Math.max(320, window.innerWidth - 16));
    transportDragRef.current = {
      panelId,
      started: false,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: Math.min(event.clientX - rect.left, width - 24),
      offsetY: event.clientY - rect.top,
      width,
      height: rect.height,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    setTransportDragging(true);
  }, [panelLayouts]);

  useEffect(() => {
    localStorage.setItem("drawerator_iannix_rate", String(scoreRate));
  }, [scoreRate]);

  useEffect(() => {
    localStorage.setItem("drawerator_iannix_tempo", String(scoreTempo));
    midiClockTempoRef.current = scoreTempo;
    setScoreTempoDraft(String(scoreTempo));
  }, [scoreTempo]);

  useEffect(() => {
    globalGridRef.current = globalGrid;
    localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify(globalGrid));
    const api = excalidrawAPIRef.current;
    const appState = api?.getAppState();
    if (api && (appState?.gridSize !== null || appState?.gridModeEnabled || appState?.objectsSnapModeEnabled)) {
      api.updateScene({ appState: { gridSize: null, gridModeEnabled: false, objectsSnapModeEnabled: false }, commitToHistory: false });
    }
  }, [globalGrid]);

  useEffect(() => {
    selectionFilterRef.current = selectionFilter;
    localStorage.setItem(SELECTION_FILTER_STORAGE_KEY, JSON.stringify(selectionFilter));
    const api = excalidrawAPIRef.current;
    if (!api) return;

    const elements = api.getSceneElements();
    const combinedSelection = {
      ...(api.getAppState().selectedElementIds || {}),
      ...runtimeCursorSelectionRef.current,
      ...selectedElementIdsRef.current,
    };
    const filteredSelection = filterSelectedElementIds(elements, combinedSelection, selectionFilter);
    const runtimeSelections = Object.fromEntries(
      elements
        .filter(element => filteredSelection[element.id] && isRuntimeCursor(element))
        .map(element => [element.id, true])
    );
    const nativeSelections = Object.fromEntries(
      Object.entries(filteredSelection).filter(([id]) => !runtimeSelections[id])
    );
    runtimeCursorSelectionRef.current = runtimeSelections;
    if (!selectionMapsEqual(nativeSelections, api.getAppState().selectedElementIds || {})) {
      api.updateScene({
        appState: {
          selectedElementIds: nativeSelections,
          selectedGroupIds: {},
          editingLinearElement: null,
          selectedLinearElement: null,
        },
        commitToHistory: false,
      });
    }
    if (!selectionMapsEqual(filteredSelection, selectedElementIdsRef.current)) {
      setSelectedElementIds(filteredSelection);
    }
  }, [excalidrawAPI, selectionFilter]);

  useEffect(() => {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(shortcutBindings));
  }, [shortcutBindings]);

  useEffect(() => {
    localStorage.setItem("drawerator_time_signature", JSON.stringify(scoreTimeSignature));
    localStorage.setItem("drawerator_transport_display", transportDisplayMode);
    localStorage.setItem("drawerator_transport_fps", String(transportFps));
    localStorage.setItem("drawerator_transport_loop", String(transportLoopEnabled));
    localStorage.setItem("drawerator_transport_loop_start", String(transportLoopStart));
    localStorage.setItem("drawerator_transport_loop_end", String(transportLoopEnd));
    localStorage.setItem("drawerator_midi_clock_mode", midiClockMode);
    localStorage.setItem("drawerator_follow_midi_clock_tempo", String(followMidiClockTempo));
    localStorage.setItem("drawerator_follow_midi_transport", String(followMidiTransport));
    localStorage.setItem("drawerator_latch_triggers_across_cursors", String(latchTriggersAcrossCursors));
  }, [followMidiClockTempo, followMidiTransport, latchTriggersAcrossCursors, midiClockMode, scoreTimeSignature, transportDisplayMode, transportFps, transportLoopEnabled, transportLoopEnd, transportLoopStart]);

  useEffect(() => {
    localStorage.setItem("drawerator_panel_layout_v1", JSON.stringify(panelLayouts));
    localStorage.removeItem("drawerator_transport_position");
  }, [panelLayouts]);

  useEffect(() => {
    localStorage.setItem("drawerator_iannix_scripts", JSON.stringify(iannixScripts));
  }, [iannixScripts]);

  useEffect(() => {
    if (activeIannixScriptId || iannixScripts.length === 0) return;
    setActiveIannixScriptId(iannixScripts[0].id);
    setIannixScriptSource(iannixScripts[0].source || "");
  }, [activeIannixScriptId, iannixScripts]);

  useEffect(() => {
    localStorage.setItem("drawerator_panel_visibility_v1", JSON.stringify(openPanels));
  }, [openPanels]);

  useEffect(() => {
    localStorage.setItem("drawerator_panel_dock_tabs_v1", JSON.stringify(activeDockPanels));
  }, [activeDockPanels]);

  useEffect(() => {
    localStorage.setItem("drawerator_collapsed_docks_v1", JSON.stringify(collapsedDocks));
  }, [collapsedDocks]);

  useEffect(() => {
    localStorage.setItem("drawerator_iannix_show_labels", String(showIannixLabels));
  }, [showIannixLabels]);

  useEffect(() => {
    localStorage.setItem("drawerator_iannix_transport_visible", String(showIannixTransport));
  }, [showIannixTransport]);

  useEffect(() => {
    midiOutputIdRef.current = midiOutputId;
    localStorage.setItem("drawerator_iannix_midi_output", midiOutputId);
    panicMidi();
    if (midiOutputId === MIDI_PORT_NONE) setInternalSynthStatus("Off");
    else if (midiOutputId === INTERNAL_MIDI_SYNTH_ID && !internalSynthRef.current) setInternalSynthStatus("Audio suspended");
    else if (midiOutputId !== MIDI_PORT_ALL && midiFallbackEnabledRef.current && getScoreMidiRoute().kind === "internal-unavailable") setInternalSynthStatus("Audio suspended");
  }, [getScoreMidiRoute, midiOutputId, panicMidi]);

  useEffect(() => {
    midiFallbackEnabledRef.current = midiFallbackEnabled;
    localStorage.setItem("drawerator_midi_internal_fallback", String(midiFallbackEnabled));
    panicMidi();
  }, [midiFallbackEnabled, panicMidi]);

  useEffect(() => {
    internalGmProgramsRef.current = internalGmPrograms;
    localStorage.setItem("drawerator_internal_gm_programs", JSON.stringify(internalGmPrograms));
  }, [internalGmPrograms]);

  useEffect(() => {
    localStorage.setItem("drawerator_history_midi_armed", String(historyMidiArmed));
  }, [historyMidiArmed]);

  useEffect(() => {
    midiInputIdRef.current = midiInputId;
    localStorage.setItem("drawerator_iannix_midi_input", midiInputId);
  }, [midiInputId]);

  useEffect(() => {
    if (!midiAccess) return undefined;
    const refreshPorts = () => {
      panicMidi();
      const outputs = [...midiAccess.outputs.values()].map(output => ({
        id: output.id,
        name: output.name || "Unnamed MIDI output",
        manufacturer: output.manufacturer || "",
        state: output.state,
      }));
      setMidiOutputs(outputs);
      const inputs = [...midiAccess.inputs.values()].map(input => ({
        id: input.id,
        name: input.name || "Unnamed MIDI input",
        manufacturer: input.manufacturer || "",
        state: input.state,
      }));
      setMidiInputs(inputs);
      if (midiInputIdRef.current !== MIDI_PORT_NONE && midiInputIdRef.current !== MIDI_PORT_ALL && !inputs.some(input => input.id === midiInputIdRef.current)) {
        midiInputIdRef.current = MIDI_PORT_NONE;
        setMidiInputId(MIDI_PORT_NONE);
      }
      setMidiStatus(`${inputs.length} in · ${outputs.length} out`);
    };
    refreshPorts();
    midiAccess.addEventListener?.("statechange", refreshPorts);
    return () => midiAccess.removeEventListener?.("statechange", refreshPorts);
  }, [midiAccess, panicMidi]);

  useEffect(() => {
    if (!scorePlaying || midiClockMode === "receive") return undefined;
    let animationFrame = 0;
    let previousTimestamp = performance.now();
    let lastCommitTimestamp = previousTimestamp;
    let pendingAdvanceSeconds = 0;
    const commitIntervalMs = 1000 / Math.max(1, Math.min(60, transportFps));
    const tick = (timestamp) => {
      const deltaSeconds = Math.max(0, Math.min(0.1, (timestamp - previousTimestamp) / 1000));
      previousTimestamp = timestamp;
      pendingAdvanceSeconds += deltaSeconds * scoreRate;
      if (timestamp - lastCommitTimestamp >= commitIntervalMs) {
        const advanceSeconds = pendingAdvanceSeconds;
        pendingAdvanceSeconds = 0;
        lastCommitTimestamp = timestamp;
        setScoreTime(time => {
          const next = time + advanceSeconds;
          if (transportLoopEnabled && transportLoopEnd > transportLoopStart && next >= transportLoopEnd) {
            return transportLoopStart + ((next - transportLoopStart) % (transportLoopEnd - transportLoopStart));
          }
          return next;
        });
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [midiClockMode, scorePlaying, scoreRate, transportFps, transportLoopEnabled, transportLoopEnd, transportLoopStart]);

  useEffect(() => {
    if (!midiAccess || midiClockMode !== "receive") return undefined;
    const inputs = resolveMidiInputs(midiAccess, midiInputId);
    if (inputs.length === 0) {
      setMidiClockStatus("No MIDI clock input");
      return undefined;
    }
    midiClockReceiverRef.current = createMidiClockReceiverState(midiClockTempoRef.current);
    midiClockRunningRef.current = false;
    let pendingClockSeconds = 0;
    let lastClockCommitTimestamp = 0;
    const clockCommitIntervalMs = 1000 / Math.max(1, Math.min(60, transportFps));
    const commitPendingClock = () => {
      if (!(pendingClockSeconds > 0)) return;
      const advanceSeconds = pendingClockSeconds;
      pendingClockSeconds = 0;
      setScoreTime(time => {
        const next = time + advanceSeconds;
        if (transportLoopEnabled && transportLoopEnd > transportLoopStart && next >= transportLoopEnd) {
          return transportLoopStart + ((next - transportLoopStart) % (transportLoopEnd - transportLoopStart));
        }
        return next;
      });
    };
    const handleMidiClock = event => {
      const [status, data1 = 0, data2 = 0] = event.data || [];
      const timestamp = Number(event.receivedTime) || performance.now();
      if (status === MIDI_REALTIME.start) {
        midiClockReceiverRef.current = createMidiClockReceiverState(midiClockTempoRef.current);
        midiClockRunningRef.current = true;
        pendingClockSeconds = 0;
        lastClockCommitTimestamp = timestamp;
        if (followMidiTransport) {
          setScoreTime(0);
          setScorePlaying(true);
        }
        setMidiClockStatus(`Receiving clock · ${inputs.length > 1 ? `${inputs.length} inputs` : inputs[0]?.name || "MIDI"}`);
      } else if (status === MIDI_REALTIME.continue) {
        midiClockRunningRef.current = true;
        if (followMidiTransport) setScorePlaying(true);
        setMidiClockStatus(`Receiving clock · ${inputs.length > 1 ? `${inputs.length} inputs` : inputs[0]?.name || "MIDI"}`);
      } else if (status === MIDI_REALTIME.stop) {
        commitPendingClock();
        midiClockRunningRef.current = false;
        if (followMidiTransport) setScorePlaying(false);
        setMidiClockStatus("External clock stopped");
      } else if (status === MIDI_REALTIME.songPosition) {
        pendingClockSeconds = 0;
        lastClockCommitTimestamp = timestamp;
        if (followMidiTransport) {
          setScoreTime(songPositionToSeconds(data1, data2, midiClockTempoRef.current));
        }
      } else if (status === MIDI_REALTIME.clock) {
        const receiverState = followMidiClockTempo
          ? midiClockReceiverRef.current
          : { ...midiClockReceiverRef.current, tempo: midiClockTempoRef.current };
        const clock = advanceMidiClockReceiver(receiverState, timestamp, {
          followTempo: followMidiClockTempo,
        });
        midiClockReceiverRef.current = clock.state;
        if (followMidiClockTempo && clock.ready && Math.abs(clock.tempo - midiClockTempoRef.current) >= 0.05) {
          const nextTempo = Number(clock.tempo.toFixed(2));
          midiClockTempoRef.current = nextTempo;
          setScoreTempo(nextTempo);
          setMidiClockStatus(`Following ${nextTempo.toFixed(2)} BPM · ${inputs.length > 1 ? `${inputs.length} inputs` : inputs[0]?.name || "MIDI"}`);
        }
        const shouldAdvance = followMidiTransport
          ? midiClockRunningRef.current
          : scorePlayingRef.current;
        if (shouldAdvance) {
          pendingClockSeconds += clock.secondsPerPulse;
          if (timestamp - lastClockCommitTimestamp >= clockCommitIntervalMs) {
            lastClockCommitTimestamp = timestamp;
            commitPendingClock();
          }
        }
      }
    };
    inputs.forEach(input => input.addEventListener?.("midimessage", handleMidiClock));
    const inputLabel = inputs.length > 1 ? `${inputs.length} inputs` : inputs[0]?.name || "MIDI";
    setMidiClockStatus(`Waiting for clock · ${inputLabel} · ${followMidiClockTempo ? "tempo follow" : `${midiClockTempoRef.current.toFixed(2)} BPM fixed`}`);
    return () => inputs.forEach(input => input.removeEventListener?.("midimessage", handleMidiClock));
  }, [followMidiClockTempo, followMidiTransport, midiAccess, midiClockMode, midiInputId, transportFps, transportLoopEnabled, transportLoopEnd, transportLoopStart]);

  useEffect(() => {
    if (!midiAccess || midiClockMode !== "send") return undefined;
    // MIDI clock is meaningful to hardware/software MIDI destinations, not the
    // embedded audio synth. "All" therefore remains external-only.
    const outputs = resolveExternalMidiOutputs(midiAccess, midiOutputId);
    if (outputs.length === 0) {
      setMidiClockStatus("No MIDI clock output");
      return undefined;
    }
    if (!scorePlaying) {
      outputs.forEach(output => output.send([MIDI_REALTIME.stop]));
      setMidiClockStatus("Clock output stopped");
      return undefined;
    }
    outputs.forEach(output => output.send([MIDI_REALTIME.start]));
    setMidiClockStatus(`Sending ${midiClockTempoRef.current.toFixed(2)} BPM · ${outputs.length > 1 ? `${outputs.length} outputs` : outputs[0]?.name || "MIDI"}`);
    let timeout = 0;
    const sendClock = () => {
      outputs.forEach(output => output.send([MIDI_REALTIME.clock]));
      timeout = window.setTimeout(sendClock, midiClockIntervalMs(midiClockTempoRef.current));
    };
    timeout = window.setTimeout(sendClock, midiClockIntervalMs(midiClockTempoRef.current));
    return () => {
      window.clearTimeout(timeout);
      outputs.forEach(output => output.send([MIDI_REALTIME.stop]));
    };
  }, [midiAccess, midiClockMode, midiOutputId, scorePlaying]);

  useEffect(() => {
    if (!transportDragging) return undefined;
    const handleMove = event => {
      const drag = transportDragRef.current;
      if (!drag) return;
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      if (!drag.started) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
        drag.started = true;
        updatePanelLayout(drag.panelId, {
          placement: PANEL_PLACEMENTS.FLOATING,
          x: Math.max(8, Math.min(window.innerWidth - drag.width - 8, event.clientX - drag.offsetX)),
          y: Math.max(8, Math.min(window.innerHeight - drag.height - 8, event.clientY - drag.offsetY)),
          width: drag.width,
        });
      }
      const width = drag.width;
      const height = drag.height;
      const target = getDockTarget(event.clientX, event.clientY, window.innerWidth, window.innerHeight, { allowBottom: true, transport: true });
      setDockPreview(target === PANEL_PLACEMENTS.BOTTOM ? target : null);
      updatePanelLayout(drag.panelId, {
        placement: PANEL_PLACEMENTS.FLOATING,
        x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - drag.offsetX)),
        y: Math.max(8, Math.min(window.innerHeight - height - 8, event.clientY - drag.offsetY)),
      });
    };
    const handleUp = () => {
      const drag = transportDragRef.current;
      if (drag?.started) {
        const target = getDockTarget(drag.clientX, drag.clientY, window.innerWidth, window.innerHeight, { allowBottom: true, transport: true });
        if (target === PANEL_PLACEMENTS.BOTTOM) setPanelPlacement(drag.panelId, PANEL_PLACEMENTS.BOTTOM);
      }
      transportDragRef.current = null;
      setTransportDragging(false);
      setDockPreview(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [setPanelPlacement, transportDragging, updatePanelLayout]);

  useEffect(() => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    const frame = evaluateScoreFrame(
      elements,
      scoreTime,
      previousCursorStatesRef.current,
    );
    previousCursorStatesRef.current = frame.nextCursorPaths;

    const elementMap = new Map(elements.map(element => [element.id, element]));

    const collisionState = advanceScoreCollisionState(
      frame.collisions,
      activeScoreCollisionsRef.current,
      scorePlaying,
      {
        nowMs: performance.now(),
        lockouts: triggerCollisionLockoutsRef.current,
        triggerDurations: frame.triggerDurations,
        latchTriggersAcrossCursors,
      },
    );
    activeScoreCollisionsRef.current = collisionState.active;
    triggerCollisionLockoutsRef.current = collisionState.lockouts;
    if (!scorePlaying) return;

    const entered = collisionState.entered;
    if (entered.length === 0) return;

    const now = Date.now();
    const nextEvents = entered.map(key => {
      const [cursorId, triggerId] = key.split(":");
      const trigger = elementMap.get(triggerId);
      const triggerData = normalizeIannixData(trigger?.customData?.iannix);
      const pulseMs = Math.max(80, triggerData.trigger.duration * 1000);
      triggerPulseUntilRef.current.set(triggerId, now + pulseMs);
      window.setTimeout(() => setScoreRuntimeNonce(nonce => nonce + 1), pulseMs + 16);
      let midi = null;
      let midiPattern = null;
      let midiContext = null;
      if (triggerData.trigger.midiEnabled) {
        try {
          const cursor = frame.cursors.find(candidate => candidate.element.id === cursorId);
          midiContext = getIannixTriggerMidiContext(cursor, triggerData, trigger);
          midiPattern = triggerData.trigger.midiPattern;
          const message = parseIannixMidiPattern(midiPattern, midiContext);
          const outputs = getScoreMidiRoute().outputs;
          if (outputs.length === 0) throw new Error("No MIDI output is selected.");
          outputs.forEach(output => midiVoiceTrackerRef.current.send(output, message, performance.now()));
          midi = message.kind === "cc"
            ? { kind: "cc", channel: message.channel, controller: message.controller, value: message.value }
            : { kind: "note", channel: message.channel, note: message.note, velocity: message.velocity };
          setMidiStatus(`Sent ${describeIannixMidiMessage(message)}`);
          historyController.record({
            kind: "midi",
            transportTime: scoreTime,
            source: "iannix-trigger",
            args: {
              description: describeIannixMidiMessage(message),
              pattern: midiPattern,
              context: midiContext,
              message: midi,
              cursorId,
              triggerId,
            },
          });
        } catch (error) {
          setMidiStatus(error.message || "MIDI send failed");
        }
      }
      return {
        id: `${key}:${now}`,
        cursorId,
        triggerId,
        time: scoreTime,
        label: triggerData.label || `Trigger ${triggerId.slice(0, 6)}`,
        midi,
      };
    });
    nextEvents.forEach(event => eventBus.emit("iannix.trigger.enter", event, {
      source: "iannix-trigger",
      time: performance.now(),
    }));
    setScoreEvents(events => [...nextEvents, ...events].slice(0, 20));
    setScoreRuntimeNonce(nonce => nonce + 1);
  }, [excalidrawAPI, getScoreMidiRoute, historyController, latchTriggersAcrossCursors, modifierUpdateNonce, scorePlaying, scoreTime]);

  useEffect(() => {
    if (!excalidrawAPI || autoKeyApplyingRef.current || isMouseDownRef.current) return;
    const elements = excalidrawAPI.getSceneElements();
    const hasAutomation = elements.some(element => {
      const tracks = element.customData?.draweratorAutomation?.tracks;
      return tracks && typeof tracks === "object" && Object.keys(tracks).length > 0;
    });
    if (!hasAutomation) return;
    let changed = false;
    const evaluated = elements.map(element => {
      let next = evaluateElementAutomation(element, scoreTime);
      if (next !== element && hasCubicBezierGeometry(next)) next = setElementBezierGeometry(next, next.customData.draweratorGeometry);
      if (next !== element && JSON.stringify(next) !== JSON.stringify(element)) changed = true;
      return next;
    });
    if (!changed) return;
    autoKeyApplyingRef.current = true;
    historySuppressSceneRef.current += 1;
    excalidrawAPI.updateScene({ elements: evaluated, commitToHistory: false });
    window.setTimeout(() => {
      autoKeyApplyingRef.current = false;
      historySuppressSceneRef.current = Math.max(0, historySuppressSceneRef.current - 1);
      lastSceneElementsRef.current = new Map(
        excalidrawAPI.getSceneElementsIncludingDeleted().map(element => [element.id, element])
      );
    }, 0);
  }, [excalidrawAPI, scoreTime]);

  // A linked cursor is rendered by the score overlay at its runtime position.
  // Keep its authored Excalidraw element invisible without losing the opacity
  // that must be restored when it is unlinked or changes role.
  useEffect(() => {
    if (!excalidrawAPI) return;
    let changed = false;
    const sceneElements = excalidrawAPI.getSceneElements();
    const byId = new Map(sceneElements.map(element => [element.id, element]));
    const nextElements = sceneElements.map(element => {
      let next = element;
      if (isRuntimeCursor(element)) {
        const data = normalizeIannixData(element.customData?.iannix);
        const supportCurve = byId.get(data.cursor.curveId);
        if (supportCurve && !supportCurve.isDeleted) {
          next = snapCursorHostToCurveStart(next, supportCurve, data.cursor.followTangent);
        }
      }
      next = enforceRuntimeCursorHostVisibility(next);
      if (next !== element) changed = true;
      return next;
    });
    if (changed) excalidrawAPI.updateScene({ elements: nextElements });
  }, [excalidrawAPI, modifierUpdateNonce]);

  // Excalidraw renders selection feedback even for a zero-opacity line. Keep
  // linked runtime cursors selected in Drawerator state, but migrate them out
  // of Excalidraw's native selection so their hidden authoring hosts never
  // appear at their stored coordinates.
  useEffect(() => {
    if (!excalidrawAPI) return;
    const nativeSelections = excalidrawAPI.getAppState().selectedElementIds || {};
    const runtimeSelections = Object.fromEntries(
      excalidrawAPI.getSceneElements()
        .filter(element => nativeSelections[element.id] && isRuntimeCursor(element))
        .map(element => [element.id, true])
    );
    if (Object.keys(runtimeSelections).length === 0) return;
    runtimeCursorSelectionRef.current = {
      ...runtimeCursorSelectionRef.current,
      ...runtimeSelections,
    };
    const nextNativeSelections = Object.fromEntries(
      Object.entries(nativeSelections).filter(([id]) => !runtimeSelections[id])
    );
    excalidrawAPI.updateScene({
      appState: {
        selectedElementIds: nextNativeSelections,
        selectedGroupIds: {},
        editingLinearElement: null,
        selectedLinearElement: null,
      },
    });
    setSelectedElementIds(previous => ({ ...previous, ...runtimeSelections }));
  }, [excalidrawAPI, selectedElementIds]);

  const [activeBrushCode, setActiveBrushCode] = useState(() => {
    const savedId = localStorage.getItem("drawerator_active_brush_id");
    const id = savedId && savedId !== "normal" ? savedId : "simple";
    
    const savedPalette = localStorage.getItem("drawerator_brush_palette");
    let currentPalette = [];
    if (savedPalette) {
      try { currentPalette = JSON.parse(savedPalette); } catch (e) {}
    }
    
    const defaultPresets = [
      { id: "simple", name: "Simple Line", code: PRESET_BRUSHES.simple.code, isPreset: true },
      { id: "hairy", name: "Hairy Brush (Calligraphy)", code: PRESET_BRUSHES.hairy.code, isPreset: true },
      { id: "growingHairy", name: "Growing Hairy Brush (Collision Stop)", code: PRESET_BRUSHES.growingHairy.code, isPreset: true },
      { id: "pressure", name: "Calligraphy Pencil (Pressure-Sensitive)", code: PRESET_BRUSHES.pressure.code, isPreset: true },
      { id: "ribbon", name: "Ribbon Brush (Double Track)", code: PRESET_BRUSHES.ribbon.code, isPreset: true },
      { id: "sketchy", name: "Sketchy Multi-line", code: PRESET_BRUSHES.sketchy.code, isPreset: true },
      { id: "walking", name: "Walking Brush (Time-Oscillated)", code: PRESET_BRUSHES.walking.code, isPreset: true },
      { id: "rake", name: "Rake Brush (Variable Teeth)", code: PRESET_BRUSHES.rake.code, isPreset: true },
      { id: "zenRake", name: "Zen Garden Rake (Parallel Grooves)", code: PRESET_BRUSHES.zenRake.code, isPreset: true },
      { id: "rdp", name: "Simplify (RDP)", code: PRESET_BRUSHES.rdp.code, isPreset: true },
      { id: "vw", name: "Simplify (VW)", code: PRESET_BRUSHES.vw.code, isPreset: true },
      { id: "smooth", name: "Laplacian Smooth", code: PRESET_BRUSHES.smooth.code, isPreset: true },
      { id: "taubin", name: "Taubin Smooth", code: PRESET_BRUSHES.taubin.code, isPreset: true },
      { id: "resample", name: "Resample Uniformly", code: PRESET_BRUSHES.resample.code, isPreset: true },
      { id: "joint", name: "Close & Smooth Joint", code: PRESET_BRUSHES.joint.code, isPreset: true },
      { id: "snap", name: "Snap to Grid", code: PRESET_BRUSHES.snap.code, isPreset: true },
      { id: "hobby", name: "Hobby Spline", code: PRESET_BRUSHES.hobby.code, isPreset: true }
    ];

    if (!currentPalette || currentPalette.length === 0) {
      currentPalette = defaultPresets;
    } else {
      defaultPresets.forEach(preset => {
        const idx = currentPalette.findIndex(b => b.id === preset.id);
        if (idx === -1) {
          currentPalette.push(preset);
        } else {
          currentPalette[idx] = { ...currentPalette[idx], code: preset.code, name: preset.name, isPreset: true };
        }
      });
    }

    const brush = currentPalette.find(b => b.id === id);
    return brush ? brush.code : "";
  });

  const [brushCompileError, setBrushCompileError] = useState("");
  const [brushParams, setBrushParams] = useState([]);
  const [saveAsBrushName, setSaveAsBrushName] = useState(null);
  const [brushSaveMessage, setBrushSaveMessage] = useState("");
  const [editingModifierTarget, setEditingModifierTarget] = useState(null);
  const pendingBrushParamsRef = useRef(null);
  const pendingModifierRetargetRef = useRef(null);
  const lastParamsBrushIdRef = useRef(activeBrushId);
  const compiledGeneratorRef = useRef(null);
  const processedModifierVersionsRef = useRef({});
  const restoredHistoryElementVersionsRef = useRef({});
  const suppressedModifierSyncVersionsRef = useRef({});
  const linearEditPointsRef = useRef({});
  const evaluatingModifiersRef = useRef(false);
  const lastOverlayVersionRef = useRef({});

  useEffect(() => {
    localStorage.setItem("drawerator_brush_palette", JSON.stringify(brushPalette));

    const pending = pendingModifierRetargetRef.current;
    if (!pending || !brushPalette.some(brush => brush.id === pending.brush.id)) return;
    const { target, brush, params } = pending;
    pendingModifierRetargetRef.current = null;

    if (target.elementId && excalidrawAPI) {
      const parentElement = excalidrawAPI.getSceneElements().find(element => element.id === target.elementId);
      if (parentElement) {
        const updatedModifiers = replaceModifierBrushAt(
          parentElement.customData?.modifiers || [],
          target.modifierIndex,
          brush,
          params
        );
        updateModifiedElementInScene(parentElement.id, updatedModifiers);
      }
    } else if (!target.elementId) {
      setGlobalModifiers(previous => replaceModifierBrushAt(previous, target.modifierIndex, brush, params));
    }
  }, [brushPalette]);

  useEffect(() => {
    localStorage.setItem("drawerator_show_debug_layer", showDebugLayer);
  }, [showDebugLayer]);

  useEffect(() => {
    localStorage.setItem("drawerator_active_brush_id", activeBrushId);
    if (activeBrushId === "normal") {
      setActiveBrushCode("");
    } else {
      const brush = brushPalette.find(b => b.id === activeBrushId);
      if (brush) {
        setActiveBrushCode(brush.code);
      }
    }
  }, [activeBrushId, brushPalette]);

  useEffect(() => {
    if (activeBrushId === "normal") {
      setBrushParams([]);
      return;
    }
    const parsed = parseParameters(activeBrushCode);
    const pending = pendingBrushParamsRef.current;
    const brushChanged = lastParamsBrushIdRef.current !== activeBrushId;
    setBrushParams(prev => {
      return parsed.map(newParam => {
        if (pending?.brushId === activeBrushId && pending.params?.[newParam.name] !== undefined) {
          return { ...newParam, value: pending.params[newParam.name] };
        }
        const existing = prev.find(p => p.name === newParam.name);
        if (!brushChanged && existing) {
          return { ...newParam, value: existing.value };
        }
        return newParam;
      });
    });
    if (pending?.brushId === activeBrushId) pendingBrushParamsRef.current = null;
    lastParamsBrushIdRef.current = activeBrushId;
  }, [activeBrushCode, activeBrushId]);

  useEffect(() => {
    if (activeBrushId === "normal") {
      setBrushCompileError("");
      compiledGeneratorRef.current = null;
      return;
    }
    const res = compileUserBrush(activeBrushCode, brushParams);
    setBrushCompileError(res.error);
    if (!res.error) {
      compiledGeneratorRef.current = res.generator;
    }
  }, [activeBrushCode, activeBrushId, brushParams]);

  const saveBrushChanges = () => {
    if (activeBrushId === "normal") return;
    const brush = brushPalette.find(b => b.id === activeBrushId);
    if (!brush) return;
    if (brush.isPreset) {
      saveBrushCopy();
      return;
    }
    const finalCode = updateCodeWithParamValues(activeBrushCode, brushParams);
    setBrushPalette(prev => prev.map(b => b.id === activeBrushId ? { ...b, code: finalCode } : b));
    setActiveBrushCode(finalCode);
    setBrushSaveMessage("Changes saved to this brush.");
  };

  const saveBrushCopy = () => {
    const brush = brushPalette.find(b => b.id === activeBrushId) || {};
    const name = saveAsBrushName?.trim();
    if (!name) return;
    
    const newId = `user-${Date.now()}`;
    const finalCode = updateCodeWithParamValues(activeBrushCode, brushParams);
    const newBrush = {
      id: newId,
      name: name.trim(),
      code: finalCode,
      isPreset: false,
      type: brush.type || "brush"
    };
    
    const currentParams = Object.fromEntries(brushParams.map(param => [param.name, param.value]));
    if (editingModifierTarget) {
      pendingModifierRetargetRef.current = {
        target: editingModifierTarget,
        brush: newBrush,
        params: currentParams
      };
      setEditingModifierTarget(null);
    }

    setBrushPalette(prev => [...prev, newBrush]);
    setActiveBrushId(newId);
    setActiveBrushCode(finalCode);
    setSaveAsBrushName(null);
    setBrushSaveMessage(editingModifierTarget
      ? `Saved “${newBrush.name}” and replaced the modifier in the stack.`
      : `Saved “${newBrush.name}” to the brush palette.`);
  };

  const deleteBrush = () => {
    if (activeBrushId === "normal") return;
    const brush = brushPalette.find(b => b.id === activeBrushId);
    if (!brush || brush.isPreset) return;
    
    if (window.confirm(`Are you sure you want to delete "${brush.name}"?`)) {
      setBrushPalette(prev => prev.filter(b => b.id !== activeBrushId));
      setActiveBrushId("hairy");
    }
  };

  const createNewBrush = () => {
    const id = `user-${Date.now()}`;
    const brush = {
      id,
      name: "Untitled Brush",
      code: `(points, globals) => {\n  return [points];\n}`,
      isPreset: false,
      type: "brush",
    };
    setEditingModifierTarget(null);
    setBrushPalette(previous => [...previous, brush]);
    setActiveBrushId(id);
    setActiveBrushCode(brush.code);
    setBrushSaveMessage("Created a new brush script.");
  };

  const [customBrushActive, setCustomBrushActive] = useState(false);
  const modifierDrawingActive = customBrushActive && globalModifiers.length > 0;
  const [customBrushRoundness, setCustomBrushRoundness] = useState(() => localStorage.getItem("drawerator_custom_brush_roundness") !== "false");
  
  useEffect(() => {
    localStorage.setItem("drawerator_custom_brush_roundness", customBrushRoundness);
  }, [customBrushRoundness]);
  const [customContextMenu, setCustomContextMenu] = useState(null);

  const isMouseDownRef = useRef(false);
  useEffect(() => {
    const closeMenu = () => setCustomContextMenu(null);
    const handleDown = () => { isMouseDownRef.current = true; };
    const handleUp = () => { isMouseDownRef.current = false; };
    const clearFinishedBrushPreview = () => {
      if (nativeLineGridPointsRef.current && excalidrawAPIRef.current?.getAppState()?.activeTool?.type === "line") return;
      // The canvas-level pointer-up handler snapshots a completed stroke during
      // capture. This bubble-phase cleanup also covers releases outside the
      // canvas, which otherwise leave the last live brush preview on screen.
      isDrawingRef.current = false;
      rawCursorRef.current = null;
      livePointsRef.current = [];
      setShiftHeld(false);
      setDrawingPoints([]);
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("pointerdown", handleDown, { capture: true });
    window.addEventListener("pointerup", handleUp, { capture: true });
    window.addEventListener("pointerup", clearFinishedBrushPreview);
    window.addEventListener("pointercancel", clearFinishedBrushPreview);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("pointerdown", handleDown, { capture: true });
      window.removeEventListener("pointerup", handleUp, { capture: true });
      window.removeEventListener("pointerup", clearFinishedBrushPreview);
      window.removeEventListener("pointercancel", clearFinishedBrushPreview);
    };
  }, []);

  const [drawingPoints, setDrawingPoints] = useState([]);
  const [pendingStrokePreview, setPendingStrokePreview] = useState(null);
  const pendingStrokePreviewIdRef = useRef(0);
  const [shiftHeld, setShiftHeld] = useState(false);
  const isDrawingRef = useRef(false);
  const livePointsRef = useRef([]);
  const rawCursorRef = useRef(null);
  const lastCanvasPointerRef = useRef(null);
  const wasShiftHeldRef = useRef(false);
  const strokeStartTimeRef = useRef(0);
  const brushElapsedRef = useRef(0);
  const [, setBrushAnimationTick] = useState(0);
  const lastStrokeColorRef = useRef("#000000");

  useEffect(() => {
    if (!modifierDrawingActive || drawingPoints.length < 2 || !isDrawingRef.current) return;
    let animationFrame = 0;
    let lastPaintTime = 0;
    const animate = (timestamp) => {
      if (!isDrawingRef.current) return;
      brushElapsedRef.current = Math.max(0, Date.now() - strokeStartTimeRef.current);
      if (timestamp - lastPaintTime >= 33) {
        lastPaintTime = timestamp;
        setBrushAnimationTick(tick => tick + 1);
      }
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [modifierDrawingActive, drawingPoints.length]);

  const getThemeColor = (color) => {
    if (!color) return "var(--color-primary)";
    if (theme === "dark") {
      if (
        color === "#000000" ||
        color === "#1c1c1e" ||
        color === "#1e1e1e" ||
        color === "#121212" ||
        color === "rgb(0,0,0)" ||
        color === "black"
      ) {
        return "#ffffff";
      }
    } else {
      if (
        color === "#ffffff" ||
        color === "rgb(255,255,255)" ||
        color === "white"
      ) {
        return "#000000";
      }
    }
    return color;
  };

  const getCanvasCoords = (clientX, clientY, snapTarget = "input") => {
    if (!excalidrawAPI) return [clientX, clientY];
    const appState = excalidrawAPI.getAppState();
    const res = viewportCoordsToSceneCoords({ clientX, clientY }, appState);
    const grid = globalGridRef.current;
    if (grid.snap.mode !== "off" && grid.snap.targets[snapTarget]) {
      return snapPointToGrid(grid, [res.x, res.y], { zoom: appState.zoom?.value || 1 }).point;
    }
    return [res.x, res.y];
  };

  const mapCanvasToScreen = (cx, cy) => {
    if (!excalidrawAPI) return [cx, cy];
    const appState = excalidrawAPI.getAppState();
    const res = sceneCoordsToViewportCoords({ sceneX: cx, sceneY: cy }, appState);
    return [res.x, res.y];
  };

  const emitPointerInputSample = (event, phase, coords) => {
    const nativeEvent = event?.nativeEvent || event || {};
    const sample = inputBus.emit({
      source: nativeEvent.pointerType || "pointer",
      deviceId: `${nativeEvent.pointerType || "pointer"}:${nativeEvent.pointerId ?? 0}`,
      pointerId: nativeEvent.pointerId ?? 0,
      phase,
      time: Number.isFinite(nativeEvent.timeStamp) ? nativeEvent.timeStamp : performance.now(),
      scene: { x: coords[0], y: coords[1] },
      pressure: Number.isFinite(nativeEvent.pressure) ? nativeEvent.pressure : 0.5,
      tiltX: nativeEvent.tiltX,
      tiltY: nativeEvent.tiltY,
      twist: nativeEvent.twist,
      buttons: nativeEvent.buttons ?? (phase === "start" ? 1 : 0),
      data: {
        strokeTime: coords.strokeTime || 0,
        speed: coords.speed || 0,
      },
    });
    strokeInputSamplesRef.current.push(sample);
    return sample;
  };

  const getBezierEditElement = () => excalidrawAPI?.getSceneElements().find(element => element.id === bezierEditElementId && !element.isDeleted && hasCubicBezierGeometry(element)) || null;

  const findBezierControlAtPointer = (element, clientX, clientY) => {
    const controls = getBezierWorldAnchors(element);
    let nearest = null;
    controls.forEach((control, index) => {
      [["anchor", control.anchor], ["in", control.in], ["out", control.out]].forEach(([part, world]) => {
        if (!world) return;
        const screen = mapCanvasToScreen(world[0], world[1]);
        const candidateDistance = Math.hypot(screen[0] - clientX, screen[1] - clientY);
        const threshold = part === "anchor" ? 11 : 9;
        if (candidateDistance <= threshold && (!nearest || candidateDistance < nearest.distance)) nearest = { index, part, distance: candidateDistance };
      });
    });
    return nearest;
  };

  const findBezierPathAtPointer = (clientX, clientY, candidates = null) => {
    const rawCoords = getCanvasCoords(clientX, clientY, null);
    const paths = candidates || excalidrawAPI?.getSceneElements().filter(candidate => !candidate.isDeleted && hasCubicBezierGeometry(candidate)) || [];
    let nearest = null;
    for (const element of paths) {
      const location = findNearestBezierLocation(element, rawCoords);
      const screenPath = getBezierWorldPath(element).map(point => mapCanvasToScreen(point[0], point[1]));
      let screenDistance = Infinity;
      for (let index = 1; index < screenPath.length; index += 1) {
        const start = screenPath[index - 1];
        const end = screenPath[index];
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const lengthSquared = dx * dx + dy * dy;
        const amount = lengthSquared > 0
          ? Math.max(0, Math.min(1, ((clientX - start[0]) * dx + (clientY - start[1]) * dy) / lengthSquared))
          : 0;
        screenDistance = Math.min(screenDistance, Math.hypot(
          clientX - (start[0] + dx * amount),
          clientY - (start[1] + dy * amount),
        ));
      }
      if (location && (!nearest || screenDistance < nearest.screenDistance)) nearest = { element, location, screenDistance };
    }
    return nearest;
  };

  const enterBezierEditAtPointer = (e, candidates = null) => {
    if (!excalidrawAPI || excalidrawAPI.getAppState().activeTool?.type !== "selection") return false;
    const selectableCandidates = (candidates || excalidrawAPI.getSceneElements().filter(
      candidate => !candidate.isDeleted && hasCubicBezierGeometry(candidate)
    )).filter(element => selectionFilterAllowsElement(selectionFilterRef.current, element));
    const hit = findBezierPathAtPointer(e.clientX, e.clientY, selectableCandidates);
    if (!hit || hit.screenDistance > 12) return false;
    e.preventDefault();
    e.stopPropagation();
    setBezierEditElementId(hit.element.id);
    setBezierSelectedAnchor(Math.min(hit.location.segmentIndex + 1, hit.element.customData.draweratorGeometry.anchors.length - 1));
    excalidrawAPI.updateScene({
      appState: {
        selectedElementIds: { [hit.element.id]: true },
        selectedGroupIds: {},
        editingLinearElement: null,
        selectedLinearElement: null,
      },
    });
    return true;
  };

  const handleCanvasDoubleClick = e => {
    enterBezierEditAtPointer(e);
  };

  const handleBezierPointerDown = e => {
    const element = getBezierEditElement();
    if (!element || e.button !== 0) return false;
    const hit = findBezierControlAtPointer(element, e.clientX, e.clientY);
    if (hit) {
      e.preventDefault();
      e.stopPropagation();
      setBezierSelectedAnchor(hit.index);
      bezierDragRef.current = { elementId: element.id, anchorIndex: hit.index, part: hit.part, pointerId: e.pointerId };
      e.currentTarget?.setPointerCapture?.(e.pointerId);
      return true;
    }
    const coords = getCanvasCoords(e.clientX, e.clientY);
    const nearest = findNearestBezierLocation(element, coords);
    if (e.detail >= 2 && nearest && nearest.distance <= 14 / Math.max(0.1, excalidrawAPI.getAppState().zoom.value || 1)) {
      e.preventDefault();
      e.stopPropagation();
      const geometry = splitBezierSegment(element.customData.draweratorGeometry, nearest.segmentIndex, nearest.t);
      commitBezierElement(element.id, geometry);
      setBezierSelectedAnchor(nearest.segmentIndex + 1);
      return true;
    }
    return false;
  };

  const handleSelectedBezierAnchorPointerDown = e => {
    if (!excalidrawAPI || e.button !== 0 || e.metaKey || e.ctrlKey) return false;
    const appState = excalidrawAPI.getAppState();
    if (appState.activeTool?.type !== "selection") return false;
    const selected = excalidrawAPI.getSceneElements().filter(element =>
      appState.selectedElementIds?.[element.id] && !element.isDeleted && hasCubicBezierGeometry(element)
    );
    let nearest = null;
    for (const element of selected) {
      getBezierWorldAnchors(element).forEach((control, index) => {
        const screen = mapCanvasToScreen(control.anchor[0], control.anchor[1]);
        const distance = Math.hypot(screen[0] - e.clientX, screen[1] - e.clientY);
        if (distance <= 11 && (!nearest || distance < nearest.distance)) nearest = { element, index, distance };
      });
    }
    if (!nearest) return false;
    e.preventDefault();
    e.stopPropagation();
    setBezierSelectedAnchor(nearest.index);
    bezierDragRef.current = {
      elementId: nearest.element.id,
      anchorIndex: nearest.index,
      part: "anchor",
      pointerId: e.pointerId,
      directSelection: true,
    };
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    return true;
  };

  const handleBezierPointerMove = e => {
    const drag = bezierDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return false;
    const element = excalidrawAPI?.getSceneElements().find(candidate => candidate.id === drag.elementId && !candidate.isDeleted && hasCubicBezierGeometry(candidate));
    if (!element || element.id !== drag.elementId) return false;
    e.preventDefault();
    e.stopPropagation();
    const world = getCanvasCoords(e.clientX, e.clientY, "points");
    const local = bezierWorldPointToLocal(element, world);
    const anchor = element.customData.draweratorGeometry.anchors[drag.anchorIndex];
    const value = drag.part === "anchor" ? local : [local[0] - anchor.x, local[1] - anchor.y];
    const geometry = updateBezierAnchor(element.customData.draweratorGeometry, drag.anchorIndex, drag.part, value, { breakHandles: e.altKey });
    commitBezierElement(element.id, geometry, { commitToHistory: false });
    return true;
  };

  const handleBezierPointerUp = e => {
    const drag = bezierDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return false;
    e.preventDefault();
    e.stopPropagation();
    bezierDragRef.current = null;
    const element = excalidrawAPI?.getSceneElements().find(candidate => candidate.id === drag.elementId && !candidate.isDeleted && hasCubicBezierGeometry(candidate));
    if (element) {
      const reframed = reframeBezierElement(element);
      const nextModifierVersion = Number(element.customData?.version || 0) + 1;
      const nextElements = excalidrawAPI.getSceneElementsIncludingDeleted().map(candidate => candidate.id === element.id
        ? {
          ...reframed,
          version: (element.version || 0) + 1,
          versionNonce: Math.floor(Math.random() * 0x7fffffff),
          updated: Date.now(),
          customData: {
            ...reframed.customData,
            version: nextModifierVersion,
            excalidrawVersion: nextModifierVersion,
          },
        }
        : candidate);
      excalidrawAPI.updateScene({ elements: nextElements, commitToHistory: true });
      setModifierUpdateNonce(nonce => nonce + 1);
    }
    e.currentTarget?.releasePointerCapture?.(e.pointerId);
    return true;
  };

  const handleCanvasPointerDown = (e) => {
    if (!excalidrawAPI) return;
    lastCanvasPointerRef.current = [e.clientX, e.clientY];
    if (e.button !== 0) return;
    gridInteractionRef.current = { moving: false, resizing: false, pointEditing: false, pointIndices: null };

    if (handleBezierPointerDown(e)) return;

    const targetElement = e.target;
    if (
      targetElement.tagName === "INPUT" ||
      targetElement.tagName === "TEXTAREA" ||
      targetElement.tagName === "SELECT" ||
      targetElement.tagName === "OPTION" ||
      targetElement.tagName === "BUTTON" ||
      targetElement.closest("button") ||
      targetElement.closest("input") ||
      targetElement.closest("textarea") ||
      targetElement.closest("select") ||
      targetElement.closest(".sidebar") ||
      targetElement.closest(".excalidraw-sidebar") ||
      targetElement.closest(".drawerator-panel-shell") ||
      targetElement.closest("#settings-overlay") ||
      targetElement.closest(".settings-modal") ||
      targetElement.closest(".context-menu") ||
      targetElement.closest(".dropdown-menu") ||
      targetElement.closest(".drawerator-top-right-wrapper") ||
      targetElement.closest(".theme-btn-top-left") ||
      targetElement.closest(".sidebar-trigger")
    ) {
      return;
    }

    const currentAppState = excalidrawAPI.getAppState();
    const activeTool = currentAppState.activeTool?.type;
    if (activeTool === "selection") {
      if (handleSelectedBezierAnchorPointerDown(e)) return;
      const sceneBeziers = excalidrawAPI.getSceneElements().filter(element => !element.isDeleted && hasCubicBezierGeometry(element));
      const selectedBezier = sceneBeziers.find(element => currentAppState.selectedElementIds?.[element.id]);
      const now = Date.now();
      const previousBezierPointer = lastBezierPointerDownRef.current;
      const repeatedPointer = previousBezierPointer &&
        now - previousBezierPointer.time <= 450 &&
        Math.hypot(e.clientX - previousBezierPointer.x, e.clientY - previousBezierPointer.y) <= 8;
      lastBezierPointerDownRef.current = { time: now, x: e.clientX, y: e.clientY };
      if (repeatedPointer && enterBezierEditAtPointer(e, sceneBeziers)) {
        lastBezierPointerDownRef.current = null;
        return;
      }
      if ((e.metaKey || e.ctrlKey) && selectedBezier) {
        // Canonical Bézier paths must never enter Excalidraw's sampled-point
        // editor. Its white points edit the derived host polyline rather than
        // Drawerator's anchors and handles, so those edits cannot be snapped or
        // persisted coherently.
        if (enterBezierEditAtPointer(e, [selectedBezier])) return;
      }
      const elements = excalidrawAPI.getSceneElements();
      const frame = evaluateScoreFrame(elements, scoreTime, undefined, { detectCollisions: false });
      const zoom = excalidrawAPI.getAppState().zoom.value || 1;
      let nearest = null;
      const distanceToSegment = (point, start, end) => {
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const lengthSquared = dx * dx + dy * dy;
        const t = lengthSquared > 0
          ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared))
          : 0;
        return Math.hypot(point[0] - (start[0] + dx * t), point[1] - (start[1] + dy * t));
      };
      for (const cursor of frame.cursors) {
        if (!selectionFilterAllowsElement(selectionFilterRef.current, cursor.element)) continue;
        const visualTransform = visualCursorTransformsRef.current.get(cursor.element.id)?.transform || cursor.transform;
        for (const track of getElementRenderedCanvasTracks(cursor.element)) {
          const canvasPath = transformPaths([track.points], visualTransform)[0];
          const screenPath = canvasPath.map(point => mapCanvasToScreen(point[0], point[1]));
          for (let index = 1; index < screenPath.length; index++) {
            const distance = distanceToSegment([e.clientX, e.clientY], screenPath[index - 1], screenPath[index]);
            const threshold = Math.max(7, (track.strokeWidth || 1) * zoom + 5);
            if (distance <= threshold && (!nearest || distance < nearest.distance)) {
              nearest = {
                id: cursor.element.id,
                distance,
              };
            }
          }
        }
      }
      if (nearest) {
        e.preventDefault();
        e.stopPropagation();
        const current = selectedElementIds || {};
        const additive = e.metaKey || e.ctrlKey || e.shiftKey;
        const next = additive ? { ...current } : {};
        if (additive && next[nearest.id]) delete next[nearest.id];
        else next[nearest.id] = true;
        const runtimeSelections = Object.fromEntries(
          excalidrawAPI.getSceneElements()
            .filter(element => next[element.id] && isRuntimeCursor(element))
            .map(element => [element.id, true])
        );
        runtimeCursorSelectionRef.current = runtimeSelections;
        const nativeSelections = Object.fromEntries(
          Object.entries(next).filter(([id]) => !runtimeSelections[id])
        );
        excalidrawAPI.updateScene({
          appState: { selectedElementIds: nativeSelections, selectedGroupIds: {}, editingLinearElement: null, selectedLinearElement: null },
        });
        setSelectedElementIds(next);
        return;
      }
      if (!e.metaKey && !e.ctrlKey && !e.shiftKey) runtimeCursorSelectionRef.current = {};
    }

    if (!modifierDrawingActive) {
      if (activeTool !== "freedraw" && activeTool !== "line") return;
      const nativeAppState = excalidrawAPI.getAppState();
      if (nativeAppState.currentItemStrokeColor && !isColorTransparent(nativeAppState.currentItemStrokeColor)) {
        lastStrokeColorRef.current = nativeAppState.currentItemStrokeColor;
      }
      const coords = getCanvasCoords(e.clientX, e.clientY);
      coords.time = Date.now();
      coords.strokeTime = 0;
      coords.speed = 0;
      strokeInputSamplesRef.current = [];
      strokeRecordingSuppressedRef.current = true;
      emitPointerInputSample(e, "start", coords);
      const gridInputSnap = globalGridRef.current.snap.mode !== "off" && globalGridRef.current.snap.targets.input;
      if (activeTool === "line" && gridInputSnap) {
        const current = nativeLineGridPointsRef.current;
        const points = current?.points ? [...current.points] : [];
        const previous = points[points.length - 1];
        if (!previous || Math.hypot(previous[0] - coords[0], previous[1] - coords[1]) > 1e-8) points.push(coords);
        nativeLineGridPointsRef.current = {
          elementId: current?.elementId || excalidrawAPI.getAppState().multiElement?.id || excalidrawAPI.getAppState().editingLinearElement?.elementId || null,
          points,
        };
        setDrawingPoints(points);
        excalidrawAPI.updateScene({ appState: { currentItemStrokeColor: "transparent" }, commitToHistory: false });
      }
      if (activeTool === "freedraw" && gridInputSnap) {
        passiveGridFreedrawRef.current = true;
        setDrawingPoints([coords]);
        const appState = excalidrawAPI.getAppState();
        if (appState.currentItemStrokeColor && appState.currentItemStrokeColor !== "transparent") {
          lastStrokeColorRef.current = appState.currentItemStrokeColor;
        }
        excalidrawAPI.updateScene({ appState: { currentItemStrokeColor: "transparent" }, commitToHistory: false });
      }
      passiveStrokeCaptureRef.current = {
        startedAt: Date.now(),
        tool: activeTool,
        existingIds: new Set(excalidrawAPI.getSceneElementsIncludingDeleted().map(element => element.id)),
      };
      return;
    }

    pendingStrokePreviewIdRef.current += 1;
    setPendingStrokePreview(null);

    const appState = excalidrawAPI.getAppState();
    if (appState.currentItemStrokeColor && appState.currentItemStrokeColor !== "transparent") {
      lastStrokeColorRef.current = appState.currentItemStrokeColor;
    }

    isDrawingRef.current = true;
    strokeInputSamplesRef.current = [];
    strokeRecordingSuppressedRef.current = true;
    const coords = getCanvasCoords(e.clientX, e.clientY);
    coords.time = Date.now();
    strokeStartTimeRef.current = coords.time;
    brushElapsedRef.current = 0;
    coords.strokeTime = 0;
    coords.pressure = e.pressure !== undefined ? e.pressure : 0.5;
    coords.speed = 0;
    emitPointerInputSample(e, "start", coords);
    livePointsRef.current = [coords];
    rawCursorRef.current = [e.clientX, e.clientY];
    setShiftHeld(e.shiftKey);
    wasShiftHeldRef.current = e.shiftKey;
    setDrawingPoints([coords]);

    // Force Excalidraw's active drawing stroke to be transparent
    excalidrawAPI.updateScene({
      appState: {
        currentItemStrokeColor: "transparent"
      }
    });
  };

  const handleCanvasPointerMove = (e) => {
    lastCanvasPointerRef.current = [e.clientX, e.clientY];
    if (handleBezierPointerMove(e)) return;
    if (nativeLineGridPointsRef.current) {
      const state = excalidrawAPI?.getAppState();
      const editingId = state?.multiElement?.id || state?.editingLinearElement?.elementId;
      if (editingId) {
        nativeLineGridPointsRef.current.elementId = editingId;
        const coords = getCanvasCoords(e.clientX, e.clientY);
        setDrawingPoints([...nativeLineGridPointsRef.current.points, coords]);
      }
    }
    if (passiveStrokeCaptureRef.current && !isDrawingRef.current) {
      const passiveTool = passiveStrokeCaptureRef.current.tool;
      if (passiveTool === "line" && nativeLineGridPointsRef.current) {
        const state = excalidrawAPI?.getAppState();
        const editingId = state?.multiElement?.id || state?.editingLinearElement?.elementId;
        if (editingId) {
          nativeLineGridPointsRef.current.elementId = editingId;
          const coords = getCanvasCoords(e.clientX, e.clientY);
          setDrawingPoints([...nativeLineGridPointsRef.current.points, coords]);
        }
        return;
      }
      if (e.buttons !== 1) return;
      const nativeEvent = e.nativeEvent || e;
      const events = typeof nativeEvent.getCoalescedEvents === "function" && nativeEvent.getCoalescedEvents().length
        ? nativeEvent.getCoalescedEvents()
        : [nativeEvent];
      for (const pointerEvent of events) {
        const coords = getCanvasCoords(pointerEvent.clientX, pointerEvent.clientY);
        coords.time = Date.now();
        coords.strokeTime = coords.time - passiveStrokeCaptureRef.current.startedAt;
        coords.speed = 0;
        emitPointerInputSample(pointerEvent, "move", coords);
        if (passiveGridFreedrawRef.current) {
          setDrawingPoints(points => [...points, coords]);
        }
      }
      return;
    }
    if (!isDrawingRef.current) return;
    if (e.buttons !== 1) {
      isDrawingRef.current = false;
      rawCursorRef.current = null;
      setShiftHeld(false);
      setDrawingPoints([]);
      return;
    }

    const nativeEvent = e.nativeEvent || e;
    const coalesced = typeof nativeEvent.getCoalescedEvents === "function"
      ? nativeEvent.getCoalescedEvents()
      : [];
    const pointerEvents = coalesced.length ? coalesced : [nativeEvent];
    const shiftKey = e.shiftKey || nativeEvent.shiftKey;
    setShiftHeld(shiftKey);
    if (shiftKey) wasShiftHeldRef.current = true;
    rawCursorRef.current = [e.clientX, e.clientY];

    for (const pointerEvent of pointerEvents) {
      const targetCoords = getCanvasCoords(pointerEvent.clientX, pointerEvent.clientY);
      let coords = targetCoords;

      // Stabilizer (Exponential Moving Average / Lazy Mouse) when holding Shift.
      if (shiftKey && livePointsRef.current.length > 0) {
        const lastPoint = livePointsRef.current[livePointsRef.current.length - 1];
        const betaParam = brushParams.find(p => p.name === "stabilizerDamping");
        const beta = betaParam ? betaParam.value : defaultStabilizerDamping;
        let x = lastPoint[0] + (targetCoords[0] - lastPoint[0]) * beta;
        let y = lastPoint[1] + (targetCoords[1] - lastPoint[1]) * beta;
        const appState = excalidrawAPI?.getAppState();
        const grid = globalGridRef.current;
        if (grid.snap.mode !== "off" && grid.snap.targets.input) {
          [x, y] = snapPointToGrid(grid, [x, y], { zoom: appState?.zoom?.value || 1 }).point;
        }
        coords = [x, y];
      }

      coords.time = Date.now();
      coords.strokeTime = coords.time - (strokeStartTimeRef.current || coords.time);
      coords.pressure = Number.isFinite(pointerEvent.pressure) ? pointerEvent.pressure : 0.5;
      let speed = 0;
      if (livePointsRef.current.length > 0) {
        const previous = livePointsRef.current[livePointsRef.current.length - 1];
        const distance = Math.hypot(coords[0] - previous[0], coords[1] - previous[1]);
        const elapsed = coords.time - (previous.time || coords.time);
        speed = elapsed > 0 ? distance / elapsed : 0;
      }
      coords.speed = speed;
      livePointsRef.current.push(coords);
      emitPointerInputSample(pointerEvent, "move", coords);
    }
    setDrawingPoints([...livePointsRef.current]);
  };

  const getBrushGlobals = (overrides = {}) => {
    if (!excalidrawAPI) return {};
    const appState = excalidrawAPI.getAppState() || {};
    const grid = globalGridRef.current;
    const clock = { tempo: scoreTempo, signature: scoreTimeSignature, fps: transportFps };
    return {
      gridSize: grid.spacing.x / grid.spacing.subdivisionsX,
      grid,
      snapToGrid: (point, options = {}) => snapPointToGrid(grid, point, { zoom: appState.zoom?.value || 1, ...options }).point,
      gridUnitsToSeconds: units => gridUnitsToSeconds(units, grid, clock),
      secondsToGridUnits: seconds => secondsToGridUnits(seconds, grid, clock),
      strokeColor: lastStrokeColorRef.current || "#000000",
      strokeWidth: appState.currentItemStrokeWidth || 2,
      opacity: appState.currentItemOpacity ?? 100,
      elapsedMs: brushElapsedRef.current,
      globalElapsedMs: brushElapsedRef.current,
      isPointerDown: isDrawingRef.current,
      zoom: appState.zoom ? appState.zoom.value : 1,
      theme: theme,
      viewBackgroundColor: appState.viewBackgroundColor || (theme === "dark" ? "#121212" : "#ffffff"),
      simplifyRDP,
      simplifyVW,
      smoothPathLaplacian,
      smoothPathTaubin,
      resampleUniform,
      resampleStrokeByDistance,
      closeAndSmoothJoint,
      solveHobbySpline,
      ...overrides
    };
  };

  const getElementBrushGlobals = (element, overrides = {}) => getBrushGlobals({
    elapsedMs: element?.customData?.brushElapsedMs ?? 0,
    isPointerDown: false,
    ...overrides
  });

  const getDrawingModifiers = () => {
    return resolveDrawingModifiers({
      globalModifiers,
    });
  };

  const getLivePreviewPaths = (frozenPreview = null) => {
    const previewPoints = frozenPreview?.points || drawingPoints;
    const previewModifiers = frozenPreview?.modifiers || getDrawingModifiers();
    const previewGlobals = frozenPreview?.globals || getBrushGlobals();
    if (previewPoints.length < 2) return [];
    if (!modifierDrawingActive) {
      return nativeLineGridPointsRef.current || passiveGridFreedrawRef.current ? [previewPoints] : [];
    }

    try {
      const evaluation = evaluateModifierStack(previewPoints, previewModifiers, previewGlobals);
      return composePreviewTracks({
        ...evaluation,
        hideOriginal: frozenPreview?.hideOriginal ?? nextStrokeHideOriginal,
      });
    } catch (e) {
      console.error("Live preview modifier evaluation error", e);
      return [previewPoints];
    }
  };

  // Sync Excalidraw tool selection with customBrushActive
  useEffect(() => {
    if (!excalidrawAPI) return;
    if (customBrushActive) {
      const activeTool = excalidrawAPI.getAppState().activeTool || {};
      if (activeTool.type !== "freedraw") {
        excalidrawAPI.updateScene({
          appState: {
            activeTool: { ...activeTool, type: "freedraw", locked: true }
          }
        });
      }
    } else {
      // Revert tool back to selection pointer when turning off custom brush
      const activeTool = excalidrawAPI.getAppState().activeTool || {};
      if (activeTool.type === "freedraw") {
        excalidrawAPI.updateScene({
          appState: {
            activeTool: { ...activeTool, type: "selection" }
          }
        });
      }
    }
  }, [customBrushActive, excalidrawAPI]);

  const handlePanelResizeMouseDown = (panelId, e, placement = PANEL_PLACEMENTS.RIGHT) => {
    e.preventDefault();
    e.stopPropagation();
    const panel = e.currentTarget.closest(".drawerator-panel-shell");
    const startRect = panel?.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const handleMouseMove = (moveEvent) => {
      if (placement === PANEL_PLACEMENTS.FLOATING && startRect) {
        updatePanelLayout(panelId, {
          width: Math.max(280, Math.min(window.innerWidth - startRect.left - 8, startRect.width + moveEvent.clientX - startX)),
          height: Math.max(220, Math.min(window.innerHeight - startRect.top - 8, startRect.height + moveEvent.clientY - startY)),
        });
        return;
      }
      const rawWidth = placement === PANEL_PLACEMENTS.LEFT
        ? moveEvent.clientX
        : window.innerWidth - moveEvent.clientX;
      if (rawWidth < 180) {
        setCollapsedDocks(previous => ({ ...previous, [placement]: true }));
        return;
      }
      setCollapsedDocks(previous => ({ ...previous, [placement]: false }));
      updatePanelLayout(panelId, { width: Math.max(280, Math.min(800, rawWidth)) });
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  useEffect(() => {
    if (!draggingPanelId) return undefined;
    const handleMove = event => {
      const drag = panelDragRef.current;
      if (!drag) return;
      drag.clientX = event.clientX;
      drag.clientY = event.clientY;
      if (!drag.started) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
        drag.started = true;
      }
      const target = getDockTarget(event.clientX, event.clientY, window.innerWidth, window.innerHeight);
      setDockPreview(target === PANEL_PLACEMENTS.FLOATING ? null : target);
      updatePanelLayout(drag.panelId, {
        placement: PANEL_PLACEMENTS.FLOATING,
        x: Math.max(8, Math.min(window.innerWidth - drag.width - 8, event.clientX - drag.offsetX)),
        y: Math.max(8, Math.min(window.innerHeight - drag.height - 8, event.clientY - drag.offsetY)),
      });
    };
    const handleUp = () => {
      const drag = panelDragRef.current;
      if (drag?.started) {
        const target = getDockTarget(drag.clientX, drag.clientY, window.innerWidth, window.innerHeight);
        if (target !== PANEL_PLACEMENTS.FLOATING) setPanelPlacement(drag.panelId, target);
      }
      panelDragRef.current = null;
      setDraggingPanelId(null);
      setDockPreview(null);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [draggingPanelId, setPanelPlacement, updatePanelLayout]);
  
  const applyBrushToFreedrawElement = (freedrawElement, generator, overrideAbsolutePoints = null) => {
    if (!freedrawElement || !generator) return null;

    const absolutePoints = overrideAbsolutePoints || (freedrawElement.points && freedrawElement.points.map(([px, py]) => [
      freedrawElement.x + px,
      freedrawElement.y + py
    ]));

    if (!absolutePoints || absolutePoints.length < 2) return null;

    // Execute the brush algorithm to get list of lines
    let newLines = [];
    try {
      newLines = generator(absolutePoints, getBrushGlobals());
    } catch (err) {
      console.error("Custom brush execution failed:", err);
      // Fall back to original points
      newLines = [absolutePoints];
    }

    if (!Array.isArray(newLines) || newLines.length === 0) return null;

    const baseId = freedrawElement.id;
    const groupId = `${baseId}-group`;

    const generatedElements = newLines.map((linePoints, idx) => {
      if (!Array.isArray(linePoints) || linePoints.length < 1) return null;
      const grid = globalGridRef.current;
      const outputPoints = grid.snap.mode !== "off" && grid.snap.targets.generated
        ? linePoints.map(point => snapPointToGrid(grid, point, { zoom: excalidrawAPIRef.current?.getAppState()?.zoom?.value || 1 }).point)
        : linePoints;
      
      // Find starting coordinate
      const [startX, startY] = outputPoints[0];
      const relativePoints = outputPoints.map(point => {
        const next = [point[0] - startX, point[1] - startY];
        if (point.pressure !== undefined) next.pressure = point.pressure;
        if (point.time !== undefined) next.time = point.time;
        if (point.strokeTime !== undefined) next.strokeTime = point.strokeTime;
        if (point.speed !== undefined) next.speed = point.speed;
        return next;
      });

      const xCoords = relativePoints.map(p => p[0]);
      const yCoords = relativePoints.map(p => p[1]);
      const minX = Math.min(...xCoords);
      const maxX = Math.max(...xCoords);
      const minY = Math.min(...yCoords);
      const maxY = Math.max(...yCoords);

      return {
        type: "line",
        x: startX,
        y: startY,
        points: relativePoints,
        width: maxX - minX,
        height: maxY - minY,
        strokeColor: (freedrawElement.strokeColor === "transparent" || !freedrawElement.strokeColor) ? lastStrokeColorRef.current : freedrawElement.strokeColor,
        strokeWidth: freedrawElement.strokeWidth,
        backgroundColor: freedrawElement.backgroundColor,
        fillStyle: "solid",
        strokeStyle: "solid",
        roughness: 0, 
        roundness: customBrushRoundness ? { type: 2 } : null,
        opacity: freedrawElement.opacity,
        groupIds: [groupId],
        id: `${baseId}-brush-${idx}-${Date.now()}`,
        seed: Math.floor(Math.random() * 1000000),
        version: 2,
        versionNonce: Math.floor(Math.random() * 1000000),
        isDeleted: false,
        updated: Date.now(),
        angle: 0,
        boundElements: null,
        link: null,
        locked: false,
        frameId: null,
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: null
      };
    }).filter(Boolean);

    return {
      deletedId: freedrawElement.id,
      newElements: generatedElements
    };
  };

  const handleApplyBrushToSelected = () => {
    if (!excalidrawAPI) return;
    const appState = excalidrawAPI.getAppState();
    const selectedIds = appState.selectedElementIds || {};
    const elements = excalidrawAPI.getSceneElements();
    
    const selectedStrokeElements = elements.filter(el => 
      selectedIds[el.id] && (el.type === "freedraw" || el.type === "line") && !el.isDeleted
    );

    if (selectedStrokeElements.length === 0) {
      alert("Please select one or more freehand pencil strokes or lines on the canvas first!");
      return;
    }

    if (globalModifiers.length === 0) {
      alert("The active modifier stack is empty! Add some modifiers to the stack first.");
      return;
    }

    for (const el of selectedStrokeElements) {
      const currentMods = el.customData?.modifiers || [];
      const updatedMods = [...currentMods, ...globalModifiers];
      
      el.roundness = globalRoundness ? { type: 2 } : null;
      el.customData = {
        ...el.customData,
        muteModifiers: globalMuteStack
      };
      
      updateModifiedElementInScene(el.id, updatedMods);
    }
  };

  const handleConvertType = (targetType) => {
    if (!excalidrawAPI) return;
    const appState = excalidrawAPI.getAppState();
    const selectedIds = appState.selectedElementIds || {};
    const elements = excalidrawAPI.getSceneElements();
    
    // Gather all active group IDs in the selection
    const selectedGroupIds = new Set();
    elements.forEach(el => {
      if (selectedIds[el.id] && !el.isDeleted && el.groupIds) {
        el.groupIds.forEach(gId => selectedGroupIds.add(gId));
      }
    });

    let count = 0;
    const nextElements = elements.map(el => {
      const isSelected = selectedIds[el.id];
      const isInSelectedGroup = el.groupIds && el.groupIds.some(gId => selectedGroupIds.has(gId));
      if ((isSelected || isInSelectedGroup) && !el.isDeleted) {
        const isSpline = hasCubicBezierGeometry(el);
        const isSplineToLine = isSpline && targetType === "line";
        const isSplineToFreehand = isSpline && targetType === "freedraw";
        const isConvertibleStroke = (el.type === "freedraw" || el.type === "line") && (el.type !== targetType || isSplineToLine || isSplineToFreehand);
        if (isConvertibleStroke) {
          count++;
          const nextColor = (el.strokeColor === "transparent" || !el.strokeColor) ? lastStrokeColorRef.current : el.strokeColor;
          const { draweratorGeometry: _geometry, ...nativeCustomData } = el.customData || {};
          return {
            ...el,
            type: targetType,
            strokeColor: nextColor,
            // Freehand and line elements share sampled points, but Excalidraw
            // expects freehand paths to have no line roundness/bindings.
            ...(targetType === "freedraw"
              ? {
                  // Excalidraw stores freehand pressure in a parallel array;
                  // putting it in a third point coordinate produces an
                  // invalid/empty freehand element.
                  ...(() => {
                    // A rounded Excalidraw line stores only its sparse control
                    // points. Feeding those directly to perfect-freehand cuts
                    // across the displayed curve. Sample the same canonical
                    // curve used by Convert to Spline so direct line ->
                    // freehand preserves the shape users actually see.
                    const sampledLine = el.type === "line" && !isSpline
                      ? (() => {
                          const geometry = createBezierGeometryFromElement(el);
                          return geometry ? setElementBezierGeometry(el, geometry).points : null;
                        })()
                      : null;
                    const sourcePoints = Array.isArray(sampledLine) && sampledLine.length >= 2
                      ? sampledLine
                      : Array.isArray(el.points) && el.points.length >= 2
                        ? el.points
                        : [[0, 0], [Math.max(Number(el.width) || 1, 1), Number(el.height) || 0]];
                    const points = sourcePoints.map(point => [
                      Number(point?.[0]) || 0,
                      Number(point?.[1]) || 0,
                    ]);
                    const pressures = points.map((_, index) => {
                      const pressure = Number(el.pressures?.[index]);
                      return Number.isFinite(pressure) ? pressure : 0.5;
                    });
                    return { points, pressures, simulatePressure: false };
                  })(),
                  roundness: null,
                  lastCommittedPoint: null,
                  startBinding: null,
                  endBinding: null,
                  startArrowhead: null,
                  endArrowhead: null,
                }
              : {}),
            ...(hasCubicBezierGeometry(el) && targetType === "line"
              ? { customData: nativeCustomData, roundness: null }
              : {}),
            version: el.version + 1,
            versionNonce: Math.floor(Math.random() * 1000000),
            updated: Date.now()
          };
        }
      }
      return el;
    });

    if (count > 0) {
      excalidrawAPI.updateScene({
        elements: nextElements,
        commitToHistory: true
      });
    }
  };

  const handleRestoreOriginalStroke = () => {
    if (!excalidrawAPI) return;
    const appState = excalidrawAPI.getAppState();
    const selectedIds = appState.selectedElementIds || {};
    const elements = excalidrawAPI.getSceneElements();

    const selectedStrokeElements = elements.filter(el => selectedIds[el.id] && !el.isDeleted);
    if (selectedStrokeElements.length === 0) return;

    // Find the first selected custom brush line to extract its color
    const firstSelected = selectedStrokeElements[0];
    const sourceColor = firstSelected ? firstSelected.strokeColor : lastStrokeColorRef.current;

    const baseIdsToRestore = new Set();
    const brushGroupIds = new Set();

    for (const el of selectedStrokeElements) {
      if (el.id.includes("-brush-")) {
        const baseId = el.id.split("-brush-")[0];
        baseIdsToRestore.add(baseId);
      }
      if (el.groupIds) {
        for (const gId of el.groupIds) {
          if (gId.endsWith("-group")) {
            const baseId = gId.slice(0, -6);
            baseIdsToRestore.add(baseId);
            brushGroupIds.add(gId);
          }
        }
      }
    }

    if (baseIdsToRestore.size === 0) {
      alert("Selected elements do not appear to be generated by a custom brush.");
      return;
    }

    let restoredCount = 0;
    const nextElements = elements.map(el => {
      if (baseIdsToRestore.has(el.id)) {
        restoredCount++;
        const finalColor = (el.strokeColor === "transparent" || !el.strokeColor) ? sourceColor : el.strokeColor;
        return {
          ...el,
          isDeleted: false,
          strokeColor: finalColor,
          updated: Date.now()
        };
      }
      const matchesBase = Array.from(baseIdsToRestore).some(baseId => el.id.startsWith(`${baseId}-brush-`));
      const matchesGroup = el.groupIds && el.groupIds.some(gId => brushGroupIds.has(gId));
      if (matchesBase || matchesGroup) {
        return {
          ...el,
          isDeleted: true,
          updated: Date.now()
        };
      }
      return el;
    });

    if (restoredCount > 0) {
      excalidrawAPI.updateScene({
        elements: nextElements,
        commitToHistory: true,
        appState: {
          selectedElementIds: Array.from(baseIdsToRestore).reduce((acc, id) => {
            acc[id] = true;
            return acc;
          }, {})
        }
      });
    } else {
      alert("Could not locate the original pencil strokes in the scene history.");
    }
  };

  const handleSimplifyStroke = (algorithm) => {
    if (!excalidrawAPI) return;
    const appState = excalidrawAPI.getAppState();
    const selectedIds = appState.selectedElementIds || {};
    const elements = excalidrawAPI.getSceneElements();

    // Gather all active group IDs in the selection
    const selectedGroupIds = new Set();
    elements.forEach(el => {
      if (selectedIds[el.id] && !el.isDeleted && el.groupIds) {
        el.groupIds.forEach(gId => selectedGroupIds.add(gId));
      }
    });

    let count = 0;
    const nextElements = elements.map(el => {
      const isSelected = selectedIds[el.id];
      const isInSelectedGroup = el.groupIds && el.groupIds.some(gId => selectedGroupIds.has(gId));
      if ((isSelected || isInSelectedGroup) && !el.isDeleted) {
        if ((el.type === "freedraw" || el.type === "line") && el.points && el.points.length > 2) {
          count++;
          
          const sourceWorldPoints = hasCubicBezierGeometry(el)
            ? getBezierWorldPath(el)
            : getElementCorePaths(el)[0];
          const absolutePoints = sourceWorldPoints.map((p, index) => {
            const absPt = [p[0], p[1]];
            const pressure = Number(el.pressures?.[index]);
            if (Number.isFinite(pressure)) absPt.pressure = pressure;
            if (p.pressure !== undefined) absPt.pressure = p.pressure;
            if (p.time !== undefined) absPt.time = p.time;
            if (p.strokeTime !== undefined) absPt.strokeTime = p.strokeTime;
            if (p.speed !== undefined) absPt.speed = p.speed;
            return absPt;
          });

          let simplifiedAbs;
          if (algorithm === "rdp") {
            simplifiedAbs = simplifyRDP(absolutePoints, 2.5); // 2.5px tolerance
          } else if (algorithm === "vw") {
            simplifiedAbs = simplifyVW(absolutePoints, 15.0); // 15px^2 area tolerance
          } else if (algorithm === "smooth") {
            simplifiedAbs = smoothPathLaplacian(absolutePoints, 0.4, 3); // 3 iterations of 0.4 Laplacian weight
          } else if (algorithm === "taubin") {
            simplifiedAbs = smoothPathTaubin(absolutePoints, 0.5, -0.53, 10, false);
          } else if (algorithm === "close") {
            simplifiedAbs = closeAndSmoothJoint(absolutePoints, el.type, el.roundness);
          } else if (algorithm === "resample") {
            simplifiedAbs = resampleUniform(absolutePoints, absolutePoints.length);
          } else if (algorithm === "snap") {
            simplifiedAbs = absolutePoints.map(point => snapPointToGrid(globalGridRef.current, point, {
              mode: "hard",
              zoom: appState.zoom?.value || 1,
            }).point);
          }

          const simplifiedElement = updateElementGeometry(el, simplifiedAbs);
          if (!hasCubicBezierGeometry(el)) return simplifiedElement;

          // Direct path operations are destructive edits of the visible
          // samples. Do not leave the old canonical spline active, otherwise
          // it will render from stale host coordinates after reframing.
          const { draweratorGeometry: _geometry, ...customData } = simplifiedElement.customData || {};
          return { ...simplifiedElement, customData };
        }
      }
      return el;
    });

    if (count > 0) {
      excalidrawAPI.updateScene({
        elements: nextElements,
        commitToHistory: true
      });
    }
  };

  const handleCanvasContextMenu = (e) => {
    if (!excalidrawAPI) return;
    
    // Require Shift key for custom context menu, otherwise let Excalidraw's default show
    if (!e.shiftKey) {
      setCustomContextMenu(null);
      return;
    }

    const appState = excalidrawAPI.getAppState();
    const selectedIds = appState.selectedElementIds || {};
    const elements = excalidrawAPI.getSceneElements();

    const selectedStrokeElements = elements.filter(el => 
      selectedIds[el.id] && (el.type === "freedraw" || el.type === "line") && !el.isDeleted
    );

    if (selectedStrokeElements.length > 0) {
      e.preventDefault();
      e.stopPropagation();

      const hasBrush = selectedStrokeElements.some(el => el.id.includes("-brush-") || (el.groupIds && el.groupIds.some(gId => gId.endsWith("-group"))));
      const hasFreehand = selectedStrokeElements.some(el => el.type === "freedraw");
      const hasLine = selectedStrokeElements.some(el => el.type === "line");
      const hasSpline = selectedStrokeElements.some(hasCubicBezierGeometry);
      const hasConvertiblePath = selectedStrokeElements.some(el => !hasCubicBezierGeometry(el));

      setCustomContextMenu({
        x: e.clientX,
        y: e.clientY,
        showAddCursor: selectedStrokeElements.length > 0,
        showRestore: hasBrush,
        showToLine: hasFreehand || hasSpline,
        showToFreehand: hasLine || hasSpline,
        showToSpline: hasConvertiblePath,
        showFromSpline: hasSpline,
      });
    } else {
      setCustomContextMenu(null);
    }
  };

  const evaluateModifierStack = (originalPoints, modifiers, globals) => {
    let baseLine = originalPoints.map(p => {
      const copy = [p[0], p[1]];
      if (p.pressure !== undefined) copy.pressure = p.pressure;
      if (p.time !== undefined) copy.time = p.time;
      if (p.strokeTime !== undefined) copy.strokeTime = p.strokeTime;
      if (p.speed !== undefined) copy.speed = p.speed;
      return copy;
    });

    let accumulatedTracks = [];

    for (const mod of modifiers) {
      if (!mod.enabled) continue;

      try {
        const brushId = resolveBrushId(mod.id, brushPalette);
        const brush = brushPalette.find(b => b.id === brushId);
        const brushCode = mod.codeOverride || brush?.code;
        if (brushCode) {
          const params = [];
          if (brushCode) {
            const lines = brushCode.split("\n");
            lines.forEach(line => {
              const match = line.match(/\/\/\s*@param\s+(\w+)\s*=\s*([0-9.-]+)/);
              if (match) {
                const pName = match[1];
                const pVal = mod.params && mod.params[pName] !== undefined ? mod.params[pName] : parseFloat(match[2]);
                params.push({ name: pName, value: pVal });
              }
            });
          }
          const processedCode = updateCodeWithParamValues(brushCode, params);
          const { generator } = compileUserBrush(processedCode, params);
          if (generator) {
            const res = generator(baseLine, globals);
            
            // Check type property first, fallback to dynamic array dimension check
            let isMultiTrack = false;
            if ((brush?.type || mod.type) === "brush") {
              isMultiTrack = true;
            } else if ((brush?.type || mod.type) === "filter") {
              isMultiTrack = false;
            } else {
              isMultiTrack = Array.isArray(res) && res.length > 0 && Array.isArray(res[0]) && Array.isArray(res[0][0]);
            }

            if (isMultiTrack) {
              const newTracks = [];
              if (Array.isArray(res) && res.length > 0) {
                if (Array.isArray(res[0]) && Array.isArray(res[0][0])) {
                  newTracks.push(...res);
                } else {
                  newTracks.push(res);
                }
              } else if (res) {
                newTracks.push(res);
              }
              accumulatedTracks.push(...newTracks);
            } else {
              // It is a geometric filter: mutate the baseline and propagate down the stack
              if (res) {
                let path = (Array.isArray(res) && res.length > 0 && Array.isArray(res[0])) ? res[0] : res;
                baseLine = path;
              }
              if (accumulatedTracks.length > 0) {
                accumulatedTracks = accumulatedTracks.map(track => {
                  const filtered = generator(track, globals);
                  let path = (Array.isArray(filtered) && filtered.length > 0 && Array.isArray(filtered[0])) ? filtered[0] : filtered;
                  return path;
                });
              }
            }
          }
        }
      } catch (err) {
        console.error("Modifier execution error:", mod.id, err);
      }
    }

    const primaryPoints = baseLine;
    const allLines = accumulatedTracks.length > 0 ? accumulatedTracks : [baseLine];
    return { primaryPoints, allLines, hasAccumulated: accumulatedTracks.length > 0 };
  };

  const createBakedTrackElements = (parentElement, updatedParent, childTracks, groupId) => {
    if (!childTracks.length) return [];

    const relPoints = updatedParent.points || [];
    const minXRel = relPoints.length > 0 ? Math.min(...relPoints.map(p => p[0])) : 0;
    const minYRel = relPoints.length > 0 ? Math.min(...relPoints.map(p => p[1])) : 0;
    const maxXRel = relPoints.length > 0 ? Math.max(...relPoints.map(p => p[0])) : 0;
    const maxYRel = relPoints.length > 0 ? Math.max(...relPoints.map(p => p[1])) : 0;
    const cx = updatedParent.x + (minXRel + maxXRel) / 2;
    const cy = updatedParent.y + (minYRel + maxYRel) / 2;
    const angle = parentElement.angle || 0;
    const timestamp = Date.now();
    const effectiveOpacity = parentElement.customData?.hideOriginal || updatedParent.opacity === 0
      ? (parentElement.customData.savedOpacity ?? parentElement.opacity ?? 100)
      : updatedParent.opacity;

    return childTracks.map((linePoints, idx) => {
      let rotatedPoints = linePoints.map((point) => {
        const [x, y] = angle === 0
          ? point
          : rotatePoint(point[0], point[1], cx, cy, angle);
        const copy = [x, y];
        if (point.pressure !== undefined) copy.pressure = point.pressure;
        if (point.time !== undefined) copy.time = point.time;
        if (point.strokeTime !== undefined) copy.strokeTime = point.strokeTime;
        if (point.speed !== undefined) copy.speed = point.speed;
        return copy;
      });
      const grid = globalGridRef.current;
      if (grid.snap.mode !== "off" && grid.snap.targets.generated) {
        rotatedPoints = rotatedPoints.map(point => snapPointToGrid(grid, point, {
          zoom: excalidrawAPIRef.current?.getAppState()?.zoom?.value || 1,
        }).point);
      }

      const [startX, startY] = rotatedPoints[0];
      const relativePoints = rotatedPoints.map((point) => {
        const relPt = [point[0] - startX, point[1] - startY];
        if (point.pressure !== undefined) relPt.pressure = point.pressure;
        if (point.time !== undefined) relPt.time = point.time;
        if (point.strokeTime !== undefined) relPt.strokeTime = point.strokeTime;
        if (point.speed !== undefined) relPt.speed = point.speed;
        return relPt;
      });
      const xCoords = relativePoints.map(p => p[0]);
      const yCoords = relativePoints.map(p => p[1]);

      return {
        type: "line",
        x: startX,
        y: startY,
        points: relativePoints,
        width: Math.max(1, Math.max(...xCoords) - Math.min(...xCoords)),
        height: Math.max(1, Math.max(...yCoords) - Math.min(...yCoords)),
        strokeColor: updatedParent.strokeColor,
        strokeWidth: updatedParent.strokeWidth,
        backgroundColor: updatedParent.backgroundColor,
        fillStyle: updatedParent.fillStyle,
        strokeStyle: updatedParent.strokeStyle,
        roughness: updatedParent.roughness,
        roundness: updatedParent.roundness,
        opacity: effectiveOpacity,
        groupIds: [...(parentElement.groupIds || []), groupId],
        id: `${parentElement.id}-baked-${idx}-${timestamp}`,
        seed: Math.floor(Math.random() * 1000000),
        version: 2,
        versionNonce: Math.floor(Math.random() * 1000000),
        isDeleted: false,
        updated: timestamp,
        angle: 0,
        boundElements: null,
        link: null,
        locked: parentElement.locked,
        frameId: parentElement.frameId,
        customData: {
          parentId: parentElement.id,
          isModifierGenerated: true,
          bakedTrack: true
        },
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null
      };
    });
  };

  const updateModifiedElementInScene = (elId, newModifiers, forceOriginalPoints = null, modifierGlobals = null, commitToHistory = true) => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    const parentEl = elements.find(el => el.id === elId);
    if (!parentEl) return;

    const isFirstTime = !parentEl.customData?.originalPoints;
    if (isFirstTime && (parentEl.type === "freedraw" || parentEl.type === "line")) {
      parentEl.roundness = { type: 2 };
    }

    let originalPoints = forceOriginalPoints;
    if (!originalPoints) {
      if (parentEl.customData?.originalPoints) {
        originalPoints = parentEl.customData.originalPoints;
      } else {
        originalPoints = parentEl.points.map(p => {
          const absPt = [parentEl.x + p[0], parentEl.y + p[1]];
          if (p.pressure !== undefined) absPt.pressure = p.pressure;
          if (p.time !== undefined) absPt.time = p.time;
          if (p.strokeTime !== undefined) absPt.strokeTime = p.strokeTime;
          if (p.speed !== undefined) absPt.speed = p.speed;
          return absPt;
        });
      }
    }

    const pointsForStack = originalPoints;

    const globals = modifierGlobals || getElementBrushGlobals(parentEl);
    const { primaryPoints, allLines } = evaluateModifierStack(pointsForStack, newModifiers, globals);



    const updatedParent = updateElementGeometry(parentEl, primaryPoints);
    
    let customStrokeWidth = null;
    newModifiers.forEach(mod => {
      if (mod.enabled && mod.params && mod.params.strokeWidth !== undefined) {
        customStrokeWidth = mod.params.strokeWidth;
      }
    });
    if (customStrokeWidth !== null) {
      updatedParent.strokeWidth = customStrokeWidth;
    }
    if (newModifiers.length === 0) {
      updatedParent.customData = {
        ...(parentEl.customData || {}),
        originalPoints: null,
        modifiers: [],
        hideOriginal: false,
        version: (parentEl.customData?.version || 0) + 1,
        excalidrawVersion: updatedParent.version,
        lastWidth: updatedParent.width,
        lastHeight: updatedParent.height,
        brushElapsedMs: modifierGlobals?.elapsedMs ?? parentEl.customData?.brushElapsedMs ?? 0
      };
      if (parentEl.customData?.hideOriginal) {
        updatedParent.opacity = parentEl.customData.savedOpacity ?? 100;
      }
    } else {
      updatedParent.customData = {
        ...(parentEl.customData || {}),
        originalPoints: originalPoints,
        modifiers: newModifiers,
        version: (parentEl.customData?.version || 0) + 1,
        excalidrawVersion: updatedParent.version,
        lastWidth: updatedParent.width,
        lastHeight: updatedParent.height,
        brushElapsedMs: modifierGlobals?.elapsedMs ?? parentEl.customData?.brushElapsedMs ?? 0
      };
    }

    processedModifierVersionsRef.current[parentEl.id] = updatedParent.customData.version;
    suppressedModifierSyncVersionsRef.current[parentEl.id] = updatedParent.customData.version;

    const nextElements = elements.map(el => {
      if (el.id === parentEl.id) {
        return updatedParent;
      }
      if (
        el.customData?.parentId === parentEl.id &&
        el.customData?.isModifierGenerated &&
        !el.customData?.bakedTrack
      ) {
        return { ...el, isDeleted: true };
      }
      return el;
    });

    evaluatingModifiersRef.current = true;
    try {
      excalidrawAPI.updateScene({
        elements: nextElements,
        commitToHistory
      });
    } finally {
      evaluatingModifiersRef.current = false;
    }
    setModifierUpdateNonce(n => n + 1);
  };

  const syncEditorDraftToModifier = (commitToHistory = false) => {
    if (!editingModifierTarget || editingModifierTarget.brushId !== activeBrushId) return false;
    const finalCode = updateCodeWithParamValues(activeBrushCode, brushParams);
    const compiled = compileUserBrush(finalCode, brushParams);
    if (!compiled.generator || compiled.error) return false;
    const nextParams = Object.fromEntries(brushParams.map(param => [param.name, param.value]));
    const paletteCode = brushPalette.find(brush => brush.id === activeBrushId)?.code || "";
    const paletteCodeWithParams = updateCodeWithParamValues(paletteCode, brushParams);
    const nextCodeOverride = finalCode === paletteCodeWithParams ? undefined : finalCode;

    const updateModifiers = (currentModifiers) => {
      let targetIndex = editingModifierTarget.modifierIndex;
      if (currentModifiers[targetIndex]?.id !== editingModifierTarget.modifierId) {
        targetIndex = currentModifiers.findIndex(modifier => modifier.id === editingModifierTarget.modifierId);
      }
      if (targetIndex < 0) return currentModifiers;
      const current = currentModifiers[targetIndex];
      if (
        current.codeOverride === nextCodeOverride &&
        JSON.stringify(current.params || {}) === JSON.stringify(nextParams)
      ) {
        return currentModifiers;
      }
      return currentModifiers.map((modifier, index) => index === targetIndex
        ? { ...modifier, codeOverride: nextCodeOverride, params: nextParams }
        : modifier);
    };

    if (editingModifierTarget.elementId && excalidrawAPI) {
      const parentElement = excalidrawAPI.getSceneElements().find(
        element => element.id === editingModifierTarget.elementId
      );
      if (!parentElement) return false;
      const currentModifiers = parentElement.customData?.modifiers || [];
      const updatedModifiers = updateModifiers(currentModifiers);
      if (updatedModifiers === currentModifiers) return true;
      updateModifiedElementInScene(
        parentElement.id,
        updatedModifiers,
        null,
        null,
        commitToHistory
      );
      return true;
    }

    if (!editingModifierTarget.elementId) {
      setGlobalModifiers(previous => updateModifiers(previous));
      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!editingModifierTarget || editingModifierTarget.brushId !== activeBrushId) return;
    const timeout = window.setTimeout(() => {
      syncEditorDraftToModifier(false);
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [activeBrushCode, brushParams, activeBrushId, editingModifierTarget]);

  const recordCompletedStroke = ({ finalElements, durationMs, brush = null }) => {
    const samples = strokeInputSamplesRef.current.map(sample => ({
      ...sample,
      time: Math.max(0, (sample.time || 0) - (strokeInputSamplesRef.current[0]?.time || 0)),
    }));
    historyController.record({
      kind: "stroke",
      duration: Math.max(0, durationMs || 0) / 1000,
      transportTime: scoreTimeRef.current,
      source: samples[0]?.source || "pointer",
      args: {
        samples,
        finalElements: (finalElements || []).map(element => JSON.parse(JSON.stringify(element))),
        brush,
      },
    });
    strokeInputSamplesRef.current = [];
    strokeRecordingSuppressedRef.current = false;
  };

  const quantizeGlobalGridElements = ({
    elementIds = null,
    transformOnly = false,
    forceHard = true,
    commitToHistory = true,
    resolution = null,
    axes = null,
    pointIndices = null,
  } = {}) => {
    const api = excalidrawAPIRef.current;
    if (!api || gridQuantizingRef.current) return { count: 0 };
    const grid = globalGridRef.current;
    const selectedIds = elementIds
      ? new Set(elementIds)
      : new Set(Object.keys(api.getAppState().selectedElementIds || {}).filter(id => api.getAppState().selectedElementIds[id]));
    const selected = api.getSceneElements().filter(element => selectedIds.has(element.id) && !element.isDeleted);
    if (!selected.length) return { count: 0 };
    const zoom = api.getAppState().zoom?.value || 1;
    const options = {
      mode: forceHard ? "hard" : grid.snap.mode,
      resolution: resolution || grid.snap.resolution,
      axes: axes || grid.snap.axes,
      zoom,
      pointIndices,
    };
    const selectedIdSet = new Set(selected.map(element => element.id));
    let changed = 0;
    let replacements;
    if (transformOnly) {
      const delta = sharedGridSnapDelta(selected, grid, options);
      if (Math.abs(delta[0]) < 1e-8 && Math.abs(delta[1]) < 1e-8) return { count: 0, delta };
      replacements = new Map(selected.map(element => [element.id, translateGridElement(element, delta)]));
      changed = selected.length;
    } else {
      replacements = new Map(selected.map(element => {
        const next = quantizeGridElement(element, grid, options);
        if (next !== element) changed += 1;
        return [element.id, next];
      }));
    }
    if (!changed) return { count: 0 };
    gridQuantizingRef.current = true;
    try {
      api.updateScene({
        elements: api.getSceneElementsIncludingDeleted().map(element => selectedIdSet.has(element.id) ? replacements.get(element.id) : element),
        commitToHistory,
      });
      setModifierUpdateNonce(nonce => nonce + 1);
    } finally {
      window.setTimeout(() => { gridQuantizingRef.current = false; }, 0);
    }
    return { count: changed };
  };

  const scheduleNativeGridQuantization = () => {
    const grid = globalGridRef.current;
    if (grid.snap.mode === "off" || (!grid.snap.targets.transforms && !grid.snap.targets.points)) return;
    if (nativeLineGridPointsRef.current && excalidrawAPIRef.current?.getAppState()?.activeTool?.type === "line") return;
    // Let Excalidraw commit its pointer-up edit before quantizing the authored point.
    window.setTimeout(() => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      const appState = api.getAppState();
      const interaction = gridInteractionRef.current;
      gridInteractionRef.current = { moving: false, resizing: false, pointEditing: false, pointIndices: null };
      if (appState.multiElement?.id && appState.activeTool?.type === "line") return;
      const selectedIds = Object.keys(appState.selectedElementIds || {}).filter(id => appState.selectedElementIds[id]);
      const editingLinearId = appState.editingLinearElement?.elementId || (interaction.pointEditing ? editingLinearGridRef.current : null);
      const eligibleIds = api.getSceneElements().filter(element =>
        (selectedIds.includes(element.id) || element.id === editingLinearId) && (!element.customData?.parentId || grid.snap.targets.generated)
      ).map(element => element.id);
      const isPointEdit = interaction.pointEditing || Boolean(appState.editingLinearElement || bezierEditElementId);
      const isCreation = appState.activeTool?.type && appState.activeTool.type !== "selection";
      const isResize = interaction.resizing;
      const allowed = isPointEdit
        ? grid.snap.targets.points
        : isCreation ? grid.snap.targets.input : grid.snap.targets.transforms;
      if (!allowed) return;
      quantizeGlobalGridElements({
        elementIds: eligibleIds,
        transformOnly: eligibleIds.length > 1 || (!isPointEdit && !isCreation && !isResize),
        forceHard: false,
        pointIndices: isPointEdit && interaction.pointIndices?.length ? interaction.pointIndices : null,
      });
    }, 32);
  };

  const applyPendingNativeLineFinalize = (elements = null) => {
    const pending = pendingNativeLineFinalizeRef.current;
    const api = excalidrawAPIRef.current;
    if (!pending || !api || api.getAppState().multiElement?.id) return false;
    const sceneElements = elements || api.getSceneElementsIncludingDeleted();
    const target = sceneElements.find(element => element.id === pending.elementId && !element.isDeleted)
      || [...sceneElements].reverse().find(element => element.type === "line" && !element.isDeleted);
    if (!target) return false;
    const strokeColor = isColorTransparent(lastStrokeColorRef.current)
      ? (theme === "dark" ? "#f8fafc" : "#1b1b1f")
      : lastStrokeColorRef.current;
    const quantized = quantizeGridElement(target, globalGridRef.current, {
      mode: globalGridRef.current.snap.mode,
      zoom: api.getAppState()?.zoom?.value || 1,
      worldPoints: pending.points,
    });
    pendingNativeLineFinalizeRef.current = null;
    api.updateScene({
      elements: sceneElements.map(element => element.id === target.id ? { ...quantized, strokeColor } : element),
      appState: { currentItemStrokeColor: strokeColor },
      commitToHistory: false,
    });
    return true;
  };

  const finalizeCapturedNativeLine = elementId => {
    const captured = nativeLineGridPointsRef.current;
    nativeLineGridPointsRef.current = null;
    setDrawingPoints([]);
    if (!captured?.points?.length) {
      if (excalidrawAPIRef.current?.getAppState().currentItemStrokeColor === "transparent") {
        excalidrawAPIRef.current.updateScene({ appState: { currentItemStrokeColor: lastStrokeColorRef.current }, commitToHistory: false });
      }
      return;
    }
    pendingNativeLineFinalizeRef.current = {
      elementId: elementId || captured.elementId || null,
      points: captured.points,
    };
    window.setTimeout(() => applyPendingNativeLineFinalize(), 80);
  };

  const handleCanvasPointerUp = (e) => {
    if (handleBezierPointerUp(e)) return;
    scheduleNativeGridQuantization();
    if (passiveStrokeCaptureRef.current && !isDrawingRef.current) {
      const capture = passiveStrokeCaptureRef.current;
      passiveStrokeCaptureRef.current = null;
      const completedInputSamples = [...strokeInputSamplesRef.current];
      const last = strokeInputSamplesRef.current[strokeInputSamplesRef.current.length - 1];
      const coords = capture.tool === "line"
        ? getCanvasCoords(e.clientX, e.clientY)
        : last ? [last.scene.x, last.scene.y] : getCanvasCoords(e.clientX, e.clientY);
      coords.strokeTime = Date.now() - capture.startedAt;
      coords.speed = 0;
      emitPointerInputSample(e, "end", coords);
      if (capture.tool === "line" && nativeLineGridPointsRef.current) {
        const points = [...nativeLineGridPointsRef.current.points];
        const previous = points[points.length - 1];
        if (!previous || Math.hypot(previous[0] - coords[0], previous[1] - coords[1]) > 1e-8) points.push(coords);
        nativeLineGridPointsRef.current = { ...nativeLineGridPointsRef.current, points };
        setDrawingPoints(points);
        window.setTimeout(() => {
          const state = excalidrawAPIRef.current?.getAppState();
          if (!state?.multiElement && nativeLineGridPointsRef.current?.points?.length >= 2) finalizeCapturedNativeLine();
        }, 120);
      }
      if (capture.tool === "freedraw" && passiveGridFreedrawRef.current) {
        excalidrawAPI?.updateScene({ appState: { currentItemStrokeColor: lastStrokeColorRef.current }, commitToHistory: false });
      }
      window.setTimeout(() => {
        let finalElements = excalidrawAPI?.getSceneElementsIncludingDeleted().filter(element =>
          !element.isDeleted && !capture.existingIds.has(element.id)
        ) || [];
        const grid = globalGridRef.current;
        if (capture.tool === "freedraw" && grid.snap.mode !== "off" && grid.snap.targets.input && finalElements.length) {
          const worldPoints = capture.tool === "freedraw"
            ? completedInputSamples.map(sample => {
              const point = [sample.scene.x, sample.scene.y];
              point.pressure = sample.pressure;
              point.time = sample.time;
              point.strokeTime = sample.strokeTime;
              point.speed = sample.speed;
              return point;
            })
            : null;
          const replacements = new Map(finalElements.map(element => {
            let next = quantizeGridElement(element, grid, {
              mode: grid.snap.mode,
              zoom: excalidrawAPI?.getAppState()?.zoom?.value || 1,
              ...(worldPoints?.length >= 2 ? { worldPoints } : {}),
            });
            if ((capture.tool === "freedraw" || capture.tool === "line") && isColorTransparent(next.strokeColor)) {
              next = { ...next, strokeColor: lastStrokeColorRef.current };
            }
            return [element.id, next];
          }));
          excalidrawAPI?.updateScene({
            elements: excalidrawAPI.getSceneElementsIncludingDeleted().map(element => replacements.get(element.id) || element),
            commitToHistory: false,
          });
          finalElements = finalElements.map(element => replacements.get(element.id) || element);
        }
        recordCompletedStroke({
          finalElements,
          durationMs: Date.now() - capture.startedAt,
          brush: { kind: "excalidraw", tool: excalidrawAPI?.getAppState().activeTool?.type || "freedraw" },
        });
        if (capture.tool === "freedraw") {
          passiveGridFreedrawRef.current = false;
          setDrawingPoints([]);
        }
      }, 120);
      return;
    }
    if (!isDrawingRef.current) {
      rawCursorRef.current = null;
      livePointsRef.current = [];
      setShiftHeld(false);
      setDrawingPoints([]);
      return;
    }
    brushElapsedRef.current = Math.max(0, Date.now() - strokeStartTimeRef.current);
    const lastRecordedPoint = livePointsRef.current[livePointsRef.current.length - 1];
    if (lastRecordedPoint) emitPointerInputSample(e, "end", lastRecordedPoint);
    isDrawingRef.current = false;
    rawCursorRef.current = null;
    setShiftHeld(false);

    // Auto-close curve if Option/Alt key is held on release
    if (e && e.altKey && livePointsRef.current && livePointsRef.current.length >= 3) {
      const firstPoint = livePointsRef.current[0];
      const closingPt = [firstPoint[0], firstPoint[1]];
      closingPt.time = Date.now();
      closingPt.strokeTime = closingPt.time - (strokeStartTimeRef.current || closingPt.time);
      
      const lastPoint = livePointsRef.current[livePointsRef.current.length - 1];
      if (lastPoint.pressure !== undefined) {
        closingPt.pressure = lastPoint.pressure;
      }
      if (lastPoint.speed !== undefined) {
        closingPt.speed = lastPoint.speed;
      }
      livePointsRef.current.push(closingPt);
    }

    if (!excalidrawAPI || !modifierDrawingActive) {
      setDrawingPoints([]);
      return;
    }

    // Restore the real stroke color in Excalidraw appState
    excalidrawAPI.updateScene({
      appState: {
        currentItemStrokeColor: lastStrokeColorRef.current
      }
    });

    // Snapshot the completed stroke before Excalidraw's asynchronous commit.
    // A new pointer-down must not replace its points, modifiers, or local clock.
    const completedStrokePoints = livePointsRef.current && livePointsRef.current.length >= 2
      ? [...livePointsRef.current]
      : null;
    const completedStrokeModifiers = getDrawingModifiers();
    const completedStrokeElapsedMs = brushElapsedRef.current;
    const completedStrokeHideOriginal = nextStrokeHideOriginal;
    const completedPreviewId = ++pendingStrokePreviewIdRef.current;
    const frozenBrushGlobals = getBrushGlobals({
      elapsedMs: completedStrokeElapsedMs,
      isPointerDown: false
    });

    if (completedStrokePoints) {
      setPendingStrokePreview({
        id: completedPreviewId,
        points: completedStrokePoints,
        modifiers: completedStrokeModifiers,
        globals: frozenBrushGlobals,
        hideOriginal: completedStrokeHideOriginal,
      });
    }
    // Wait a brief tick for Excalidraw to finish writing the element
    setTimeout(() => {
      let scheduledStrokeRecord = false;
      try {
        const elements = excalidrawAPI.getSceneElements();
        if (!elements || elements.length === 0) return;

        // Find the last added freedraw element that hasn't been processed yet
        const lastElement = elements[elements.length - 1];
        if (
          lastElement &&
          lastElement.type === "freedraw" &&
          !lastElement.isDeleted &&
          !lastElement.__processed
        ) {
          lastElement.__processed = true;

          const pointsToUse = completedStrokePoints
            ? completedStrokePoints
            : lastElement.points.map(p => [lastElement.x + p[0], lastElement.y + p[1]]);

          lastElement.roundness = globalRoundness ? { type: 2 } : null;
          lastElement.strokeColor = lastStrokeColorRef.current;
          const drawingModifiers = completedStrokeModifiers;
          const shouldHideOriginal = completedStrokeHideOriginal && drawingModifiers.length > 0;
          let savedOpacity = lastElement.customData?.savedOpacity;
          if (shouldHideOriginal) {
            savedOpacity = lastElement.opacity > 0 ? lastElement.opacity : (savedOpacity ?? 100);
            lastElement.opacity = 0;
          }
          lastElement.customData = {
            ...lastElement.customData,
            hideOriginal: completedStrokeHideOriginal,
            muteModifiers: globalMuteStack,
            ...(savedOpacity !== undefined ? { savedOpacity } : {})
          };
          updateModifiedElementInScene(lastElement.id, drawingModifiers, pointsToUse, frozenBrushGlobals);
          window.setTimeout(() => {
            const finalElements = excalidrawAPI.getSceneElementsIncludingDeleted().filter(element =>
              element.id === lastElement.id || element.customData?.parentId === lastElement.id
            );
            recordCompletedStroke({
              finalElements,
              durationMs: completedStrokeElapsedMs,
              brush: {
                kind: "modifier-stack",
                modifiers: drawingModifiers,
                hideOriginal: completedStrokeHideOriginal,
                roundness: globalRoundness,
              },
            });
          }, 0);
          scheduledStrokeRecord = true;
        }
      } catch (err) {
        console.error("Error processing custom brush as modifier:", err);
        strokeRecordingSuppressedRef.current = false;
      } finally {
        if (!scheduledStrokeRecord) {
          strokeInputSamplesRef.current = [];
          strokeRecordingSuppressedRef.current = false;
        }
        setDrawingPoints([]);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setPendingStrokePreview(previous =>
            previous?.id === completedPreviewId ? null : previous
          ));
        });
      }
    }, 80);
  };
  
  // Chat States
  const [chatHistory, setChatHistory] = useState([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "assistant", content: INITIAL_GREETING }
  ]);
  const [userInput, setUserInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Settings States
  const [aiSettings, setAiSettings] = useState(() => {
    const saved = localStorage.getItem("drawerator_ai_settings");
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      provider: "ollama",
      url: "http://localhost:11434",
      model: ""
    };
  });
  const [modelsList, setModelsList] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("pending");
  const [toolLogs, setToolLogs] = useState([]);
  
  const messagesEndRef = useRef(null);

  // Sync theme to body class
  useEffect(() => {
    if (theme === "light") {
      document.body.classList.add("light-mode");
    } else {
      document.body.classList.remove("light-mode");
    }
    localStorage.setItem("drawerator_theme", theme);
  }, [theme]);

  // Scroll chat messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Test AI Connection & Fetch Models
  const testAIConnection = async (settings = aiSettings) => {
    setConnectionStatus("pending");
    const { provider } = settings;
    const url = cleanApiUrl(settings.url, provider);
    
    try {
      if (provider === "ollama") {
        const res = await fetch(`${url}/api/tags`);
        if (res.ok) {
          const data = await res.json();
          const list = data.models ? data.models.map(m => m.name) : [];
          setModelsList(list);
          setConnectionStatus("ok");
          if (list.length > 0 && !settings.model) {
            setAiSettings(prev => ({ ...prev, model: list[0] }));
          }
        } else {
          setConnectionStatus("error");
        }
      } else if (provider === "lmstudio") {
        const res = await fetch(`${url}/v1/models`);
        if (res.ok) {
          const data = await res.json();
          const list = data.data ? data.data.map(m => m.id) : [];
          setModelsList(list);
          setConnectionStatus("ok");
          if (list.length > 0 && !settings.model) {
            setAiSettings(prev => ({ ...prev, model: list[0] }));
          }
        } else {
          setConnectionStatus("error");
        }
      } else {
        setConnectionStatus("ok");
      }
    } catch (e) {
      setConnectionStatus("error");
    }
  };

  const ALL_TAGS = [
    { name: "@selection", description: "Selected elements (JSON)" },
    { name: "@selection-as-svg", description: "Selected elements (SVG)" },
    { name: "@selection-as-png", description: "Selected elements (PNG)" },
    { name: "@canvas", description: "Entire canvas (JSON)" },
    { name: "@canvas-as-svg", description: "Entire canvas (SVG)" },
    { name: "@canvas-as-png", description: "Entire canvas (PNG)" },
    { name: "@mermaid", description: "Create Mermaid diagrams" },
    { name: "@manim", description: "Math animation script" },
    { name: "@imagegen", description: "Generate images/illustrations" }
  ];

  const getFilteredTags = () => {
    if (!autocompleteSearch) return ALL_TAGS;
    return ALL_TAGS.filter(tag => tag.name.toLowerCase().includes(autocompleteSearch.toLowerCase()));
  };

  const getContextValue = async (type) => {
    if (!excalidrawAPI) return null;
    const allElements = excalidrawAPI.getSceneElements();
    const activeState = excalidrawAPI.getAppState();
    const files = excalidrawAPI.getFiles();

    const selectedElements = allElements.filter(el => activeState.selectedElementIds?.[el.id]);

    if (type.startsWith("selection") && selectedElements.length === 0) {
      return { error: "No elements are currently selected on the canvas." };
    }

    const targetElements = type.startsWith("selection") ? selectedElements : allElements.filter(el => !el.isDeleted);

    if (type === "selection" || type === "canvas") {
      const cleanElements = targetElements.map(el => ({
        type: el.type,
        id: el.id,
        x: Math.round(el.x),
        y: Math.round(el.y),
        w: Math.round(el.width),
        h: Math.round(el.height),
        points: el.points ? el.points.map(p => [Math.round(p[0]), Math.round(p[1])]) : undefined
      }));
      return { text: JSON.stringify(cleanElements, null, 2), type: "json" };
    }

    if (type === "selection-as-svg" || type === "canvas-as-svg") {
      try {
        const svgElement = await exportToSvg({
          elements: targetElements,
          appState: { ...activeState, exportBackground: true },
          files
        });
        return { text: svgElement.outerHTML, type: "svg" };
      } catch (err) {
        console.error(err);
        return { error: "Failed to export context as SVG." };
      }
    }

    if (type === "selection-as-png" || type === "canvas-as-png") {
      try {
        const canvas = await exportToCanvas({
          elements: targetElements,
          appState: { ...activeState, exportBackground: true },
          files
        });
        const dataUrl = canvas.toDataURL("image/png");
        return { dataUrl, type: "png" };
      } catch (err) {
        console.error(err);
        return { error: "Failed to export context as PNG." };
      }
    }

    return null;
  };

  const insertTextAtCursor = (text) => {
    const textarea = document.getElementById("chat-message-input");
    if (!textarea) {
      setUserInput(prev => prev + text);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;
    const newVal = currentVal.substring(0, start) + text + currentVal.substring(end);
    setUserInput(newVal);
    
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
    }, 50);
  };

  const handleAutocompleteSelect = (tagName) => {
    const textarea = document.getElementById("chat-message-input");
    if (!textarea) return;
    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = userInput.substring(0, cursorPosition);
    const lastAtIdx = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIdx !== -1) {
      const newVal = userInput.substring(0, lastAtIdx) + tagName + " " + userInput.substring(cursorPosition);
      setUserInput(newVal);
      setShowAutocomplete(false);
      setTimeout(() => {
        textarea.focus();
        const newCursorPos = lastAtIdx + tagName.length + 1;
        textarea.selectionStart = textarea.selectionEnd = newCursorPos;
      }, 50);
    }
  };

  const handleTextareaChange = (e) => {
    const val = e.target.value;
    setUserInput(val);

    const cursorPosition = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, cursorPosition);
    const lastWordMatch = textBeforeCursor.match(/@(\w*-?\w*)$/);

    if (lastWordMatch) {
      setShowAutocomplete(true);
      setAutocompleteSearch(lastWordMatch[1]);
      setAutocompleteIndex(0);
    } else {
      setShowAutocomplete(false);
    }
  };

  useEffect(() => {
    testAIConnection();
  }, [aiSettings.provider, aiSettings.url]);

  // Global Escape key listener to close context and autocomplete dropdowns
  useEffect(() => {
    const handleGlobalEscape = (e) => {
      if (e.key === "Escape") {
        let didClose = false;
        if (showContextDropdown) {
          setShowContextDropdown(false);
          didClose = true;
        }
        if (showAutocomplete) {
          setShowAutocomplete(false);
          didClose = true;
        }
        if (didClose) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalEscape, true);
    return () => window.removeEventListener("keydown", handleGlobalEscape, true);
  }, [showContextDropdown, showAutocomplete]);

  const saveSettings = () => {
    localStorage.setItem("drawerator_ai_settings", JSON.stringify(aiSettings));
    testAIConnection(aiSettings);
  };

  const logToolAction = (msg, status = "ok") => {
    setToolLogs(prev => [...prev, { msg, status, id: Date.now() + Math.random() }]);
  };

  // XML Parser that executes AI Tool tags in Excalidraw
  const executeAIToolCalls = (text, api) => {
    if (!api) return;
    
    if (/<clear\s*\/>/i.test(text)) {
      api.updateScene({ elements: [] });
      logToolAction("clear_canvas()", "ok");
    }

    const elements = [...api.getSceneElements()];
    let didChange = false;

    const parseAttrs = (str) => {
      const attrs = {};
      const regex = /(\w+)="([^"]*)"/g;
      let m;
      while ((m = regex.exec(str)) !== null) {
        attrs[m[1]] = m[2];
      }
      return attrs;
    };

    const draweratorCommandRegex = /<drawerator-command\s+id="([^"]+)"\s*>([\s\S]*?)<\/drawerator-command>/gi;
    let commandMatch;
    while ((commandMatch = draweratorCommandRegex.exec(text)) !== null) {
      try {
        const commandId = commandMatch[1];
        const args = commandMatch[2].trim() ? JSON.parse(commandMatch[2]) : {};
        commandRegistry.execute(commandId, args, {
          source: "ai",
          transportTime: scoreTimeRef.current,
        }).then(() => logToolAction(`command(${commandId})`, "ok"))
          .catch(error => logToolAction(`command(${commandId}): ${error.message}`, "error"));
      } catch (error) {
        logToolAction(`command(${commandMatch[1]}): ${error.message}`, "error");
      }
    }

    // 1. Draw Rectangles
    const rectRegex = /<rect\s+([^>]+)\/>/gi;
    let match;
    while ((match = rectRegex.exec(text)) !== null) {
      const attrs = parseAttrs(match[1]);
      const x = parseFloat(attrs.x || 0);
      const y = parseFloat(attrs.y || 0);
      const w = parseFloat(attrs.w || 100);
      const h = parseFloat(attrs.h || 100);
      const color = attrs.color || (theme === "light" ? "#0f172a" : "#f8fafc");
      
      const rect = {
        ...createBaseElement("rectangle", x, y, w, h, color),
        backgroundColor: attrs.fill || "transparent"
      };
      elements.push(rect);
      didChange = true;
      logToolAction(`rect(x:${x}, y:${y}, w:${w}, h:${h})`, "ok");
    }

    // 2. Draw Circles / Ellipses
    const circleRegex = /<circle\s+([^>]+)\/>/gi;
    while ((match = circleRegex.exec(text)) !== null) {
      const attrs = parseAttrs(match[1]);
      const cx = parseFloat(attrs.x || 0);
      const cy = parseFloat(attrs.y || 0);
      const r = parseFloat(attrs.r || 50);
      const color = attrs.color || (theme === "light" ? "#0f172a" : "#f8fafc");
      
      const ellipse = {
        ...createBaseElement("ellipse", cx - r, cy - r, r * 2, r * 2, color),
        backgroundColor: attrs.fill || "transparent"
      };
      elements.push(ellipse);
      didChange = true;
      logToolAction(`circle(x:${cx}, y:${cy}, r:${r})`, "ok");
    }

    // 3. Draw Lines
    const lineRegex = /<line\s+([^>]+)\/>/gi;
    while ((match = lineRegex.exec(text)) !== null) {
      const attrs = parseAttrs(match[1]);
      const x1 = parseFloat(attrs.x1 || 0);
      const y1 = parseFloat(attrs.y1 || 0);
      const x2 = parseFloat(attrs.x2 || 100);
      const y2 = parseFloat(attrs.y2 || 100);
      const color = attrs.color || (theme === "light" ? "#0f172a" : "#f8fafc");
      
      const dx = x2 - x1;
      const dy = y2 - y1;
      const width = Math.abs(dx);
      const height = Math.abs(dy);
      
      const line = {
        ...createBaseElement("line", x1, y1, width || 1, height || 1, color),
        points: [[0, 0], [dx, dy]]
      };
      elements.push(line);
      didChange = true;
      logToolAction(`line(x1:${x1}, x2:${x2})`, "ok");
    }

    // 4. Draw Freehand Paths
    const pathRegex = /<path\s+([^>]+)\/>/gi;
    while ((match = pathRegex.exec(text)) !== null) {
      const attrs = parseAttrs(match[1]);
      const pointsStr = attrs.points || "";
      const color = attrs.color || (theme === "light" ? "#0f172a" : "#f8fafc");
      
      const parts = pointsStr.trim().split(/\s+/);
      const pts = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      parts.forEach(p => {
        const coords = p.split(",");
        if (coords.length >= 2) {
          const px = parseFloat(coords[0]);
          const py = parseFloat(coords[1]);
          pts.push({ x: px, y: py });
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
      });
      
      if (pts.length > 1) {
        const relativePoints = pts.map(pt => [pt.x - minX, pt.y - minY]);
        const freedraw = {
          ...createBaseElement("freedraw", minX, minY, maxX - minX, maxY - minY, color),
          points: relativePoints,
          pressures: new Array(pts.length).fill(0.5)
        };
        elements.push(freedraw);
        didChange = true;
        logToolAction(`path(points:${pts.length})`, "ok");
      }
    }

    // 5. Erase Elements
    const eraseRegex = /<erase\s+id="([^"]+)"\s*\/>/gi;
    while ((match = eraseRegex.exec(text)) !== null) {
      const targetId = match[1];
      const idx = elements.findIndex(el => el.id === targetId);
      if (idx !== -1) {
        elements[idx] = { ...elements[idx], isDeleted: true };
        didChange = true;
        logToolAction(`erase(id:${targetId})`, "ok");
      }
    }

    if (didChange) {
      api.updateScene({ elements });
    }
  };

  // Submit chat text to Local LLM
  const sendChatMessage = async (msgOverride = null) => {
    const textToSend = msgOverride !== null ? msgOverride : userInput;
    if (!textToSend.trim() || isStreaming) return;
    
    const userMessage = textToSend.trim();
    if (msgOverride === null) setUserInput("");
    setIsStreaming(true);

    const allElements = excalidrawAPI ? excalidrawAPI.getSceneElements().filter(el => !el.isDeleted) : [];
    const appState = excalidrawAPI ? excalidrawAPI.getAppState() : {};
    const selectedIds = appState.selectedElementIds ? Object.keys(appState.selectedElementIds).filter(id => appState.selectedElementIds[id]) : [];
    const selectedElements = allElements.filter(el => selectedIds.includes(el.id));
    
    const canvasSummary = allElements.map(el => {
      if (el.type === "rectangle" || el.type === "ellipse") {
        return { id: el.id, type: el.type, x: Math.round(el.x), y: Math.round(el.y), w: Math.round(el.width), h: Math.round(el.height), color: el.strokeColor };
      } else if (el.type === "line") {
        return { id: el.id, type: el.type, x: Math.round(el.x), y: Math.round(el.y), points: el.points.map(p => [Math.round(p[0]), Math.round(p[1])]), color: el.strokeColor };
      } else if (el.type === "freedraw") {
        return { id: el.id, type: el.type, x: Math.round(el.x), y: Math.round(el.y), pointsCount: el.points.length, color: el.strokeColor };
      }
      return { id: el.id, type: el.type };
    });

    let processedMessage = userMessage;
    const imagesToAttach = [];

    // Check tags:
    if (userMessage.includes("@selection-as-png")) {
      const val = await getContextValue("selection-as-png");
      if (val?.error) {
        alert(val.error);
        return;
      }
      if (val?.dataUrl) imagesToAttach.push(val.dataUrl);
    }
    if (userMessage.includes("@canvas-as-png")) {
      const val = await getContextValue("canvas-as-png");
      if (val?.error) {
        alert(val.error);
        return;
      }
      if (val?.dataUrl) imagesToAttach.push(val.dataUrl);
    }

    if (userMessage.includes("@selection-as-svg")) {
      const val = await getContextValue("selection-as-svg");
      if (val?.error) {
        alert(val.error);
        return;
      }
      processedMessage += `\n\n[Context: @selection-as-svg]:\n\`\`\`xml\n${val.text}\n\`\`\``;
    }
    if (userMessage.includes("@canvas-as-svg")) {
      const val = await getContextValue("canvas-as-svg");
      if (val?.error) {
        alert(val.error);
        return;
      }
      processedMessage += `\n\n[Context: @canvas-as-svg]:\n\`\`\`xml\n${val.text}\n\`\`\``;
    }

    if (userMessage.includes("@selection") && !userMessage.includes("@selection-as-")) {
      const val = await getContextValue("selection");
      if (val?.error) {
        alert(val.error);
        return;
      }
      processedMessage += `\n\n[Context: @selection JSON]:\n${val.text}`;
    }
    if (userMessage.includes("@canvas") && !userMessage.includes("@canvas-as-")) {
      const val = await getContextValue("canvas");
      if (val?.error) {
        alert(val.error);
        return;
      }
      processedMessage += `\n\n[Context: @canvas JSON]:\n${val.text}`;
    }

    // Default fallback context if no explicit tags are used
    const hasExplicitTags = ["@selection", "@selection-as-svg", "@selection-as-png", "@canvas", "@canvas-as-svg", "@canvas-as-png"].some(tag => userMessage.includes(tag));
    if (!hasExplicitTags) {
      if (selectedElements.length > 0) {
        processedMessage += `\n\n[Active Selection Element Details]:\n${JSON.stringify(selectedElements.map(el => ({
          id: el.id,
          type: el.type,
          x: Math.round(el.x),
          y: Math.round(el.y),
          w: Math.round(el.width),
          h: Math.round(el.height),
          points: el.points ? el.points.map(p => [Math.round(p[0]), Math.round(p[1])]) : undefined
        })), null, 2)}`;
      }
      processedMessage += `\n\n[Full Excalidraw Scene JSON]:\n${JSON.stringify(canvasSummary)}`;
    }

    const newUserPayload = {
      role: "user",
      content: processedMessage,
      displayContent: userMessage,
      images: imagesToAttach.length > 0 ? imagesToAttach : undefined
    };

    const newHistory = [...chatHistory, newUserPayload];
    setChatHistory(newHistory);

    setChatHistory(prev => [...prev, { role: "assistant", content: "Thinking..." }]);

    const provider = aiSettings.provider;
    const url = cleanApiUrl(aiSettings.url, provider);
    const model = aiSettings.model || "default";

    const aiCommandCatalog = commandRegistry.list().map(command => ({
      id: command.id,
      name: command.name,
      args: command.args,
    }));
    const messagesPayload = newHistory.map(h => {
      if (h.role === "system") {
        return {
          role: "system",
          content: `${h.content}\n\nRegistered Drawerator commands (generated from the live registry):\n${JSON.stringify(aiCommandCatalog)}`,
        };
      }
      if (h.role === "user") {
        if (h.images && h.images.length > 0) {
          if (provider === "ollama") {
            const cleanImages = h.images.map(img => img.split(",")[1]);
            return {
              role: "user",
              content: h.content,
              images: cleanImages
            };
          } else {
            const contentArray = [{ type: "text", text: h.content }];
            h.images.forEach(img => {
              contentArray.push({
                type: "image_url",
                image_url: { url: img }
              });
            });
            return {
              role: "user",
              content: contentArray
            };
          }
        }
      }
      return {
        role: h.role,
        content: h.content
      };
    });

    try {
      let response;
      if (provider === "ollama") {
        response = await fetch(`${url}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: messagesPayload, stream: true })
        });
      } else {
        response = await fetch(`${url}/v1/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: messagesPayload, stream: true })
        });
      }

      if (!response.ok) {
        throw new Error("API call failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullResponse = "";

      if (provider === "ollama") {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunks = decoder.decode(value, { stream: true }).split("\n");
          chunks.forEach(chunk => {
            if (!chunk.trim()) return;
            try {
              const parsed = JSON.parse(chunk);
              if (parsed.message?.content) {
                fullResponse += parsed.message.content;
                setChatHistory(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: fullResponse };
                  return updated;
                });
              }
            } catch (e) {}
          });
        }
      } else {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const raw = decoder.decode(value, { stream: true });
          const lines = raw.split("\n");
          lines.forEach(line => {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              if (dataStr === "[DONE]") return;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.choices?.[0].delta?.content) {
                  fullResponse += parsed.choices[0].delta.content;
                  setChatHistory(prev => {
                    const updated = [...prev];
                    updated[updated.length - 1] = { role: "assistant", content: fullResponse };
                    return updated;
                  });
                }
              } catch (e) {}
            }
          });
        }
      }

      executeAIToolCalls(fullResponse, excalidrawAPI);

    } catch (e) {
      console.error(e);
      setChatHistory(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "Error: Unreachable local LLM endpoint. Please verify your connection settings." };
        return updated;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const clearChat = () => {
    if (window.confirm("Reset conversation history?")) {
      setChatHistory([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "assistant", content: INITIAL_GREETING }
      ]);
    }
  };

  const copyTranscript = () => {
    const transcript = chatHistory
      .filter(h => h.role !== "system")
      .map(h => `[${h.role === "user" ? "User" : "AI Assistant"}]:\n${h.displayContent || h.content}`)
      .join("\n\n");
      
    if (!transcript.trim()) return;

    navigator.clipboard.writeText(transcript).then(() => {
      alert("Transcript copied to clipboard!");
    });
  };

  const toggleBackgroundTransparency = (api) => {
    if (!api) return;
    const appState = api.getAppState();
    const isTransparent = isColorTransparent(appState.viewBackgroundColor);
    
    let nextColor;
    if (isTransparent) {
      nextColor = makeColorOpaque(appState.viewBackgroundColor, lastNonTransparentColorRef.current);
      if (theme === "dark" && (nextColor.toLowerCase() === "#ffffff" || nextColor.toLowerCase() === "#fff")) {
        nextColor = "#121212";
      } else if (theme === "light" && nextColor.toLowerCase() === "#121212") {
        nextColor = "#ffffff";
      }
    } else {
      nextColor = makeColorTransparent(appState.viewBackgroundColor || (theme === "dark" ? "#121212" : "#ffffff"));
    }
    
    api.updateScene({
      appState: {
        viewBackgroundColor: nextColor
      }
    });
  };

  const toggleDraweratorPanel = (panelId, options = {}) => {
    const panel = DRAWERATOR_PANELS.find(candidate => candidate.id === panelId);
    if (!panel) return;
    if (panel.id === "transport") {
      const forceOpen = Boolean(options.open);
      const isFrontmost = showIannixTransport && panelLayouts.transport.placement === PANEL_PLACEMENTS.BOTTOM && activeDockPanels.bottom === "transport";
      setShowIannixTransport(forceOpen ? true : !isFrontmost);
      if (forceOpen || !isFrontmost) setActiveDockPanels(previous => ({ ...previous, bottom: "transport" }));
      return;
    }
    if (panel.id === "settings" && options.settingsTab) {
      setActiveSettingsTab(options.settingsTab);
    }
    if (panel.id === "mods" && options.modsTab) {
      setModsPanelTab(options.modsTab);
    }
    const forceOpen = Boolean(options.settingsTab || options.modsTab || options.open);
    const placement = panelLayouts[panelId]?.placement;
    if (placement === PANEL_PLACEMENTS.BOTTOM) {
      const isFrontmost = Boolean(openPanels[panelId] && activeDockPanels.bottom === panelId);
      setOpenPanels(previous => ({ ...previous, [panelId]: forceOpen ? true : !isFrontmost }));
      if (forceOpen || !isFrontmost) setActiveDockPanels(previous => ({ ...previous, bottom: panelId }));
      return;
    }
    if (placement === PANEL_PLACEMENTS.LEFT || placement === PANEL_PLACEMENTS.RIGHT) {
      const isFrontmostExpandedPanel = Boolean(
        openPanels[panelId] &&
        activeDockPanels[placement] === panelId &&
        !collapsedDocks[placement]
      );
      setOpenPanels(previous => ({ ...previous, [panelId]: true }));
      setActiveDockPanels(previous => ({ ...previous, [placement]: panelId }));
      setCollapsedDocks(previous => ({
        ...previous,
        [placement]: forceOpen ? false : isFrontmostExpandedPanel,
      }));
      return;
    }
    setOpenPanels(previous => ({ ...previous, [panelId]: forceOpen ? true : !previous[panelId] }));
  };

  const closeDraweratorPanel = panelId => {
    setOpenPanels(previous => ({ ...previous, [panelId]: false }));
  };

  const toggleLibrary = () => {
    excalidrawAPI?.toggleSidebar({ name: "library" });
  };

  // --- COMMAND PALETTE LOGIC ---
  const PANEL_COMMANDS = DRAWERATOR_PANELS.map(panel => ({
    id: `panel-${panel.id}`,
    name: `Toggle ${panel.label} ${panel.slash}`,
    aliases: [panel.slash, panel.label, `panel ${panel.label}`],
    category: "Panels",
    record: "presentation",
    panel,
    action: () => {
      applyingRecordedUiStateRef.current = true;
      toggleDraweratorPanel(panel.id);
      finishApplyingRecordedUiState();
    },
  }));
  const COMMANDS = [
    ...PANEL_COMMANDS,
    { id: "toggle-satori", name: "Toggle Satori Mode (Zen) /satori", category: "View", action: () => { applyingRecordedUiStateRef.current = true; setSatoriMode(prev => !prev); finishApplyingRecordedUiState(); } },
    { id: "toggle-theme", name: "Toggle Dark/Light Theme", category: "View", action: (api) => { applyingRecordedUiStateRef.current = true; const next = theme === "dark" ? "light" : "dark"; setTheme(next); api?.updateScene({ appState: { theme: next } }); finishApplyingRecordedUiState(); } },
    { id: "toggle-chat", name: "Toggle AI Assistant Chat", category: "AI Chat", action: () => toggleDraweratorPanel("chat") },
    { id: "library", name: "Library /library", aliases: ["/library"], category: "Panels", action: toggleLibrary },
    { id: "new-chat", name: "Reset Conversation (New Chat)", category: "AI Chat", action: () => clearChat() },
    { id: "copy-transcript", name: "Copy Conversation Transcript", category: "AI Chat", action: () => copyTranscript() },
    { id: "settings-ai", name: "Open AI Configuration /settings-ai", aliases: ["/settings-ai"], category: "Panels", action: () => toggleDraweratorPanel("settings", { settingsTab: "ai" }) },
    { id: "clear-canvas", name: "Clear Sketchboard Canvas", category: "Canvas", action: (api) => api.updateScene({ elements: [] }) },
    { id: "toggle-transparency", name: "Toggle Canvas Background Transparency", category: "Canvas", action: (api) => toggleBackgroundTransparency(api) },
    { id: "reset-view", name: "Reset Zoom & Pan View", category: "Canvas", action: (api) => api.updateScene({ appState: { zoom: { value: 1 }, scrollX: 0, scrollY: 0 } }) },
    { id: "view.frameAll", name: "Frame All /frame all", aliases: ["/frame all", "Frame All"], category: "Canvas", record: "presentation", action: (api) => {
      const elements = api.getSceneElements().filter(element => !element.isDeleted);
      if (elements.length) api.scrollToContent(elements, { fitToContent: true, animate: true });
    } },
    { id: "view.frameSelected", name: "Frame Selected /frame selected", aliases: ["/frame selected", "Frame Selected"], category: "Canvas", record: "presentation", action: (api) => {
      const selectedIds = api.getAppState().selectedElementIds || {};
      const elements = api.getSceneElements().filter(element => !element.isDeleted && selectedIds[element.id]);
      if (elements.length) api.scrollToContent(elements, { fitToContent: true, animate: true });
    } },
    { id: "tool-select", name: "Select Pointer/Selection Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "selection", locked: tool.locked ?? false } } }); } },
    { id: "tool-rect", name: "Select Rectangle Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "rectangle", locked: tool.locked ?? false } } }); } },
    { id: "tool-ellipse", name: "Select Ellipse/Circle Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "ellipse", locked: tool.locked ?? false } } }); } },
    { id: "tool-line", name: "Select Straight Line Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "line", locked: tool.locked ?? false } } }); } },
    { id: "tool-freedraw", name: "Select Pencil/Freedraw Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "freedraw", locked: tool.locked ?? false } } }); } },
    { id: "tool-eraser", name: "Select Eraser Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "eraser", locked: tool.locked ?? false } } }); } },
    { id: "tool-hand", name: "Select Hand/Pan Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "hand", locked: tool.locked ?? false } } }); } },
    { id: "restore-original-stroke", name: "Restore Original Stroke (Recover Brush Replacement)", category: "Brushes", action: () => handleRestoreOriginalStroke() },
    { id: "convert-to-line", name: "Convert Selected Strokes to Straight Lines", category: "Brushes", action: () => handleConvertType("line") },
    { id: "convert-to-freedraw", name: "Convert Selected Lines to Freehand Pencil", category: "Brushes", action: () => handleConvertType("freedraw") },
    { id: "iannix.cursor.addToSelectedCurves", name: "Add Cursor to Selected Curves /add cursor to selected curves", aliases: ["/add cursor to selected curves", "Add Cursor to Selected Curves"], category: "IanniX", action: () => addCursorsToSelectedCurves() },
    { id: "geometry.bezier.convert", name: "Convert Selection to Bézier /bezier convert", aliases: ["/bezier convert", "Convert to Bézier"], category: "Geometry", action: () => convertSelectedToBezier() },
    { id: "geometry.bezier.edit", name: "Edit Selected Bézier /bezier edit", aliases: ["/bezier edit", "Edit Bézier"], category: "Geometry", action: () => enterBezierEditMode() },
    { id: "geometry.bezier.close", name: "Close Selected Bézier Path /bezier close", aliases: ["/bezier close"], category: "Geometry", action: () => setSelectedBezierClosed(true) },
    { id: "geometry.bezier.open", name: "Open Selected Bézier Path /bezier open", aliases: ["/bezier open"], category: "Geometry", action: () => setSelectedBezierClosed(false) },
    { id: "geometry.bezier.handles.smooth", name: "Set Bézier Anchor Smooth /bezier smooth", aliases: ["/bezier smooth"], category: "Geometry", action: () => setSelectedBezierHandleMode("smooth") },
    { id: "geometry.bezier.handles.corner", name: "Set Bézier Anchor Corner /bezier corner", aliases: ["/bezier corner"], category: "Geometry", action: () => setSelectedBezierHandleMode("corner") },
    { id: "geometry.bezier.anchor.insert", name: "Insert Bézier Anchor", category: "Geometry", args: { segmentIndex: "number", t: "number?" }, action: (_api, args) => insertSelectedBezierAnchor(args) },
    { id: "geometry.bezier.anchor.delete", name: "Delete Selected Bézier Anchor", category: "Geometry", action: () => deleteSelectedBezierAnchor() },
    { id: "iannix.export.bezier", name: "Export Selected Bézier Curves as IanniX /iannix export", aliases: ["/iannix export"], category: "IanniX", action: () => exportSelectedBezierIannix() },
    { id: "scene.create", name: "Create Scene Objects", category: "Scene", args: { elements: "element[]" }, action: (_api, args) => runtimeCallbacksRef.current.sceneCommand("scene.create", args) },
    { id: "scene.update", name: "Update Scene Objects", category: "Scene", args: { elements: "element[]" }, action: (_api, args) => runtimeCallbacksRef.current.sceneCommand("scene.update", args) },
    { id: "scene.delete", name: "Delete Scene Objects", category: "Scene", args: { elementIds: "string[]" }, action: (_api, args) => runtimeCallbacksRef.current.sceneCommand("scene.delete", args) },
    { id: "transport.update", name: "Update Transport State", category: "Transport", args: { state: "transportState" }, action: (_api, args) => runtimeCallbacksRef.current.transportUpdate(args?.state || args) },
    { id: "transport.seek", name: "Seek Global Transport", category: "Transport", args: { seconds: "number" }, action: (_api, args) => runtimeCallbacksRef.current.transportSeek(Number(args?.seconds) || 0) },
    { id: "presentation.panels", name: "Update Panel Presentation", category: "Panels", record: "presentation", args: { state: "panelState" }, action: (_api, args) => runtimeCallbacksRef.current.panelStateUpdate(args?.state || args) },
    { id: "settings.board.update", name: "Update Board Settings", category: "Settings", record: "presentation", args: { state: "boardSettings" }, sensitiveArgs: ["state.credentials", "state.apiKey", "state.token"], action: (_api, args) => runtimeCallbacksRef.current.boardSettingsUpdate(args?.state || args) },
    { id: "grid.global.update", name: "Update Global Grid /grid update", aliases: ["/grid update"], category: "Grid", args: { patch: "gridPatch" }, action: (_api, args) => runtimeCallbacksRef.current.globalGridUpdate(args?.patch || args) },
    { id: "grid.global.reset", name: "Reset Global Grid /grid reset", aliases: ["/grid reset"], category: "Grid", action: () => runtimeCallbacksRef.current.globalGridReset() },
    { id: "grid.visible.toggle", name: "Toggle Global Grid Visibility /grid visible", aliases: ["/grid visible"], category: "Grid", action: () => runtimeCallbacksRef.current.globalGridUpdate({ appearance: { visible: !globalGridRef.current.appearance.visible } }) },
    { id: "grid.snap.toggle", name: "Toggle Global Grid Snapping /grid snap", aliases: ["/grid snap"], category: "Grid", action: () => runtimeCallbacksRef.current.globalGridUpdate({ snap: { mode: globalGridRef.current.snap.mode === "off" ? "hard" : "off" } }) },
    { id: "grid.quantize.selection", name: "Quantize Selection to Global Grid /grid quantize", aliases: ["/grid quantize"], category: "Grid", args: { elementIds: "string[]?", resolution: "minor|major?", axes: "x|y|both?" }, action: (_api, args) => runtimeCallbacksRef.current.gridQuantizeSelection(args) },
    { id: "history.record.start", name: "Start Session Recording /record start", aliases: ["/record start"], category: "History", record: "never", action: () => runtimeCallbacksRef.current.historyStart({ play: false }) },
    { id: "history.record.play", name: "Record and Play /record play", aliases: ["/record play"], category: "History", record: "never", action: () => runtimeCallbacksRef.current.historyStart({ play: true }) },
    { id: "history.record.pause", name: "Pause or Resume Recording /record pause", aliases: ["/record pause"], category: "History", record: "never", action: () => runtimeCallbacksRef.current.historyPause() },
    { id: "history.record.stop", name: "Stop Session Recording /record stop", aliases: ["/record stop"], category: "History", record: "never", action: () => runtimeCallbacksRef.current.historyStop() },
    { id: "history.play", name: "Play Session /history play", aliases: ["/history play"], category: "History", record: "never", action: () => runtimeCallbacksRef.current.historyPlay() },
    { id: "history.seek", name: "Seek Session /history seek", aliases: ["/history seek"], category: "History", record: "never", args: { seconds: "number" }, action: (_api, args) => runtimeCallbacksRef.current.historySeek(Number(args?.seconds) || 0) },
    { id: "automation.autokey.toggle", name: "Toggle Auto-key /autokey", aliases: ["/autokey"], category: "History", record: "presentation", action: () => setAutoKeyEnabled(enabled => !enabled) },
    { id: "macro.save", name: "Save Session as Sequence /macro save", aliases: ["/macro save"], category: "History", record: "never", args: { name: "string?" }, action: (_api, args) => runtimeCallbacksRef.current.macroSave(null, args?.name) },
    { id: "macro.insert", name: "Insert Sequence /macro insert", aliases: ["/macro insert"], category: "History", args: { id: "string", mode: "relative|absolute" }, action: (_api, args) => runtimeCallbacksRef.current.macroInsert(args) },
    { id: "iannix.import.trusted", name: "Import Trusted IanniX Script /iannix import", aliases: ["/iannix import"], category: "IanniX", args: { source: "string", filename: "string?", seed: "number?", anchor: "point?", scale: "number?", importId: "string?", parameters: "object?" }, validate: args => ({ ...args, importId: args?.importId || crypto.randomUUID() }), action: (_api, args) => runtimeCallbacksRef.current.iannixImport(args) },
    { id: "iannix.command.execute", name: "Execute IanniX Command", category: "IanniX", args: { command: "string" }, action: (_api, args) => runtimeCallbacksRef.current.iannixCommand(args?.command) },
    { id: "ai.prompt", name: "Send AI Prompt", category: "AI Chat", args: { prompt: "string" }, action: (_api, args) => { openAISidebar(); return sendChatMessage(args?.prompt || ""); } },
  ];

  commandActionsRef.current = new Map(COMMANDS.map(command => [command.id, command]));
  const commandRegistrySignature = COMMANDS.map(command => `${command.id}:${command.version || 1}`).join("|");
  useEffect(() => {
    const currentCommands = [...commandActionsRef.current.values()];
    commandRegistry.replace(currentCommands.map(command => ({
      ...command,
      title: command.name,
      execute: async (args, _context, metadata) => {
        const current = commandActionsRef.current.get(command.id);
        if (!current) throw new Error(`Command is no longer available: ${command.id}`);
        historySuppressSceneRef.current += 1;
        try {
          return await current.action(excalidrawAPIRef.current, args, metadata);
        } finally {
          window.setTimeout(() => {
            historySuppressSceneRef.current = Math.max(0, historySuppressSceneRef.current - 1);
          }, 0);
        }
      },
    })));
  }, [commandRegistry, commandRegistrySignature]);

  const paletteInputRef = useRef(null);
  const lastNonTransparentColorRef = useRef(theme === "dark" ? "#121212" : "#ffffff");

  // Toggle Command Palette on Cmd + / and Satori Mode on Opt + Shift + Z
  useEffect(() => {
    const refreshCanvasToolCursor = () => {
      const point = lastCanvasPointerRef.current;
      if (!point) return;
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const target = document.elementFromPoint(point[0], point[1]);
        if (!target?.closest?.("#canvas-container")) return;
        target.dispatchEvent(new PointerEvent("pointermove", {
          bubbles: true,
          clientX: point[0],
          clientY: point[1],
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }));
      }));
    };
    const handleKeyDown = (e) => {
      // Escape is a global cancel/clear gesture: close transient UI, blur any
      // focused control, leave Bézier editing, and clear the canvas selection.
      // Keep this capture-phase so it also works from number boxes and menus.
      if (e.key === "Escape") {
        const activeElement = document.activeElement;
        const hadFocus = activeElement && activeElement !== document.body;
        if (showContextDropdown) setShowContextDropdown(false);
        if (showAutocomplete) setShowAutocomplete(false);
        if (showCommandPalette) setShowCommandPalette(false);
        if (hadFocus && typeof activeElement.blur === "function") activeElement.blur();
        if (bezierEditElementId) exitBezierEditMode();
        if (excalidrawAPI) {
          excalidrawAPI.updateScene({ appState: { selectedElementIds: {} } });
        }
        runtimeCursorSelectionRef.current = {};
        if (hadFocus || showContextDropdown || showAutocomplete || showCommandPalette || bezierEditElementId) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // Space controls score transport from the canvas/UI. Text controls keep
      // their native spacebar behavior so users can still type normally.
      const activeElement = document.activeElement;
      const isTextControlFocused = activeElement && (
        activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.tagName === "SELECT" ||
        activeElement.isContentEditable ||
        activeElement.closest?.(".cm-editor")
      );
      const shortcutAction = !isTextControlFocused ? findShortcutAction(shortcutBindings, e) : null;
      if (shortcutAction) {
        if (shortcutAction.id !== "tool-line" && excalidrawAPI?.getAppState()?.activeTool?.type === "line" && nativeLineGridPointsRef.current?.points?.length >= 2) {
          finalizeCapturedNativeLine();
        }
        e.preventDefault();
        e.stopPropagation();
        commandRegistry.execute(shortcutAction.commandId || shortcutAction.id, {}, {
          source: "shortcut",
          transportTime: scoreTimeRef.current,
        });
        refreshCanvasToolCursor();
        return;
      }
      if (e.code === "Enter" && !isTextControlFocused && excalidrawAPI?.getAppState()?.activeTool?.type === "line" && nativeLineGridPointsRef.current?.points?.length >= 2) {
        finalizeCapturedNativeLine();
      }
      if (e.code === "Space" && !isTextControlFocused && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        setScorePlaying(playing => !playing);
        return;
      }

      // Keep H deterministic across browsers; Excalidraw's hand tool uses the
      // same activeTool value and still handles its normal temporary hand mode.
      if (e.code === "KeyH" && !isTextControlFocused && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        excalidrawAPI?.updateScene({ appState: { activeTool: { type: "hand", locked: false } } });
        return;
      }

      // Cmd + / or Ctrl + /
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        e.stopPropagation();
        setShowCommandPalette(prev => !prev);
      }
      // Cmd + Ctrl + Z
      if (e.metaKey && e.ctrlKey && e.code === "KeyZ") {
        e.preventDefault();
        e.stopPropagation();
        setSatoriMode(prev => !prev);
      }
      // Ctrl + Option + T, with legacy Cmd + Ctrl + T support (Toggle transport)
      if (((e.ctrlKey && e.altKey) || (e.metaKey && e.ctrlKey)) && e.code === "KeyT") {
        e.preventDefault();
        e.stopPropagation();
        commandRegistry.execute("panel-transport", {}, { source: "shortcut", transportTime: scoreTimeRef.current });
      }
      // Opt + Shift + D (Theme toggle)
      if (e.altKey && e.shiftKey && e.code === "KeyD") {
        e.preventDefault();
        e.stopPropagation();
        commandRegistry.execute("toggle-theme", {}, { source: "shortcut", transportTime: scoreTimeRef.current });
      }
      // Cmd + Shift + 0 or Ctrl + Shift + 0 (Toggle background transparency)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "Digit0") {
        e.preventDefault();
        e.stopPropagation();
        toggleBackgroundTransparency(excalidrawAPI);
      }
      // Cmd + Shift + , or Cmd + , (Toggle Settings Panel)
      if ((e.metaKey || e.ctrlKey) && (e.key === "," || e.code === "Comma")) {
        e.preventDefault();
        e.stopPropagation();
        commandRegistry.execute("panel-settings", {}, { source: "shortcut", transportTime: scoreTimeRef.current });
      }
      // Ctrl + Option + A (Toggle AI Chat Panel)
      if (e.ctrlKey && e.altKey && e.code === "KeyA") {
        e.preventDefault();
        e.stopPropagation();
        commandRegistry.execute("panel-chat", {}, { source: "shortcut", transportTime: scoreTimeRef.current });
      }
      // Cmd + B collapses/reveals the left dock; Cmd + Option + B does the right dock.
      if (e.metaKey && !e.ctrlKey && e.code === "KeyB") {
        e.preventDefault();
        e.stopPropagation();
        const side = e.altKey ? PANEL_PLACEMENTS.RIGHT : PANEL_PLACEMENTS.LEFT;
        setCollapsedDocks(previous => ({ ...previous, [side]: !previous[side] }));
      }
      // Ctrl + Option + B (Open the script editor in Mods & FX)
      if (e.ctrlKey && e.altKey && e.code === "KeyB") {
        e.preventDefault();
        e.stopPropagation();
        setModsPanelTab("script");
        commandRegistry.execute("panel-mods", {}, { source: "shortcut", transportTime: scoreTimeRef.current });
      }
      // Ctrl + Option + P (Toggle Modifiers/Properties Sidebar Panel)
      if (e.ctrlKey && e.altKey && e.code === "KeyP") {
        e.preventDefault();
        e.stopPropagation();
        commandRegistry.execute("panel-mods", {}, { source: "shortcut", transportTime: scoreTimeRef.current });
      }
      // Ctrl + Option + R toggles session recording without changing transport playback.
      if (e.ctrlKey && e.altKey && e.code === "KeyR") {
        e.preventDefault();
        e.stopPropagation();
        const commandId = historyController.status.startsWith("recording") ? "history.record.stop" : "history.record.start";
        commandRegistry.execute(commandId, {}, { source: "shortcut", record: false, transportTime: scoreTimeRef.current });
      }
      // Cmd + Option + P (Pin / unpin Modifiers sidebar)
      if (e.metaKey && e.altKey && !e.ctrlKey && e.code === "KeyP") {
        e.preventDefault();
        e.stopPropagation();
        setPanelLayouts(previous => ({
          ...previous,
          mods: {
            ...previous.mods,
            placement: previous.mods.placement === PANEL_PLACEMENTS.FLOATING
              ? PANEL_PLACEMENTS.RIGHT
              : PANEL_PLACEMENTS.FLOATING,
          },
        }));
        setOpenPanels(previous => ({ ...previous, mods: true }));
      }

      // Keyboard shortcuts check for non-input focus
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.contentEditable === "true" ||
        activeEl.closest?.(".cm-editor")
      );

      if (!isInputFocused && !e.metaKey && !e.ctrlKey && !e.altKey && e.code === "Home") {
        e.preventDefault();
        e.stopPropagation();
        commandRegistry.execute(e.shiftKey ? "view.frameSelected" : "view.frameAll", {}, {
          source: "shortcut",
          transportTime: scoreTimeRef.current,
        });
      }

      if (!isInputFocused && !e.metaKey && !e.ctrlKey && !e.altKey && e.code === "NumpadDecimal") {
        e.preventDefault();
        e.stopPropagation();
        commandRegistry.execute("view.frameSelected", {}, {
          source: "shortcut",
          transportTime: scoreTimeRef.current,
        });
      }

      if (
        !isInputFocused &&
        !e.metaKey && !e.ctrlKey && !e.altKey &&
        new Set(["KeyV", "KeyP", "KeyR", "KeyO", "KeyD", "KeyA", "KeyL", "KeyT", "KeyE", "KeyH", "KeyI"]).has(e.code)
      ) {
        refreshCanvasToolCursor();
      }

      if (!isInputFocused) {
        // Shift + P (Toggle Custom Brush Mode)
        if (e.shiftKey && !e.ctrlKey && !e.altKey && e.code === "KeyP") {
          e.preventDefault();
          e.stopPropagation();
          const nextState = !customBrushActive;
          setCustomBrushActive(nextState);
          if (nextState) {
            excalidrawAPI?.updateScene({ appState: { activeTool: { type: "freedraw", locked: true } } });
          } else {
            excalidrawAPI?.updateScene({ appState: { activeTool: { type: "selection" } } });
          }
        }
        
        // Ctrl + Shift + P (Apply active brush style to selected strokes)
        if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === "KeyP") {
          e.preventDefault();
          e.stopPropagation();
          handleApplyBrushToSelected();
        }

        // Shift + R (Toggle sharp / smooth edges)
        if (e.shiftKey && !e.ctrlKey && !e.altKey && e.code === "KeyR" && excalidrawAPI) {
          e.preventDefault();
          e.stopPropagation();
          const appState = excalidrawAPI.getAppState();
          const selectedIds = appState.selectedElementIds || {};
          const elements = excalidrawAPI.getSceneElements();
          
          let count = 0;
          const nextElements = elements.map(el => {
            if (selectedIds[el.id] && !el.isDeleted) {
              if (
                el.type === "freedraw" ||
                el.type === "line" ||
                el.type === "rectangle" ||
                el.type === "diamond"
              ) {
                count++;
                return {
                  ...el,
                  roundness: el.roundness ? null : { type: 2 },
                  version: el.version + 1,
                  versionNonce: Math.floor(Math.random() * 1000000),
                  updated: Date.now()
                };
              }
            }
            return el;
          });
          
          if (count > 0) {
            excalidrawAPI.updateScene({
              elements: nextElements,
              commitToHistory: true
            });
          } else {
            // Toggle our global custom brush roundness switch!
            setCustomBrushRoundness(prev => !prev);

            // Toggle currentItemRoundnessType in appState: 2 is smooth, 1 is sharp
            const currentType = appState.currentItemRoundnessType;
            const nextType = currentType === 2 ? 1 : 2;
            excalidrawAPI.updateScene({
              appState: {
                currentItemRoundnessType: nextType
              }
            });
          }
        }
      }

      // Brackets adjust stroke width; Shift uses a one-tenth step.
      const strokeWidthShortcut = getStrokeWidthShortcut(e);
      if (strokeWidthShortcut && excalidrawAPI) {
        const activeEl = document.activeElement;
        if (
          !activeEl ||
          (activeEl.tagName !== "INPUT" &&
            activeEl.tagName !== "TEXTAREA" &&
            activeEl.contentEditable !== "true")
        ) {
          const appState = excalidrawAPI.getAppState();
          const activeTool = appState.activeTool?.type;
          
          const selectedElements = excalidrawAPI.getSceneElements().filter(
            (el) => !el.isDeleted && appState.selectedElementIds?.[el.id]
          );
          const hasSelectedPenOrLine = selectedElements.some(
            (el) => el.type === "freedraw" || el.type === "line"
          );
          
          const isPenOrLine =
            activeTool === "freedraw" ||
            activeTool === "line" ||
            hasSelectedPenOrLine;

          if (isPenOrLine) {
            e.preventDefault();
            e.stopPropagation();
            const currentWidth = appState.currentItemStrokeWidth ?? 1;
            const newWidth = stepStrokeWidth(
              currentWidth,
              strokeWidthShortcut.direction,
              strokeWidthShortcut.fine,
            );

            if (newWidth !== currentWidth) {
              const updatedElements = excalidrawAPI.getSceneElements().map((el) => {
                if (
                  appState.selectedElementIds?.[el.id] &&
                  (el.type === "freedraw" || el.type === "line")
                ) {
                  return { ...el, strokeWidth: newWidth };
                }
                return el;
              });

              excalidrawAPI.updateScene({
                elements: updatedElements,
                appState: {
                  currentItemStrokeWidth: newWidth
                }
              });
            }
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [theme, excalidrawAPI, customBrushActive, activeBrushId, shortcutBindings, commandRegistry]);

  // Autofocus input when Command Palette opens
  useEffect(() => {
    if (showCommandPalette) {
      setTimeout(() => paletteInputRef.current?.focus(), 50);
      setCommandSearch("");
      setSelectedIndex(0);
    }
  }, [showCommandPalette]);

  const getExcalidrawInstance = () => {
    try {
      const container = document.getElementById("canvas-container");
      const wrapper = container?.querySelector(".excalidraw");
      const fiberKey = Object.keys(wrapper || {}).find(key => key.startsWith("__reactFiber$"));
      const fiber = wrapper?.[fiberKey];
      let current = fiber;
      while (current) {
        if (current.stateNode && current.stateNode.refresh && current.stateNode.isMobileBreakpoint) {
          return current.stateNode;
        }
        current = current.return;
      }
    } catch (e) {
      console.error("Failed to get Excalidraw instance:", e);
    }
    return null;
  };

  const applyForceDesktopOverride = (shouldRefresh = true) => {
    try {
      const instance = getExcalidrawInstance();
      if (!instance) return;
      
      let changed = false;
      if (forceDesktopLayout) {
        if (!instance.__originalIsMobileBreakpoint) {
          instance.__originalIsMobileBreakpoint = instance.isMobileBreakpoint;
        }
        if (instance.isMobileBreakpoint.toString() !== "() => false") {
          instance.isMobileBreakpoint = () => false;
          changed = true;
        }
        if (instance.device && (
          instance.device.viewport.isMobile ||
          instance.device.editor.isMobile ||
          instance.device.editor.canFitSidebar === false
        )) {
          instance.device = {
            ...instance.device,
            viewport: { ...instance.device.viewport, isMobile: false },
            editor: { ...instance.device.editor, isMobile: false, canFitSidebar: true }
          };
          changed = true;
        }
      } else {
        if (instance.__originalIsMobileBreakpoint && instance.isMobileBreakpoint !== instance.__originalIsMobileBreakpoint) {
          instance.isMobileBreakpoint = instance.__originalIsMobileBreakpoint;
          changed = true;
        }
      }
      
      if (changed && shouldRefresh) {
        instance.refresh();
      }
    } catch (err) {
      console.error("Failed to apply layout override:", err);
    }
  };

  useEffect(() => {
    if (excalidrawAPI) {
      const timer = setTimeout(() => {
        applyForceDesktopOverride(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [excalidrawAPI, forceDesktopLayout]);

  // Start with active pen tool when entering Satori Mode
  useEffect(() => {
    if (excalidrawAPI && satoriMode) {
      const tool = excalidrawAPI.getAppState().activeTool || {};
      excalidrawAPI.updateScene({
        appState: {
          activeTool: { ...tool, type: "freedraw", locked: tool.locked ?? false },
          currentItemRoughness: 0
        }
      });
    }
  }, [excalidrawAPI, satoriMode]);

  const getFilteredCommands = () => {
    const query = commandSearch.toLowerCase().trim();
    const matches = COMMANDS.filter(cmd => 
      cmd.name.toLowerCase().includes(query) || 
      cmd.category.toLowerCase().includes(query) ||
      cmd.aliases?.some(alias => alias.toLowerCase().includes(query))
    );
    
    if (commandSearch.trim() !== "" && !query.startsWith("/")) {
      matches.unshift({
        id: "ask-ai",
        name: `Ask AI: "${commandSearch}"`,
        category: "AI Query"
      });
    }
    
    return matches;
  };

  const parseSlashInvocation = value => {
    const input = String(value || "").trim();
    if (!input.startsWith("/")) return null;
    const exact = COMMANDS.find(command => command.aliases?.includes(input));
    if (exact) return { command: exact, args: {} };
    let match = /^\/history\s+seek\s+([0-9.]+)$/i.exec(input);
    if (match) return { command: COMMANDS.find(command => command.id === "history.seek"), args: { seconds: Number(match[1]) } };
    match = /^\/macro\s+save(?:\s+(.+))?$/i.exec(input);
    if (match) return { command: COMMANDS.find(command => command.id === "macro.save"), args: { name: match[1]?.trim() || "" } };
    match = /^\/macro\s+insert\s+(.+?)(?:\s+(relative|absolute))?$/i.exec(input);
    if (match) return {
      command: COMMANDS.find(command => command.id === "macro.insert"),
      args: { query: match[1].trim(), mode: match[2] || "relative" },
    };
    const generic = parseGenericCommandSlash(input, COMMANDS.map(command => command.id));
    if (generic) {
      if (generic.error) return generic;
      return { command: COMMANDS.find(command => command.id === generic.id), args: generic.args };
    }
    return null;
  };

  const openAISidebar = () => {
    setOpenPanels(previous => ({ ...previous, chat: true }));
    const placement = panelLayouts.chat.placement;
    if (placement === PANEL_PLACEMENTS.LEFT || placement === PANEL_PLACEMENTS.RIGHT) {
      setActiveDockPanels(previous => ({ ...previous, [placement]: "chat" }));
    }
  };

  const executeCommand = async (cmd, args = {}, source = "palette") => {
    setShowCommandPalette(false);
    if (cmd.id === "ask-ai") {
      return commandRegistry.execute("ai.prompt", { prompt: commandSearch }, { source, transportTime: scoreTimeRef.current });
    }
    try {
      return await commandRegistry.execute(cmd.id, args, { source, transportTime: scoreTimeRef.current });
    } catch (error) {
      console.error("Drawerator command failed", error);
      setSceneExchangeStatus(error.message || "Command failed.");
    }
  };

  const getSelectedElements = () => {
    if (!excalidrawAPI) return [];
    const elements = excalidrawAPI.getSceneElements();
    return elements.filter(el => selectedElementIds[el.id] && !el.isDeleted);
  };

  const commitBezierElement = (elementId, geometry, { commitToHistory = true } = {}) => {
    if (!excalidrawAPI) return null;
    let updated = null;
    const nextElements = excalidrawAPI.getSceneElementsIncludingDeleted().map(element => {
      if (element.id !== elementId || element.isDeleted) return element;
      const nextVersion = (element.version || 0) + 1;
      const next = setElementBezierGeometry(element, geometry);
      next.version = nextVersion;
      next.versionNonce = Math.floor(Math.random() * 0x7fffffff);
      next.updated = Date.now();
      next.customData = {
        ...(next.customData || {}),
        version: (next.customData?.version || 0) + 1,
        ...(next.customData?.modifiers?.length ? { excalidrawVersion: nextVersion } : {}),
      };
      updated = next;
      return next;
    });
    if (!updated) return null;
    excalidrawAPI.updateScene({ elements: nextElements, commitToHistory });
    setModifierUpdateNonce(nonce => nonce + 1);
    return updated;
  };

  const convertSelectedToBezier = () => {
    if (!excalidrawAPI) return [];
    const selected = getSelectedElements().filter(element => ["line", "freedraw"].includes(element.type));
    if (!selected.length) throw new Error("Select at least one line or freehand path to convert.");
    const targets = new Map();
    for (const element of selected) {
      const geometry = hasCubicBezierGeometry(element)
        ? normalizeBezierGeometry(element.customData.draweratorGeometry)
        : createBezierGeometryFromElement(element);
      if (geometry) targets.set(element.id, geometry);
    }
    const nextElements = excalidrawAPI.getSceneElementsIncludingDeleted().map(element => {
      const geometry = targets.get(element.id);
      if (!geometry) return element;
      const nextVersion = (element.version || 0) + 1;
      const next = setElementBezierGeometry(element, geometry);
      return {
        ...next,
        version: nextVersion,
        versionNonce: Math.floor(Math.random() * 0x7fffffff),
        updated: Date.now(),
        customData: {
          ...(next.customData || {}),
          version: (next.customData?.version || 0) + 1,
          ...(next.customData?.modifiers?.length ? { excalidrawVersion: nextVersion } : {}),
        },
      };
    });
    excalidrawAPI.updateScene({
      elements: nextElements,
      appState: { editingLinearElement: null, selectedLinearElement: null },
      commitToHistory: true,
    });
    setModifierUpdateNonce(nonce => nonce + 1);
    return [...targets.keys()];
  };

  // Remove Drawerator's canonical spline metadata while retaining the sampled
  // host path. This makes the conversion reversible without changing the
  // element's Excalidraw identity, selection, or transforms.
  const convertSelectedFromBezier = () => {
    if (!excalidrawAPI) return [];
    const selected = getSelectedElements().filter(hasCubicBezierGeometry);
    if (!selected.length) throw new Error("Select at least one spline path to convert.");
    const selectedIds = new Set(selected.map(element => element.id));
    const convertedIds = [];
    const nextElements = excalidrawAPI.getSceneElementsIncludingDeleted().map(element => {
      if (!selectedIds.has(element.id) || element.isDeleted) return element;
      const { draweratorGeometry: _geometry, ...remainingCustomData } = element.customData || {};
      convertedIds.push(element.id);
      return {
        ...element,
        customData: remainingCustomData,
        roundness: null,
        version: (element.version || 0) + 1,
        versionNonce: Math.floor(Math.random() * 0x7fffffff),
        updated: Date.now(),
      };
    });
    excalidrawAPI.updateScene({ elements: nextElements, commitToHistory: true });
    setModifierUpdateNonce(nonce => nonce + 1);
    return convertedIds;
  };

  const enterBezierEditMode = () => {
    const selected = getSelectedElements().find(hasCubicBezierGeometry);
    if (!selected) throw new Error("Select a Bézier path first.");
    setBezierEditElementId(selected.id);
    setBezierSelectedAnchor(0);
    const activeTool = excalidrawAPI.getAppState().activeTool || {};
    excalidrawAPI.updateScene({ appState: { activeTool: { ...activeTool, type: "selection" }, editingLinearElement: null, selectedLinearElement: null } });
    return selected.id;
  };

  const exitBezierEditMode = () => {
    bezierDragRef.current = null;
    setBezierEditElementId(null);
    setBezierSelectedAnchor(null);
  };

  const setSelectedBezierClosed = closed => {
    const element = getSelectedElements().find(hasCubicBezierGeometry);
    if (!element) throw new Error("Select a Bézier path first.");
    return commitBezierElement(element.id, { ...element.customData.draweratorGeometry, closed: closed === undefined ? !element.customData.draweratorGeometry.closed : Boolean(closed) });
  };

  const setSelectedBezierHandleMode = mode => {
    const element = getSelectedElements().find(hasCubicBezierGeometry);
    if (!element) throw new Error("Select a Bézier path first.");
    const index = Number.isInteger(bezierSelectedAnchor) ? bezierSelectedAnchor : 0;
    return commitBezierElement(element.id, setBezierAnchorMode(element.customData.draweratorGeometry, index, mode));
  };

  const insertSelectedBezierAnchor = args => {
    const element = getSelectedElements().find(hasCubicBezierGeometry);
    if (!element) throw new Error("Select a Bézier path first.");
    const segmentIndex = Math.max(0, Math.min(element.customData.draweratorGeometry.anchors.length - 1, Math.round(Number(args?.segmentIndex) || 0)));
    const geometry = splitBezierSegment(element.customData.draweratorGeometry, segmentIndex, Number.isFinite(Number(args?.t)) ? Number(args.t) : 0.5);
    commitBezierElement(element.id, geometry);
    setBezierSelectedAnchor(segmentIndex + 1);
    return geometry;
  };

  const deleteSelectedBezierAnchor = () => {
    const element = getSelectedElements().find(hasCubicBezierGeometry);
    if (!element) throw new Error("Select a Bézier path first.");
    const index = Number.isInteger(bezierSelectedAnchor) ? bezierSelectedAnchor : element.customData.draweratorGeometry.anchors.length - 1;
    const geometry = removeBezierAnchor(element.customData.draweratorGeometry, index);
    commitBezierElement(element.id, geometry);
    setBezierSelectedAnchor(Math.min(index, geometry.anchors.length - 1));
    return geometry;
  };

  const exportSelectedBezierIannix = () => {
    const selected = getSelectedElements().filter(hasCubicBezierGeometry);
    if (!selected.length) throw new Error("Select at least one Bézier curve to export.");
    const commands = ["/* Exported by Drawerator */", "run(\"clear\");"];
    selected.forEach((element, index) => {
      const importData = element.customData?.iannixImport || {};
      const elementCommands = serializeBezierElementToIannixCommands(element, {
        externalId: importData.externalId ?? index + 1,
        scale: importData.scale || 1,
        anchor: importData.anchor || [0, 0],
      });
      elementCommands.forEach(command => commands.push(`run(${JSON.stringify(command)});`));
    });
    const source = `${commands.join("\n")}\n`;
    downloadTextFile(source, `drawerator-curves-${new Date().toISOString().slice(0, 10)}.iannix`, "text/javascript");
    return source;
  };

  useEffect(() => {
    if (!bezierEditElementId) return undefined;
    const handleKeyDown = event => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
      if (event.key === "Escape") {
        event.preventDefault();
        exitBezierEditMode();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && Number.isInteger(bezierSelectedAnchor)) {
        const element = getBezierEditElement();
        if (!element) return;
        event.preventDefault();
        event.stopPropagation();
        const geometry = removeBezierAnchor(element.customData.draweratorGeometry, bezierSelectedAnchor);
        commitBezierElement(element.id, geometry);
        setBezierSelectedAnchor(Math.min(bezierSelectedAnchor, geometry.anchors.length - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [bezierEditElementId, bezierSelectedAnchor, excalidrawAPI]);

  useEffect(() => {
    if (bezierEditElementId && !selectedElementIds[bezierEditElementId]) exitBezierEditMode();
  }, [bezierEditElementId, selectedElementIds]);

  const updateIannixElements = (elementIds, updater) => {
    if (!excalidrawAPI || !elementIds?.length) return;
    const targetIds = new Set(elementIds);
    let didUpdate = false;
    const sceneElements = excalidrawAPI.getSceneElements();
    const sceneElementsById = new Map(sceneElements.map(element => [element.id, element]));
    const nextElements = sceneElements.map(element => {
      if (!targetIds.has(element.id)) return element;
      const current = normalizeIannixData(element.customData?.iannix);
      let updated = normalizeIannixData(updater(current, element));
      const wasRuntimeCursor = isRuntimeCursor({ customData: { iannix: current } });
      const becomesRuntimeCursor = isRuntimeCursor({ customData: { iannix: updated } });
      let opacity = element.opacity;
      let strokeColor = element.strokeColor;
      if (becomesRuntimeCursor) {
        const sourceOpacity = wasRuntimeCursor
          ? (current.cursor.sourceOpacity ?? element.opacity)
          : element.opacity;
        const sourceStrokeColor = wasRuntimeCursor
          ? (current.cursor.sourceStrokeColor || (element.strokeColor !== "transparent" ? element.strokeColor : null))
          : element.strokeColor;
        updated = {
          ...updated,
          cursor: { ...updated.cursor, sourceOpacity, sourceStrokeColor },
        };
        opacity = 0;
        strokeColor = "transparent";
      } else if (wasRuntimeCursor) {
        opacity = current.cursor.sourceOpacity ?? element.opacity;
        strokeColor = current.cursor.sourceStrokeColor || element.customData?.roleThemeSourceStrokeColor || element.strokeColor;
        updated = {
          ...updated,
          cursor: { ...updated.cursor, sourceOpacity: null, sourceStrokeColor: null },
        };
      }
      updated.version = (current.version || 0) + 1;
      const nextVersion = element.version + 1;
      const customData = {
        ...(element.customData || {}),
        iannix: updated,
      };
      if (customData.modifiers?.length > 0) {
        customData.excalidrawVersion = nextVersion;
        processedModifierVersionsRef.current[element.id] = customData.version || 0;
      }
      didUpdate = true;
      let nextElement = {
        ...element,
        opacity,
        strokeColor,
        customData,
        version: nextVersion,
        versionNonce: Math.floor(Math.random() * 1000000),
        updated: Date.now(),
      };
      const changedSupportCurve = current.cursor.curveId !== updated.cursor.curveId;
      if (becomesRuntimeCursor && (!wasRuntimeCursor || changedSupportCurve)) {
        const supportCurve = sceneElementsById.get(updated.cursor.curveId);
        if (supportCurve && !supportCurve.isDeleted) {
          nextElement = snapCursorHostToCurveStart(nextElement, supportCurve, updated.cursor.followTangent);
        }
      }
      return nextElement;
    });
    if (!didUpdate) return;
    excalidrawAPI.updateScene({ elements: nextElements, commitToHistory: true });
    setModifierUpdateNonce(nonce => nonce + 1);
  };

  const updateIannixElement = (elementId, updater) => {
    updateIannixElements([elementId], updater);
  };

  const updateIannixDataPath = (elementIds, path, value) => {
    const ids = Array.isArray(elementIds) ? elementIds : [elementIds];
    const elementIndex = new Map(ids.map((id, index) => [id, index]));
    updateIannixElements(ids, (current, element) => {
      const next = structuredClone(current);
      let target = next;
      path.slice(0, -1).forEach(segment => { target = target[segment]; });
      const nextValue = path.length === 1 && path[0] === "label"
        ? expandIndexedLabelTemplate(value, elementIndex.get(element.id) || 0)
        : value;
      target[path[path.length - 1]] = nextValue;
      return next;
    });
  };

  const assignIannixRole = (elements, role) => {
    if (!excalidrawAPI || elements.length === 0) return;
    const sceneElements = excalidrawAPI.getSceneElements();
    const elementIds = elements.map(element => element.id);
    const labels = allocateIannixRoleLabels(sceneElements, elementIds, role);
    updateIannixElements(elementIds, (current, element) => ({
      ...current,
      role,
      label: labels.get(element.id) ?? current.label,
    }));
  };

  // Create one hidden, runtime-linked cursor for every selected path. As with
  // imported IanniX cursors, the host is a vertical line centered exactly on
  // curve progress 0 and rotated by the onset tangent. Runtime evaluation then
  // moves that center along the curve and applies only the tangent delta.
  const addCursorsToSelectedCurves = () => {
    if (!excalidrawAPI) throw new Error("The canvas is not ready.");
    const sceneElements = excalidrawAPI.getSceneElements();
    const selectedIds = excalidrawAPI.getAppState().selectedElementIds || {};
    const candidates = sceneElements.filter(element => (
      selectedIds[element.id] &&
      !element.isDeleted &&
      (element.type === "line" || element.type === "freedraw") &&
      !isRuntimeCursor(element) &&
      !sceneElements.some(candidate => (
        !candidate.isDeleted &&
        isRuntimeCursor(candidate) &&
        normalizeIannixData(candidate.customData?.iannix).cursor?.curveId === element.id
      ))
    ));
    if (!candidates.length) throw new Error("Select one or more lines or freehand paths first.");

    const curveLabels = allocateIannixRoleLabels(sceneElements, candidates.map(element => element.id), "curve");
    const updates = new Map();
    const cursors = [];
    candidates.forEach((source, index) => {
      const path = getElementCorePaths(source)?.[0] || [];
      const points = path.filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));
      if (points.length < 2) return;
      let first = points[0];
      let second = points.find(point => Math.hypot(point[0] - first[0], point[1] - first[1]) > 0.0001);
      if (!second) {
        first = points[points.length - 2];
        second = points[points.length - 1];
      }
      const dx = second[0] - first[0];
      const dy = second[1] - first[1];
      const tangentLength = Math.hypot(dx, dy);
      const startTangentAngle = tangentLength > 0.0001 ? Math.atan2(dy, dx) : 0;
      const pathLength = points.slice(1).reduce((sum, point, pointIndex) => sum + Math.hypot(point[0] - points[pointIndex][0], point[1] - points[pointIndex][1]), 0);
      const cursorLength = Math.max(12, Math.min(48, pathLength * 0.08 || 20));
      const half = cursorLength / 2;
      const cursorId = `cursor_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
      const sourceData = normalizeIannixData({
        ...(source.customData?.iannix || {}),
        role: "curve",
        active: true,
        label: curveLabels.get(source.id) || source.customData?.iannix?.label || `Curve ${index + 1}`,
      });
      updates.set(source.id, sourceData);
      const cursorData = normalizeIannixData({
        role: "cursor",
        active: true,
        label: `Cursor ${index + 1}`,
        cursor: {
          curveId: source.id,
          followTangent: true,
          visualSmoothing: 0.65,
          sourceOpacity: source.opacity ?? 100,
          sourceStrokeColor: source.strokeColor || "#ff3b0a",
        },
      });
      const cursor = {
        ...createBaseElement("line", first[0], first[1] - half, 0, cursorLength, "transparent"),
        id: cursorId,
        points: [[0, 0], [0, cursorLength]],
        angle: startTangentAngle,
        strokeWidth: source.strokeWidth || 2,
        roughness: 0,
        opacity: 0,
        strokeColor: "transparent",
        customData: { iannix: cursorData },
      };
      cursors.push(cursor);
    });
    if (!cursors.length) throw new Error("The selected paths do not contain usable geometry.");
    const nextElements = sceneElements.map(element => {
      const nextData = updates.get(element.id);
      if (!nextData) return element;
      return {
        ...element,
        customData: { ...(element.customData || {}), iannix: nextData },
        version: (element.version || 0) + 1,
        versionNonce: Math.floor(Math.random() * 1000000),
        updated: Date.now(),
      };
    });
    const preparedCursors = reconcileRuntimeCursorHosts(cursors, [...nextElements, ...cursors]);
    const cursorSelection = Object.fromEntries(preparedCursors.map(cursor => [cursor.id, true]));
    runtimeCursorSelectionRef.current = cursorSelection;
    excalidrawAPI.updateScene({
      elements: [...nextElements, ...preparedCursors],
      appState: {
        selectedElementIds: {},
        selectedGroupIds: {},
        editingLinearElement: null,
        selectedLinearElement: null,
      },
      commitToHistory: true,
    });
    setSelectedElementIds(cursorSelection);
    setModifierUpdateNonce(nonce => nonce + 1);
    return preparedCursors;
  };

  const handleMidiOutputChange = async nextOutputId => {
    panicMidi();
    midiOutputIdRef.current = nextOutputId;
    setMidiOutputId(nextOutputId);
    if (nextOutputId === INTERNAL_MIDI_SYNTH_ID) await ensureInternalSynth();
  };

  const handleMidiFallbackChange = async enabled => {
    panicMidi();
    midiFallbackEnabledRef.current = enabled;
    setMidiFallbackEnabled(enabled);
    if (enabled) {
      const route = resolveMidiOutputRoute({
        midiAccess: midiAccessRef.current,
        selectedOutputId: midiOutputIdRef.current,
        fallbackEnabled: true,
        internalOutput: internalSynthRef.current?.getState?.() !== "off" ? internalSynthRef.current : null,
      });
      if (route.kind === "internal-unavailable") await ensureInternalSynth();
    }
  };

  const handleInternalProgramChange = (channel, program) => {
    const next = normalizeGmPrograms({ ...internalGmProgramsRef.current, [channel]: program });
    internalGmProgramsRef.current = next;
    setInternalGmPrograms(next);
    internalSynthRef.current?.setProgram?.(channel, next[channel]);
  };

  const connectIannixMidi = async () => {
    if (!navigator.requestMIDIAccess) {
      setMidiStatus("Web MIDI is unavailable in this browser");
      return;
    }
    try {
      setMidiStatus("Requesting MIDI access…");
      const access = await navigator.requestMIDIAccess({ sysex: false });
      midiAccessRef.current = access;
      setMidiAccess(access);
      const inputs = [...access.inputs.values()].map(input => ({
        id: input.id,
        name: input.name || "Unnamed MIDI input",
        manufacturer: input.manufacturer || "",
        state: input.state,
      }));
      const outputs = [...access.outputs.values()].map(output => ({
        id: output.id,
        name: output.name || "Unnamed MIDI output",
        manufacturer: output.manufacturer || "",
        state: output.state,
      }));
      setMidiInputs(inputs);
      setMidiOutputs(outputs);
      setMidiStatus(`${inputs.length} in · ${outputs.length} out`);
    } catch (error) {
      setMidiStatus(error?.message || "MIDI access was denied");
    }
  };

  const emitIannixMidiPattern = async (pattern, context, { userGesture = false } = {}) => {
    try {
      const message = parseIannixMidiPattern(pattern, context);
      let route = getScoreMidiRoute();
      if (userGesture && route.kind === "internal-unavailable") {
        await ensureInternalSynth();
        route = getScoreMidiRoute();
      }
      const outputs = route.outputs;
      if (outputs.length === 0) throw new Error("No MIDI output is selected.");
      outputs.forEach(output => midiVoiceTrackerRef.current.send(output, message, performance.now()));
      setMidiStatus(`Sent ${describeIannixMidiMessage(message)}${route.fallback ? " · internal fallback" : ""}`);
    } catch (error) {
      setMidiStatus(error.message || "MIDI send failed");
    }
  };

  const toggleScorePlayback = async () => {
    if (scorePlaying) {
      setScorePlaying(false);
      return;
    }
    const route = getScoreMidiRoute();
    if (route.kind === "internal-unavailable") await ensureInternalSynth();
    setScorePlaying(true);
  };

  const createDraweratorExchangeJson = (kind, elements) => {
    if (!excalidrawAPI) throw new Error("The scene is not ready.");
    const serialized = serializeAsJSON(
      elements,
      excalidrawAPI.getAppState(),
      excalidrawAPI.getFiles(),
      "local",
    );
    return JSON.stringify(attachDraweratorExchangeMetadata(serialized, kind, {
      time: scoreTime,
      rate: scoreRate,
      tempo: scoreTempo,
      timeSignature: scoreTimeSignature,
      displayMode: transportDisplayMode,
      fps: transportFps,
      loop: { enabled: transportLoopEnabled, start: transportLoopStart, end: transportLoopEnd },
    }, kind === "scene" ? globalGridRef.current : null), null, 2);
  };

  const downloadTextFile = (text, filename, mimeType = "application/json") => {
    const useDataUrl = text.length <= 2_000_000;
    const url = useDataUrl
      ? `data:${mimeType};charset=utf-8,${encodeURIComponent(text)}`
      : URL.createObjectURL(new Blob([text], { type: mimeType }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => {
      anchor.remove();
      if (!useDataUrl) URL.revokeObjectURL(url);
    }, 1000);
  };

  const runWithoutSessionSceneRecording = async callback => {
    historySuppressSceneRef.current += 1;
    try {
      return await callback();
    } finally {
      window.setTimeout(() => {
        historySuppressSceneRef.current = Math.max(0, historySuppressSceneRef.current - 1);
        if (excalidrawAPIRef.current) {
          lastSceneElementsRef.current = new Map(
            excalidrawAPIRef.current.getSceneElementsIncludingDeleted().map(element => [element.id, element])
          );
        }
      }, 0);
    }
  };

  const resetIannixRuntime = ({ resetTransport = false } = {}) => {
    previousCursorStatesRef.current = new Map();
    visualCursorTransformsRef.current = new Map();
    activeScoreCollisionsRef.current = new Set();
    triggerCollisionLockoutsRef.current = new Map();
    triggerPulseUntilRef.current = new Map();
    setScoreEvents([]);
    if (resetTransport) {
      setScorePlaying(false);
      scoreTimeRef.current = 0;
      setScoreTime(0);
    }
    setScoreRuntimeNonce(nonce => nonce + 1);
  };

  const exportDraweratorScene = () => {
    try {
      const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
      downloadTextFile(createDraweratorExchangeJson("scene", elements), `drawerator-scene-${new Date().toISOString().slice(0, 10)}.excalidraw`);
      setSceneExchangeStatus(`Exported ${elements.filter(element => !element.isDeleted).length} scene objects with Drawerator metadata.`);
    } catch (error) {
      setSceneExchangeStatus(error.message || "Scene export failed.");
    }
  };

  const prepareDraweratorSceneDownload = event => {
    try {
      const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
      const text = createDraweratorExchangeJson("scene", elements);
      const useDataUrl = text.length <= 2_000_000;
      const url = useDataUrl
        ? `data:application/json;charset=utf-8,${encodeURIComponent(text)}`
        : URL.createObjectURL(new Blob([text], { type: "application/json" }));
      event.currentTarget.href = url;
      event.currentTarget.download = `drawerator-scene-${new Date().toISOString().slice(0, 10)}.excalidraw`;
      if (!useDataUrl) window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setSceneExchangeStatus(`Exported ${elements.filter(element => !element.isDeleted).length} scene objects with Drawerator metadata.`);
    } catch (error) {
      event.preventDefault();
      setSceneExchangeStatus(error.message || "Scene export failed.");
    }
  };

  const importDraweratorSceneText = async (text, { commitToHistory = true } = {}) => {
    if (!excalidrawAPI) return;
    const { score, grid } = parseDraweratorExchange(text, "scene");
    const restored = await loadFromBlob(new Blob([text], { type: "application/json" }), null, null);
    const restoredElements = reconcileRuntimeCursorHosts(restored.elements || []);
    if (restored.files) excalidrawAPI.addFiles(Object.values(restored.files));
    excalidrawAPI.updateScene({
      elements: restoredElements,
      appState: {
        ...(restored.appState || {}),
        selectedElementIds: {},
        gridSize: null,
        gridModeEnabled: false,
        objectsSnapModeEnabled: false,
      },
      commitToHistory,
    });
    setGlobalGrid(grid);
    if (Number.isFinite(score?.time)) setScoreTime(score.time);
    if (Number.isFinite(score?.rate) && score.rate > 0) setScoreRate(score.rate);
    if (Number.isFinite(score?.tempo) && score.tempo >= 20 && score.tempo <= 400) setScoreTempo(score.tempo);
    if (score?.timeSignature) setScoreTimeSignature(normalizeTimeSignature(score.timeSignature));
    if (["frame", "timecode", "beats"].includes(score?.displayMode)) setTransportDisplayMode(score.displayMode);
    if ([24, 25, 30, 50, 60].includes(score?.fps)) setTransportFps(score.fps);
    if (score?.loop) {
      setTransportLoopEnabled(!!score.loop.enabled);
      if (Number.isFinite(score.loop.start)) setTransportLoopStart(Math.max(0, score.loop.start));
      if (Number.isFinite(score.loop.end)) setTransportLoopEnd(Math.max(0.1, score.loop.end));
    }
    previousCursorStatesRef.current = new Map();
    activeScoreCollisionsRef.current = new Set();
    triggerCollisionLockoutsRef.current = new Map();
    visualCursorTransformsRef.current = new Map();
    setModifierUpdateNonce(nonce => nonce + 1);
    setSceneExchangeStatus(`Imported ${restoredElements.filter(element => !element.isDeleted).length} scene objects.`);
  };

  const copyDraweratorScene = async () => {
    try {
      const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
      await navigator.clipboard.writeText(createDraweratorExchangeJson("scene", elements));
      setSceneExchangeStatus(`Copied ${elements.filter(element => !element.isDeleted).length} scene objects as Drawerator JSON.`);
    } catch (error) {
      setSceneExchangeStatus(error.message || "Could not copy scene JSON.");
    }
  };

  const pasteDraweratorScene = async () => {
    try {
      await importDraweratorSceneText(await navigator.clipboard.readText());
      setSceneExchangeStatus("Pasted the complete Drawerator scene from the clipboard.");
    } catch (error) {
      setSceneExchangeStatus(error.message || "Could not paste scene JSON.");
    }
  };

  const captureSessionBaseline = () => {
    if (!excalidrawAPI) return null;
    const appState = excalidrawAPI.getAppState();
    return {
      version: 1,
      sceneJson: createDraweratorExchangeJson("scene", excalidrawAPI.getSceneElementsIncludingDeleted()),
      presentation: {
        theme,
        selectedElementIds: appState.selectedElementIds || {},
        activeTool: appState.activeTool || null,
        camera: {
          scrollX: appState.scrollX || 0,
          scrollY: appState.scrollY || 0,
          zoom: appState.zoom?.value || 1,
        },
        openPanels,
        panelLayouts,
        activeDockPanels,
        collapsedDocks,
        activeSettingsTab,
        modsPanelTab,
      },
    };
  };

  const restoreSessionBaseline = async baseline => {
    if (!baseline?.sceneJson || !excalidrawAPIRef.current) return;
    await runWithoutSessionSceneRecording(async () => {
      await importDraweratorSceneText(baseline.sceneJson, { commitToHistory: false });
      const presentation = baseline.presentation;
      if (presentation) {
        if (presentation.theme) setTheme(presentation.theme);
        if (presentation.openPanels) setOpenPanels(presentation.openPanels);
        if (presentation.panelLayouts) setPanelLayouts(normalizePanelLayouts(presentation.panelLayouts));
        if (presentation.activeDockPanels) setActiveDockPanels(presentation.activeDockPanels);
        if (presentation.collapsedDocks) setCollapsedDocks(presentation.collapsedDocks);
        if (presentation.activeSettingsTab) setActiveSettingsTab(presentation.activeSettingsTab);
        if (presentation.modsPanelTab) setModsPanelTab(presentation.modsPanelTab);
        excalidrawAPIRef.current.updateScene({
          appState: {
            selectedElementIds: presentation.selectedElementIds || {},
            activeTool: presentation.activeTool || undefined,
            scrollX: presentation.camera?.scrollX,
            scrollY: presentation.camera?.scrollY,
            zoom: presentation.camera?.zoom ? { value: presentation.camera.zoom } : undefined,
          },
          commitToHistory: false,
        });
      }
    });
  };

  const applySessionAction = async (action, { emitMidi = false } = {}) => {
    if (!action?.enabled || !excalidrawAPIRef.current) return;
    if (action.kind === "command" && action.commandId) {
      return commandRegistry.execute(action.commandId, action.args || {}, {
        source: "playback",
        record: false,
        transportTime: action.transportTime,
      });
    }
    if (action.kind === "stroke" || action.kind === "scene") {
      const snapshots = action.args?.finalElements || action.args?.elements || [];
      const deletedIds = new Set(action.args?.deletedElementIds || []);
      await runWithoutSessionSceneRecording(async () => {
        const current = excalidrawAPIRef.current.getSceneElementsIncludingDeleted();
        const snapshotMap = new Map(snapshots.map(element => [element.id, element]));
        const existingIds = new Set(current.map(element => element.id));
        const next = current.map(element => {
          if (snapshotMap.has(element.id)) return JSON.parse(JSON.stringify(snapshotMap.get(element.id)));
          if (deletedIds.has(element.id)) return { ...element, isDeleted: true };
          return element;
        });
        for (const element of snapshots) {
          if (!existingIds.has(element.id)) next.push(JSON.parse(JSON.stringify(element)));
        }
        excalidrawAPIRef.current.updateScene({ elements: next, commitToHistory: false });
      });
      setModifierUpdateNonce(nonce => nonce + 1);
      return;
    }
    if (action.kind === "midi") {
      const event = {
        id: action.id,
        time: action.transportTime,
        kind: "playback",
        description: action.args?.description || "Recorded MIDI event",
        message: action.args?.message || null,
      };
      setScoreEvents(previous => [event, ...previous].slice(0, 100));
      eventBus.emit("midi.playback", event, { source: "playback" });
      if (emitMidi && action.args?.pattern) await emitIannixMidiPattern(action.args.pattern, action.args.context || {});
      return;
    }
    if (action.kind === "presentation" && action.args?.appState) {
      await runWithoutSessionSceneRecording(async () => {
        excalidrawAPIRef.current.updateScene({ appState: action.args.appState, commitToHistory: false });
      });
    }
  };

  runtimeCallbacksRef.current.restoreBaseline = restoreSessionBaseline;
  runtimeCallbacksRef.current.applyAction = applySessionAction;
  runtimeCallbacksRef.current.sceneCommand = (commandId, args = {}) => applySessionAction({
    id: crypto.randomUUID(),
    enabled: true,
    kind: "scene",
    args: commandId === "scene.delete"
      ? { deletedElementIds: args.elementIds || [] }
      : { elements: args.elements || [] },
  });

  const startHistoryRecording = ({ play = false } = {}) => {
    const baseline = captureSessionBaseline();
    lastSceneElementsRef.current = new Map(
      (excalidrawAPI?.getSceneElementsIncludingDeleted() || []).map(element => [element.id, element])
    );
    pendingSceneMutationRef.current = null;
    window.clearTimeout(sceneMutationTimerRef.current);
    historyController.start({
      baseline,
      includePresentation: historyIncludePresentation,
      clock: { fps: transportFps, tempo: scoreTempo, signature: scoreTimeSignature, historyMode: historyClockMode },
      name: `Session ${new Date().toLocaleString()}`,
    });
    if (play) setScorePlaying(true);
  };

  const stopHistory = async () => {
    const wasRecording = historyController.status === "recording" || historyController.status === "recording-paused";
    historyController.stop();
    panicMidi();
    if (wasRecording) await historyLibrary.put(historyController.get());
  };

  const playHistory = () => historyController.play({
    from: 0,
    restoreBaseline: true,
    includePresentation: historyIncludePresentation,
    emitMidi: historyMidiArmed,
    rate: historySnapshot.playbackRate,
  });

  const exportHistorySession = () => {
    downloadTextFile(historyController.export(), `drawerator-session-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const importHistorySession = text => {
    historyController.load(parseDraweratorSession(text));
  };

  const clearHistorySession = () => {
    if (!window.confirm("Clear all recorded History actions?")) return;
    historyController.clear({
      baseline: captureSessionBaseline(),
      includePresentation: historyIncludePresentation,
      clock: { fps: transportFps, tempo: scoreTempo, signature: scoreTimeSignature, historyMode: historyClockMode },
      name: `Session ${new Date().toLocaleString()}`,
    });
  };

  const saveHistoryMacro = async (selection = {}, requestedName = "") => {
    const name = requestedName || window.prompt("Sequence name", "New sequence");
    if (!name) return;
    const options = Array.isArray(selection) ? { actionIds: selection } : (selection || {});
    const macro = createDraweratorMacro(historyController.get(), { ...options, name });
    await historyLibrary.put(macro);
    await refreshHistoryMacros();
  };

  const insertHistoryMacro = (macro, mode = "relative") => {
    const appState = excalidrawAPI?.getAppState();
    const center = appState
      ? viewportCoordsToSceneCoords({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 }, appState)
      : { x: 0, y: 0 };
    const actions = instantiateDraweratorMacro(macro, { mode, anchor: { x: center.x, y: center.y } });
    for (const action of actions) {
      window.setTimeout(() => applySessionAction(action, { emitMidi: historyMidiArmed }), Math.max(0, action.at * 1000));
    }
    eventBus.emit("macro.insert", { id: macro.id, mode, actionCount: actions.length }, { source: "history" });
  };

  const removeHistoryMacro = async id => {
    await historyLibrary.remove(id);
    await refreshHistoryMacros();
  };

  runtimeCallbacksRef.current.historyStart = startHistoryRecording;
  runtimeCallbacksRef.current.historyPause = () => historyController.pause();
  runtimeCallbacksRef.current.historyStop = stopHistory;
  runtimeCallbacksRef.current.historyPlay = playHistory;
  runtimeCallbacksRef.current.historySeek = seconds => historyController.seek(seconds, {
    includePresentation: historyIncludePresentation,
    emitMidi: historyMidiArmed,
  });
  runtimeCallbacksRef.current.macroSave = saveHistoryMacro;
  runtimeCallbacksRef.current.macroInsert = ({ id, query, mode = "relative" } = {}) => {
    const needle = String(id || query || "").toLowerCase();
    const macro = historyMacros.find(candidate => candidate.id === id || candidate.name.toLowerCase() === needle || candidate.name.toLowerCase().includes(needle));
    if (!macro) throw new Error(`Sequence not found: ${id || query || "(missing id)"}`);
    insertHistoryMacro(macro, mode);
  };

  const finishApplyingRecordedUiState = () => {
    window.setTimeout(() => {
      applyingRecordedUiStateRef.current = false;
    }, 50);
  };

  runtimeCallbacksRef.current.transportSeek = seconds => {
    applyingRecordedUiStateRef.current = true;
    setScoreTime(Math.max(0, Number(seconds) || 0));
    previousCursorStatesRef.current = new Map();
    visualCursorTransformsRef.current = new Map();
    activeScoreCollisionsRef.current = new Set();
    triggerCollisionLockoutsRef.current = new Map();
    finishApplyingRecordedUiState();
  };
  runtimeCallbacksRef.current.transportUpdate = state => {
    if (!state || typeof state !== "object") return;
    applyingRecordedUiStateRef.current = true;
    if (typeof state.playing === "boolean") setScorePlaying(state.playing);
    if (Number.isFinite(Number(state.rate)) && Number(state.rate) > 0) setScoreRate(Number(state.rate));
    if (Number.isFinite(Number(state.tempo)) && Number(state.tempo) >= 20 && Number(state.tempo) <= 400) {
      setScoreTempo(Number(state.tempo));
    }
    if (state.timeSignature) setScoreTimeSignature(normalizeTimeSignature(state.timeSignature));
    if (["frame", "timecode", "beats"].includes(state.displayMode)) setTransportDisplayMode(state.displayMode);
    if ([24, 25, 30, 50, 60].includes(Number(state.fps))) setTransportFps(Number(state.fps));
    if (state.loop && typeof state.loop === "object") {
      if (typeof state.loop.enabled === "boolean") setTransportLoopEnabled(state.loop.enabled);
      if (Number.isFinite(Number(state.loop.start)) && Number.isFinite(Number(state.loop.end))) {
        updateTransportLoop(Number(state.loop.start), Number(state.loop.end));
      }
    }
    if (["internal", "send", "receive"].includes(state.midiClockMode)) setMidiClockMode(state.midiClockMode);
    if (typeof state.followMidiClockTempo === "boolean") setFollowMidiClockTempo(state.followMidiClockTempo);
    if (typeof state.followMidiTransport === "boolean") setFollowMidiTransport(state.followMidiTransport);
    finishApplyingRecordedUiState();
  };
  runtimeCallbacksRef.current.panelStateUpdate = state => {
    if (!state || typeof state !== "object") return;
    applyingRecordedUiStateRef.current = true;
    if (state.openPanels) setOpenPanels(state.openPanels);
    if (state.panelLayouts) setPanelLayouts(normalizePanelLayouts(state.panelLayouts));
    if (state.activeDockPanels) setActiveDockPanels(state.activeDockPanels);
    if (state.collapsedDocks) setCollapsedDocks(state.collapsedDocks);
    if (typeof state.activeSettingsTab === "string") setActiveSettingsTab(state.activeSettingsTab);
    if (typeof state.modsPanelTab === "string") setModsPanelTab(state.modsPanelTab);
    finishApplyingRecordedUiState();
  };
  runtimeCallbacksRef.current.boardSettingsUpdate = state => {
    if (!state || typeof state !== "object") return;
    applyingRecordedUiStateRef.current = true;
    if (["dark", "light"].includes(state.theme)) {
      setTheme(state.theme);
      excalidrawAPIRef.current?.updateScene({ appState: { theme: state.theme }, commitToHistory: false });
    }
    if (typeof state.accentColor === "string") {
      setAccentColor(state.accentColor);
      localStorage.setItem("drawerator_accent_color", state.accentColor);
    }
    if (Number.isFinite(Number(state.accentOpacity))) {
      setAccentOpacity(Number(state.accentOpacity));
      localStorage.setItem("drawerator_accent_opacity", String(state.accentOpacity));
    }
    if (typeof state.highlightColor === "string") {
      setHighlightColor(state.highlightColor);
      localStorage.setItem("drawerator_highlight_color", state.highlightColor);
    }
    if (Number.isFinite(Number(state.highlightOpacity))) {
      setHighlightOpacity(Number(state.highlightOpacity));
      localStorage.setItem("drawerator_highlight_opacity", String(state.highlightOpacity));
    }
    if (state.roleTheme && typeof state.roleTheme === "object") setRoleTheme(previous => ({ ...previous, ...state.roleTheme }));
    if (typeof state.satoriMode === "boolean") setSatoriMode(state.satoriMode);
    if (typeof state.showToolbarHints === "boolean") setShowToolbarHints(state.showToolbarHints);
    if (typeof state.showBottomNotifications === "boolean") setShowBottomNotifications(state.showBottomNotifications);
    if (typeof state.forceDesktopLayout === "boolean") setForceDesktopLayout(state.forceDesktopLayout);
    if (typeof state.showDebugLayer === "boolean") setShowDebugLayer(state.showDebugLayer);
    if (Number.isFinite(Number(state.defaultStabilizerDamping))) {
      setDefaultStabilizerDamping(Number(state.defaultStabilizerDamping));
    }
    finishApplyingRecordedUiState();
  };
  runtimeCallbacksRef.current.globalGridUpdate = patch => {
    const next = mergeGridPatch(globalGridRef.current, patch || {});
    globalGridRef.current = next;
    setGlobalGrid(next);
    setModifierUpdateNonce(nonce => nonce + 1);
    return next;
  };
  runtimeCallbacksRef.current.globalGridReset = () => {
    const next = normalizeGlobalGrid(DEFAULT_GLOBAL_GRID);
    globalGridRef.current = next;
    setGlobalGrid(next);
    setModifierUpdateNonce(nonce => nonce + 1);
    return next;
  };
  runtimeCallbacksRef.current.gridQuantizeSelection = (args = {}) => quantizeGlobalGridElements({
    elementIds: args?.elementIds,
    resolution: args?.resolution,
    axes: args?.axes,
    forceHard: true,
  });

  useEffect(() => {
    const state = {
      playing: scorePlaying,
      rate: scoreRate,
      tempo: scoreTempo,
      timeSignature: scoreTimeSignature,
      displayMode: transportDisplayMode,
      fps: transportFps,
      loop: { enabled: transportLoopEnabled, start: transportLoopStart, end: transportLoopEnd },
      midiClockMode,
      followMidiClockTempo,
      followMidiTransport,
    };
    const signature = JSON.stringify(state);
    const previous = transportStateRecordingRef.current?.signature ?? null;
    window.clearTimeout(transportStateRecordingRef.current?.timer);
    transportStateRecordingRef.current = { signature, timer: null };
    if (
      previous === null || previous === signature || applyingRecordedUiStateRef.current ||
      historyController.status !== "recording"
    ) return;
    transportStateRecordingRef.current.timer = window.setTimeout(() => {
      commandRegistry.execute("transport.update", { state }, {
        source: "transport",
        transportTime: scoreTimeRef.current,
      }).catch(error => console.error("Could not record transport state", error));
    }, 180);
  }, [commandRegistry, followMidiClockTempo, followMidiTransport, historyController, midiClockMode, scorePlaying, scoreRate, scoreTempo, scoreTimeSignature, transportDisplayMode, transportFps, transportLoopEnabled, transportLoopEnd, transportLoopStart]);

  useEffect(() => {
    const state = { openPanels, panelLayouts, activeDockPanels, collapsedDocks, activeSettingsTab, modsPanelTab };
    const signature = JSON.stringify(state);
    const previous = panelStateRecordingRef.current?.signature ?? null;
    window.clearTimeout(panelStateRecordingRef.current?.timer);
    panelStateRecordingRef.current = { signature, timer: null };
    if (
      previous === null || previous === signature || applyingRecordedUiStateRef.current ||
      historyController.status !== "recording" || !historyIncludePresentation
    ) return;
    panelStateRecordingRef.current.timer = window.setTimeout(() => {
      commandRegistry.execute("presentation.panels", { state }, {
        source: "panel",
        presentation: true,
        transportTime: scoreTimeRef.current,
      }).catch(error => console.error("Could not record panel presentation", error));
    }, 180);
  }, [activeDockPanels, activeSettingsTab, collapsedDocks, commandRegistry, historyController, historyIncludePresentation, modsPanelTab, openPanels, panelLayouts]);

  useEffect(() => {
    const state = {
      theme,
      accentColor,
      accentOpacity,
      highlightColor,
      highlightOpacity,
      roleTheme,
      satoriMode,
      showToolbarHints,
      showBottomNotifications,
      forceDesktopLayout,
      showDebugLayer,
      defaultStabilizerDamping,
    };
    const signature = JSON.stringify(state);
    const previous = boardSettingsRecordingRef.current?.signature ?? null;
    window.clearTimeout(boardSettingsRecordingRef.current?.timer);
    boardSettingsRecordingRef.current = { signature, timer: null };
    if (
      previous === null || previous === signature || applyingRecordedUiStateRef.current ||
      historyController.status !== "recording" || !historyIncludePresentation
    ) return;
    boardSettingsRecordingRef.current.timer = window.setTimeout(() => {
      commandRegistry.execute("settings.board.update", { state }, {
        source: "settings",
        presentation: true,
        transportTime: scoreTimeRef.current,
      }).catch(error => console.error("Could not record board settings", error));
    }, 180);
  }, [accentColor, accentOpacity, commandRegistry, defaultStabilizerDamping, forceDesktopLayout, highlightColor, highlightOpacity, historyController, historyIncludePresentation, roleTheme, satoriMode, showBottomNotifications, showDebugLayer, showToolbarHints, theme]);

  useEffect(() => {
    const api = {
      apiVersion: 2,
      commands: {
        list: () => commandRegistry.list(),
        describe: id => commandRegistry.describe(id),
        execute: (id, args, options) => commandRegistry.execute(id, args, { transportTime: scoreTimeRef.current, ...options }),
        subscribe: listener => commandRegistry.subscribe(listener),
      },
      history: {
        start: options => runtimeCallbacksRef.current.historyStart(options),
        pause: () => runtimeCallbacksRef.current.historyPause(),
        stop: () => runtimeCallbacksRef.current.historyStop(),
        get: () => historyController.get(),
        load: session => historyController.load(session),
        play: options => options
          ? historyController.play({ includePresentation: historyIncludePresentation, emitMidi: historyMidiArmed, ...options })
          : runtimeCallbacksRef.current.historyPlay(),
        pausePlayback: () => historyController.pausePlayback(),
        stopPlayback: () => historyController.stopPlayback(),
        seek: seconds => runtimeCallbacksRef.current.historySeek(seconds),
        export: () => historyController.export(),
        import: payload => historyController.load(parseDraweratorSession(payload)),
      },
      macros: {
        list: () => historyLibrary.list(DRAWERATOR_MACRO_TYPE),
        saveRange: options => {
          const macro = createDraweratorMacro(historyController.get(), options);
          return historyLibrary.put(macro).then(() => refreshHistoryMacros()).then(() => macro);
        },
        insert: (id, options = {}) => runtimeCallbacksRef.current.macroInsert({ id, ...options }),
        remove: id => historyLibrary.remove(id).then(refreshHistoryMacros),
      },
      inputs: {
        registerAdapter: adapter => inputBus.registerAdapter(adapter),
        unregisterAdapter: id => inputBus.unregisterAdapter(id),
        emit: sample => inputBus.emit(sample),
      },
      events: {
        subscribe: (pattern, listener) => eventBus.subscribe(pattern, listener),
      },
      scene: {
        get: () => excalidrawAPIRef.current?.getSceneElementsIncludingDeleted() || [],
        getAppState: () => excalidrawAPIRef.current?.getAppState() || null,
      },
      grid: {
        getGlobal: () => normalizeGlobalGrid(globalGridRef.current),
        updateGlobal: patch => commandRegistry.execute("grid.global.update", { patch }, { source: "api", transportTime: scoreTimeRef.current }),
        snapPoint: (point, options = {}) => snapPointToGrid(globalGridRef.current, point, {
          zoom: excalidrawAPIRef.current?.getAppState()?.zoom?.value || 1,
          ...options,
        }),
        unitsToSeconds: units => gridUnitsToSeconds(units, globalGridRef.current, {
          tempo: scoreTempo,
          signature: scoreTimeSignature,
          fps: transportFps,
        }),
        secondsToUnits: seconds => secondsToGridUnits(seconds, globalGridRef.current, {
          tempo: scoreTempo,
          signature: scoreTimeSignature,
          fps: transportFps,
        }),
      },
    };
    window.drawerator = api;
    window.dispatchEvent(new CustomEvent("drawerator:ready", { detail: { apiVersion: api.apiVersion } }));
    return () => {
      if (window.drawerator === api) delete window.drawerator;
    };
  }, [commandRegistry, eventBus, historyController, historyIncludePresentation, historyLibrary, historyMidiArmed, inputBus, refreshHistoryMacros, scoreTempo, scoreTimeSignature, transportFps]);

  const handleDraweratorSceneFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await importDraweratorSceneText(await file.text());
    } catch (error) {
      setSceneExchangeStatus(error.message || "Scene import failed.");
    }
  };

  const copyDraweratorSelection = async () => {
    try {
      const appState = excalidrawAPI.getAppState();
      const draweratorSelection = {
        ...(appState.selectedElementIds || {}),
        ...runtimeCursorSelectionRef.current,
        ...selectedElementIdsRef.current,
      };
      const elements = getSelectionExchangeElements(
        excalidrawAPI.getSceneElementsIncludingDeleted(),
        draweratorSelection,
      );
      if (elements.length === 0) throw new Error("Select one or more objects to copy as JSON.");
      await navigator.clipboard.writeText(createDraweratorExchangeJson("selection", elements));
      setSceneExchangeStatus(`Copied ${elements.length} selected object${elements.length === 1 ? "" : "s"} as Drawerator JSON.`);
    } catch (error) {
      setSceneExchangeStatus(error.message || "Could not copy selection JSON.");
    }
  };

  const pasteDraweratorSelection = async () => {
    if (!excalidrawAPI) return;
    try {
      const text = await navigator.clipboard.readText();
      parseDraweratorExchange(text, "selection");
      const restored = await loadFromBlob(new Blob([text], { type: "application/json" }), null, null);
      const existing = excalidrawAPI.getSceneElementsIncludingDeleted();
      const imported = remapSelectionForImport(restored.elements || [], existing);
      if (imported.elements.length === 0) throw new Error("The selection JSON contains no objects.");
      const importedElements = reconcileRuntimeCursorHosts(
        imported.elements,
        [...existing, ...imported.elements],
      );
      if (restored.files) excalidrawAPI.addFiles(Object.values(restored.files));
      const importedIds = Object.fromEntries(importedElements.map(element => [element.id, true]));
      excalidrawAPI.updateScene({
        elements: [...existing, ...importedElements],
        appState: { selectedElementIds: importedIds },
        commitToHistory: true,
      });
      setModifierUpdateNonce(nonce => nonce + 1);
      setSceneExchangeStatus(`Pasted ${importedElements.length} objects with new IDs and preserved Drawerator metadata.`);
    } catch (error) {
      setSceneExchangeStatus(error.message || "Could not paste selection JSON.");
    }
  };

  const colorFromIannix = object => {
    if (object.color?.length >= 3) {
      const [r, g, b] = object.color.map(value => Math.min(255, Math.max(0, Math.round(value))));
      return `#${[r, g, b].map(value => value.toString(16).padStart(2, "0")).join("")}`;
    }
    if (object.colorHue?.length >= 3) {
      const [h, s, lightness] = object.colorHue;
      return `hsl(${((h % 360) + 360) % 360} ${Math.min(100, Math.max(0, s / 2.55))}% ${Math.min(80, Math.max(20, lightness / 5.1))}%)`;
    }
    return theme === "light" ? "#1b1b1f" : "#e7e7e9";
  };

  const applyTrustedIannixImport = async (args = {}) => {
    if (!excalidrawAPIRef.current) throw new Error("The canvas is not ready.");
    if (!String(args.source || "").trim()) throw new Error("The IanniX script is empty.");
    // A script import is a new score runtime. Reset synchronously before
    // evaluating it so a render caused by selection cannot reuse the previous
    // score's time, cursor smoothing state, collisions, or trigger pulses.
    resetIannixRuntime({ resetTransport: true });
    let result;
    let model;
    try {
      result = executeTrustedIannixScript(args.source, {
        trusted: true,
        seed: Number.isFinite(Number(args.seed)) ? Number(args.seed) : 1,
        sessionTime: scoreTimeRef.current,
        files: args.files || {},
        parameters: args.parameters || {},
      });
      model = buildIannixObjectModel(result.operations);
    } catch (error) {
      const message = `IanniX import failed: ${error instanceof Error ? error.message : String(error)}`;
      setSceneExchangeStatus(message);
      eventBus.emit("iannix.import.error", { filename: args.filename || "IanniX script", message }, { source: "iannix" });
      throw error;
    }
    const scale = Math.max(0.01, Number(args.scale) || 40);
    const anchor = {
      x: Number(args.anchor?.x) || 0,
      y: Number(args.anchor?.y) || 0,
    };
    const importId = String(args.importId || "iannix").replace(/[^a-z0-9_-]/gi, "_");
    const internalIds = new Map(model.objects.map(object => [
      object.externalId,
      `iannix_${importId}_${String(object.externalId).replace(/[^a-z0-9_-]/gi, "_")}`,
    ]));
    const mapPoint = point => [
      anchor.x + (Number(point?.[0]) || 0) * scale,
      anchor.y - (Number(point?.[1]) || 0) * scale,
    ];
    const imported = [];

    for (const object of model.objects) {
      const objectPosition = object.position || [0, 0, 0];
      const positioned = point => mapPoint([
        (Number(objectPosition[0]) || 0) + (Number(point?.[0]) || 0),
        (Number(objectPosition[1]) || 0) + (Number(point?.[1]) || 0),
      ]);
      const strokeColor = colorFromIannix(object);
      const alpha = object.color?.[3] ?? object.colorHue?.[3] ?? 255;
      const opacity = Math.min(100, Math.max(0, Math.round(alpha / 2.55)));
      const linkedCurve = object.role === "cursor"
        ? model.objects.find(candidate => candidate.externalId === object.curveExternalId)
        : null;
      const iannix = normalizeIannixData({
        role: object.role,
        active: object.active !== false,
        label: object.label || `${object.role.charAt(0).toUpperCase()}${object.role.slice(1)} ${object.externalId}`,
        time: {
          duration: object.role === "cursor" ? getIannixCursorDuration(object, linkedCurve) : Math.max(0.001, Number(object.speed) || 5),
          loopMode: object.role === "cursor" ? getIannixCursorLoopMode(object) : "once",
        },
        cursor: object.role === "cursor" ? {
          curveId: internalIds.get(object.curveExternalId) || null,
          sourceOpacity: opacity,
          sourceStrokeColor: strokeColor,
          boundsSource: Array.isArray(object.boundsSource) && object.boundsSource.length >= 4
            ? object.boundsSource
            : null,
          boundsTarget: Array.isArray(object.boundsTarget) && object.boundsTarget.length >= 4
            ? object.boundsTarget
            : [0, 1, 0, 1, 0, 1],
        } : undefined,
        trigger: object.role === "trigger" ? (() => {
          const explicitMessage = String(object.message || "");
          const hasExplicitMessage = explicitMessage.trim().length > 0;
          const hasExplicitMidi = explicitMessage.includes("midi://");
          return {
            // Native IanniX triggers inherit its global MIDI note template when
            // no setMessage override is present. An explicit non-MIDI message
            // intentionally replaces that default.
            duration: 1,
            midiEnabled: !hasExplicitMessage || hasExplicitMidi,
            midiTemplate: hasExplicitMidi ? "custom" : "iannixXY",
            midiPattern: hasExplicitMidi ? explicitMessage : undefined,
          };
        })() : undefined,
      });
      const customData = {
        iannix,
        iannixImport: {
          version: 1,
          externalId: object.externalId,
          group: object.group || "",
          pattern: object.pattern || "",
          source: args.filename || "IanniX script",
          scale,
          anchor: [anchor.x, anchor.y],
        },
      };
      let element;
      if (object.role === "curve") {
        let worldPoints;
        let bezierHost = null;
        if (object.ellipse) {
          worldPoints = Array.from({ length: 49 }, (_, index) => {
            const angle = index / 48 * Math.PI * 2;
            return positioned([Math.cos(angle) * object.ellipse[0], Math.sin(angle) * object.ellipse[1]]);
          });
        } else {
          const indexedPoints = object.points.map((value, index) => ({ value, index })).filter(entry => entry.value);
          const points = indexedPoints.length >= 2 ? indexedPoints : [{ value: [0, 0], index: 0 }, { value: [1, 0], index: 1 }];
          worldPoints = points.map(entry => positioned(entry.value));
          const anchors = worldPoints.map(point => ({ x: point[0], y: point[1], in: null, out: null, mode: "corner" }));
          const mapControlVector = value => [(Number(value?.[0]) || 0) * scale, -(Number(value?.[1]) || 0) * scale];
          for (let destination = 1; destination < points.length; destination += 1) {
            const controls = object.controls?.[points[destination].index];
            if (!controls) continue;
            const c1 = mapControlVector(controls.c1);
            const c2 = mapControlVector(controls.c2);
            if (Math.hypot(...c1) > 0.000001) anchors[destination - 1].out = c1;
            if (Math.hypot(...c2) > 0.000001) anchors[destination].in = c2;
            if (controls.smooth) anchors[destination].mode = "smooth";
          }
          bezierHost = createBezierHostGeometry(anchors, Boolean(object.closed));
          worldPoints = bezierHost.points.map(point => [bezierHost.bounds.x + point[0], bezierHost.bounds.y + point[1]]);
        }
        const minX = bezierHost?.bounds.x ?? Math.min(...worldPoints.map(point => point[0]));
        const minY = bezierHost?.bounds.y ?? Math.min(...worldPoints.map(point => point[1]));
        const width = bezierHost?.bounds.width ?? Math.max(1, Math.max(...worldPoints.map(point => point[0])) - minX);
        const height = bezierHost?.bounds.height ?? Math.max(1, Math.max(...worldPoints.map(point => point[1])) - minY);
        element = {
          ...createBaseElement("line", minX, minY, width, height, strokeColor),
          points: bezierHost?.points || worldPoints.map(point => [point[0] - minX, point[1] - minY]),
          strokeWidth: Math.max(0.5, Number(object.width) || 1),
          roughness: 0,
          opacity,
          customData: bezierHost ? { ...customData, draweratorGeometry: bezierHost.geometry } : customData,
        };
      } else if (object.role === "cursor") {
        const center = positioned([0, 0]);
        const length = getIannixCursorCanvasLength(object, scale);
        element = {
          ...createBaseElement("line", center[0], center[1] - length / 2, 1, length, strokeColor),
          points: [[0, 0], [0, length]],
          angle: getIannixCurveStartAngle(linkedCurve),
          strokeWidth: Math.max(1, Number(object.size) || 1),
          roughness: 0,
          opacity: iannix.cursor.curveId ? 0 : opacity,
          strokeColor: iannix.cursor.curveId ? "transparent" : strokeColor,
          customData,
        };
      } else {
        const center = positioned([0, 0]);
        const diameter = Math.max(8, (Number(object.size) || 1) * scale * 0.4);
        element = {
          ...createBaseElement("ellipse", center[0] - diameter / 2, center[1] - diameter / 2, diameter, diameter, strokeColor),
          strokeWidth: Math.max(1, Number(object.width) || 2),
          roughness: 0,
          opacity,
          customData,
        };
      }
      element.id = internalIds.get(object.externalId);
      imported.push(element);
    }

    await runWithoutSessionSceneRecording(async () => {
      const current = model.clear ? [] : excalidrawAPIRef.current.getSceneElementsIncludingDeleted();
      const importedIds = new Set(imported.map(element => element.id));
      const preserved = current.filter(element => !importedIds.has(element.id));
      runtimeCursorSelectionRef.current = {};
      excalidrawAPIRef.current.updateScene({
        elements: [...preserved, ...imported],
        appState: { selectedElementIds: {}, selectedGroupIds: {}, editingLinearElement: null, selectedLinearElement: null },
        commitToHistory: true,
      });
      setSelectedElementIds({});
    });
    resetIannixRuntime();
    setModifierUpdateNonce(nonce => nonce + 1);
    const report = {
      filename: args.filename || "IanniX script",
      objectCount: imported.length,
      operationCount: result.operations.length,
      unsupported: result.unsupported,
    };
    eventBus.emit("iannix.import.complete", report, { source: "iannix" });
    const unsupportedSummary = result.unsupported
      .slice(0, 3)
      .map(entry => entry.reason || entry.command)
      .filter(Boolean)
      .join(" ");
    setSceneExchangeStatus(
      imported.length === 0
        ? `Imported 0 IanniX objects. ${unsupportedSummary || "The script produced no curve, cursor, or trigger objects."}`
        : `Imported ${imported.length} IanniX object${imported.length === 1 ? "" : "s"}.` +
          (result.unsupported.length
            ? ` ${result.unsupported.length} unsupported command${result.unsupported.length === 1 ? "" : "s"}: ${unsupportedSummary}`
            : "")
    );
    return report;
  };

  runtimeCallbacksRef.current.iannixImport = applyTrustedIannixImport;

  const applyTrustedIannixCommand = async source => {
    if (!excalidrawAPIRef.current) throw new Error("The canvas is not ready.");
    const command = String(source || "").trim();
    if (!command) throw new Error("The IanniX command is empty.");
    const elements = excalidrawAPIRef.current.getSceneElementsIncludingDeleted();
    const liveElements = elements.filter(element => !element.isDeleted);
    const selected = liveElements.filter(element => selectedElementIds[element.id]);
    const externalIdFor = element => String(element?.customData?.iannixImport?.externalId ?? element?.id ?? "");
    const byExternalId = new Map(liveElements.map(element => [externalIdFor(element), element]));
    const byLabel = new Map(liveElements.map(element => [String(element.customData?.iannix?.label || ""), element]).filter(([label]) => label));
    const defaultTarget = selected[0] || null;
    const expandTarget = raw => {
      const token = String(raw || "");
      if (token === "@selection") return selected.map(externalIdFor);
      if (token.startsWith("#")) {
        const key = token.slice(1);
        const element = byExternalId.get(key) || byLabel.get(key);
        return element ? [externalIdFor(element)] : [];
      }
      return [token];
    };
    const tokens = tokenizeIannixCommand(command);
    const targetToken = tokens[1];
    const targets = targetToken === "@selection" || targetToken?.startsWith("#")
      ? expandTarget(targetToken)
      : [externalIdFor(defaultTarget) || undefined];
    if ((targetToken === "@selection" || targetToken?.startsWith("#")) && targets.length === 0) {
      throw new Error(`No IanniX object matches ${targetToken}.`);
    }
    const commands = targets.map(target => {
      if (!(targetToken === "@selection" || targetToken?.startsWith("#"))) return command;
      return [tokens[0], target, ...tokens.slice(2)].map(token => JSON.stringify(token)).join(" ");
    });
    const operations = [];
    const unsupported = [];
    for (let index = 0; index < commands.length; index += 1) {
      const result = executeTrustedIannixScript(`run(${JSON.stringify(commands[index])});`, {
        trusted: true,
        sessionTime: scoreTimeRef.current,
        currentId: targets[index] || externalIdFor(defaultTarget) || null,
      });
      operations.push(...result.operations);
      unsupported.push(...result.unsupported);
    }
    if (unsupported.length) throw new Error(unsupported[0].reason);
    if (operations.some(operation => operation.type === "clear")) {
      await runWithoutSessionSceneRecording(async () => {
        excalidrawAPIRef.current.updateScene({
          elements: [],
          appState: { selectedElementIds: {}, selectedGroupIds: {}, editingLinearElement: null, selectedLinearElement: null },
          commitToHistory: true,
        });
        setSelectedElementIds({});
      });
      resetIannixRuntime();
      setModifierUpdateNonce(nonce => nonce + 1);
      setSceneExchangeStatus("Executed IanniX command: cleared the scene.");
      eventBus.emit("iannix.command.executed", { command, objectCount: 0 }, { source: "iannix" });
      return { command, objectCount: 0 };
    }
    const supportedTypes = new Set(["group", "label", "active", "speed", "width", "color", "colorHue", "message", "pattern", "curve"]);
    const unsupportedOperation = operations.find(operation => !supportedTypes.has(operation.type));
    if (unsupportedOperation) throw new Error(`Interactive ${unsupportedOperation.type} commands are not supported yet; run a full script for structural score changes.`);
    let changed = 0;
    const nextElements = elements.map(element => {
      const relevant = operations.filter(operation => String(operation.externalId) === externalIdFor(element));
      if (!relevant.length) return element;
      let iannix = normalizeIannixData(element.customData?.iannix);
      let iannixImport = { ...(element.customData?.iannixImport || {}) };
      let strokeColor = element.strokeColor;
      let strokeWidth = element.strokeWidth;
      for (const operation of relevant) {
        if (operation.type === "group") iannixImport.group = operation.value;
        else if (operation.type === "label") iannix = { ...iannix, label: operation.value };
        else if (operation.type === "active") iannix = { ...iannix, active: operation.value };
        else if (operation.type === "speed") iannix = { ...iannix, time: { ...iannix.time, duration: Math.max(0.001, operation.value) } };
        else if (operation.type === "width") strokeWidth = Math.max(0.5, operation.value);
        else if (operation.type === "color") {
          const [r = 0, g = 0, b = 0] = operation.value;
          strokeColor = `#${[r, g, b].map(value => Math.min(255, Math.max(0, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
        } else if (operation.type === "colorHue") {
          const [h = 0, s = 0, lightness = 0] = operation.value;
          strokeColor = `hsl(${((h % 360) + 360) % 360} ${Math.min(100, Math.max(0, s / 2.55))}% ${Math.min(80, Math.max(20, lightness / 5.1))}%)`;
        } else if (operation.type === "message") iannix = { ...iannix, trigger: { ...iannix.trigger, midiPattern: operation.value, midiEnabled: String(operation.value).includes("midi://") } };
        else if (operation.type === "pattern") iannixImport.pattern = operation.value;
        else if (operation.type === "curve") {
          const curve = byExternalId.get(String(operation.curveExternalId));
          iannix = { ...iannix, cursor: { ...iannix.cursor, curveId: curve?.id || null } };
        }
      }
      changed += 1;
      return {
        ...element,
        strokeColor,
        strokeWidth,
        customData: { ...(element.customData || {}), iannix: { ...iannix, version: (iannix.version || 0) + 1 }, iannixImport },
        version: element.version + 1,
        versionNonce: Math.floor(Math.random() * 1000000),
        updated: Date.now(),
      };
    });
    if (!changed) throw new Error("Select an IanniX object or address one by #id or #label.");
    excalidrawAPIRef.current.updateScene({ elements: nextElements, commitToHistory: true });
    resetIannixRuntime();
    setModifierUpdateNonce(nonce => nonce + 1);
    setSceneExchangeStatus(`Executed IanniX command on ${changed} object${changed === 1 ? "" : "s"}.`);
    eventBus.emit("iannix.command.executed", { command, objectCount: changed }, { source: "iannix" });
    return { command, objectCount: changed };
  };

  runtimeCallbacksRef.current.iannixCommand = applyTrustedIannixCommand;

  const handleTrustedIannixFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !excalidrawAPI) return;
    const trusted = window.confirm(
      "IanniX files are executable JavaScript. Only continue with a file you trust. This compatibility mode is not a security sandbox."
    );
    if (!trusted) return;
    try {
      const source = await file.text();
      const existingScript = iannixScripts.find(script => script.name === file.name);
      const scriptId = existingScript?.id || `iannix-script-${crypto.randomUUID()}`;
      setIannixScripts(previous => existingScript
        ? previous.map(script => script.id === scriptId ? { ...script, source, updatedAt: Date.now() } : script)
        : [...previous, { id: scriptId, name: file.name, source, createdAt: Date.now(), updatedAt: Date.now() }]
      );
      setActiveIannixScriptId(scriptId);
      setIannixScriptSource(source);
      setIannixPanelTab("script");
      await commandRegistry.execute("iannix.import.trusted", {
        source,
        filename: file.name,
        seed: historyController.get()?.seed || 1,
        // IanniX coordinates are model coordinates. Keep imports independent
        // of the current pointer, pan, zoom, viewport size, and panel layout.
        anchor: { x: 0, y: 0 },
        scale: 40,
      }, { source: "file", transportTime: scoreTimeRef.current });
    } catch (error) {
      setSceneExchangeStatus(error.message || "Could not import this IanniX script.");
    }
  };

  const renderSceneExchangeTools = () => {
    const selectedCount = getSelectedElements().length;
    return (
      <InspectorSection title="Scene data" className="iannix-section compact iannix-data-section">
        <input
          ref={sceneImportInputRef}
          type="file"
          accept=".excalidraw,.json,application/json"
          hidden
          onChange={handleDraweratorSceneFile}
        />
        <div className="iannix-data-actions">
          <a className="iannix-flat-button" href="#" download onClick={prepareDraweratorSceneDownload}>Export scene</a>
          <button type="button" className="iannix-flat-button" onClick={() => sceneImportInputRef.current?.click()}>Import scene</button>
          <button type="button" className="iannix-flat-button" onClick={() => void copyDraweratorScene()}>Copy scene JSON</button>
          <button type="button" className="iannix-flat-button" onClick={() => void pasteDraweratorScene()}>Paste scene JSON</button>
          <button type="button" className="iannix-flat-button" onClick={copyDraweratorSelection} disabled={selectedCount === 0}>Copy selection JSON</button>
          <button type="button" className="iannix-flat-button" onClick={pasteDraweratorSelection}>Paste selection JSON</button>
        </div>
        <div className="iannix-hint">Scene exchange preserves Drawerator metadata. Trusted .iannix compatibility executes familiar run()/load() scripts, reports unsupported commands, and is not a security sandbox.</div>
        {sceneExchangeStatus && <div className="iannix-midi-status" role="status">{sceneExchangeStatus}</div>}
      </InspectorSection>
    );
  };

  const renderIannixTab = () => {
    if (!excalidrawAPI) return null;
    const selectedElements = getSelectedElements();
    if (selectedElements.length === 0) {
      return (
        <div className="iannix-properties">
          {renderSceneExchangeTools()}
          <div className="iannix-empty-state">
            Select any canvas object to assign a score role and object time.
          </div>
        </div>
      );
    }

    const roleOptions = [
      { value: null, label: "None" },
      { value: "curve", label: "Curve" },
      { value: "cursor", label: "Cursor" },
      { value: "trigger", label: "Trigger" },
    ];

    if (selectedElements.length > 1) {
      const selectedRoles = new Set(selectedElements.map(element =>
        normalizeIannixData(element.customData?.iannix).role
      ));
      const sharedRole = selectedRoles.size === 1 ? selectedRoles.values().next().value : undefined;
      return (
        <div className="iannix-properties">
          {renderSceneExchangeTools()}
          <InspectorSection title="Score role" className="iannix-section" aside={<span className="iannix-selection-count">{selectedElements.length} objects</span>}>
            <div className="iannix-role-grid" role="radiogroup" aria-label="IanniX role for selected objects">
              {roleOptions.map(option => (
                <button
                  key={option.label}
                  type="button"
                  className={`iannix-role-button role-${option.value || "none"} ${sharedRole === option.value ? "active" : ""}`}
                  role="radio"
                  aria-checked={sharedRole === option.value}
                  onClick={() => assignIannixRole(selectedElements, option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="iannix-hint">
              {selectedRoles.size > 1 ? "Mixed roles. " : ""}
              Assigning a role gives every selected object a unique label. Same-role selections can be edited together below.
            </div>
          </InspectorSection>
          {sharedRole ? (
            <div className="iannix-object-shared-editor">
              <IannixDataPanel elements={selectedElements} onChange={updateIannixDataPath} />
            </div>
          ) : (
            <div className="iannix-empty-state iannix-object-shared-empty">
              Assign one shared score role to edit these objects together.
            </div>
          )}
        </div>
      );
    }

    const element = selectedElements[0];
    const data = normalizeIannixData(element.customData?.iannix);
    const timeState = getObjectTimeState(scoreTime, data.time);
    const curves = excalidrawAPI.getSceneElements().filter(candidate =>
      !candidate.isDeleted && candidate.customData?.iannix?.role === "curve"
    );
    const linkedCursorCount = excalidrawAPI.getSceneElements().filter(candidate =>
      !candidate.isDeleted &&
      candidate.customData?.iannix?.role === "cursor" &&
      candidate.customData?.iannix?.cursor?.curveId === element.id
    ).length;
    const setNumber = (section, field, value) => {
      const number = Number(value);
      if (!Number.isFinite(number)) return;
      updateIannixElement(element.id, current => ({
        ...current,
        [section]: { ...current[section], [field]: number },
      }));
    };
    let midiPreview = null;
    let midiPreviewError = "";
    if (data.role === "trigger" && data.trigger.midiEnabled) {
      try {
        const frame = evaluateScoreFrame(excalidrawAPI.getSceneElements(), scoreTime);
        const collisionKey = [...frame.collisions].find(key => key.endsWith(`:${element.id}`));
        const preferredCursorId = collisionKey?.split(":")[0] || null;
        const cursor = selectIannixTriggerCursor(frame.cursors, element, preferredCursorId);
        if (!cursor) throw new Error("No active cursor is linked to a curve, so this trigger has no event context yet.");
        const context = getIannixTriggerMidiContext(cursor, data, element);
        const message = parseIannixMidiPattern(data.trigger.midiPattern, context);
        const cursorData = normalizeIannixData(cursor.element.customData?.iannix);
        midiPreview = {
          context,
          message,
          cursorLabel: cursorData.label || `Cursor ${cursor.element.id.slice(0, 6)}`,
        };
      } catch (error) {
        midiPreviewError = error.message || "Could not resolve this trigger's MIDI event.";
      }
    }
    const updateTriggerMidi = (updates, regeneratePattern = true) => {
      updateIannixElement(element.id, current => {
        const trigger = { ...current.trigger, ...updates };
        if (regeneratePattern && trigger.midiTemplate !== "custom") {
          trigger.midiPattern = getIannixMidiTemplatePattern(trigger.midiTemplate, trigger);
        }
        return { ...current, trigger };
      });
    };

    return (
      <div className="iannix-properties">
        {renderSceneExchangeTools()}
        <InspectorSection title="Score role" className="iannix-section">
          <div className="iannix-role-grid" role="radiogroup" aria-label="IanniX object role">
            {roleOptions.map(option => (
              <button
                key={option.label}
                type="button"
                className={`iannix-role-button role-${option.value || "none"} ${data.role === option.value ? "active" : ""}`}
                role="radio"
                aria-checked={data.role === option.value}
                onClick={() => assignIannixRole([element], option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="iannix-field">
            <span>Label</span>
            <input
              type="text"
              value={data.label}
              placeholder={`${element.type} ${element.id.slice(0, 6)}`}
              onChange={event => updateIannixElement(element.id, current => ({ ...current, label: event.target.value }))}
            />
          </label>
          <label className="iannix-check-row">
            <span>Active in score</span>
            <input
              type="checkbox"
              checked={data.active}
              onChange={event => updateIannixElement(element.id, current => ({ ...current, active: event.target.checked }))}
            />
          </label>
        </InspectorSection>

        {data.role === "cursor" && (
          <InspectorSection title="Cursor" className="iannix-section">
            <label className="iannix-field">
              <span>Support curve</span>
              <select
                value={data.cursor.curveId || ""}
                onChange={event => updateIannixElement(element.id, current => ({
                  ...current,
                  cursor: { ...current.cursor, curveId: event.target.value || null },
                }))}
              >
                <option value="">— Choose curve —</option>
                {curves.map(curve => {
                  const curveData = normalizeIannixData(curve.customData?.iannix);
                  return (
                    <option key={curve.id} value={curve.id}>
                      {curveData.label || `${curve.type} ${curve.id.slice(0, 6)}`}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="iannix-check-row">
              <span>Follow curve tangent</span>
              <input
                type="checkbox"
                checked={data.cursor.followTangent}
                onChange={event => updateIannixElement(element.id, current => ({
                  ...current,
                  cursor: { ...current.cursor, followTangent: event.target.checked },
                }))}
              />
            </label>
            <label className="iannix-field">
              <span>Visual smoothing</span>
              <input
                type="number"
                min="0"
                max="0.95"
                step="0.05"
                data-default="0.65"
                value={data.cursor.visualSmoothing}
                onChange={event => updateIannixElement(element.id, current => ({
                  ...current,
                  cursor: { ...current.cursor, visualSmoothing: Number(event.target.value) },
                }))}
              />
            </label>
            <div className="iannix-hint">Display-only position and angle damping. Trigger timing continues to use the exact cursor path.</div>
            <div className="iannix-two-column">
              <label className="iannix-field">
                <span>MIDI base note</span>
                <input type="number" min="0" max="127" step="1" data-default="60" value={data.midi.baseNote} onChange={event => setNumber("midi", "baseNote", event.target.value)} />
              </label>
              <label className="iannix-field">
                <span>Pitch range ± oct.</span>
                <input type="number" min="0" max="5" step="0.25" data-default="2" value={data.midi.pitchRangeOctaves} onChange={event => setNumber("midi", "pitchRangeOctaves", event.target.value)} />
              </label>
            </div>
            <div className="iannix-hint">Used by the Cursor-relative pitch template. The cursor center is the base note; either end of its shape reaches the selected octave range.</div>
            {curves.length === 0 && (
              <div className="iannix-hint">Assign another object as a Curve before linking this cursor.</div>
            )}
          </InspectorSection>
        )}

        {data.role === "curve" && (
          <InspectorSection title="Curve" className="iannix-section">
            <div className="iannix-readout-row"><span>Linked cursors</span><strong>{linkedCursorCount}</strong></div>
            <div className="iannix-two-column">
              <label className="iannix-field">
                <span>MIDI base note</span>
                <input type="number" min="0" max="127" step="1" data-default="60" value={data.midi.baseNote} onChange={event => setNumber("midi", "baseNote", event.target.value)} />
              </label>
              <label className="iannix-field">
                <span>Pitch range ± oct.</span>
                <input type="number" min="0" max="5" step="0.25" data-default="2" value={data.midi.pitchRangeOctaves} onChange={event => setNumber("midi", "pitchRangeOctaves", event.target.value)} />
              </label>
            </div>
            <div className="iannix-hint">Playback follows this object's core geometry; Mods &amp; FX remain a rendering layer.</div>
          </InspectorSection>
        )}

        {data.role === "trigger" && (
          <InspectorSection title="Trigger" className="iannix-section">
            <label className="iannix-field">
              <span>Pulse duration (s)</span>
              <input
                type="number"
                min="0"
                step="0.05"
                data-default="0.35"
                value={data.trigger.duration}
                onChange={event => setNumber("trigger", "duration", event.target.value)}
              />
            </label>
            <div className="iannix-hint">Fires once when a cursor enters this object's core geometry and rearms after exit.</div>
            <label className="iannix-check-row">
              <span>Send MIDI on trigger</span>
              <input
                type="checkbox"
                checked={data.trigger.midiEnabled}
                onChange={event => updateIannixElement(element.id, current => ({
                  ...current,
                  trigger: { ...current.trigger, midiEnabled: event.target.checked },
                }))}
              />
            </label>
            {data.trigger.midiEnabled && (
              <>
                <label className="iannix-field">
                  <span>Message template</span>
                  <select
                    value={data.trigger.midiTemplate}
                    onChange={event => updateTriggerMidi({ midiTemplate: event.target.value })}
                  >
                    {IANNIX_MIDI_TEMPLATES.map(template => (
                      <option key={template.id} value={template.id}>{template.label}</option>
                    ))}
                  </select>
                </label>
                {data.trigger.midiTemplate !== "custom" && (
                  <div className="iannix-two-column">
                    <label className="iannix-field">
                      <span>Channel</span>
                      <input type="number" min="1" max="16" step="1" data-default="1" value={data.trigger.midiChannel} onChange={event => updateTriggerMidi({ midiChannel: Number(event.target.value) })} />
                    </label>
                    {(data.trigger.midiTemplate === "relativePitch" || data.trigger.midiTemplate === "fixedNote") && (
                      <label className="iannix-field">
                        <span>Velocity</span>
                        <input type="number" min="0" max="127" step="1" data-default="100" value={data.trigger.midiVelocity} onChange={event => updateTriggerMidi({ midiVelocity: Number(event.target.value) })} />
                      </label>
                    )}
                    {data.trigger.midiTemplate === "fixedNote" && (
                      <label className="iannix-field">
                        <span>Note</span>
                        <input type="number" min="0" max="127" step="1" data-default="69" value={data.trigger.midiFixedNote} onChange={event => updateTriggerMidi({ midiFixedNote: Number(event.target.value) })} />
                      </label>
                    )}
                    {data.trigger.midiTemplate === "cursorCC" && (
                      <label className="iannix-field">
                        <span>Controller</span>
                        <input type="number" min="0" max="127" step="1" data-default="0" value={data.trigger.midiController} onChange={event => updateTriggerMidi({ midiController: Number(event.target.value) })} />
                      </label>
                    )}
                  </div>
                )}
                {data.trigger.midiTemplate === "relativePitch" && (
                  <>
                    <label className="iannix-field">
                      <span>Base note from</span>
                      <select value={data.trigger.midiBaseSource} onChange={event => updateTriggerMidi({ midiBaseSource: event.target.value }, false)}>
                        <option value="cursor">Cursor</option>
                        <option value="curve">Curve</option>
                      </select>
                    </label>
                    <div className="iannix-hint">Pitch is the signed intersection offset along the cursor shape. Its center is the chosen object's base note; its ends use that object's ± octave range.</div>
                  </>
                )}
                <label className="iannix-field">
                  <span>IanniX MIDI pattern</span>
                  <input
                    type="text"
                    value={data.trigger.midiPattern}
                    onChange={event => updateTriggerMidi({ midiTemplate: "custom", midiPattern: event.target.value }, false)}
                  />
                </label>
                <div className="iannix-midi-actions">
                  <button
                    type="button"
                    className="iannix-flat-button"
                    onClick={() => toggleDraweratorPanel("settings", { settingsTab: "score" })}
                  >
                    Score &amp; MIDI settings
                  </button>
                  <button
                    type="button"
                    className="iannix-flat-button"
                    disabled={!midiPreview}
                    onClick={() => emitIannixMidiPattern(data.trigger.midiPattern, midiPreview.context, { userGesture: true })}
                  >
                    Test message
                  </button>
                </div>
                <div className="iannix-hint">MIDI destination and tempo are global score settings.</div>
                {midiPreview ? (
                  <div className="iannix-midi-preview">
                    <span>Would emit via {midiPreview.cursorLabel}</span>
                    <strong>{describeIannixMidiMessage(midiPreview.message)}</strong>
                    {data.trigger.midiTemplate === "relativePitch" && (
                      <small>offset {midiPreview.context.trigger_offset.toFixed(3)} · base {midiPreview.context.midi_base_note}</small>
                    )}
                  </div>
                ) : (
                  <div className="iannix-hint warning">{midiPreviewError}</div>
                )}
                <div className="iannix-midi-status" role="status">{midiStatus}</div>
                <details className="iannix-protocol-docs">
                  <summary>MIDI protocol reference</summary>
                  <div className="iannix-protocol-body">
                    <code>midi://device/notef channel note velocity duration</code>
                    <code>midi://device/ccf channel controller value</code>
                    <p><strong>/notef</strong> maps note and velocity from 0–1 to MIDI 0–127. <strong>/note</strong> accepts integer MIDI values directly. <strong>/ccf</strong> maps a 0–1 value to a control change; <strong>/cc</strong> accepts 0–127.</p>
                    <dl>
                      <dt>trigger_value_x</dt><dd>Trigger X mapped through the colliding cursor's curve bounds; default velocity.</dd>
                      <dt>trigger_value_y</dt><dd>Trigger Y mapped upward from 0–1; default pitch.</dd>
                      <dt>trigger_offset</dt><dd>Signed −1…1 intersection offset along the cursor shape.</dd>
                      <dt>trigger_note</dt><dd>Cursor-relative pitch after applying base note and octave range.</dd>
                      <dt>cursor_value_y</dt><dd>Current cursor Y in its expanded IanniX curve bounds.</dd>
                      <dt>trigger_duration</dt><dd>This trigger's pulse duration in seconds.</dd>
                      <dt>midi_out</dt><dd>Alias for the MIDI output selected above.</dd>
                    </dl>
                    <p>IanniX XY preserves the original template. Cursor-relative pitch is a Drawerator extension built on IanniX's configurable cursor bounds idea. Test Message uses the same selected-trigger and nearest-cursor context as playback.</p>
                  </div>
                </details>
              </>
            )}
          </InspectorSection>
        )}

        <InspectorSection title="Object time" className="iannix-section" aside={<span className="iannix-progress-readout">{timeState.localTime.toFixed(2)}s · {(timeState.progress * 100).toFixed(1)}%</span>}>
          <div className="iannix-two-column">
            <label className="iannix-field">
              <span>Start (s)</span>
              <input type="number" min="0" step="0.1" data-default="0" value={data.time.start} onChange={event => setNumber("time", "start", event.target.value)} />
            </label>
            <label className="iannix-field">
              <span>Duration (s)</span>
              <input type="number" min="0.001" step="0.1" data-default="5" value={data.time.duration} onChange={event => setNumber("time", "duration", event.target.value)} />
            </label>
            <label className="iannix-field">
              <span>Rate</span>
              <input type="number" min="0" step="0.1" data-default="1" value={data.time.rate} onChange={event => setNumber("time", "rate", event.target.value)} />
            </label>
            <label className="iannix-field">
              <span>Loop</span>
              <select
                value={data.time.loopMode}
                onChange={event => updateIannixElement(element.id, current => ({
                  ...current,
                  time: { ...current.time, loopMode: event.target.value },
                }))}
              >
                <option value="once">Once / hold</option>
                <option value="loop">Loop</option>
                <option value="pingPong">Ping-pong</option>
              </select>
            </label>
          </div>
          <div className="iannix-time-bar" aria-label="Object time progress">
            <span style={{ width: `${Math.max(0, Math.min(100, timeState.progress * 100))}%` }} />
          </div>
          <div className="iannix-hint">This role-independent clock will also drive object draw-on animation in the next phase.</div>
        </InspectorSection>

        {scoreEvents.length > 0 && (
          <InspectorSection title="Recent triggers" className="iannix-section compact" aside={<button type="button" className="iannix-text-button" onClick={() => setScoreEvents([])}>Clear</button>}>
            <div className="iannix-event-list">
              {scoreEvents.slice(0, 5).map(event => (
                <div key={event.id}>
                  <span>{event.label}{event.midi
                    ? event.midi.kind === "cc"
                      ? ` · ch ${event.midi.channel} CC ${event.midi.controller} value ${event.midi.value}`
                      : ` · ch ${event.midi.channel} note ${event.midi.note} vel ${event.midi.velocity}`
                    : ""}</span>
                  <time>{event.time.toFixed(3)}s</time>
                </div>
              ))}
            </div>
          </InspectorSection>
        )}
      </div>
    );
  };

  const renderIannixScriptTab = () => {
    const activeScript = iannixScripts.find(script => script.id === activeIannixScriptId);
    const scriptParameters = parseScriptParameters(iannixScriptSource, {
      includeIannixAsk: true,
      values: activeScript?.parameters || {},
    });
    const scriptParameterValues = getScriptParameterValues(scriptParameters);
    const runTrustedSource = (source, filename, parameters = {}) => {
      const trimmed = String(source || "").trim();
      if (!trimmed) return Promise.resolve(null);
      return commandRegistry.execute("iannix.import.trusted", {
        source: trimmed,
        filename,
        parameters,
      }, {
        source: "iannix-panel",
        transportTime: scoreTimeRef.current,
      }).catch(error => {
        setSceneExchangeStatus(error.message || "Could not execute this IanniX source.");
        return null;
      });
    };
    const runScript = () => runTrustedSource(iannixScriptSource, activeScript?.name || "IanniX editor", scriptParameterValues);
    const runCommand = async () => {
      const command = iannixCommandSource.trim();
      if (!command) return;
      const result = await commandRegistry.execute("iannix.command.execute", { command }, {
        source: "iannix-panel",
        transportTime: scoreTimeRef.current,
      }).catch(error => {
        setSceneExchangeStatus(error.message || "Could not execute this IanniX command.");
        return null;
      });
      if (result) setIannixCommandSource("");
    };
    const createScript = () => {
      const id = `iannix-script-${crypto.randomUUID()}`;
      const script = { id, name: "Untitled IanniX Script", source: "// IanniX commands\n", parameters: {}, createdAt: Date.now(), updatedAt: Date.now() };
      setIannixScripts(previous => [...previous, script]);
      setActiveIannixScriptId(id);
      setIannixScriptSource(script.source);
    };
    const saveScript = () => {
      if (!activeScript) return;
      setIannixScripts(previous => previous.map(script => script.id === activeScript.id
        ? { ...script, source: iannixScriptSource, updatedAt: Date.now() }
        : script
      ));
      setSceneExchangeStatus(`Saved “${activeScript.name}” in this browser.`);
    };
    const renameScript = name => {
      if (!activeScript) return;
      const trimmed = String(name || "").trim();
      if (!trimmed || trimmed === activeScript.name) return;
      setIannixScripts(previous => previous.map(script => script.id === activeScript.id
        ? { ...script, name: trimmed, updatedAt: Date.now() }
        : script
      ));
      setSceneExchangeStatus(`Renamed script to “${trimmed}”.`);
    };
    const deleteScript = () => {
      if (!activeScript || !window.confirm(`Delete “${activeScript.name}”?`)) return;
      const remaining = iannixScripts.filter(script => script.id !== activeScript.id);
      setIannixScripts(remaining);
      setActiveIannixScriptId(remaining[0]?.id || "");
      setIannixScriptSource(remaining[0]?.source || "");
    };
    const updateScriptParameter = (name, value) => {
      if (!activeScript || !Number.isFinite(Number(value))) return;
      setIannixScripts(previous => previous.map(script => script.id === activeScript.id
        ? {
            ...script,
            parameters: { ...(script.parameters || {}), [name]: Number(value) },
            updatedAt: Date.now(),
          }
        : script
      ));
    };
    return (
      <div className="iannix-properties iannix-script-pane">
          <label className="iannix-section-title" htmlFor="iannix-script-select">IanniX Script</label>
          <select id="iannix-script-select" className="custom-brush-select" value={activeIannixScriptId} onChange={event => {
            const script = iannixScripts.find(candidate => candidate.id === event.target.value);
            setActiveIannixScriptId(event.target.value);
            setIannixScriptSource(script?.source || "");
          }}>
            <option value="">— Choose script —</option>
            {iannixScripts.map(script => <option key={script.id} value={script.id}>{script.name}</option>)}
          </select>
          <input
            type="text"
            className="custom-brush-select"
            defaultValue={activeScript?.name || ""}
            key={activeScript?.id || "no-script"}
            onBlur={event => renameScript(event.target.value)}
            onKeyDown={event => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              renameScript(event.currentTarget.value);
              event.currentTarget.blur();
            }}
            placeholder="Script name"
            aria-label="Script name"
            disabled={!activeScript}
          />
          <textarea
            className="iannix-script-editor custom-brush-textarea"
            value={iannixScriptSource}
            onChange={event => setIannixScriptSource(event.target.value)}
            onKeyDown={event => {
              if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
              event.preventDefault();
              event.stopPropagation();
              runScript();
            }}
            placeholder="Paste a trusted .iannix script or a one-off run() command…"
            spellCheck="false"
          />
          {scriptParameters.length > 0 && (
            <div className="iannix-script-parameters" aria-label="IanniX script parameters">
              {scriptParameters.map(parameter => (
                <label
                  className="iannix-script-parameter"
                  key={parameter.name}
                  title={[parameter.category, parameter.name].filter(Boolean).join(" · ")}
                >
                  <span className="iannix-script-parameter-header">{parameter.label || parameter.name}</span>
                  <input
                    type="number"
                    min={parameter.min}
                    max={parameter.max}
                    step={parameter.step}
                    data-default={parameter.default}
                    value={parameter.value}
                    onChange={event => updateScriptParameter(parameter.name, event.target.value)}
                    disabled={!activeScript}
                    aria-label={`${parameter.label || parameter.name} (${parameter.name})`}
                  />
                </label>
              ))}
            </div>
          )}
          <div className="script-icon-toolbar">
            <button type="button" className="palette-action-btn primary script-icon-button" title="Run script (Cmd/Ctrl+Enter)" aria-label="Run script" onClick={runScript}><ScriptActionIcon type="run" /></button>
            <button type="button" className="palette-action-btn secondary script-icon-button" title="Save script" aria-label="Save script" onClick={saveScript} disabled={!activeScript}><ScriptActionIcon type="save" /></button>
            <button type="button" className="palette-action-btn secondary script-icon-button" title="New script" aria-label="New script" onClick={createScript}><ScriptActionIcon type="add" /></button>
            <button type="button" className="palette-action-btn secondary script-icon-button" title="Import trusted .iannix" aria-label="Import trusted .iannix" onClick={() => iannixImportInputRef.current?.click()}><ScriptActionIcon type="import" /></button>
            <button type="button" className="palette-action-btn danger script-icon-button" title="Delete script" aria-label="Delete script" onClick={deleteScript} disabled={!activeScript}><ScriptActionIcon type="remove" /></button>
          </div>
          <form className="iannix-command-line" onSubmit={event => { event.preventDefault(); runCommand(); }}>
            <input
              type="text"
              value={iannixCommandSource}
              onChange={event => setIannixCommandSource(event.target.value)}
              onKeyDown={event => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.stopPropagation();
                runCommand();
              }}
              placeholder='IanniX command, e.g. setGroup current "section A"'
              aria-label="IanniX command line"
              spellCheck="false"
            />
            <button type="submit" className="palette-action-btn primary script-icon-button" title="Run IanniX command" aria-label="Run IanniX command" disabled={!iannixCommandSource.trim()}><ScriptActionIcon type="run" /></button>
          </form>
          <div className="iannix-hint">Cmd/Ctrl+Enter runs the editor. Scripts are saved in this browser's localStorage. The command line executes its value as <code>run("...")</code>.</div>
          {sceneExchangeStatus && <div className="iannix-midi-status" role="status">{sceneExchangeStatus}</div>}
      </div>
    );
  };

  const getScriptParams = code => parseScriptParameters(code);

  const convertShapeToPath = (element) => {
    if (!excalidrawAPI) return;
    const { x, y, width, height, strokeColor, strokeWidth, backgroundColor, fillStyle, strokeStyle, roughness, roundness, opacity, groupIds, angle } = element;

    let points = [];
    if (element.type === "rectangle") {
      points = [[0, 0], [width, 0], [width, height], [0, height], [0, 0]];
    } else if (element.type === "diamond") {
      points = [[width/2, 0], [width, height/2], [width/2, height], [0, height/2], [width/2, 0]];
    } else if (element.type === "ellipse") {
      const steps = 36;
      for (let i = 0; i <= steps; i++) {
        const angle = (i * 2 * Math.PI) / steps;
        points.push([
          width / 2 + (width / 2) * Math.cos(angle),
          height / 2 + (height / 2) * Math.sin(angle)
        ]);
      }
    } else {
      return;
    }

    const convertedElement = {
      type: "line",
      x,
      y,
      width,
      height,
      points,
      strokeColor,
      strokeWidth,
      backgroundColor,
      fillStyle,
      strokeStyle,
      roughness,
      roundness,
      opacity,
      groupIds,
      angle,
      id: element.id,
      seed: element.seed,
      version: element.version + 1,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      updated: Date.now(),
      boundElements: null,
      link: null,
      locked: element.locked,
      frameId: element.frameId,
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null
    };

    const nextElements = excalidrawAPI.getSceneElements().map(el => {
      if (el.id === element.id) {
        return convertedElement;
      }
      return el;
    });

    excalidrawAPI.updateScene({
      elements: nextElements,
      commitToHistory: true
    });
  };

  const getModifierPanelSelectedElements = () => {
    let selectedElements = getSelectedElements();
    const selectedIds = new Set(selectedElements.map(el => el.id));
    // A baked brush is one logical object even though Excalidraw selects its
    // grouped track elements individually. Keep the owning parent editable in
    // the modifier panel and ignore its baked children for selection counting.
    selectedElements = selectedElements.filter(el => !(
      el.customData?.bakedTrack && selectedIds.has(el.customData?.parentId)
    ));
    return selectedElements;
  };

  const getModifierPanelControlState = () => {
    const selectedElements = getModifierPanelSelectedElements();
    const hasSelection = selectedElements.length === 1;
    const hasMultipleSelection = selectedElements.length > 1;
    const element = hasSelection ? selectedElements[0] : null;
    const isShape = element ? ["rectangle", "ellipse", "diamond"].includes(element.type) : false;
    const modifiers = hasSelection ? (element.customData?.modifiers || []) : globalModifiers;
    const isMuted = hasSelection ? Boolean(element.customData?.muteModifiers) : globalMuteStack;
    const selectedHideOriginal = hasSelection ? Boolean(element.customData?.hideOriginal) : nextStrokeHideOriginal;
    const resolvedHideControl = resolveHideOriginalControl({
      hasSelection,
      selectedHideOriginal,
      customBrushActive,
      nextStrokeHideOriginal,
    });
    const hideOriginalControl = hasMultipleSelection
      ? { checked: false, disabled: true, target: null }
      : resolvedHideControl;
    const canRestoreOriginal = hasSelection && (
      element.id.includes("-brush-") ||
      element.groupIds?.some(groupId => groupId.endsWith("-group"))
    );

    return {
      selectedElements,
      hasSelection,
      hasMultipleSelection,
      element,
      isShape,
      modifiers,
      isMuted,
      hideOriginalControl,
      canRestoreOriginal,
    };
  };

  const handleToggleModifierMute = ({ hasSelection, element, modifiers, isMuted, hasMultipleSelection, hideOriginalControl }) => {
    if (!excalidrawAPI || hasMultipleSelection) return;
    if (!isMuted && hideOriginalControl.checked) return;
    if (hasSelection) {
      const nextElements = excalidrawAPI.getSceneElements().map(el => {
        if (el.id !== element.id) return el;
        const originalPoints = el.customData?.originalPoints;
        const mute = !isMuted;
        let updatedPoints = el.points;

        if (mute && originalPoints) {
          updatedPoints = originalPoints.map(point => {
            const relativePoint = [point[0] - el.x, point[1] - el.y];
            if (point.pressure !== undefined) relativePoint.pressure = point.pressure;
            return relativePoint;
          });
        }

        return {
          ...el,
          points: updatedPoints,
          customData: {
            ...(el.customData || {}),
            muteModifiers: mute,
          },
        };
      });
      excalidrawAPI.updateScene({ elements: nextElements });

      if (isMuted) {
        setTimeout(() => updateModifiedElementInScene(element.id, modifiers), 50);
      }
      return;
    }
    setGlobalMuteStack(previous => !previous);
  };

  const handleToggleModifierHideOriginal = ({ element, hideOriginalControl, isMuted }) => {
    if (!excalidrawAPI || hideOriginalControl.disabled) return;
    if (!hideOriginalControl.checked && isMuted) return;
    if (hideOriginalControl.target === "nextStroke") {
      setNextStrokeHideOriginal(previous => !previous);
      return;
    }
    if (hideOriginalControl.target !== "selectedStroke" || !element) return;

    const nextElements = excalidrawAPI.getSceneElements().map(el => {
      if (el.id !== element.id) return el;
      const hide = !el.customData?.hideOriginal;
      const effectiveHide = hide && (el.customData?.modifiers?.length || 0) > 0;
      const runtimeCursor = isRuntimeCursor(el);
      let savedOpacity = el.customData?.savedOpacity;

      if (effectiveHide) {
        if (el.opacity > 0) savedOpacity = el.opacity;
        else if (savedOpacity === undefined) savedOpacity = 100;
      }

      return {
        ...el,
        opacity: runtimeCursor ? 0 : (effectiveHide ? 0 : (savedOpacity ?? 100)),
        customData: {
          ...(el.customData || {}),
          hideOriginal: hide,
          savedOpacity,
        },
      };
    });

    evaluatingModifiersRef.current = true;
    try {
      excalidrawAPI.updateScene({ elements: nextElements });
    } finally {
      evaluatingModifiersRef.current = false;
    }
    setModifierUpdateNonce(nonce => nonce + 1);
  };

  const renderModifiersTab = () => {
    if (!excalidrawAPI) {
      return <div className="modifiers-panel-empty" style={{ textAlign: "center", opacity: 0.6, padding: "20px" }}>Excalidraw is loading...</div>;
    }

    const selectedElements = getModifierPanelSelectedElements();
    const hasSelection = selectedElements.length === 1;

    let element = null;
    let isShape = false;
    let modifiers = [];

    if (hasSelection) {
      element = selectedElements[0];
      isShape = ["rectangle", "ellipse", "diamond"].includes(element.type);
      modifiers = element.customData?.modifiers || [];
      if (element.type !== "freedraw" && element.type !== "line" && !isShape) {
        return (
          <div className="modifiers-panel-empty" style={{
            textAlign: "center",
            padding: "24px 16px",
            border: "1px dashed var(--color-border, #3a3b46)",
            borderRadius: "8px",
            opacity: 0.7,
            fontSize: "13px"
          }}>
            Modifiers can only be applied to stroke paths (pencil drawings or lines) or geometric shapes.
          </div>
        );
      }
    } else {
      if (selectedElements.length > 1) {
        return (
          <div className="modifiers-panel-empty" style={{
            textAlign: "center",
            padding: "32px 16px",
            border: "1px dashed var(--color-border, #3a3b46)",
            borderRadius: "8px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
            opacity: 0.7
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.24 9.12l-8.62 8.62a1 1 0 01-1.41 0l-2.01-2.01a1 1 0 010-1.41l8.62-8.62m3.42 3.42l1.58-1.58a2.5 2.5 0 00-3.54-3.54l-1.58 1.58m3.54 3.54l-3.54-3.54" />
            </svg>
            <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.5" }}>
              Modifier stack editing is limited to one selected object at a time.
            </p>
          </div>
        );
      }
      // Zero elements selected: Use global stack
      modifiers = globalModifiers;
    }

    if (isShape) {
      return (
        <div style={{
          textAlign: "center",
          padding: "24px 16px",
          border: "1px dashed var(--color-border, #3a3b46)",
          borderRadius: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          alignItems: "center"
        }}>
          <p style={{ margin: 0, fontSize: "13px", opacity: 0.8 }}>
            Selected: <strong style={{ textTransform: "capitalize" }}>{element.type}</strong>. Convert it to a path to apply modifiers.
          </p>
          <button
            onClick={() => convertShapeToPath(element)}
            style={{
              padding: "6px 12px",
              borderRadius: "4px",
              background: "var(--button-hover-bg, rgba(0, 0, 0, 0.05))",
              color: "var(--color-primary)",
              border: "1px solid var(--border-color, rgba(0, 0, 0, 0.1))",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "12px"
            }}
          >
            Convert to Path
          </button>
        </div>
      );
    }

    const handleAddModifier = (type) => {
      const brushId = resolveBrushId(type, brushPalette);
      const brush = brushPalette.find(b => b.id === brushId);
      if (brush) {
        const defaultParams = {};
        const scriptParams = getScriptParams(brush.code);
        scriptParams.forEach(p => {
          defaultParams[p.name] = p.default;
        });
        const newMod = {
          id: `custom-${brushId}`,
          name: brush.name,
          enabled: true,
          params: defaultParams
        };
        const updated = [...modifiers, newMod];
        if (hasSelection) {
          updateModifiedElementInScene(element.id, updated);
        } else {
          setGlobalModifiers(updated);
        }
      }
    };

    const handleUpdateModifierParams = (modIndex, key, val) => {
      const updated = modifiers.map((mod, idx) => {
        if (idx === modIndex) {
          return {
            ...mod,
            params: {
              ...(mod.params || {}),
              [key]: val
            }
          };
        }
        return mod;
      });
      if (hasSelection) {
        updateModifiedElementInScene(element.id, updated);
      } else {
        setGlobalModifiers(updated);
      }
    };

    const handleToggleModifierEnabled = (modIndex) => {
      const updated = modifiers.map((mod, idx) => {
        if (idx === modIndex) {
          return { ...mod, enabled: !mod.enabled };
        }
        return mod;
      });
      if (hasSelection) {
        updateModifiedElementInScene(element.id, updated);
      } else {
        setGlobalModifiers(updated);
      }
    };

    const handleRemoveModifier = (modIndex) => {
      const updated = modifiers.filter((_, idx) => idx !== modIndex);
      if (hasSelection) {
        updateModifiedElementInScene(element.id, updated);
      } else {
        setGlobalModifiers(updated);
      }
    };

    const handleMoveModifier = (modIndex, direction) => {
      const newIndex = modIndex + direction;
      if (newIndex < 0 || newIndex >= modifiers.length) return;
      const updated = [...modifiers];
      const temp = updated[modIndex];
      updated[modIndex] = updated[newIndex];
      updated[newIndex] = temp;
      if (hasSelection) {
        updateModifiedElementInScene(element.id, updated);
      } else {
        setGlobalModifiers(updated);
      }
    };

    const handleApplyModifier = (modIndex) => {
      if (!hasSelection || !excalidrawAPI) return;
      const elements = excalidrawAPI.getSceneElements();
      const parentEl = elements.find(el => el.id === element.id);
      if (!parentEl) return;

      const liveLinearEditPoints = linearEditPointsRef.current[parentEl.id];
      const originalPoints = liveLinearEditPoints || parentEl.customData?.originalPoints;
      if (!originalPoints || originalPoints.length === 0) return;

      // 1. Evaluate modifier stack up to and including modIndex
      const subStack = modifiers.slice(0, modIndex + 1);
      const globals = getElementBrushGlobals(parentEl);
      const pointsForStack = originalPoints;

      const selectedModifier = modifiers[modIndex];
      const upstreamEvaluation = evaluateModifierStack(
        pointsForStack,
        modifiers.slice(0, modIndex),
        globals
      );
      const selectedEvaluation = evaluateModifierStack(
        upstreamEvaluation.primaryPoints,
        [selectedModifier],
        globals
      );

      // Brush modifiers produce additional tracks rather than replacing the
      // source path. They can therefore be baked independently while every
      // other modifier remains live and editable in its original stack order.
      if (selectedEvaluation.hasAccumulated) {
        const tracksToBake = selectedEvaluation.allLines.filter(isDrawableTrack);
        if (tracksToBake.length === 0) return;

        const remainingMods = removeModifierAt(modifiers, modIndex);
        const remainingEvaluation = evaluateModifierStack(
          pointsForStack,
          remainingMods,
          globals
        );
        const updatedParent = updateElementGeometry(parentEl, remainingEvaluation.primaryPoints);

        let customStrokeWidth = null;
        remainingMods.forEach(mod => {
          if (mod.enabled && mod.params?.strokeWidth !== undefined) {
            customStrokeWidth = mod.params.strokeWidth;
          }
        });
        if (customStrokeWidth !== null) updatedParent.strokeWidth = customStrokeWidth;

        updatedParent.customData = {
          ...(parentEl.customData || {}),
          originalPoints,
          modifiers: remainingMods,
          version: (parentEl.customData?.version || 0) + 1,
          excalidrawVersion: updatedParent.version,
          lastWidth: updatedParent.width,
          lastHeight: updatedParent.height
        };

        const detachedGroupId = `${parentEl.id}-partial-bake-${Date.now()}`;
        const childElements = createBakedTrackElements(
          parentEl,
          updatedParent,
          tracksToBake,
          detachedGroupId
        ).map(child => ({
          ...child,
          // The bake is detached from the live source, but its tracks remain
          // one independently selectable and transformable Excalidraw group.
          groupIds: [detachedGroupId],
          locked: false,
          customData: {
            bakedTrack: true,
            detachedBake: true,
            sourceElementId: parentEl.id,
            sourceModifierId: selectedModifier.id
          }
        }));
        processedModifierVersionsRef.current[parentEl.id] = updatedParent.customData.version;
        suppressedModifierSyncVersionsRef.current[parentEl.id] = updatedParent.customData.version;

        const nextElements = [];
        elements.forEach(el => {
          if (el.id === parentEl.id) {
            // Insert detached baked artwork immediately underneath its source.
            nextElements.push(...childElements, updatedParent);
            return;
          }
          if (
            el.customData?.parentId === parentEl.id &&
            el.customData?.isModifierGenerated &&
            !el.customData?.bakedTrack
          ) {
            nextElements.push({ ...el, isDeleted: true });
            return;
          }
          nextElements.push(el);
        });

        evaluatingModifiersRef.current = true;
        try {
          excalidrawAPI.updateScene({
            elements: nextElements,
            appState: {
              selectedElementIds: { [updatedParent.id]: true }
            },
            commitToHistory: true
          });
        } finally {
          evaluatingModifiersRef.current = false;
        }
        setModifierUpdateNonce(n => n + 1);
        return;
      }

      const evaluation = evaluateModifierStack(pointsForStack, subStack, globals);
      const { parentTrack, childTracks } = resolveBakedTracks(evaluation);
      if (!parentTrack) return;

      // 2. The remaining modifiers that will stay in the stack
      const remainingMods = modifiers.slice(modIndex + 1);
      const isFinalBrushBake = evaluation.hasAccumulated && remainingMods.length === 0;

      // 3. Update element geometry and custom data
      const updatedParent = isFinalBrushBake
        ? {
            ...parentEl,
            version: parentEl.version + 1,
            versionNonce: Math.floor(Math.random() * 1000000),
            updated: Date.now()
          }
        : updateElementGeometry(parentEl, parentTrack);
      
      let customStrokeWidth = null;
      remainingMods.forEach(mod => {
        if (mod.enabled && mod.params && mod.params.strokeWidth !== undefined) {
          customStrokeWidth = mod.params.strokeWidth;
        }
      });
      if (customStrokeWidth !== null) {
        updatedParent.strokeWidth = customStrokeWidth;
      }

      const childElements = [];
      const groupId = `${parentEl.id}-baked-group`;

      const tracksToBake = isFinalBrushBake
        ? evaluation.allLines.filter(isDrawableTrack)
        : childTracks;
      childElements.push(...createBakedTrackElements(parentEl, updatedParent, tracksToBake, groupId));
      if (childElements.length > 0) {
        updatedParent.groupIds = [...new Set([...(parentEl.groupIds || []), groupId])];
      }

      if (remainingMods.length === 0) {
        updatedParent.customData = {
          ...(parentEl.customData || {}),
          originalPoints: null,
          modifiers: [],
          hideOriginal: false,
          version: (parentEl.customData?.version || 0) + 1,
          excalidrawVersion: updatedParent.version,
          lastWidth: updatedParent.width,
          lastHeight: updatedParent.height
        };
        if (parentEl.customData?.hideOriginal) {
          // Preserve the preview's layer semantics: hide only the source
          // freedraw while keeping every generated brush track visible.
          updatedParent.opacity = isFinalBrushBake
            ? 0
            : (parentEl.customData.savedOpacity ?? 100);
        }

      } else {
        updatedParent.customData = {
          ...(parentEl.customData || {}),
          originalPoints: parentTrack,
          modifiers: remainingMods,
          version: (parentEl.customData?.version || 0) + 1,
          excalidrawVersion: updatedParent.version,
          lastWidth: updatedParent.width,
          lastHeight: updatedParent.height
        };
      }

      processedModifierVersionsRef.current[parentEl.id] = updatedParent.customData.version;

      const nextElements = elements.map(el => {
        if (el.id === parentEl.id) {
          return updatedParent;
        }
        if (el.customData?.parentId === parentEl.id && el.customData?.isModifierGenerated) {
          return { ...el, isDeleted: true };
        }
        return el;
      }).concat(childElements);

      evaluatingModifiersRef.current = true;
      try {
        const selectedElementIds = Object.fromEntries(
          [updatedParent, ...childElements].map(el => [el.id, true])
        );
        excalidrawAPI.updateScene({
          elements: nextElements,
          appState: { selectedElementIds },
          commitToHistory: true
        });
      } finally {
        evaluatingModifiersRef.current = false;
      }
      setModifierUpdateNonce(n => n + 1);
    };

    return (
      <div className="modifiers-panel-container" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label style={{ fontSize: "11px", fontWeight: "bold", opacity: 0.7 }}>ADD MODIFIER</label>
          <select 
            value=""
            onChange={(e) => {
              if (e.target.value) {
                handleAddModifier(e.target.value);
              }
            }}
            style={{
              padding: "6px 10px",
              borderRadius: "4px",
              background: "var(--island-bg-color, #ffffff)",
              color: "var(--color-primary)",
              border: "1px solid var(--border-color, rgba(0, 0, 0, 0.1))",
              cursor: "pointer",
              width: "100%",
              outline: "none"
            }}
          >
            <option value="" style={{ background: "var(--island-bg-color, #ffffff)", color: "var(--color-primary)" }}>-- Choose Modifier to Add --</option>
            <optgroup label="Geometric Filters" style={{ background: "var(--island-bg-color, #ffffff)", color: "var(--color-primary)" }}>
              <option value="custom-rdp" style={{ background: "var(--island-bg-color, #ffffff)", color: "var(--color-primary)" }}>Simplify (RDP)</option>
              <option value="custom-vw" style={{ background: "var(--island-bg-color, #ffffff)", color: "var(--color-primary)" }}>Simplify (VW)</option>
              <option value="custom-smooth" style={{ background: "var(--island-bg-color, #ffffff)", color: "var(--color-primary)" }}>Laplacian Smooth</option>
              <option value="custom-taubin" style={{ background: "var(--island-bg-color, #ffffff)", color: "var(--color-primary)" }}>Taubin Smooth</option>
              <option value="custom-resample" style={{ background: "var(--island-bg-color, #ffffff)", color: "var(--color-primary)" }}>Resample Uniformly</option>
              <option value="custom-joint" style={{ background: "var(--island-bg-color, #ffffff)", color: "var(--color-primary)" }}>Close & Smooth Joint</option>
              <option value="custom-snap" style={{ background: "var(--island-bg-color, #ffffff)", color: "var(--color-primary)" }}>Snap to Grid</option>
              <option value="custom-hobby" style={{ background: "var(--island-bg-color, #ffffff)", color: "var(--color-primary)" }}>Hobby Spline</option>
            </optgroup>
            <optgroup label="Creative Effects & Brushes" style={{ background: "var(--island-bg-color, #ffffff)", color: "var(--color-primary)" }}>
              {brushPalette.filter(b => !["rdp", "vw", "smooth", "taubin", "resample", "joint", "snap", "hobby"].includes(b.id)).map(b => (
                <option key={b.id} value={`custom-${b.id}`} style={{ background: "var(--island-bg-color, #ffffff)", color: "var(--color-primary)" }}>{b.name}</option>
              ))}
            </optgroup>
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ fontSize: "11px", fontWeight: "bold", opacity: 0.7 }}>
            MODIFIER STACK ({modifiers.length})
          </label>
          
          {modifiers.length === 0 ? (
            <div style={{ 
              textAlign: "center", 
              padding: "24px", 
              border: "1px dashed var(--color-border, #3a3b46)",
              borderRadius: "8px",
              opacity: 0.6,
              fontSize: "13px"
            }}>
              No active modifiers. Select a modifier above to begin.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {modifiers.map((mod, index) => {
                return (
                  <div 
                    key={index} 
                    style={{
                      border: "1px solid var(--border-color, rgba(0, 0, 0, 0.1))",
                      borderRadius: "4px",
                      background: "var(--input-bg-color, rgba(0, 0, 0, 0.02))",
                      padding: "8px 10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      opacity: mod.enabled ? 1 : 0.6
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "11px", opacity: 0.5, fontWeight: "bold" }}>#{index + 1}</span>
                        <strong style={{ fontSize: "12px" }}>{mod.name}</strong>
                        {mod.codeOverride && (
                          <span style={{ fontSize: "9px", opacity: 0.65, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            edited
                          </span>
                        )}
                      </div>
                      
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <button
                          onClick={() => handleToggleModifierEnabled(index)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px",
                            color: "var(--color-primary)",
                            opacity: mod.enabled ? 1 : 0.4,
                            display: "flex",
                            alignItems: "center"
                          }}
                          title={mod.enabled ? "Disable" : "Enable"}
                        >
                          {mod.enabled ? (
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a10.024 10.024 0 014.501-5.786m3.07-1.425A8.986 8.986 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-2.25 3.566m-4.396-4.396A2.98 2.98 0 0012 9c-.343 0-.671.077-.966.216m0 0l-8.47-8.47M3 3l18 18" />
                            </svg>
                          )}
                        </button>
 
                        {hasSelection && (
                          <button
                            onClick={() => handleApplyModifier(index)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: "4px",
                              color: "var(--color-primary)",
                              opacity: 0.8,
                              display: "flex",
                              alignItems: "center"
                            }}
                            title="Apply (Bake) modifier"
                          >
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            const brushId = resolveBrushId(mod.id, brushPalette);
                            const brush = brushPalette.find(candidate => candidate.id === brushId);
                            if (!brushId || !brush) return;
                            const editorCode = mod.codeOverride || brush.code;
                            const editorParams = getScriptParams(editorCode).map(param => ({
                              ...param,
                              value: mod.params?.[param.name] ?? param.default
                            }));
                            pendingBrushParamsRef.current = {
                              brushId,
                              params: { ...(mod.params || {}) }
                            };
                            setEditingModifierTarget({
                              elementId: element?.id || null,
                              modifierIndex: index,
                              modifierId: mod.id,
                              brushId
                            });
                            setActiveBrushId(brushId);
                            setActiveBrushCode(editorCode);
                            setBrushParams(editorParams);
                            setModsPanelTab("script");
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px",
                            color: "var(--color-primary)",
                            opacity: 0.8,
                            display: "flex",
                            alignItems: "center"
                          }}
                          title="Edit modifier script"
                        >
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>

                        <button
                          onClick={() => handleMoveModifier(index, -1)}
                          disabled={index === 0}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: index === 0 ? "not-allowed" : "pointer",
                            padding: "4px",
                            opacity: index === 0 ? 0.3 : 1,
                            color: "inherit",
                            display: "flex",
                            alignItems: "center"
                          }}
                          title="Move Up"
                        >
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
 
                        <button
                          onClick={() => handleMoveModifier(index, 1)}
                          disabled={index === modifiers.length - 1}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: index === modifiers.length - 1 ? "not-allowed" : "pointer",
                            padding: "4px",
                            opacity: index === modifiers.length - 1 ? 0.3 : 1,
                            color: "inherit",
                            display: "flex",
                            alignItems: "center"
                          }}
                          title="Move Down"
                        >
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
 
                        <button
                          onClick={() => handleRemoveModifier(index)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px",
                            color: "#ff4757",
                            display: "flex",
                            alignItems: "center"
                          }}
                          title="Delete Modifier"
                        >
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
 
                    {mod.enabled && (
                      <div style={{
                        borderTop: "1px solid var(--border-color, rgba(0, 0, 0, 0.1))",
                        paddingTop: "8px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px"
                      }}>
                        {(() => {
                          const brushId = resolveBrushId(mod.id, brushPalette);
                          const brush = brushPalette.find(b => b.id === brushId);
                          if (!brush) return null;
                          const scriptParams = getScriptParams(mod.codeOverride || brush.code);
                          if (scriptParams.length === 0) {
                            return <div style={{ fontSize: "11px", opacity: 0.6 }}>No parameters.</div>;
                          }
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {scriptParams.map(sp => {
                                const val = mod.params && mod.params[sp.name] !== undefined ? mod.params[sp.name] : sp.default;
                                const isBinary = sp.min === 0 && sp.max === 1 && sp.step === 1;
                                return (
                                  <div key={sp.name} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    {isBinary ? (
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 0" }}>
                                        <span style={{ fontSize: "11px", opacity: 0.8 }}>{sp.name}:</span>
                                        <input 
                                          type="checkbox"
                                          checked={val > 0.5}
                                          onChange={(e) => handleUpdateModifierParams(index, sp.name, e.target.checked ? 1 : 0)}
                                          style={{ cursor: "pointer", width: "16px", height: "16px" }}
                                        />
                                      </div>
                                    ) : (
                                      <>
                                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                                          <span>{sp.name}:</span>
                                        </div>
                                        <input
                                          type="number"
                                          min={sp.min}
                                          max={sp.max}
                                          step={sp.step}
                                          data-default={sp.default ?? sp.min ?? 0}
                                          value={val}
                                          onChange={(e) => handleUpdateModifierParams(index, sp.name, parseFloat(e.target.value))}
                                          style={{ width: "100%" }}
                                        />
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
 

      </div>
    );
  };

  const rotatePoint = (x, y, cx, cy, angle) => {
    if (!angle) return [x, y];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rx = cos * (x - cx) - sin * (y - cy) + cx;
    const ry = sin * (x - cx) + cos * (y - cy) + cy;
    return [rx, ry];
  };

  const handleToggleSharpness = (element, sharpness) => {
    if (element) {
      const nextElements = excalidrawAPI.getSceneElements().map(el => {
        if (el.id === element.id) {
          return {
            ...el,
            roundness: sharpness === "round" ? { type: 2 } : null,
            version: el.version + 1,
            versionNonce: Math.floor(Math.random() * 1000000)
          };
        }
        return el;
      });
      excalidrawAPI.updateScene({ elements: nextElements });
      setModifierUpdateNonce(n => n + 1);
    } else {
      setGlobalRoundness(sharpness === "round");
    }
  };

  const getElementRenderedCanvasTracks = (element) => {
    if (element.customData?.outlinerHidden) return [];
    const sourcePaths = getElementCorePaths(element);
    const modifiers = element.customData?.modifiers || [];
    const data = normalizeIannixData(element.customData?.iannix);
    const authoredOpacity = data.cursor.sourceOpacity ?? element.opacity ?? 100;
    const renderedOpacity = element.customData?.hideOriginal && modifiers.length > 0
      ? (element.customData.savedOpacity ?? authoredOpacity)
      : authoredOpacity;
    const styleTrack = points => ({
      points,
      smooth: !!element.roundness && points.length >= 3,
      strokeColor: isRuntimeCursor(element)
        ? (data.cursor.sourceStrokeColor || element.customData?.roleThemeSourceStrokeColor || "#ff3b0a")
        : element.strokeColor,
      strokeWidth: element.strokeWidth,
      opacity: renderedOpacity / 100,
    });

    const liveLinearEditPoints = linearEditPointsRef.current[element.id];
    const originalPoints = liveLinearEditPoints || (hasCubicBezierGeometry(element) ? sourcePaths[0] : element.customData?.originalPoints);
    if (element.customData?.muteModifiers || modifiers.length === 0 || !isDrawableTrack(originalPoints)) {
      return composeRuntimeCursorTracks({
        sourcePaths,
        evaluatedTracks: [],
        hasAccumulated: false,
        hideOriginal: false,
        muteModifiers: true,
      }).map(styleTrack);
    }

    const globals = getElementBrushGlobals(element);
    const evaluation = evaluateModifierStack(originalPoints, modifiers, globals);
    const lastWidth = element.customData?.lastWidth || element.width;
    const lastHeight = element.customData?.lastHeight || element.height;
    const scaleSignX = liveLinearEditPoints ? 1 : inferAxisFlipSign(originalPoints, element.points, 0);
    const scaleSignY = liveLinearEditPoints ? 1 : inferAxisFlipSign(originalPoints, element.points, 1);
    let scaleX = scaleSignX;
    let scaleY = scaleSignY;
    if (!liveLinearEditPoints && lastWidth > 0.1 && Math.abs(element.width - lastWidth) > 0.1) {
      scaleX = scaleSignX * (element.width / lastWidth);
    }
    if (!liveLinearEditPoints && lastHeight > 0.1 && Math.abs(element.height - lastHeight) > 0.1) {
      scaleY = scaleSignY * (element.height / lastHeight);
    }

    const relPoints = element.points || [];
    const minXRel = relPoints.length > 0 ? Math.min(...relPoints.map(point => point[0])) : 0;
    const minYRel = relPoints.length > 0 ? Math.min(...relPoints.map(point => point[1])) : 0;
    const maxXRel = relPoints.length > 0 ? Math.max(...relPoints.map(point => point[0])) : 0;
    const maxYRel = relPoints.length > 0 ? Math.max(...relPoints.map(point => point[1])) : 0;
    const centerX = element.x + (minXRel + maxXRel) / 2;
    const centerY = element.y + (minYRel + maxYRel) / 2;
    const firstPoint = relPoints[0] || [0, 0];
    const angle = element.angle || 0;
    const mapEvaluatedTrack = linePoints => {
      // Canonical Bézier paths enter the modifier engine in world space, so
      // modifier output is already world-space too. Mapping it through the
      // legacy freehand/line anchoring path double-translates the result.
      if (hasCubicBezierGeometry(element)) {
        return linePoints.map(point => [point[0], point[1]]);
      }
      return linePoints.map(point => {
      const [mappedX, mappedY] = mapTrackPointToElement({
        point,
        elementType: element.type,
        elementX: element.x,
        elementY: element.y,
        elementFirstPoint: firstPoint,
        evaluatedBaseline: evaluation.primaryPoints,
        scaleX,
        scaleY,
      });
      return angle === 0
        ? [mappedX, mappedY]
        : rotatePoint(mappedX, mappedY, centerX, centerY, angle);
      });
    };
    const evaluatedTracks = (evaluation.hasAccumulated
      ? evaluation.allLines
      : [evaluation.primaryPoints]
    ).filter(isDrawableTrack).map(mapEvaluatedTrack);

    return composeRuntimeCursorTracks({
      sourcePaths,
      evaluatedTracks,
      hasAccumulated: evaluation.hasAccumulated,
      hideOriginal: Boolean(element.customData?.hideOriginal),
      muteModifiers: false,
    }).map(styleTrack);
  };

  const handleBakeModifiers = (parentElement) => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    
    let originalPoints = parentElement.customData?.originalPoints;
    if (!originalPoints || originalPoints.length === 0) return;
    
    const pointsForStack = originalPoints;

    const globals = getElementBrushGlobals(parentElement);
    const evaluation = evaluateModifierStack(pointsForStack, parentElement.customData.modifiers, globals);
    const { parentTrack, childTracks } = resolveBakedTracks(evaluation);
    if (!parentTrack) return;

    // A brush preview is composed of the source Excalidraw element plus every
    // generated track. Preserve that exact layer model when baking instead of
    // replacing the source freedraw with the generated primary line.
    const isBrushBake = evaluation.hasAccumulated;
    const updatedParent = isBrushBake
      ? {
          ...parentElement,
          version: parentElement.version + 1,
          versionNonce: Math.floor(Math.random() * 1000000),
          updated: Date.now()
        }
      : updateElementGeometry(parentElement, parentTrack);
    updatedParent.customData = {
      ...(parentElement.customData || {}),
      originalPoints: null,
      modifiers: [],
      hideOriginal: false,
      version: (parentElement.customData?.version || 0) + 1,
      excalidrawVersion: updatedParent.version,
      lastWidth: updatedParent.width,
      lastHeight: updatedParent.height
    };
    processedModifierVersionsRef.current[parentElement.id] = updatedParent.customData.version;
    
    if (parentElement.customData?.hideOriginal) {
      updatedParent.opacity = isBrushBake
        ? 0
        : (parentElement.customData.savedOpacity ?? 100);
    }
    
    const groupId = `${parentElement.id}-baked-group`;
    const tracksToBake = isBrushBake
      ? evaluation.allLines.filter(isDrawableTrack)
      : childTracks;
    const childElements = createBakedTrackElements(parentElement, updatedParent, tracksToBake, groupId);
    if (childElements.length > 0) {
      updatedParent.groupIds = [...new Set([...(parentElement.groupIds || []), groupId])];
    }

    const nextElements = elements.map(el => {
      if (el.id === parentElement.id) {
        return updatedParent;
      }
      return el;
    }).concat(childElements);

    const selectedElementIds = Object.fromEntries(
      [updatedParent, ...childElements].map(el => [el.id, true])
    );
    excalidrawAPI.updateScene({
      elements: nextElements,
      appState: { selectedElementIds },
      commitToHistory: true
    });
    setModifierUpdateNonce(n => n + 1);
  };

  const renderGlobalModifiersOverlay = () => {
    if (!excalidrawAPI) return null;
    const elements = excalidrawAPI.getSceneElements();
    
    const modifierElements = elements.filter(el => el.customData?.modifiers && !el.customData?.outlinerHidden && !el.isDeleted);
    if (modifierElements.length === 0) return null;

    const paths = [];
    const debugTexts = [];
 
    modifierElements.forEach(parentEl => {
      if (parentEl.customData?.muteModifiers) return;
      if (isRuntimeCursor(parentEl)) return;
 
      const liveLinearEditPoints = linearEditPointsRef.current[parentEl.id];
      const originalPoints = liveLinearEditPoints || (hasCubicBezierGeometry(parentEl) ? getElementCorePaths(parentEl)[0] : parentEl.customData?.originalPoints);
      if (!originalPoints || originalPoints.length === 0) return;
 
      const pointsForStack = originalPoints;
 
      const globals = getElementBrushGlobals(parentEl);
      const { primaryPoints, allLines, hasAccumulated } = evaluateModifierStack(pointsForStack, parentEl.customData.modifiers, globals);
      
      if (allLines.length > 0) {
        const lastWidth = parentEl.customData?.lastWidth || parentEl.width;
        const lastHeight = parentEl.customData?.lastHeight || parentEl.height;

        const scaleSignX = liveLinearEditPoints ? 1 : inferAxisFlipSign(originalPoints, parentEl.points, 0);
        const scaleSignY = liveLinearEditPoints ? 1 : inferAxisFlipSign(originalPoints, parentEl.points, 1);

        let scaleX = scaleSignX;
        let scaleY = scaleSignY;
        if (!liveLinearEditPoints && lastWidth > 0.1 && Math.abs(parentEl.width - lastWidth) > 0.1) {
          scaleX = scaleSignX * (parentEl.width / lastWidth);
        }
        if (!liveLinearEditPoints && lastHeight > 0.1 && Math.abs(parentEl.height - lastHeight) > 0.1) {
          scaleY = scaleSignY * (parentEl.height / lastHeight);
        }

        if (showDebugLayer) {
          const debugStr = `W:${parentEl.width.toFixed(1)} LW:${lastWidth.toFixed(1)} SX:${scaleX.toFixed(2)}`;
          const screenPos = mapCanvasToScreen(parentEl.x, parentEl.y - 15);
          debugTexts.push({ x: screenPos[0], y: screenPos[1], text: debugStr });
        }
 
        const relPoints = parentEl.points || [];
        const minXRel = relPoints.length > 0 ? Math.min(...relPoints.map(p => p[0])) : 0;
        const minYRel = relPoints.length > 0 ? Math.min(...relPoints.map(p => p[1])) : 0;
        const maxXRel = relPoints.length > 0 ? Math.max(...relPoints.map(p => p[0])) : 0;
        const maxYRel = relPoints.length > 0 ? Math.max(...relPoints.map(p => p[1])) : 0;
 
        const cx = parentEl.x + (minXRel + maxXRel) / 2;
        const cy = parentEl.y + (minYRel + maxYRel) / 2;
        const angle = parentEl.angle || 0;
 
        const startIdx = hasAccumulated ? 0 : 1;
        const firstPtRel = relPoints[0] || [0, 0];

        for (let idx = startIdx; idx < allLines.length; idx++) {
          const linePoints = allLines[idx];
          const screenPoints = linePoints.map(p => {
            const [tx, ty] = mapTrackPointToElement({
              point: p,
              elementType: parentEl.type,
              elementX: parentEl.x,
              elementY: parentEl.y,
              elementFirstPoint: firstPtRel,
              evaluatedBaseline: primaryPoints,
              scaleX,
              scaleY
            });
 
            let rx = tx;
            let ry = ty;
            if (angle !== 0) {
              const rotated = rotatePoint(tx, ty, cx, cy, angle);
              rx = rotated[0];
              ry = rotated[1];
            }
            return mapCanvasToScreen(rx, ry);
          });
 
          paths.push({
            points: screenPoints,
            smooth: !!parentEl.roundness && screenPoints.length >= 3,
            strokeColor: parentEl.strokeColor,
            strokeWidth: parentEl.strokeWidth,
            opacity: parentEl.customData?.hideOriginal 
              ? (parentEl.customData.savedOpacity ?? 100) / 100
              : parentEl.opacity / 100
          });
        }
      }
    });
 
    if (paths.length === 0 && debugTexts.length === 0) return null;
 
    return (
      <svg 
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 1
        }}
      >
        {paths.map((p, idx) => {
          const pointsString = p.points.map(([x, y]) => `${x},${y}`).join(" ");
          const sharedProps = {
            fill: "none",
            stroke: p.strokeColor,
            strokeWidth: p.strokeWidth * (excalidrawAPI.getAppState().zoom.value || 1),
            strokeLinecap: "round",
            strokeLinejoin: "round",
            opacity: p.opacity,
            style: theme === "dark" ? { filter: "invert(93%) hue-rotate(180deg)" } : undefined
          };
          if (p.smooth) {
            return (
              <path
                key={idx}
                d={pointsToSmoothSvgPath(p.points)}
                {...sharedProps}
              />
            );
          }
          return (
            <polyline
              key={idx}
              points={pointsString}
              {...sharedProps}
            />
          );
        })}
        {debugTexts.map((dt, idx) => (
          <text
            key={`debug-${idx}`}
            x={dt.x}
            y={dt.y}
            fill="#ff00ff"
            fontSize="14"
            fontFamily="monospace"
            fontWeight="bold"
            textAnchor="middle"
          >
            {dt.text}
          </text>
        ))}
      </svg>
    );
  };

  const renderBezierEditorOverlay = () => {
    const element = getBezierEditElement();
    if (!element) return null;
    const controls = getBezierWorldAnchors(element).map(control => ({
      ...control,
      anchor: mapCanvasToScreen(control.anchor[0], control.anchor[1]),
      in: control.in ? mapCanvasToScreen(control.in[0], control.in[1]) : null,
      out: control.out ? mapCanvasToScreen(control.out[0], control.out[1]) : null,
    }));
    return (
      <svg className="drawerator-bezier-editor-overlay" aria-label="Bézier path editor">
        {controls.map((control, index) => (
          <g key={`${element.id}-bezier-control-${index}`} className={bezierSelectedAnchor === index ? "selected" : ""}>
            {control.in && <line x1={control.anchor[0]} y1={control.anchor[1]} x2={control.in[0]} y2={control.in[1]} className="bezier-handle-line" />}
            {control.out && <line x1={control.anchor[0]} y1={control.anchor[1]} x2={control.out[0]} y2={control.out[1]} className="bezier-handle-line" />}
            {control.in && <circle cx={control.in[0]} cy={control.in[1]} r="4.5" className="bezier-handle-point" />}
            {control.out && <circle cx={control.out[0]} cy={control.out[1]} r="4.5" className="bezier-handle-point" />}
            <circle cx={control.anchor[0]} cy={control.anchor[1]} r="6" className="bezier-anchor-point" />
          </g>
        ))}
      </svg>
    );
  };

  const renderIannixOverlay = () => {
    if (!excalidrawAPI) return null;
    const elements = excalidrawAPI.getSceneElements();
    const scoreObjects = elements.filter(element =>
      !element.isDeleted && ["curve", "cursor", "trigger"].includes(element.customData?.iannix?.role)
    );
    if (scoreObjects.length === 0) return null;

    const frame = evaluateScoreFrame(elements, scoreTime, undefined, { detectCollisions: false });
    const zoom = excalidrawAPI.getAppState().zoom.value || 1;
    const now = Date.now();
    const roleColors = { curve: "#7c9cff", cursor: "#19c3ff", trigger: "#ff8a3d" };
    const visualTransforms = new Map();
    const nextVisualStates = new Map();
    for (const cursor of frame.cursors) {
      const previous = visualCursorTransformsRef.current.get(cursor.element.id);
      const deltaSeconds = previous ? Math.max(0, (now - previous.timestamp) / 1000) : 0;
      const discontinuity = !scorePlaying || !previous ||
        Math.abs(previous.progress - cursor.timeState.progress) > 0.35;
      const transform = discontinuity
        ? cursor.transform
        : dampCursorTransform(
          previous.transform,
          cursor.transform,
          cursor.data.cursor.visualSmoothing,
          deltaSeconds,
        );
      visualTransforms.set(cursor.element.id, transform);
      nextVisualStates.set(cursor.element.id, {
        transform,
        progress: cursor.timeState.progress,
        timestamp: now,
      });
    }
    visualCursorTransformsRef.current = nextVisualStates;

    return (
      <svg className="iannix-runtime-overlay" aria-hidden="true">
        {frame.cursors.flatMap(cursor => getElementRenderedCanvasTracks(cursor.element).map((track, pathIndex) => {
          const visualTransform = visualTransforms.get(cursor.element.id) || cursor.transform;
          const path = transformPaths([track.points], visualTransform)[0];
          const screenPath = path.map(point => mapCanvasToScreen(point[0], point[1]));
          const sharedProps = {
            fill: "none",
            stroke: track.strokeColor || "#ffffff",
            strokeWidth: Math.max(1, track.strokeWidth || 2) * zoom,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            opacity: track.opacity,
            style: theme === "dark" ? { filter: "invert(93%) hue-rotate(180deg)" } : undefined,
          };
          const selected = Boolean(selectedElementIds[cursor.element.id]);
          const geometry = track.smooth
            ? { element: "path", props: { d: pointsToSmoothSvgPath(screenPath) } }
            : { element: "polyline", props: { points: screenPath.map(point => `${point[0]},${point[1]}`).join(" ") } };
          const Geometry = geometry.element;
          return (
            <g key={`${cursor.element.id}-${pathIndex}`}>
              {selected && <Geometry {...geometry.props} {...sharedProps} stroke="var(--drawerator-accent)" strokeWidth={sharedProps.strokeWidth + 6} opacity="0.55" style={undefined} />}
              <Geometry {...geometry.props} {...sharedProps} />
            </g>
          );
        }))}

        {scoreObjects.filter(element => element.customData.iannix.role === "trigger").map(element => {
          const pulseUntil = triggerPulseUntilRef.current.get(element.id) || 0;
          if (pulseUntil <= now) return null;
          return getElementCorePaths(element).map((path, index) => {
            const points = path
              .map(point => mapCanvasToScreen(point[0], point[1]))
              .map(point => `${point[0]},${point[1]}`)
              .join(" ");
            return (
              <polyline
                key={`${element.id}-pulse-${index}`}
                points={points}
                fill="none"
                stroke={roleTheme.enabled ? colorWithOpacity(roleTheme.triggerPulse.color, roleTheme.triggerPulse.opacity) : "#ff8a3d"}
                strokeWidth={Math.max(5, (element.strokeWidth || 2) * 3) * zoom}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={roleTheme.enabled ? 1 : 0.85}
              />
            );
          });
        })}

        {showIannixLabels && scoreObjects.map(element => {
          const data = normalizeIannixData(element.customData.iannix);
          let center = getElementCenter(element);
          if (data.role === "cursor") {
            const runtimeCursor = frame.cursors.find(cursor => cursor.element.id === element.id);
            if (runtimeCursor) {
              center = (visualTransforms.get(element.id) || runtimeCursor.transform).position;
            }
          }
          const [x, y] = mapCanvasToScreen(center[0], center[1]);
          return (
            <g key={`${element.id}-role`} transform={`translate(${x + 9} ${y - 9})`}>
              <rect x="0" y="-14" width={Math.max(44, (data.label || data.role).length * 6.5 + 14)} height="18" rx="5" fill="rgba(20, 22, 28, 0.86)" stroke={roleColors[data.role]} />
              <text x="7" y="-2" fill={roleColors[data.role]} fontSize="10" fontWeight="700" fontFamily="system-ui, sans-serif">
                {(data.label || data.role).toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  const renderIannixTransport = () => {
    if (!excalidrawAPI) return null;
    const scoreObjects = excalidrawAPI.getSceneElements().filter(element =>
      !element.isDeleted && ["curve", "cursor", "trigger"].includes(element.customData?.iannix?.role)
    );
    const scoreEnd = Math.max(
      transportLoopEnd,
      10,
      scoreTime + 1,
      historySnapshot.duration,
      ...scoreObjects.map(element => {
        const timing = normalizeIannixData(element.customData?.iannix).time;
        return timing.start + timing.duration / Math.max(0.001, timing.rate || 1);
      }),
    );
    const commitTransportSeek = seconds => commandRegistry.execute("transport.seek", { seconds }, {
      source: "transport",
      transportTime: scoreTimeRef.current,
    }).catch(error => console.error("Could not seek transport", error));
    const rewind = () => {
      setScorePlaying(false);
      commitTransportSeek(transportLoopEnabled ? transportLoopStart : 0);
    };
    const timelineOptions = { fps: transportFps, tempo: scoreTempo, signature: scoreTimeSignature };
    const displayValue = formatTimelinePosition(scoreTime, transportDisplayMode, timelineOptions);
    const currentFrame = secondsToFrame(scoreTime, transportFps);
    const tapTempo = () => {
      if (midiClockMode === "receive") return;
      const now = performance.now();
      const recentTaps = tapTempoTimesRef.current.filter(timestamp => now - timestamp < 2000);
      recentTaps.push(now);
      tapTempoTimesRef.current = recentTaps.slice(-6);
      if (tapTempoTimesRef.current.length < 2) return;
      const intervals = tapTempoTimesRef.current.slice(1).map((timestamp, index) => timestamp - tapTempoTimesRef.current[index]);
      const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      setScoreTempo(Math.min(400, Math.max(20, Number((60000 / averageInterval).toFixed(2)))));
    };
    const updateTempoDraft = event => {
      const nextValue = event.target.value;
      setScoreTempoDraft(nextValue);
      if (nextValue.trim() === "") return;
      const nextTempo = Number(nextValue);
      if (Number.isFinite(nextTempo) && nextTempo >= 20 && nextTempo <= 400) setScoreTempo(nextTempo);
    };
    const commitTempoDraft = () => {
      if (scoreTempoDraft.trim() === "") {
        setScoreTempoDraft(String(scoreTempo));
        return;
      }
      const parsedTempo = Number(scoreTempoDraft);
      const nextTempo = Number.isFinite(parsedTempo) ? Math.min(400, Math.max(20, parsedTempo)) : scoreTempo;
      setScoreTempo(nextTempo);
      setScoreTempoDraft(String(nextTempo));
    };
    const commitLoopBoundary = (event, boundary) => {
      const parsed = parseTimelinePosition(event.currentTarget.value, transportDisplayMode, timelineOptions);
      const minimumSpan = 1 / transportFps;
      if (boundary === "start") {
        setTransportLoopStart(Math.max(0, Math.min(parsed, transportLoopEnd - minimumSpan)));
      } else {
        setTransportLoopEnd(Math.max(transportLoopStart + minimumSpan, parsed));
      }
      setTransportLoopEnabled(true);
    };
    return (
      <div
        className={`iannix-transport theme-${theme}`}
        role="region"
        aria-label="Timeline"
      >
        <select className="iannix-transport-mode" aria-label="Transport display" value={transportDisplayMode} onChange={event => setTransportDisplayMode(event.target.value)}>
          <option value="frame">Frame</option>
          <option value="timecode">Timecode</option>
          <option value="beats">Beats</option>
        </select>

        <div className="iannix-transport-display" aria-label={transportDisplayMode === "beats" ? "Bars beats sixteenths" : transportDisplayMode === "frame" ? "Frame" : "Timecode"}>
          <strong>{displayValue}</strong>
          <span>{transportDisplayMode === "beats" ? `${scoreTimeSignature.numerator}/${scoreTimeSignature.denominator}` : `${transportFps} FPS`}</span>
        </div>

        <div className="iannix-transport-frame" aria-label={`Current frame ${currentFrame}`}>
          <strong>{currentFrame}</strong>
        </div>

        <div className="iannix-transport-controls">
          <button type="button" onClick={rewind} title="Stop and rewind" aria-label="Stop and rewind">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11 6v12l-8.5-6L11 6Zm10 0v12l-8.5-6L21 6Z" /></svg>
          </button>
          <button type="button" className={scorePlaying ? "active" : ""} onClick={() => void toggleScorePlayback()} title={scorePlaying ? "Pause" : "Play"} aria-label={scorePlaying ? "Pause score" : "Play score"}>
            {scorePlaying ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6V5Zm8 0h4v14h-4V5Z" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="m7 4 13 8L7 20V4Z" /></svg>}
          </button>
          <button type="button" onClick={() => setScorePlaying(false)} title="Stop" aria-label="Stop score">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5h14v14H5z" /></svg>
          </button>
          <button
            type="button"
            className={autoKeyEnabled ? "active autokey" : "autokey"}
            onClick={() => commandRegistry.execute("automation.autokey.toggle", {}, { source: "transport", transportTime: scoreTimeRef.current })}
            title="Auto-key object changes"
            aria-label="Toggle auto-key"
            aria-pressed={autoKeyEnabled}
          >
            <span className="transport-autokey-diamond" />
          </button>
        </div>

        <div className="iannix-transport-tempo">
          <button type="button" onClick={tapTempo} disabled={midiClockMode === "receive" && followMidiClockTempo} title="Tap repeatedly to set tempo">BPM</button>
          <input type="number" min="20" max="400" step="1" data-default="120" value={scoreTempoDraft} disabled={midiClockMode === "receive" && followMidiClockTempo} onChange={updateTempoDraft} onBlur={commitTempoDraft} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label="Tempo in BPM" />
        </div>

        <div className="iannix-transport-signature" aria-label="Time signature">
          <input aria-label="Time signature numerator" type="number" min="1" max="32" step="1" data-default="4" value={scoreTimeSignature.numerator} onChange={event => setScoreTimeSignature(normalizeTimeSignature({ ...scoreTimeSignature, numerator: event.target.value }))} />
          <span>/</span>
          <select aria-label="Time signature denominator" value={scoreTimeSignature.denominator} onChange={event => setScoreTimeSignature(normalizeTimeSignature({ ...scoreTimeSignature, denominator: event.target.value }))}>
            {[1, 2, 4, 8, 16].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>

        <select className="iannix-transport-sync" aria-label="Clock synchronization" value={midiClockMode} onChange={event => setMidiClockMode(event.target.value)}>
          <option value="internal">INT</option>
          <option value="send">MIDI OUT</option>
          <option value="receive">MIDI IN</option>
        </select>

        <button type="button" className={transportLoopEnabled ? "active loop" : "loop"} onClick={() => setTransportLoopEnabled(enabled => !enabled)} title="Toggle loop" aria-label="Toggle loop" aria-pressed={transportLoopEnabled}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>
        </button>

        <div className="iannix-transport-range">
          <input key={`start-${transportDisplayMode}-${transportLoopStart}`} aria-label={`Loop start in ${transportDisplayMode}`} type={transportDisplayMode === "frame" ? "number" : "text"} min={transportDisplayMode === "frame" ? 0 : undefined} step={transportDisplayMode === "frame" ? 1 : undefined} data-default={transportDisplayMode === "frame" ? 0 : undefined} defaultValue={formatTimelinePosition(transportLoopStart, transportDisplayMode, timelineOptions)} onBlur={event => commitLoopBoundary(event, "start")} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
          <span>–</span>
          <input key={`end-${transportDisplayMode}-${transportLoopEnd}`} aria-label={`Loop end in ${transportDisplayMode}`} type={transportDisplayMode === "frame" ? "number" : "text"} min={transportDisplayMode === "frame" ? 1 : undefined} step={transportDisplayMode === "frame" ? 1 : undefined} data-default={transportDisplayMode === "frame" ? Math.round(scoreEnd * transportFps) : undefined} defaultValue={formatTimelinePosition(transportLoopEnd, transportDisplayMode, timelineOptions)} onBlur={event => commitLoopBoundary(event, "end")} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        </div>

        <TransportTimeline
          duration={scoreEnd}
          currentTime={scoreTime}
          displayMode={transportDisplayMode}
          fps={transportFps}
          tempo={scoreTempo}
          signature={scoreTimeSignature}
          loopEnabled={transportLoopEnabled}
          loopStart={transportLoopStart}
          loopEnd={transportLoopEnd}
          onSeek={setScoreTime}
          onSeekCommit={commitTransportSeek}
          onLoopEnabledChange={setTransportLoopEnabled}
          onLoopChange={updateTransportLoop}
          automationKeys={collectAutomationKeys(excalidrawAPI.getSceneElements())}
        />
      </div>
    );
  };
  const updateGlobalGridSetting = patch => {
    commandRegistry.execute("grid.global.update", { patch }, {
      source: "settings",
      transportTime: scoreTimeRef.current,
    }).catch(error => setSceneExchangeStatus(error.message || "Could not update the global grid."));
  };
  const resetGlobalGridSetting = () => {
    commandRegistry.execute("grid.global.reset", {}, {
      source: "settings",
      transportTime: scoreTimeRef.current,
    }).catch(error => setSceneExchangeStatus(error.message || "Could not reset the global grid."));
  };
  const renderSettingsContent = () => {
    const boardState = excalidrawAPI?.getAppState() || {};
    const settingTabs = [
      { id: "ai", label: "AI" },
      { id: "preferences", label: "Board" },
      { id: "shortcuts", label: "Shortcuts" },
      { id: "score", label: "Score & MIDI" },
    ];
    return (
      <div className="settings-panel-content">
        <div className="settings-panel-tabs" role="tablist" aria-label="Settings sections">
          {settingTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeSettingsTab === tab.id}
              className={activeSettingsTab === tab.id ? "active" : ""}
              onClick={() => setActiveSettingsTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeSettingsTab === "ai" && (
          <div className="settings-panel-section">
            <InspectorSection title="Connection" className="settings-inspector-section">
            <label className="settings-panel-field">
              <span>API provider</span>
              <select
                value={aiSettings.provider}
                onChange={event => {
                  const provider = event.target.value;
                  const url = provider === "lmstudio"
                    ? "http://localhost:1234"
                    : provider === "openai" ? "https://api.openai.com" : "http://localhost:11434";
                  const updated = { ...aiSettings, provider, url, model: "" };
                  setAiSettings(updated);
                  testAIConnection(updated);
                }}
              >
                <option value="ollama">Ollama</option>
                <option value="lmstudio">LM Studio</option>
                <option value="openai">OpenAI Compatible</option>
              </select>
            </label>
            <label className="settings-panel-field">
              <span>API endpoint URL</span>
              <input type="text" value={aiSettings.url} onChange={event => setAiSettings({ ...aiSettings, url: event.target.value })} />
            </label>
            <label className="settings-panel-field">
              <span>Active model</span>
              {aiSettings.provider !== "openai" && modelsList.length > 0 ? (
                <select value={aiSettings.model} onChange={event => setAiSettings({ ...aiSettings, model: event.target.value })}>
                  {modelsList.map(model => <option key={model} value={model}>{model}</option>)}
                </select>
              ) : (
                <input type="text" value={aiSettings.model} onChange={event => setAiSettings({ ...aiSettings, model: event.target.value })} placeholder="Model name" />
              )}
            </label>
            <div className="settings-panel-actions">
              <span className={`settings-panel-status ${connectionStatus}`}>
                {connectionStatus === "ok" ? "Backend reachable" : connectionStatus === "error" ? "Connection failed" : "Checking…"}
              </span>
              <button type="button" className="iannix-flat-button" onClick={saveSettings}>Save &amp; test</button>
            </div>
            </InspectorSection>
          </div>
        )}

        {activeSettingsTab === "preferences" && (
          <div className="settings-panel-section">
            <InspectorSection title="Appearance" className="settings-inspector-section">
            <label className="settings-panel-field">
              <span>Accent color</span>
              <div className="settings-color-control">
                <input type="color" value={accentColor} onChange={event => { setAccentColor(event.target.value); localStorage.setItem("drawerator_accent_color", event.target.value); }} aria-label="Accent color" />
                <input key={accentColor} type="text" defaultValue={accentColor} onBlur={event => { if (/^#[0-9a-f]{6}$/i.test(event.currentTarget.value)) { setAccentColor(event.currentTarget.value); localStorage.setItem("drawerator_accent_color", event.currentTarget.value); } else event.currentTarget.value = accentColor; }} aria-label="Accent hex color" />
                <input type="number" min="0" max="100" step="1" data-default="100" value={accentOpacity} onChange={event => { const value = Number(event.target.value); setAccentOpacity(value); localStorage.setItem("drawerator_accent_opacity", String(value)); }} aria-label="Accent opacity" />
                <output>%</output>
              </div>
            </label>
            <label className="settings-panel-field">
              <span>Hover highlight</span>
              <div className="settings-color-control">
                <input type="color" value={highlightColor} onChange={event => { setHighlightColor(event.target.value); localStorage.setItem("drawerator_highlight_color", event.target.value); }} aria-label="Hover highlight color" />
                <input key={highlightColor} type="text" defaultValue={highlightColor} onBlur={event => { if (/^#[0-9a-f]{6}$/i.test(event.currentTarget.value)) { setHighlightColor(event.currentTarget.value); localStorage.setItem("drawerator_highlight_color", event.currentTarget.value); } else event.currentTarget.value = highlightColor; }} aria-label="Hover highlight hex color" />
                <input type="number" min="0" max="100" step="1" data-default="100" value={highlightOpacity} onChange={event => { const value = Number(event.target.value); setHighlightOpacity(value); localStorage.setItem("drawerator_highlight_opacity", String(value)); }} aria-label="Hover highlight opacity" />
                <output>%</output>
              </div>
            </label>
            <details className="settings-role-theme">
              <summary>Score object theme</summary>
              <div className="settings-role-theme-body">
                <label className="settings-panel-check">
                  <span>Override role colors</span>
                  <input type="checkbox" checked={roleTheme.enabled} onChange={event => setRoleTheme(previous => ({ ...previous, enabled: event.target.checked }))} />
                </label>
                {[
                  ["curveActive", "Curve enabled"], ["curveInactive", "Curve disabled"],
                  ["cursorActive", "Cursor enabled"], ["cursorInactive", "Cursor disabled"],
                  ["triggerActive", "Trigger enabled"], ["triggerInactive", "Trigger disabled"],
                  ["triggerPulse", "Trigger pulse"],
                ].map(([key, label]) => {
                  const entry = roleTheme[key];
                  return (
                    <label className="settings-panel-field" key={key}>
                      <span>{label}</span>
                      <div className="settings-color-control">
                        <input type="color" value={entry.color} onChange={event => setRoleTheme(previous => ({ ...previous, [key]: { ...previous[key], color: event.target.value } }))} aria-label={`${label} color`} />
                        <input key={entry.color} type="text" defaultValue={entry.color} onBlur={event => {
                          if (/^#[0-9a-f]{6}$/i.test(event.currentTarget.value)) setRoleTheme(previous => ({ ...previous, [key]: { ...previous[key], color: event.currentTarget.value } }));
                          else event.currentTarget.value = entry.color;
                        }} aria-label={`${label} hex color`} />
                        <input type="number" min="0" max="100" step="1" data-default={DEFAULT_ROLE_THEME[key].opacity} value={entry.opacity} onChange={event => setRoleTheme(previous => ({ ...previous, [key]: { ...previous[key], opacity: Number(event.target.value) } }))} aria-label={`${label} opacity`} />
                        <output>%</output>
                      </div>
                    </label>
                  );
                })}
                <button type="button" className="iannix-flat-button" onClick={() => setRoleTheme(previous => ({ ...DEFAULT_ROLE_THEME, enabled: previous.enabled }))}>Reset to IanniX-compatible palette</button>
                <div className="settings-panel-hint">Enabled/disabled follows the object's score switch. Trigger pulse is the temporary collision highlight. Original object colors restore when the override is disabled.</div>
              </div>
            </details>
            </InspectorSection>
            <InspectorSection title="Interface" className="settings-inspector-section">
            {[
              ["Force desktop layout", forceDesktopLayout, value => { setForceDesktopLayout(value); localStorage.setItem("drawerator_force_desktop_layout", value); }],
              ["Show toolbar hints", showToolbarHints, value => { setShowToolbarHints(value); localStorage.setItem("drawerator_show_toolbar_hints", value); }],
              ["Show bottom alerts", showBottomNotifications, value => { setShowBottomNotifications(value); localStorage.setItem("drawerator_show_bottom_notifications", value); }],
              ["Show modifier debug coordinates", showDebugLayer, setShowDebugLayer],
            ].map(([label, checked, update]) => (
              <label className="settings-panel-check" key={label}>
                <span>{label}</span>
                <input type="checkbox" checked={checked} onChange={event => update(event.target.checked)} />
              </label>
            ))}
            <label className="settings-panel-field">
              <span>Default stabilizer damping</span>
              <input type="number" min="0.01" max="0.5" step="0.01" data-default="0.12" value={defaultStabilizerDamping} onChange={event => {
                const value = Number(event.target.value);
                setDefaultStabilizerDamping(value);
                localStorage.setItem("drawerator_default_stabilizer_damping", value);
              }} />
            </label>
            <div className="settings-panel-divider" />
            {[
              ["Zen mode", !!boardState.zenModeEnabled, "zenModeEnabled"],
              ["View mode", !!boardState.viewModeEnabled, "viewModeEnabled"],
            ].map(([label, checked, field]) => (
              <label className="settings-panel-check" key={field}>
                <span>{label}</span>
                <input type="checkbox" checked={checked} onChange={event => excalidrawAPI?.updateScene({ appState: { [field]: event.target.checked } })} />
              </label>
            ))}
            </InspectorSection>
          </div>
        )}

        {activeSettingsTab === "shortcuts" && (
          <ShortcutsPanel
            bindings={shortcutBindings}
            onChange={(actionId, binding) => setShortcutBindings(previous => ({ ...previous, [actionId]: binding }))}
            onReset={() => setShortcutBindings({ ...DEFAULT_SHORTCUTS })}
          />
        )}

        {activeSettingsTab === "score" && (
          <div className="settings-panel-section">
            <InspectorSection title="Transport" className="settings-inspector-section">
            <div className="settings-panel-two-column">
              <label className="settings-panel-field">
                <span>Tempo (BPM)</span>
                <input type="number" min="20" max="400" step="1" data-default="120" value={scoreTempo} onChange={event => {
                  const value = Math.min(400, Math.max(20, Number(event.target.value) || 120));
                  setScoreTempo(value);
                }} />
              </label>
              <label className="settings-panel-field">
                <span>Playback rate</span>
                <input type="number" min="0.05" max="8" step="0.05" data-default="1" value={scoreRate} onChange={event => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && value > 0) setScoreRate(value);
                }} />
              </label>
            </div>
            <div className="settings-panel-two-column">
              <label className="settings-panel-field">
                <span>Transport display</span>
                <select value={transportDisplayMode} onChange={event => setTransportDisplayMode(event.target.value)}>
                  <option value="frame">Frames</option>
                  <option value="timecode">Timecode</option>
                  <option value="beats">Bars · Beats · 16ths</option>
                </select>
              </label>
              <label className="settings-panel-field">
                <span>Timecode FPS</span>
                <select value={transportFps} onChange={event => setTransportFps(Number(event.target.value))}>
                  {[24, 25, 30, 50, 60].map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <div className="settings-panel-two-column">
              <label className="settings-panel-field">
                <span>Meter numerator</span>
                <input type="number" min="1" max="32" step="1" data-default="4" value={scoreTimeSignature.numerator} onChange={event => setScoreTimeSignature(normalizeTimeSignature({ ...scoreTimeSignature, numerator: event.target.value }))} />
              </label>
              <label className="settings-panel-field">
                <span>Meter denominator</span>
                <select value={scoreTimeSignature.denominator} onChange={event => setScoreTimeSignature(normalizeTimeSignature({ ...scoreTimeSignature, denominator: event.target.value }))}>
                  {[1, 2, 4, 8, 16].map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <label className="settings-panel-check">
              <span>Loop range</span>
              <input type="checkbox" checked={transportLoopEnabled} onChange={event => setTransportLoopEnabled(event.target.checked)} />
            </label>
            <div className="settings-panel-two-column">
              <label className="settings-panel-field"><span>Loop start ({transportDisplayMode})</span><input key={`settings-start-${transportDisplayMode}-${transportLoopStart}`} type="text" defaultValue={formatTimelinePosition(transportLoopStart, transportDisplayMode, { fps: transportFps, tempo: scoreTempo, signature: scoreTimeSignature })} onBlur={event => {
                const parsed = parseTimelinePosition(event.currentTarget.value, transportDisplayMode, { fps: transportFps, tempo: scoreTempo, signature: scoreTimeSignature });
                setTransportLoopStart(Math.max(0, Math.min(parsed, transportLoopEnd - 1 / transportFps)));
              }} /></label>
              <label className="settings-panel-field"><span>Loop end ({transportDisplayMode})</span><input key={`settings-end-${transportDisplayMode}-${transportLoopEnd}`} type="text" defaultValue={formatTimelinePosition(transportLoopEnd, transportDisplayMode, { fps: transportFps, tempo: scoreTempo, signature: scoreTimeSignature })} onBlur={event => {
                const parsed = parseTimelinePosition(event.currentTarget.value, transportDisplayMode, { fps: transportFps, tempo: scoreTempo, signature: scoreTimeSignature });
                setTransportLoopEnd(Math.max(transportLoopStart + 1 / transportFps, parsed));
              }} /></label>
            </div>
            <label className="settings-panel-check">
              <span>Show Timeline panel</span>
              <input type="checkbox" checked={showIannixTransport} onChange={event => setShowIannixTransport(event.target.checked)} />
            </label>
            <label className="settings-panel-check">
              <span>Show score-object labels</span>
              <input type="checkbox" checked={showIannixLabels} onChange={event => setShowIannixLabels(event.target.checked)} />
            </label>
            </InspectorSection>
            <InspectorSection title="MIDI & clock" className="settings-inspector-section">
            <label className="settings-panel-field">
              <span>Clock synchronization</span>
              <select value={midiClockMode} onChange={event => setMidiClockMode(event.target.value)}>
                <option value="internal">Internal</option>
                <option value="send">Send MIDI clock</option>
                <option value="receive">Receive MIDI clock</option>
              </select>
            </label>
            {midiClockMode === "receive" && (
              <>
                <label className="settings-panel-check">
                  <span>Follow MIDI transport</span>
                  <input type="checkbox" checked={followMidiTransport} onChange={event => setFollowMidiTransport(event.target.checked)} />
                </label>
                <label className="settings-panel-check">
                  <span>Estimate tempo from clock</span>
                  <input type="checkbox" checked={followMidiClockTempo} onChange={event => setFollowMidiClockTempo(event.target.checked)} />
                </label>
                <div className="settings-panel-hint">
                  MIDI Clock carries pulses, not a numeric BPM. Leave tempo estimation off to keep the BPM field fixed and match the sender manually.
                </div>
              </>
            )}
            <div className="settings-panel-midi-routing">
              <label className="settings-panel-field">
                <span>MIDI in</span>
                <select value={midiInputId} onChange={event => setMidiInputId(event.target.value)}>
                  <option value={MIDI_PORT_NONE}>None</option>
                  <option value={MIDI_PORT_ALL}>All</option>
                  {midiInputs.map(input => <option key={input.id} value={input.id}>{input.name}{input.manufacturer ? ` — ${input.manufacturer}` : ""}</option>)}
                </select>
              </label>
              <label className="settings-panel-field">
                <span>MIDI out</span>
                <select value={midiOutputId} onChange={event => void handleMidiOutputChange(event.target.value)}>
                  <option value={MIDI_PORT_NONE}>None</option>
                  <option value={MIDI_PORT_ALL}>All MIDI Outputs</option>
                  <option value={INTERNAL_MIDI_SYNTH_ID}>Internal GM Synth</option>
                  {midiOutputId && midiOutputId !== MIDI_PORT_ALL && midiOutputId !== INTERNAL_MIDI_SYNTH_ID && !midiOutputs.some(output => output.id === midiOutputId) && (
                    <option value={midiOutputId}>Unavailable output ({midiOutputId})</option>
                  )}
                  {midiOutputs.map(output => (
                    <option key={output.id} value={output.id}>{output.name}{output.manufacturer ? ` — ${output.manufacturer}` : ""}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="settings-panel-midi-refresh" title={midiAccess ? "Refresh MIDI access" : "Connect MIDI"} aria-label={midiAccess ? "Refresh MIDI access" : "Connect MIDI"} onClick={connectIannixMidi}>↻</button>
            </div>
            <label className="settings-panel-check settings-panel-midi-fallback">
              <span>Use Internal GM Synth if the selected external output disappears</span>
              <input type="checkbox" checked={midiFallbackEnabled} onChange={event => void handleMidiFallbackChange(event.target.checked)} />
            </label>
            <details className="settings-panel-gm-programs" open={internalProgramsExpanded} onToggle={event => setInternalProgramsExpanded(event.currentTarget.open)}>
              <summary>Internal GM programs</summary>
              <div className="settings-panel-gm-program-list">
                {Array.from({ length: 16 }, (_, index) => {
                  const channel = index + 1;
                  return (
                    <label key={channel} className={isPercussionChannel(channel) ? "settings-panel-gm-program percussion" : "settings-panel-gm-program"}>
                      <span>Ch {channel}</span>
                      {isPercussionChannel(channel) ? (
                        <strong>Percussion</strong>
                      ) : (
                        <select value={internalGmPrograms[channel]} onChange={event => handleInternalProgramChange(channel, Number(event.target.value))}>
                          {GM_PROGRAMS.map((name, program) => (
                            <option key={program} value={program}>{String(program + 1).padStart(3, "0")} {name}</option>
                          ))}
                        </select>
                      )}
                    </label>
                  );
                })}
              </div>
            </details>
            <div className="settings-panel-synth-status" role="status">
              <span>Internal synth: <strong>{internalSynthStatus}</strong></span>
              {(internalSynthStatus === "Audio suspended" || internalSynthStatus === "Error") && (
                <button type="button" className="iannix-flat-button" onClick={() => void ensureInternalSynth()}>Enable audio</button>
              )}
              <button type="button" className="iannix-flat-button" onClick={() => void testInternalSynthAudio()}>Test audio</button>
              <button type="button" className="iannix-flat-button" onClick={() => void testRawWebAudio()}>Test Web Audio</button>
              <button type="button" className="iannix-flat-button" onClick={() => void resetInternalSynth()}>Reset audio</button>
              <button type="button" className="iannix-flat-button" onClick={panicMidi}>Panic</button>
            </div>
            {internalSynthError && <div className="settings-panel-hint warning">{internalSynthError}</div>}
            <div className="settings-panel-hint">Channel 10 is percussion. Programs are saved locally and apply only to the embedded synth.</div>
            <label className="settings-panel-check" title="On: one voice per trigger for its duration. Off: each cursor can voice the same trigger independently, with a separate duration latch per cursor.">
              <span>Latch each trigger across cursors</span>
              <input type="checkbox" checked={latchTriggersAcrossCursors} onChange={event => {
                setLatchTriggersAcrossCursors(event.target.checked);
                activeScoreCollisionsRef.current = new Set();
                triggerCollisionLockoutsRef.current = new Map();
              }} />
            </label>
            <div className="settings-panel-status">{midiStatus}</div>
            <div className="settings-panel-status">{midiClockStatus}</div>
            <div className="settings-panel-divider" />
            <div className="settings-panel-actions">
              <span className="settings-panel-hint">{scoreTime.toFixed(2)}s · {(scoreTime * scoreTempo / 60).toFixed(2)} beats</span>
              <button type="button" className="iannix-flat-button" onClick={() => { setScorePlaying(false); setScoreTime(0); }}>Rewind</button>
            </div>
            </InspectorSection>
          </div>
        )}
      </div>
    );
  };

  const renderBrushConfigForm = () => {
    const activeBrush = brushPalette.find(b => b.id === activeBrushId) || {};
    const editingActiveModifier = editingModifierTarget?.brushId === activeBrushId;
    
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", height: "100%" }}>
        {/* Script selector */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-primary)", opacity: 0.8 }}>Brush Script</label>
          <select
              value={activeBrushId}
              onChange={(e) => {
                const val = e.target.value;
                setEditingModifierTarget(null);
                pendingBrushParamsRef.current = null;
                setSaveAsBrushName(null);
                setBrushSaveMessage("");
                setActiveBrushId(val);
            }}
            className="custom-brush-select"
          >
            {brushPalette.map((brush) => (
              <option key={brush.id} value={brush.id} style={{ background: "var(--island-bg-color)", color: "var(--color-primary)" }}>
                {brush.name} {brush.isPreset ? "" : "⭐"}
              </option>
            ))}
          </select>
        </div>

        {/* Script editor */}
        {activeBrushId !== "normal" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexGrow: 1, minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-primary)", opacity: 0.8 }}>
                JavaScript modifier code
              </span>
            </div>

            {/* Monospace Code Editor Textarea */}
            <textarea
              value={activeBrushCode}
              onChange={(e) => {
                setActiveBrushCode(e.target.value);
                setBrushSaveMessage("");
              }}
              onBlur={() => syncEditorDraftToModifier(true)}
              className="custom-brush-textarea"
              style={{
                fontFamily: "monospace",
                fontSize: "11px",
                padding: "8px",
                borderRadius: "6px",
                border: "1px solid var(--border-color)",
                background: "var(--input-bg-color, rgba(0, 0, 0, 0.05))",
                color: "var(--color-primary)",
                resize: "vertical",
                width: "100%",
                minHeight: "420px",
                flexGrow: 1,
                outline: "none"
              }}
              spellCheck="false"
            />

            {/* Action buttons row */}
            <div className="script-icon-toolbar">
              <button
                onClick={() => {
                  if (editingActiveModifier) {
                    if (syncEditorDraftToModifier(true)) {
                      setBrushSaveMessage("Modifier script updated.");
                    }
                    return;
                  }
                  saveBrushChanges();
                }}
                disabled={Boolean(activeBrush.isPreset && !editingActiveModifier)}
                className="palette-action-btn primary script-icon-button"
                aria-label="Save brush script"
                title={activeBrush.isPreset && !editingActiveModifier
                  ? "Built-in scripts are locked; use Save As to create an editable copy"
                  : editingActiveModifier
                    ? "Save this script to the modifier being edited"
                    : "Save changes to this custom brush script"}
              ><ScriptActionIcon type="save" /></button>
              <button
                onClick={() => {
                  const defaultName = activeBrush.name
                    ? `Copy of ${activeBrush.name.split(" (")[0]}`
                    : "My Custom Brush";
                  setSaveAsBrushName(defaultName);
                  setBrushSaveMessage("");
                }}
                className="palette-action-btn secondary script-icon-button"
                aria-label="Save brush script as a copy"
                title="Save this code as a new custom brush under a new name"
              ><ScriptActionIcon type="copy" /></button>
              <button
                onClick={createNewBrush}
                className="palette-action-btn secondary script-icon-button"
                aria-label="New brush script"
                title="Create a new editable brush script"
              ><ScriptActionIcon type="add" /></button>
              {!activeBrush.isPreset && (
                <button
                  onClick={deleteBrush}
                  className="palette-action-btn danger script-icon-button"
                  aria-label="Delete brush script"
                  title="Delete this custom brush"
                ><ScriptActionIcon type="remove" /></button>
              )}
            </div>

            {saveAsBrushName !== null && (
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  aria-label="New brush name"
                  value={saveAsBrushName}
                  onChange={(event) => setSaveAsBrushName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveBrushCopy();
                    if (event.key === "Escape") setSaveAsBrushName(null);
                  }}
                  autoFocus
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "6px 8px",
                    borderRadius: "5px",
                    border: "1px solid var(--border-color)",
                    background: "var(--input-bg-color, rgba(0, 0, 0, 0.05))",
                    color: "var(--color-primary)"
                  }}
                />
                <button
                  onClick={saveBrushCopy}
                  disabled={!saveAsBrushName.trim()}
                  className="palette-action-btn primary"
                >
                  Save copy
                </button>
                <button
                  onClick={() => setSaveAsBrushName(null)}
                  className="palette-action-btn secondary"
                >
                  Cancel
                </button>
              </div>
            )}

            {brushSaveMessage && (
              <div role="status" style={{ fontSize: "10px", color: "var(--color-primary)", opacity: 0.8 }}>
                {brushSaveMessage}
              </div>
            )}

            {/* Compilation banner */}
            {brushCompileError ? (
              <div className="custom-brush-status-error" style={{ marginTop: "2px" }}>
                <span>❌ Error compiling custom code:</span>
                <span style={{ fontSize: "10px", whiteSpace: "pre-wrap" }}>{brushCompileError}</span>
              </div>
            ) : (
              <div className="custom-brush-status-success" style={{ marginTop: "2px" }}>
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>Compiled successfully!</span>
              </div>
            )}
          </div>
        )}



      </div>
    );
  };

  const updateSceneObject = (elementId, mutate) => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
    let changed = false;
    const nextElements = elements.map(element => {
      if (element.id !== elementId) return element;
      const next = structuredClone(element);
      mutate(next);
      next.version = (element.version || 0) + 1;
      next.versionNonce = Math.floor(Math.random() * 0x7fffffff);
      next.updated = Date.now();
      changed = true;
      return next;
    });
    if (!changed) return;
    excalidrawAPI.updateScene({ elements: nextElements, commitToHistory: true });
    setModifierUpdateNonce(nonce => nonce + 1);
  };

  const updateSceneObjectProperty = (elementId, path, value) => updateSceneObject(elementId, element => {
    let target = element;
    for (let index = 0; index < path.length - 1; index += 1) target = target[path[index]];
    target[path.at(-1)] = value;
    if (path[0] === "customData" && path.includes("modifiers")) {
      element.customData.version = (element.customData.version || 0) + 1;
    }
    if (path[0] === "customData" && path[1] === "draweratorGeometry") {
      Object.assign(element, setElementBezierGeometry(element, element.customData.draweratorGeometry));
    }
  });

  const sidePanels = DRAWERATOR_PANELS.filter(panel => !panel.placements.includes(PANEL_PLACEMENTS.BOTTOM));
  const horizontalPanels = DRAWERATOR_PANELS.filter(panel => panel.placements.includes(PANEL_PLACEMENTS.BOTTOM));
  const getDockTabs = placement => getOpenPanelsForPlacement(sidePanels, openPanels, panelLayouts, placement);
  const leftDockTabs = getDockTabs(PANEL_PLACEMENTS.LEFT);
  const rightDockTabs = getDockTabs(PANEL_PLACEMENTS.RIGHT);
  const resolvedActiveDockPanels = {
    left: resolveActiveDockPanel(leftDockTabs, activeDockPanels.left),
    right: resolveActiveDockPanel(rightDockTabs, activeDockPanels.right),
  };
  const horizontalOpenPanels = { ...openPanels, transport: showIannixTransport };
  const bottomDockTabs = getOpenPanelsForPlacement(horizontalPanels, horizontalOpenPanels, panelLayouts, PANEL_PLACEMENTS.BOTTOM);
  const activeBottomPanelId = resolveActiveDockPanel(bottomDockTabs, activeDockPanels.bottom);
  const shouldRenderPanel = panelId => {
    if (!openPanels[panelId]) return false;
    const placement = panelLayouts[panelId]?.placement;
    if (placement === PANEL_PLACEMENTS.FLOATING) return true;
    return resolvedActiveDockPanels[placement] === panelId;
  };
  const getPanelDockTabs = panelId => {
    const placement = panelLayouts[panelId]?.placement;
    return placement === PANEL_PLACEMENTS.LEFT ? leftDockTabs : placement === PANEL_PLACEMENTS.RIGHT ? rightDockTabs : [];
  };
  const shouldRenderHorizontalPanel = panelId => {
    if (!horizontalOpenPanels[panelId]) return false;
    return panelLayouts[panelId]?.placement === PANEL_PLACEMENTS.FLOATING || activeBottomPanelId === panelId;
  };
  const closeHorizontalPanel = panelId => {
    if (panelId === "transport") setShowIannixTransport(false);
    else closeDraweratorPanel(panelId);
  };
  const anySidePanelOpen = sidePanels.some(panel => openPanels[panel.id]);
  const bottomDockOpen = bottomDockTabs.length > 0;
  const bottomDockHeight = horizontalPanels.find(panel => panel.id === activeBottomPanelId)?.dockedHeight || 144;

  return (
    <div 
      id="root" 
      className={`drawerator-shell ${satoriMode ? "satori-mode" : ""} ${showToolbarHints ? "" : "hide-toolbar-hints"} ${showBottomNotifications ? "" : "hide-bottom-notifications"} ${anySidePanelOpen ? "sidebar-open" : ""} ${bottomDockOpen ? "horizontal-dock-open" : ""} ${draggingPanelId || transportDragging ? "panel-is-dragging" : ""}`}
      style={{
        "--drawerator-accent": colorWithOpacity(accentColor, accentOpacity),
        "--drawerator-highlight": colorWithOpacity(highlightColor, highlightOpacity),
        "--horizontal-dock-height": `${bottomDockHeight}px`,
      }}
    >
      <NumberInputController onRouteRequest={detail => {
        eventBus.emit("parameter.route.request", detail, { source: "number-box" });
        setSceneExchangeStatus(`Route request: ${detail.label}`);
      }} />
      <div 
        id="canvas-container" 
        onPointerDownCapture={handleCanvasPointerDown}
        onPointerMoveCapture={handleCanvasPointerMove}
        onPointerUpCapture={handleCanvasPointerUp} 
        onDoubleClickCapture={handleCanvasDoubleClick}
        onContextMenuCapture={handleCanvasContextMenu}
        style={{ width: "100%", height: "100%", position: "relative" }}
        className={modifierDrawingActive && drawingPoints.length > 0 ? "custom-brush-drawing" : ""}
      >
        <Excalidraw 
          theme={theme} 
          gridModeEnabled={false}
          excalidrawAPI={(api) => setExcalidrawAPI(api)} 
          getFormFactor={(width, height) => {
            if (forceDesktopLayout) {
              return "desktop";
            }
            return width < 768 ? "phone" : "desktop";
          }}
          initialData={{
            appState: {
              currentItemRoughness: 0,
              gridSize: null,
              gridModeEnabled: false,
              objectsSnapModeEnabled: false,
            }
          }}
          onChange={(elements, appState) => {
            applyForceDesktopOverride(false);

            const nativeBezierEditId = appState.editingLinearElement?.elementId || null;
            const nativeBezierEditElement = nativeBezierEditId
              ? elements.find(element => element.id === nativeBezierEditId && !element.isDeleted && hasCubicBezierGeometry(element))
              : null;
            if (nativeBezierEditElement) {
              if (!selectionFilterAllowsElement(selectionFilterRef.current, nativeBezierEditElement)) {
                excalidrawAPIRef.current?.updateScene({
                  appState: {
                    selectedElementIds: {},
                    selectedGroupIds: {},
                    editingLinearElement: null,
                    selectedLinearElement: null,
                  },
                  commitToHistory: false,
                });
                return;
              }
              // Canonical curves are owned by Drawerator's anchor/handle
              // editor. Transfer both edit and selection state together so the
              // selection-sync effect cannot immediately exit the editor.
              const nextSelection = { [nativeBezierEditElement.id]: true };
              setSelectedElementIds(nextSelection);
              setBezierEditElementId(nativeBezierEditElement.id);
              setBezierSelectedAnchor(0);
              excalidrawAPIRef.current?.updateScene({
                appState: {
                  selectedElementIds: nextSelection,
                  selectedGroupIds: {},
                  editingLinearElement: null,
                  selectedLinearElement: null,
                },
                commitToHistory: false,
              });
              return;
            }

            const nativeGridEnabled = appState.gridSize !== null || Boolean(appState.gridModeEnabled) || Boolean(appState.objectsSnapModeEnabled);
            const activeToolType = appState.activeTool?.type || null;
            const previousActiveToolType = activeGridToolRef.current;
            activeGridToolRef.current = activeToolType;
            const activeLinearState = appState.editingLinearElement || appState.selectedLinearElement || null;
            const editingLinearId = activeLinearState?.elementId || null;
            editingLinearGridRef.current = editingLinearId;
            const multiElementId = appState.multiElement?.id || null;
            const previousMultiElementId = multiElementGridRef.current;
            multiElementGridRef.current = multiElementId;

            if (previousActiveToolType === "line" && activeToolType !== "line" && nativeLineGridPointsRef.current) {
              if (nativeLineGridPointsRef.current.points?.length >= 2) {
                const fallbackLine = [...elements].reverse().find(element => element.type === "line" && !element.isDeleted);
                const capturedElementId = nativeLineGridPointsRef.current.elementId || previousMultiElementId || fallbackLine?.id;
                if (capturedElementId) finalizeCapturedNativeLine(capturedElementId);
              } else {
                nativeLineGridPointsRef.current = null;
                setDrawingPoints([]);
                excalidrawAPIRef.current?.updateScene({ appState: { currentItemStrokeColor: lastStrokeColorRef.current }, commitToHistory: false });
              }
            }

            if (pendingNativeLineFinalizeRef.current && !multiElementId) {
              window.setTimeout(() => applyPendingNativeLineFinalize(), 0);
            }

            if (nativeGridEnabled) {
              excalidrawAPIRef.current?.updateScene({
                appState: { gridSize: null, gridModeEnabled: false, objectsSnapModeEnabled: false },
                commitToHistory: false,
              });
            }

            if (appState.draggingElement) gridInteractionRef.current.moving = true;
            if (appState.resizingElement || appState.isRotating) gridInteractionRef.current.resizing = true;
            if (activeLinearState && isMouseDownRef.current) {
              gridInteractionRef.current.pointEditing = true;
              const selectedPointIndices = activeLinearState.selectedPointsIndices;
              const lastClickedPoint = activeLinearState.pointerDownState?.lastClickedPoint;
              if (selectedPointIndices?.length) {
                gridInteractionRef.current.pointIndices = [...selectedPointIndices];
              } else if (Number.isInteger(lastClickedPoint) && lastClickedPoint >= 0) {
                gridInteractionRef.current.pointIndices = [lastClickedPoint];
              }
            }

            const visibilitySafeElements = elements.map(element =>
              enforceRuntimeCursorHostVisibility(normalizeBezierHostElement(element))
            );
            if (visibilitySafeElements.some((element, index) => element !== elements[index])) {
              historySuppressSceneRef.current += 1;
              excalidrawAPIRef.current?.updateScene({ elements: visibilitySafeElements, commitToHistory: false });
              window.setTimeout(() => {
                historySuppressSceneRef.current = Math.max(0, historySuppressSceneRef.current - 1);
              }, 0);
              return;
            }

            // Sync selected element IDs state to trigger panel re-renders
            const combinedSelectedIds = {
              ...(appState.selectedElementIds || {}),
              ...runtimeCursorSelectionRef.current,
            };
            const selectedIds = filterSelectedElementIds(elements, combinedSelectedIds, selectionFilterRef.current);
            const nativeSelectedIds = filterSelectedElementIds(elements, appState.selectedElementIds || {}, selectionFilterRef.current);
            runtimeCursorSelectionRef.current = filterSelectedElementIds(
              elements,
              runtimeCursorSelectionRef.current,
              selectionFilterRef.current
            );
            if (!selectionMapsEqual(nativeSelectedIds, appState.selectedElementIds || {})) {
              excalidrawAPIRef.current?.updateScene({
                appState: {
                  selectedElementIds: nativeSelectedIds,
                  selectedGroupIds: {},
                  editingLinearElement: null,
                  selectedLinearElement: null,
                },
                commitToHistory: false,
              });
            }
            if (!selectionMapsEqual(selectedIds, selectedElementIds)) {
              setSelectedElementIds(selectedIds);
            }

            // Sync camera zoom/scroll state to trigger visual overlay position updates in real-time
            if (
              appState.scrollX !== cameraRef.current.scrollX ||
              appState.scrollY !== cameraRef.current.scrollY ||
              appState.zoom.value !== cameraRef.current.zoom
            ) {
              cameraRef.current = {
                scrollX: appState.scrollX,
                scrollY: appState.scrollY,
                zoom: appState.zoom.value
              };
              setModifierUpdateNonce(n => n + 1);
            }

            const presentationState = {
              selectedElementIds: appState.selectedElementIds || {},
              activeTool: appState.activeTool || null,
              scrollX: appState.scrollX || 0,
              scrollY: appState.scrollY || 0,
              zoom: appState.zoom || { value: 1 },
            };
            const presentationChanged = JSON.stringify(presentationState) !== JSON.stringify(lastPresentationStateRef.current);
            lastPresentationStateRef.current = presentationState;
            if (
              presentationChanged &&
              historyIncludePresentation &&
              historyController.status === "recording" &&
              historySuppressSceneRef.current === 0
            ) {
              pendingPresentationRef.current = presentationState;
              window.clearTimeout(presentationTimerRef.current);
              presentationTimerRef.current = window.setTimeout(() => {
                const next = pendingPresentationRef.current;
                pendingPresentationRef.current = null;
                if (!next) return;
                historyController.record({
                  kind: "presentation",
                  presentation: true,
                  track: "presentation",
                  source: "excalidraw",
                  transportTime: scoreTimeRef.current,
                  args: { label: "View / selection", appState: next },
                });
              }, 120);
            }

            const previousSceneMap = lastSceneElementsRef.current;
            let effectiveElements = elements;
            if (
              autoKeyEnabled &&
              !autoKeyApplyingRef.current &&
              historySuppressSceneRef.current === 0 &&
              previousSceneMap.size > 0
            ) {
              let keyed = false;
              effectiveElements = elements.map(element => {
                const previous = previousSceneMap.get(element.id);
                const next = autoKeyElement(previous, element, scoreTimeRef.current);
                if (next === element) return element;
                keyed = true;
                const version = (element.version || 0) + 1;
                return {
                  ...next,
                  version,
                  versionNonce: Math.floor(Math.random() * 0x7fffffff),
                  updated: Date.now(),
                  customData: {
                    ...(next.customData || {}),
                    ...(next.customData?.modifiers?.length ? { excalidrawVersion: version } : {}),
                  },
                };
              });
              if (keyed) {
                autoKeyApplyingRef.current = true;
                excalidrawAPI.updateScene({ elements: effectiveElements, commitToHistory: false });
                window.setTimeout(() => { autoKeyApplyingRef.current = false; }, 0);
              }
            }

            const currentSceneMap = new Map(effectiveElements.map(element => [element.id, element]));
            const changedElements = effectiveElements.filter(element => {
              const previous = previousSceneMap.get(element.id);
              return !previous || previous.version !== element.version || previous.isDeleted !== element.isDeleted;
            });
            const removedElementIds = [...previousSceneMap.keys()].filter(id => !currentSceneMap.has(id));
            lastSceneElementsRef.current = currentSceneMap;

            if (
              historyController.status === "recording" &&
              historySuppressSceneRef.current === 0 &&
              !strokeRecordingSuppressedRef.current &&
              !evaluatingModifiersRef.current &&
              (changedElements.length > 0 || removedElementIds.length > 0)
            ) {
              pendingSceneMutationRef.current = mergeSceneMutation(pendingSceneMutationRef.current, {
                previousElements: previousSceneMap,
                changedElements,
                removedElementIds,
              });
              window.clearTimeout(sceneMutationTimerRef.current);
              sceneMutationTimerRef.current = window.setTimeout(() => {
                const mutation = pendingSceneMutationRef.current;
                pendingSceneMutationRef.current = null;
                if (!mutation) return;
                const duration = Math.max(0, performance.now() - mutation.startedAt) / 1000;
                const groupId = crypto.randomUUID();
                const recordSceneCommand = (commandId, args) => historyController.record({
                  kind: "command",
                  commandId,
                  commandVersion: 1,
                  args,
                  source: "excalidraw",
                  groupId,
                  duration,
                  transportTime: scoreTimeRef.current,
                });
                if (mutation.created.size) recordSceneCommand("scene.create", { elements: [...mutation.created.values()] });
                if (mutation.updated.size) recordSceneCommand("scene.update", { elements: [...mutation.updated.values()] });
                if (mutation.deletedElementIds.size) recordSceneCommand("scene.delete", { elementIds: [...mutation.deletedElementIds] });
              }, 180);
            }

            if (effectiveElements !== elements) return;

            if (!evaluatingModifiersRef.current && excalidrawAPI) {
              // 1. Clean up children of deleted parents
              const deletedParentIds = new Set(
                elements.filter(el => el.isDeleted && el.customData?.modifiers).map(el => el.id)
              );
              if (deletedParentIds.size > 0) {
                let childDeletedCount = 0;
                const nextElements = elements.map(el => {
                  if (el.customData?.parentId && deletedParentIds.has(el.customData.parentId) && !el.isDeleted) {
                    childDeletedCount++;
                    return { ...el, isDeleted: true };
                  }
                  return el;
                });
                if (childDeletedCount > 0) {
                  evaluatingModifiersRef.current = true;
                  try {
                    excalidrawAPI.updateScene({ elements: nextElements });
                  } finally {
                    evaluatingModifiersRef.current = false;
                  }
                  return;
                }
              }

              // 2. Detect updates to parent elements and sync if needed
              let needsUpdate = false;
              let targetElId = null;
              let targetMods = null;
              let targetPoints = null;
              const isTransforming = !!(
                appState.draggingElement || 
                appState.resizingElement || 
                appState.isRotating || 
                (appState.editingLinearElement && isMouseDownRef.current)
              );

              for (const el of elements) {
                if (el.customData?.modifiers?.length > 0 && !el.isDeleted) {
                  const modifierVersion = el.customData?.version || 0;
                  const processedModifierVersion = processedModifierVersionsRef.current[el.id];
                  const restoredElementVersion = restoredHistoryElementVersionsRef.current[el.id];
                  const suppressedModifierVersion = suppressedModifierSyncVersionsRef.current[el.id];

                  if (suppressedModifierVersion === modifierVersion) {
                    if (isTransforming) {
                      delete suppressedModifierSyncVersionsRef.current[el.id];
                    }
                    continue;
                  }

                  if (restoredElementVersion === el.version) {
                    continue;
                  }
                  if (restoredElementVersion !== undefined && restoredElementVersion !== el.version) {
                    delete restoredHistoryElementVersionsRef.current[el.id];
                  }

                  // Undo/redo restores the element and its modifier metadata as
                  // one Excalidraw history snapshot. Accept that snapshot as-is.
                  // Our own modifier edits update this ref before updateScene(),
                  // while transforms leave customData.version unchanged.
                  if (
                    processedModifierVersion === undefined ||
                    modifierVersion !== processedModifierVersion
                  ) {
                    processedModifierVersionsRef.current[el.id] = modifierVersion;
                    restoredHistoryElementVersionsRef.current[el.id] = el.version;
                    continue;
                  }

                  if (el.version > (el.customData.excalidrawVersion || 0)) {
                    if (isTransforming) {
                      if (el.type === "line") {
                        // Excalidraw's line points are authoritative during both
                        // point edits and frame transforms. Do not reconstruct
                        // them from cached bounds or inferred flip signs.
                        linearEditPointsRef.current[el.id] = getElementAbsolutePoints(el);
                      }
                      const lastVer = lastOverlayVersionRef.current[el.id] || 0;
                      if (el.version > lastVer) {
                        lastOverlayVersionRef.current[el.id] = el.version;
                        // Force a re-render of the SVG overlay during real-time transformation
                        setModifierUpdateNonce(n => n + 1);
                      }
                      continue; // Wait until drag/resize/rotate is finished to finalize coordinates
                    }
                    if (!el.customData.muteModifiers) {
                      if (el.type === "line") {
                        targetPoints = linearEditPointsRef.current[el.id] || getElementAbsolutePoints(el);
                        delete linearEditPointsRef.current[el.id];
                      } else {
                        const originalPoints = el.customData?.originalPoints;
                        if (originalPoints && originalPoints.length > 0) {
                          const lastWidth = el.customData?.lastWidth || el.width;
                          const lastHeight = el.customData?.lastHeight || el.height;

                          const scaleSignX = inferAxisFlipSign(originalPoints, el.points, 0);
                          const scaleSignY = inferAxisFlipSign(originalPoints, el.points, 1);

                          let scaleX = scaleSignX;
                          let scaleY = scaleSignY;
                          if (lastWidth > 0.1 && Math.abs(el.width - lastWidth) > 0.1) {
                            scaleX = scaleSignX * (el.width / lastWidth);
                          }
                          if (lastHeight > 0.1 && Math.abs(el.height - lastHeight) > 0.1) {
                            scaleY = scaleSignY * (el.height / lastHeight);
                          }

                          const origMinX = Math.min(...originalPoints.map(p => p[0]));
                          const origMinY = Math.min(...originalPoints.map(p => p[1]));
                          const deltaX = el.type === "freedraw" ? (el.x - origMinX) : (el.x - originalPoints[0][0]);
                          const deltaY = el.type === "freedraw" ? (el.y - origMinY) : (el.y - originalPoints[0][1]);

                          if (Math.abs(deltaX) > 0.1 || Math.abs(deltaY) > 0.1 || Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
                            if (el.type === "freedraw") {
                              targetPoints = originalPoints.map(p => {
                                const copy = [
                                  el.x + (p[0] - origMinX) * scaleX,
                                  el.y + (p[1] - origMinY) * scaleY
                                ];
                                if (p.pressure !== undefined) copy.pressure = p.pressure;
                                if (p.time !== undefined) copy.time = p.time;
                                if (p.strokeTime !== undefined) copy.strokeTime = p.strokeTime;
                                if (p.speed !== undefined) copy.speed = p.speed;
                                return copy;
                              });
                            } else {
                              const currMinXRel = el.points && el.points.length > 0 ? Math.min(...el.points.map(p => p[0])) : 0;
                              const currMinYRel = el.points && el.points.length > 0 ? Math.min(...el.points.map(p => p[1])) : 0;
                              
                              const shiftX = scaleX > 0.01 ? currMinXRel * (1 - 1 / scaleX) : 0;
                              const shiftY = scaleY > 0.01 ? currMinYRel * (1 - 1 / scaleY) : 0;
                              
                              const newStartX = el.x + shiftX;
                              const newStartY = el.y + shiftY;

                              targetPoints = originalPoints.map(p => {
                                const copy = [
                                  newStartX + (p[0] - originalPoints[0][0]) * scaleX,
                                  newStartY + (p[1] - originalPoints[0][1]) * scaleY
                                ];
                                if (p.pressure !== undefined) copy.pressure = p.pressure;
                                if (p.time !== undefined) copy.time = p.time;
                                if (p.strokeTime !== undefined) copy.strokeTime = p.strokeTime;
                                if (p.speed !== undefined) copy.speed = p.speed;
                                return copy;
                              });
                            }
                          }
                        } else {
                          // No originalPoints exists, initialize it
                          targetPoints = el.points.map(p => {
                            const absPt = [el.x + p[0], el.y + p[1]];
                            if (p.pressure !== undefined) absPt.pressure = p.pressure;
                            if (p.time !== undefined) absPt.time = p.time;
                            if (p.strokeTime !== undefined) absPt.strokeTime = p.strokeTime;
                            if (p.speed !== undefined) absPt.speed = p.speed;
                            return absPt;
                          });
                        }
                      }
                      el.customData.lastWidth = el.width;
                      el.customData.lastHeight = el.height;
                      el.customData.excalidrawVersion = el.version;
                      needsUpdate = true;
                      targetElId = el.id;
                      targetMods = el.customData.modifiers;
                      break;
                    }
                  }
                }
              }

              if (needsUpdate && targetElId) {
                setTimeout(() => {
                  updateModifiedElementInScene(targetElId, targetMods, targetPoints);
                }, 0);
              }
            }

            if (appState.currentItemStrokeColor && appState.currentItemStrokeColor !== "transparent") {
              lastStrokeColorRef.current = appState.currentItemStrokeColor;
            }
            if (appState.theme && appState.theme !== theme) {
              setTheme(appState.theme);
            }
             if (
              appState.viewBackgroundColor &&
              !isColorTransparent(appState.viewBackgroundColor)
             ) {
              lastNonTransparentColorRef.current = appState.viewBackgroundColor;
            }
            // Sync Excalidraw Zen Mode state
            if (appState.zenModeEnabled !== zenMode) {
              setZenMode(appState.zenModeEnabled);
            }
            
            // Auto deactivate custom brush if the active tool changes from freedraw
            if (customBrushActive && appState.activeTool && appState.activeTool.type !== "freedraw") {
              setCustomBrushActive(false);
            }
          }}
        >
          {/* Main Hamburguer Menu */}
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Export />
            <MainMenu.Item onSelect={exportDraweratorScene}>Export Drawerator .excalidraw</MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.Separator />
            <MainMenu.Item onSelect={() => commandRegistry.execute("library", {}, { source: "menu", transportTime: scoreTimeRef.current })}>Library</MainMenu.Item>
            <MainMenu.Item onSelect={() => commandRegistry.execute("panel-chat", {}, { source: "menu", transportTime: scoreTimeRef.current })}>
              AI Assistant
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => commandRegistry.execute("panel-mods", {}, { source: "menu", transportTime: scoreTimeRef.current })}>
              Mods &amp; FX
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => commandRegistry.execute("panel-iannix", {}, { source: "menu", transportTime: scoreTimeRef.current })}>
              IanniX
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => commandRegistry.execute("panel-settings", {}, { source: "menu", transportTime: scoreTimeRef.current })}>
              Settings
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => commandRegistry.execute("panel-console", {}, { source: "menu", transportTime: scoreTimeRef.current })}>
              Console
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => commandRegistry.execute("panel-history", {}, { source: "menu", transportTime: scoreTimeRef.current })}>
              History
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => commandRegistry.execute("panel-properties", {}, { source: "menu", transportTime: scoreTimeRef.current })}>
              Properties
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => commandRegistry.execute("panel-outliner", {}, { source: "menu", transportTime: scoreTimeRef.current })}>
              Outliner
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => commandRegistry.execute("panel-transport", {}, { source: "menu", transportTime: scoreTimeRef.current })}>
              Timeline
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => commandRegistry.execute("panel-grid", {}, { source: "menu", transportTime: scoreTimeRef.current })}>
              Grid
            </MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
          </MainMenu>

          {/* Drawerator-owned panels can coexist when floating and share icon tabs when docked. */}
          {shouldRenderPanel("chat") && (
          <DraweratorPanel
            id="chat"
            title="AI Assistant"
            placement={panelLayouts.chat.placement}
            layout={panelLayouts.chat}
            dockTabs={getPanelDockTabs("chat")}
            onSelectDockTab={panelId => setActiveDockPanels(previous => ({ ...previous, [panelLayouts.chat.placement]: panelId }))}
            onDockTabPlacementChange={setPanelPlacement}
            onDockTabDragStart={startSidebarPanelDrag}
            onCloseDockTab={closeDraweratorPanel}
            onPlacementChange={placement => setPanelPlacement("chat", placement)}
            onDragStart={event => startSidebarPanelDrag("chat", event)}
            onClose={() => closeDraweratorPanel("chat")}
            onResizeStart={handlePanelResizeMouseDown}
            collapsed={panelLayouts.chat.placement !== PANEL_PLACEMENTS.FLOATING && collapsedDocks[panelLayouts.chat.placement]}
            onExpand={() => setCollapsedDocks(previous => ({ ...previous, [panelLayouts.chat.placement]: false }))}
          >
            <div className="drawerator-panel-secondary-header">
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", paddingRight: "10px", gap: "10px" }}>
                {/* Model Selector Pill */}
                <div className="ai-model-picker">
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-secondary)", flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <select
                    className="ai-model-select"
                    value={aiSettings.model} 
                    onChange={(e) => {
                      const updated = { ...aiSettings, model: e.target.value };
                      setAiSettings(updated);
                      localStorage.setItem("drawerator_ai_settings", JSON.stringify(updated));
                    }}
                  >
                    {modelsList.length > 0 ? (
                      modelsList.map((m, idx) => (
                        <option key={idx} value={m}>{m}</option>
                      ))
                    ) : (
                      <option value="">{aiSettings.model || "Select Model"}</option>
                    )}
                  </select>
                  {/* Custom tiny down arrow */}
                  <span className="ai-model-picker-arrow">▼</span>
                </div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button className="header-btn" onClick={clearChat} title="Reset chat history">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <button className="header-btn" onClick={copyTranscript} title="Copy transcript">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </button>
                  <button className="header-btn" onClick={() => toggleDraweratorPanel("settings", { settingsTab: "ai" })} title="AI settings">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", height: "calc(100% - 50px)", overflow: "hidden", background: "var(--bg-sidebar)" }}>
              {/* Messages Stream */}
              <div id="chat-messages" style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {chatHistory
                  .filter(msg => msg.role !== "system")
                  .map((msg, idx) => (
                    <div key={idx} className={`chat-message ${msg.role}`}>
                      {msg.displayContent || msg.content}
                      {msg.images && msg.images.map((img, imgIdx) => (
                        <img 
                          key={imgIdx} 
                          src={img} 
                          alt="Context preview" 
                          style={{ 
                            maxWidth: "100%", 
                            maxHeight: "150px", 
                            borderRadius: "6px", 
                            marginTop: "8px", 
                            display: "block",
                            border: "1px solid var(--border-color)"
                          }} 
                        />
                      ))}
                      {msg.content !== "Thinking..." && (
                        <button 
                          className="copy-bubble-btn" 
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(msg.displayContent || msg.content);
                          }}
                          title="Copy message"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Container */}
              <div className="chat-input-container" style={{
                padding: "10px",
                borderTop: "1px solid var(--border-color)",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                background: "var(--color-surface-primary)",
                position: "relative",
                alignItems: "stretch"
              }}>
                {/* Autocomplete Suggestions Popover */}
                {showAutocomplete && getFilteredTags().length > 0 && (
                  <div 
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: "10px",
                      right: "10px",
                      background: "var(--island-bg-color, #1e1e24)",
                      border: "1px solid var(--border-color, #2d2d34)",
                      borderRadius: "8px",
                      boxShadow: "0 -10px 25px -5px rgba(0, 0, 0, 0.3), 0 -8px 10px -6px rgba(0, 0, 0, 0.3)",
                      maxHeight: "180px",
                      overflowY: "auto",
                      zIndex: 2100,
                      backdropFilter: "blur(8px)",
                      marginBottom: "4px"
                    }}
                  >
                    {getFilteredTags().map((tag, idx) => (
                      <div
                        key={tag.name}
                        onClick={() => handleAutocompleteSelect(tag.name)}
                        className={`autocomplete-item ${idx === autocompleteIndex ? "active" : ""}`}
                        style={{
                          padding: "6px 12px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "12px",
                          color: "var(--color-primary)",
                          cursor: "pointer",
                          background: idx === autocompleteIndex ? "var(--button-hover-bg, rgba(255, 255, 255, 0.08))" : "transparent"
                        }}
                      >
                        <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>{tag.name}</span>
                        <span style={{ fontSize: "11px", color: "var(--color-secondary)", opacity: 0.8 }}>{tag.description}</span>
                      </div>
                    ))}
                  </div>
                )}

                <textarea
                  id="chat-message-input"
                  value={userInput}
                  onChange={handleTextareaChange}
                  onKeyDown={(e) => {
                    const filteredTags = getFilteredTags();
                    if (showAutocomplete && filteredTags.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setAutocompleteIndex(prev => (prev + 1) % filteredTags.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setAutocompleteIndex(prev => (prev - 1 + filteredTags.length) % filteredTags.length);
                      } else if (e.key === "Enter" || e.key === "Tab") {
                        e.preventDefault();
                        handleAutocompleteSelect(filteredTags[autocompleteIndex].name);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setShowAutocomplete(false);
                      }
                    } else if (e.key === "Escape") {
                      if (showContextDropdown) {
                        e.preventDefault();
                        setShowContextDropdown(false);
                      }
                    } else if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  placeholder="Type prompt (Enter to send, Shift+Enter for new line)..."
                  style={{
                    width: "100%",
                    minHeight: "60px",
                    maxHeight: "150px",
                    resize: "none",
                    fontSize: "13px",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--color-primary)",
                    padding: 0
                  }}
                />
                
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  width: "100%"
                }}>
                  {/* Plus / Add Context Button */}
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => {
                        setShowContextDropdown(!showContextDropdown);
                        setContextMenuTab("main");
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--color-secondary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        transition: "background var(--transition-fast)",
                        padding: 0
                      }}
                      title="Add context (@)"
                    >
                      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>

                    {/* Context Drop-up Menu */}
                    {showContextDropdown && (
                      <div 
                        style={{
                          position: "absolute",
                          bottom: "34px",
                          left: "0",
                          background: "var(--island-bg-color, #1e1e24)",
                          border: "1px solid var(--border-color, #2d2d34)",
                          borderRadius: "12px",
                          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
                          padding: "6px 0",
                          minWidth: "160px",
                          zIndex: 2000,
                          backdropFilter: "blur(8px)"
                        }}
                      >
                        <div style={{ 
                          padding: "6px 12px", 
                          fontSize: "11px", 
                          fontWeight: "700", 
                          color: "var(--color-secondary)", 
                          textTransform: "uppercase", 
                          letterSpacing: "0.5px",
                          opacity: 0.7,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center"
                        }}>
                          <span>Add Context</span>
                          {contextMenuTab !== "main" && (
                            <span 
                              onClick={(e) => { e.stopPropagation(); setContextMenuTab("main"); }}
                              style={{ color: "var(--color-accent)", cursor: "pointer", textTransform: "none", fontSize: "10px" }}
                            >
                              ← Back
                            </span>
                          )}
                        </div>
                        
                        {contextMenuTab === "main" && (
                          <>
                            <div 
                              className="context-menu-item"
                              onClick={() => setContextMenuTab("media")}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "8px 12px",
                                fontSize: "13px",
                                color: "var(--color-primary)",
                                cursor: "pointer",
                                transition: "background var(--transition-fast)"
                              }}
                            >
                              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span>Media (PNG)</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => setContextMenuTab("mentions")}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "8px 12px",
                                fontSize: "13px",
                                color: "var(--color-primary)",
                                cursor: "pointer",
                                transition: "background var(--transition-fast)"
                              }}
                            >
                              <span style={{ fontSize: "14px", fontWeight: "bold", width: "16px", textAlign: "center" }}>@</span>
                              <span>Mentions</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => setContextMenuTab("actions")}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "8px 12px",
                                fontSize: "13px",
                                color: "var(--color-primary)",
                                cursor: "pointer",
                                transition: "background var(--transition-fast)"
                              }}
                            >
                              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              <span>Actions & Skills</span>
                            </div>
                          </>
                        )}

                        {contextMenuTab === "media" && (
                          <>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@canvas-as-png"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@canvas-as-png</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@selection-as-png"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@selection-as-png</span>
                            </div>
                          </>
                        )}

                        {contextMenuTab === "mentions" && (
                          <>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@selection"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@selection</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@canvas"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@canvas</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@selection-as-svg"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@selection-as-svg</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@canvas-as-svg"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@canvas-as-svg</span>
                            </div>
                          </>
                        )}

                        {contextMenuTab === "actions" && (
                          <>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@mermaid"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@mermaid</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@manim"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@manim</span>
                            </div>
                            <div 
                              className="context-menu-item"
                              onClick={() => { insertTextAtCursor("@imagegen"); setShowContextDropdown(false); }}
                              style={{ padding: "8px 12px", fontSize: "12px", color: "var(--color-primary)", cursor: "pointer" }}
                            >
                              <span style={{ fontWeight: "600", color: "var(--color-accent)" }}>@imagegen</span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Send Button */}
                  <button 
                    id="chat-send-btn" 
                    onClick={() => sendChatMessage()} 
                    disabled={isStreaming} 
                    style={{ 
                      width: "28px", 
                      height: "28px", 
                      borderRadius: "50%", 
                      background: "var(--color-accent)", 
                      color: "var(--color-btn-text)", 
                      border: "none", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      cursor: "pointer"
                    }}
                  >
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </DraweratorPanel>
          )}

          {shouldRenderPanel("settings") && (
          <DraweratorPanel
            id="settings"
            title="Settings"
            placement={panelLayouts.settings.placement}
            layout={panelLayouts.settings}
            dockTabs={getPanelDockTabs("settings")}
            onSelectDockTab={panelId => setActiveDockPanels(previous => ({ ...previous, [panelLayouts.settings.placement]: panelId }))}
            onDockTabPlacementChange={setPanelPlacement}
            onDockTabDragStart={startSidebarPanelDrag}
            onCloseDockTab={closeDraweratorPanel}
            onPlacementChange={placement => setPanelPlacement("settings", placement)}
            onDragStart={event => startSidebarPanelDrag("settings", event)}
            onClose={() => closeDraweratorPanel("settings")}
            onResizeStart={handlePanelResizeMouseDown}
            collapsed={panelLayouts.settings.placement !== PANEL_PLACEMENTS.FLOATING && collapsedDocks[panelLayouts.settings.placement]}
            onExpand={() => setCollapsedDocks(previous => ({ ...previous, [panelLayouts.settings.placement]: false }))}
          >
            {renderSettingsContent()}
          </DraweratorPanel>
          )}

          {shouldRenderPanel("console") && (
          <DraweratorPanel
            id="console"
            title="Console"
            placement={panelLayouts.console.placement}
            layout={panelLayouts.console}
            dockTabs={getPanelDockTabs("console")}
            onSelectDockTab={panelId => setActiveDockPanels(previous => ({ ...previous, [panelLayouts.console.placement]: panelId }))}
            onDockTabPlacementChange={setPanelPlacement}
            onDockTabDragStart={startSidebarPanelDrag}
            onCloseDockTab={closeDraweratorPanel}
            onPlacementChange={placement => setPanelPlacement("console", placement)}
            onDragStart={event => startSidebarPanelDrag("console", event)}
            onClose={() => closeDraweratorPanel("console")}
            onResizeStart={handlePanelResizeMouseDown}
            collapsed={panelLayouts.console.placement !== PANEL_PLACEMENTS.FLOATING && collapsedDocks[panelLayouts.console.placement]}
            onExpand={() => setCollapsedDocks(previous => ({ ...previous, [panelLayouts.console.placement]: false }))}
          >
            <EventConsole eventBus={eventBus} commandRegistry={commandRegistry} transportTime={scoreTime} />
          </DraweratorPanel>
          )}

          {shouldRenderPanel("history") && (
          <DraweratorPanel
            id="history"
            title="History"
            placement={panelLayouts.history.placement}
            layout={panelLayouts.history}
            dockTabs={getPanelDockTabs("history")}
            onSelectDockTab={panelId => setActiveDockPanels(previous => ({ ...previous, [panelLayouts.history.placement]: panelId }))}
            onDockTabPlacementChange={setPanelPlacement}
            onDockTabDragStart={startSidebarPanelDrag}
            onCloseDockTab={closeDraweratorPanel}
            onPlacementChange={placement => setPanelPlacement("history", placement)}
            onDragStart={event => startSidebarPanelDrag("history", event)}
            onClose={() => closeDraweratorPanel("history")}
            onResizeStart={handlePanelResizeMouseDown}
            collapsed={panelLayouts.history.placement !== PANEL_PLACEMENTS.FLOATING && collapsedDocks[panelLayouts.history.placement]}
            onExpand={() => setCollapsedDocks(previous => ({ ...previous, [panelLayouts.history.placement]: false }))}
          >
            <HistoryPanel
              snapshot={historySnapshot}
              commands={commandRegistry.list()}
              macros={historyMacros}
              includePresentation={historyIncludePresentation}
              emitMidi={historyMidiArmed}
              showPointer={historyShowPointer}
              clockMode={historyClockMode}
              recordFilter={historyRecordFilter}
              onIncludePresentationChange={setHistoryIncludePresentation}
              onEmitMidiChange={setHistoryMidiArmed}
              onShowPointerChange={setHistoryShowPointer}
              onClockModeChange={mode => {
                setHistoryClockMode(mode);
                localStorage.setItem("drawerator_history_clock_mode", mode);
              }}
              onRecordFilterChange={filter => {
                setHistoryRecordFilter(filter);
                localStorage.setItem("drawerator_history_record_filter", filter);
              }}
              onStart={() => startHistoryRecording()}
              onPause={() => historyController.pause()}
              onStop={stopHistory}
              onPlay={playHistory}
              onPlayAction={id => historyController.playAction(id, { emitMidi: historyMidiArmed })}
              onSeek={seconds => historyController.seek(seconds, { includePresentation: historyIncludePresentation, emitMidi: historyMidiArmed })}
              onRateChange={rate => historyController.setPlaybackRate(rate)}
              onUpdateAction={(id, patch) => historyController.updateAction(id, patch)}
              onRemoveAction={id => historyController.removeAction(id)}
              onDuplicateAction={id => historyController.duplicateAction(id)}
              onMoveAction={(id, direction) => historyController.moveAction(id, direction)}
              onSaveMacro={saveHistoryMacro}
              onInsertMacro={insertHistoryMacro}
              onRemoveMacro={removeHistoryMacro}
              onExport={exportHistorySession}
              onImport={importHistorySession}
              onClear={clearHistorySession}
            />
          </DraweratorPanel>
          )}

          {shouldRenderPanel("properties") && (
          <DraweratorPanel
            id="properties"
            title="Properties"
            placement={panelLayouts.properties.placement}
            layout={panelLayouts.properties}
            dockTabs={getPanelDockTabs("properties")}
            onSelectDockTab={panelId => setActiveDockPanels(previous => ({ ...previous, [panelLayouts.properties.placement]: panelId }))}
            onDockTabPlacementChange={setPanelPlacement}
            onDockTabDragStart={startSidebarPanelDrag}
            onCloseDockTab={closeDraweratorPanel}
            onPlacementChange={placement => setPanelPlacement("properties", placement)}
            onDragStart={event => startSidebarPanelDrag("properties", event)}
            onClose={() => closeDraweratorPanel("properties")}
            onResizeStart={handlePanelResizeMouseDown}
            collapsed={panelLayouts.properties.placement !== PANEL_PLACEMENTS.FLOATING && collapsedDocks[panelLayouts.properties.placement]}
            onExpand={() => setCollapsedDocks(previous => ({ ...previous, [panelLayouts.properties.placement]: false }))}
          >
            <PropertiesPanel
              elements={(excalidrawAPI?.getSceneElementsIncludingDeleted() || []).filter(element => selectedElementIds[element.id])}
              onChange={updateSceneObjectProperty}
            />
          </DraweratorPanel>
          )}

          {shouldRenderPanel("outliner") && (
          <DraweratorPanel
            id="outliner"
            title="Outliner"
            placement={panelLayouts.outliner.placement}
            layout={panelLayouts.outliner}
            dockTabs={getPanelDockTabs("outliner")}
            onSelectDockTab={panelId => setActiveDockPanels(previous => ({ ...previous, [panelLayouts.outliner.placement]: panelId }))}
            onDockTabPlacementChange={setPanelPlacement}
            onDockTabDragStart={startSidebarPanelDrag}
            onCloseDockTab={closeDraweratorPanel}
            onPlacementChange={placement => setPanelPlacement("outliner", placement)}
            onDragStart={event => startSidebarPanelDrag("outliner", event)}
            onClose={() => closeDraweratorPanel("outliner")}
            onResizeStart={handlePanelResizeMouseDown}
            collapsed={panelLayouts.outliner.placement !== PANEL_PLACEMENTS.FLOATING && collapsedDocks[panelLayouts.outliner.placement]}
            onExpand={() => setCollapsedDocks(previous => ({ ...previous, [panelLayouts.outliner.placement]: false }))}
          >
            <OutlinerPanel
              elements={excalidrawAPI?.getSceneElementsIncludingDeleted() || []}
              selectedElementIds={selectedElementIds}
              onSelect={(elementId, selection = {}) => {
                if (!excalidrawAPI) return;
                const sceneElements = excalidrawAPI.getSceneElements();
                const clickedElement = sceneElements.find(element => element.id === elementId);
                if (!selectionFilterAllowsElement(selectionFilterRef.current, clickedElement)) return;
                const current = selectedElementIds || {};
                let next = {};
                if (selection.mode === "toggle") {
                  next = { ...current };
                  if (next[elementId]) delete next[elementId];
                  else next[elementId] = true;
                } else if (selection.mode === "range") {
                  next = selection.additive ? { ...current } : {};
                  for (const id of selection.rangeIds || [elementId]) next[id] = true;
                } else {
                  next[elementId] = true;
                }
                next = filterSelectedElementIds(sceneElements, next, selectionFilterRef.current);
                const runtimeSelections = Object.fromEntries(
                  sceneElements
                    .filter(element => next[element.id] && isRuntimeCursor(element))
                    .map(element => [element.id, true])
                );
                runtimeCursorSelectionRef.current = runtimeSelections;
                const nativeSelections = Object.fromEntries(
                  Object.entries(next).filter(([id]) => !runtimeSelections[id])
                );
                const activeTool = excalidrawAPI.getAppState().activeTool || {};
                excalidrawAPI.updateScene({ appState: { selectedElementIds: nativeSelections, selectedGroupIds: {}, editingLinearElement: null, selectedLinearElement: null, activeTool: { ...activeTool, type: "selection" } } });
                setSelectedElementIds(next);
              }}
              onDelete={elementIds => {
                if (!excalidrawAPI || !elementIds?.length) return;
                const ids = new Set(elementIds);
                const nextElements = excalidrawAPI.getSceneElementsIncludingDeleted().map(element => (
                  ids.has(element.id) ? { ...element, isDeleted: true, updated: Date.now() } : element
                ));
                runtimeCursorSelectionRef.current = {};
                excalidrawAPI.updateScene({
                  elements: nextElements,
                  appState: { selectedElementIds: {}, selectedGroupIds: {}, editingLinearElement: null, selectedLinearElement: null },
                  commitToHistory: true,
                });
                setSelectedElementIds({});
              }}
              onVisibilityChange={elementId => updateSceneObject(elementId, element => {
                const hidden = !element.customData?.outlinerHidden;
                element.customData = { ...(element.customData || {}) };
                if (hidden) {
                  element.customData.outlinerSavedOpacity = element.opacity ?? 100;
                  element.customData.outlinerHidden = true;
                  element.opacity = 0;
                } else {
                  element.opacity = element.customData.outlinerSavedOpacity ?? 100;
                  element.customData.outlinerHidden = false;
                  delete element.customData.outlinerSavedOpacity;
                }
              })}
              onLockChange={elementId => updateSceneObject(elementId, element => { element.locked = !element.locked; })}
              onRename={(elementId, label) => updateIannixElements([elementId], current => ({
                ...current,
                label: label || undefined,
              }))}
            />
          </DraweratorPanel>
          )}

          {shouldRenderPanel("mods") && (
          <DraweratorPanel
            id="mods"
            title="Mods & FX"
            placement={panelLayouts.mods.placement}
            layout={panelLayouts.mods}
            dockTabs={getPanelDockTabs("mods")}
            onSelectDockTab={panelId => setActiveDockPanels(previous => ({ ...previous, [panelLayouts.mods.placement]: panelId }))}
            onDockTabPlacementChange={setPanelPlacement}
            onDockTabDragStart={startSidebarPanelDrag}
            onCloseDockTab={closeDraweratorPanel}
            onPlacementChange={placement => setPanelPlacement("mods", placement)}
            onDragStart={event => startSidebarPanelDrag("mods", event)}
            onClose={() => closeDraweratorPanel("mods")}
            onResizeStart={handlePanelResizeMouseDown}
            collapsed={panelLayouts.mods.placement !== PANEL_PLACEMENTS.FLOATING && collapsedDocks[panelLayouts.mods.placement]}
            onExpand={() => setCollapsedDocks(previous => ({ ...previous, [panelLayouts.mods.placement]: false }))}
          >
            <div className="drawerator-panel-secondary-header drawerator-mods-actions-header">
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", paddingRight: "10px", gap: "10px" }}>
                {(() => {
                  const controlState = getModifierPanelControlState();
                  const { element, isShape, modifiers, isMuted, hideOriginalControl, canRestoreOriginal } = controlState;
                  if (element && element.type !== "freedraw" && element.type !== "line" && !isShape) return null;

                  const isRound = element ? !!element.roundness : globalRoundness;
                  const bypassDisabled = controlState.hasMultipleSelection || (!isMuted && hideOriginalControl.checked);
                  const hideDisabled = hideOriginalControl.disabled || (!hideOriginalControl.checked && isMuted);
                  const hideTargetLabel = hideOriginalControl.target === "nextStroke" ? "new Mod Pen strokes" : "the selected stroke";

                  return (
                    <div className="modifiers-header-actions">
                      {modsPanelTab === "stack" && (
                        <>
                          <button
                            className={`header-btn ${customBrushActive ? "active" : ""}`}
                            onClick={() => {
                              const nextState = !customBrushActive;
                              setCustomBrushActive(nextState);
                              excalidrawAPI?.updateScene({
                                appState: { activeTool: { type: nextState ? "freedraw" : "selection", ...(nextState ? { locked: true } : {}) } }
                              });
                            }}
                            title={customBrushActive ? "Disable Mod Pen (Shift+P)" : "Enable Mod Pen (Shift+P)"}
                            aria-label={customBrushActive ? "Disable Mod Pen" : "Enable Mod Pen"}
                            aria-pressed={customBrushActive}
                          >
                            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122l9.82-9.82 1.41 1.414-9.82 9.82-1.41-1.414zm-1.86 2.23l.36-1.02 1.02.36-.36 1.02-1.02-.36zm-.49 1.4l-.4-.4 1.25-1.25.4.4-1.25 1.25zm-.76-.76l-.4-.4.4-1.25 1.25 1.25-.4.4zm.76-.76l-1.09-1.09-4.8 4.8 1.41 1.414 4.48-4.48-.36-1.02-.36-1.02z" />
                            </svg>
                          </button>

                          {!isShape && !controlState.hasMultipleSelection && (
                            <button
                              className={`header-btn ${!isRound ? "active" : ""}`}
                              onClick={() => handleToggleSharpness(element, isRound ? "sharp" : "round")}
                              title={isRound ? "Use sharp corners" : "Use smooth corners"}
                              aria-label={isRound ? "Use sharp corners" : "Use smooth corners"}
                            >
                              {isRound ? (
                                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 20c8 0 16-8 16-16" />
                                </svg>
                              ) : (
                                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16V4" />
                                </svg>
                              )}
                            </button>
                          )}

                          {element?.type === "freedraw" && (
                            <button className="header-btn" onClick={() => handleConvertType("line")} title="Convert selected freehand stroke to a line" aria-label="Convert to line">
                              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <circle cx="5" cy="12" r="1.5" /><path d="M6.5 12h11" /><circle cx="19" cy="12" r="1.5" />
                              </svg>
                            </button>
                          )}

                          {element?.type === "line" && (
                            <button className="header-btn" onClick={() => handleConvertType("freedraw")} title="Convert selected line to a freehand stroke" aria-label="Convert to freehand">
                              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M3 16c3-8 6 4 9-4s6 4 9-4" />
                              </svg>
                            </button>
                          )}

                          {element && ["line", "freedraw"].includes(element.type) && (
                            <button
                              className={`header-btn ${hasCubicBezierGeometry(element) && bezierEditElementId === element.id ? "active" : ""}`}
                              onClick={() => hasCubicBezierGeometry(element) ? enterBezierEditMode() : convertSelectedToBezier()}
                              title={hasCubicBezierGeometry(element) ? "Edit Bézier anchors and handles" : "Convert selected path to an editable Bézier"}
                              aria-label={hasCubicBezierGeometry(element) ? "Edit Bézier" : "Convert to Bézier"}
                            >
                              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 18C4 7 20 17 20 6" />
                                <circle cx="4" cy="18" r="1.7" /><circle cx="20" cy="6" r="1.7" />
                                <path d="M4 18 8 8M20 6l-5 10" opacity=".7" />
                              </svg>
                            </button>
                          )}

                          {element && (
                            <button
                              className="header-btn"
                              onClick={handleRestoreOriginalStroke}
                              disabled={!canRestoreOriginal}
                              title={canRestoreOriginal ? "Restore the original source stroke" : "Restore is available for generated legacy brush strokes"}
                              aria-label="Restore original stroke"
                            >
                              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                              </svg>
                            </button>
                          )}

                          <button
                            className={`header-btn ${isMuted ? "active" : ""}`}
                            onClick={() => handleToggleModifierMute(controlState)}
                            disabled={bypassDisabled}
                            title={bypassDisabled ? "Show the original path before bypassing the stack" : isMuted ? "Reapply the modifier stack" : "Bypass the modifier stack to edit the source path"}
                            aria-label={isMuted ? "Reapply modifier stack" : "Bypass modifier stack"}
                            aria-pressed={isMuted}
                          >
                            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m12 3-8 4.5 8 4.5 8-4.5L12 3Z" /><path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" /><path d="M3 3 21 21" />
                            </svg>
                          </button>

                          <button
                            className={`header-btn ${hideOriginalControl.checked ? "active" : ""}`}
                            onClick={() => handleToggleModifierHideOriginal(controlState)}
                            disabled={hideDisabled}
                            title={hideDisabled && isMuted ? "Reapply the modifier stack before hiding the original path" : hideOriginalControl.checked ? `Show the original path for ${hideTargetLabel}` : `Hide the original path for ${hideTargetLabel}`}
                            aria-label={hideOriginalControl.checked ? "Show original path" : "Hide original path"}
                            aria-pressed={hideOriginalControl.checked}
                          >
                            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 3 21 21" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9 7 9 7a16.5 16.5 0 0 1-2.2 3.1M6.2 6.2C4.1 7.6 3 12 3 12s3.5 7 9 7a9.8 9.8 0 0 0 3.1-.5" />
                            </svg>
                          </button>

                          {element && modifiers.length > 0 && (
                            <button className="header-btn" onClick={() => handleBakeModifiers(element)} title="Bake the modifier stack permanently" aria-label="Bake modifier stack">
                              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 21l-.812-5.096L3 15l5.188-.904L9 9l.813 5.096L15 15l-5.187.904ZM19.071 4.929l-1.414 1.414M15 3h2M21 5v2" />
                              </svg>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px", height: "calc(100% - 50px)", overflowY: "auto" }}>
              <div
                role="tablist"
                aria-label="Mods and effects views"
                className="mods-panel-tabs"
              >
                {[
                  { id: "stack", label: "Stack" },
                  { id: "script", label: "Script" },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={modsPanelTab === tab.id}
                    onClick={() => setModsPanelTab(tab.id)}
                    className={`mods-panel-tab ${modsPanelTab === tab.id ? "active" : ""}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {modsPanelTab === "script" ? renderBrushConfigForm() : (() => {
                const selectedElements = getSelectedElements();
                if (selectedElements.length > 1) {
                  return (
                    <div style={{ textAlign: "center", padding: "24px 16px", opacity: 0.6, fontSize: "13px" }}>
                      Modifier stack editing is limited to one selected object at a time.
                    </div>
                  );
                }
                const element = selectedElements[0];
                if (element) {
                  const isShape = ["rectangle", "ellipse", "diamond"].includes(element.type);
                  if (isShape) {
                    return (
                      <div style={{
                        textAlign: "center",
                        padding: "24px 16px",
                        border: "1px dashed var(--color-border, #3a3b46)",
                        borderRadius: "8px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        alignItems: "center"
                      }}>
                        <p style={{ margin: 0, fontSize: "13px", opacity: 0.8 }}>
                          Selected: <strong style={{ textTransform: "capitalize" }}>{element.type}</strong>. Convert it to a path to apply modifiers.
                        </p>
                        <button
                          onClick={() => convertShapeToPath(element)}
                          style={{
                             padding: "6px 12px",
                             borderRadius: "4px",
                             background: "var(--button-hover-bg, rgba(0, 0, 0, 0.05))",
                             color: "var(--color-primary)",
                             border: "1px solid var(--border-color, rgba(0, 0, 0, 0.1))",
                             cursor: "pointer",
                             fontWeight: "600",
                             fontSize: "12px"
                           }}
                        >
                          Convert to Path
                        </button>
                      </div>
                    );
                  }
                  
                  if (element.type !== "freedraw" && element.type !== "line") {
                    return (
                      <div style={{ textAlign: "center", padding: "24px 16px", opacity: 0.6, fontSize: "13px" }}>
                        Modifiers can only be applied to stroke paths (pencil drawings or lines) or geometric shapes.
                      </div>
                    );
                  }
                }
                
                return renderModifiersTab();
              })()}
            </div>
          </DraweratorPanel>
          )}

          {shouldRenderPanel("iannix") && (
          <DraweratorPanel
            id="iannix"
            title="IanniX"
            placement={panelLayouts.iannix.placement}
            layout={panelLayouts.iannix}
            dockTabs={getPanelDockTabs("iannix")}
            onSelectDockTab={panelId => setActiveDockPanels(previous => ({ ...previous, [panelLayouts.iannix.placement]: panelId }))}
            onDockTabPlacementChange={setPanelPlacement}
            onDockTabDragStart={startSidebarPanelDrag}
            onCloseDockTab={closeDraweratorPanel}
            onPlacementChange={placement => setPanelPlacement("iannix", placement)}
            onDragStart={event => startSidebarPanelDrag("iannix", event)}
            onClose={() => closeDraweratorPanel("iannix")}
            onResizeStart={handlePanelResizeMouseDown}
            collapsed={panelLayouts.iannix.placement !== PANEL_PLACEMENTS.FLOATING && collapsedDocks[panelLayouts.iannix.placement]}
            onExpand={() => setCollapsedDocks(previous => ({ ...previous, [panelLayouts.iannix.placement]: false }))}
          >
            <input ref={iannixImportInputRef} type="file" accept=".iannix,.js,text/javascript" hidden onChange={handleTrustedIannixFile} />
            <div className="drawerator-panel-secondary-header">
              <div role="tablist" aria-label="IanniX views" className="mods-panel-tabs">
                {[{ id: "object", label: "Object" }, { id: "data", label: "Data" }, { id: "script", label: "Script" }].map(tab => (
                  <button key={tab.id} type="button" role="tab" aria-selected={iannixPanelTab === tab.id} className={`mods-panel-tab ${iannixPanelTab === tab.id ? "active" : ""}`} onClick={() => setIannixPanelTab(tab.id)}>{tab.label}</button>
                ))}
              </div>
            </div>
            <div style={{ padding: "16px", height: "calc(100% - 50px)", overflowY: "auto" }}>
              {iannixPanelTab === "script"
                ? renderIannixScriptTab()
                : iannixPanelTab === "data"
                  ? <IannixDataPanel elements={getSelectedElements()} onChange={updateIannixDataPath} />
                  : renderIannixTab()}
            </div>
          </DraweratorPanel>
          )}

          {shouldRenderHorizontalPanel("transport") && (
            <DraweratorPanel
              id="transport"
              title="Timeline"
              placement={panelLayouts.transport.placement}
              layout={panelLayouts.transport}
              dockTabs={panelLayouts.transport.placement === PANEL_PLACEMENTS.BOTTOM ? bottomDockTabs : []}
              onSelectDockTab={panelId => setActiveDockPanels(previous => ({ ...previous, bottom: panelId }))}
              onDockTabPlacementChange={setPanelPlacement}
              onDockTabDragStart={startHorizontalPanelDrag}
              onCloseDockTab={closeHorizontalPanel}
              onPlacementChange={placement => setPanelPlacement("transport", placement)}
              onDragStart={event => startHorizontalPanelDrag("transport", event)}
              onClose={() => closeHorizontalPanel("transport")}
              onResizeStart={handlePanelResizeMouseDown}
              allowBottom
              bottomHeight={114}
            >
              {renderIannixTransport()}
            </DraweratorPanel>
          )}

          {shouldRenderPanel("grid") && (
            <DraweratorPanel
              id="grid"
              title="Grid"
              placement={panelLayouts.grid.placement}
              layout={panelLayouts.grid}
              dockTabs={getPanelDockTabs("grid")}
              onSelectDockTab={panelId => setActiveDockPanels(previous => ({ ...previous, [panelLayouts.grid.placement]: panelId }))}
              onDockTabPlacementChange={setPanelPlacement}
              onDockTabDragStart={startSidebarPanelDrag}
              onCloseDockTab={closeDraweratorPanel}
              onPlacementChange={placement => setPanelPlacement("grid", placement)}
              onDragStart={event => startSidebarPanelDrag("grid", event)}
              onClose={() => closeDraweratorPanel("grid")}
              onResizeStart={handlePanelResizeMouseDown}
              collapsed={panelLayouts.grid.placement !== PANEL_PLACEMENTS.FLOATING && collapsedDocks[panelLayouts.grid.placement]}
              onExpand={() => setCollapsedDocks(previous => ({ ...previous, [panelLayouts.grid.placement]: false }))}
            >
              <GridPanel
                grid={globalGrid}
                selectionFilter={selectionFilter}
                tempo={scoreTempo}
                signature={scoreTimeSignature}
                fps={transportFps}
                onUpdate={updateGlobalGridSetting}
                onReset={resetGlobalGridSetting}
                onQuantizeSelection={() => commandRegistry.execute("grid.quantize.selection", {}, { source: "grid-panel", transportTime: scoreTimeRef.current }).catch(error => setSceneExchangeStatus(error.message || "Could not quantize the selection."))}
                onToggleSelectionFilter={target => setSelectionFilter(previous => toggleSelectionFilter(previous, target))}
              />
            </DraweratorPanel>
          )}
        </Excalidraw>

        <GlobalGridCanvas
          grid={globalGrid}
          appState={excalidrawAPI?.getAppState() || null}
          theme={theme}
          renderNonce={modifierUpdateNonce}
        />

        {/* Live Preview SVG Overlay */}
        {(
          (modifierDrawingActive && ((isDrawingRef.current && isMouseDownRef.current && drawingPoints.length >= 2) || pendingStrokePreview)) ||
          (!modifierDrawingActive && (nativeLineGridPointsRef.current || passiveGridFreedrawRef.current) && drawingPoints.length >= 2)
        ) && (
          <svg
            className="drawerator-live-stroke-preview"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              zIndex: 1
            }}
          >
            {getLivePreviewPaths(isDrawingRef.current ? null : pendingStrokePreview).map((linePoints) => {
              return linePoints.map(([cx, cy]) => mapCanvasToScreen(cx, cy));
            }).map((line, idx) => {
              const pointsString = line.map(([x, y]) => `${x},${y}`).join(" ");
              const commonProps = {
                fill: "none",
                stroke: lastStrokeColorRef.current,
                strokeWidth: (excalidrawAPI?.getAppState().currentItemStrokeWidth || 2) * (excalidrawAPI?.getAppState().zoom.value || 1),
                strokeLinecap: "round",
                strokeLinejoin: "round",
                opacity: (excalidrawAPI?.getAppState().currentItemOpacity ?? 100) / 100,
                style: theme === "dark" ? { filter: "invert(93%) hue-rotate(180deg)" } : undefined
              };
              if (globalRoundness && line.length >= 3) {
                return <path key={idx} d={pointsToSmoothSvgPath(line)} {...commonProps} />;
              }
              return (
                <polyline
                  key={idx}
                  points={pointsString}
                  {...commonProps}
                />
              );
            })}

            {/* Stabilizer guide leash line (Blender-like Lazy Mouse leash) */}
            {shiftHeld && rawCursorRef.current && (() => {
              const lastPoint = drawingPoints[drawingPoints.length - 1];
              if (!lastPoint) return null;
              const [tipX, tipY] = mapCanvasToScreen(lastPoint[0], lastPoint[1]);
              return (
                <g>
                  <line
                    x1={tipX}
                    y1={tipY}
                    x2={rawCursorRef.current[0]}
                    y2={rawCursorRef.current[1]}
                    stroke="#ff3366"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.85"
                  />
                  <circle
                    cx={rawCursorRef.current[0]}
                    cy={rawCursorRef.current[1]}
                    r="6"
                    fill="none"
                    stroke="#ff3366"
                    strokeWidth="1.5"
                    opacity="0.85"
                  />
                  <circle
                    cx={tipX}
                    cy={tipY}
                    r="3.5"
                    fill="#ff3366"
                    opacity="0.85"
                  />
                </g>
              );
            })()}
          </svg>
        )}

        {sessionPlaybackOverlay.length > 0 && (
          <svg className="drawerator-session-playback-overlay" aria-hidden="true">
            {sessionPlaybackOverlay.flatMap(stroke => (stroke.paths.length ? stroke.paths : [stroke.samples.map(sample => [sample.scene.x, sample.scene.y])]).map((path, index) => {
              const screenPath = path.map(point => mapCanvasToScreen(point[0], point[1]));
              return screenPath.length >= 2 ? (
                <polyline
                  key={`${stroke.id}-${index}`}
                  points={screenPath.map(point => `${point[0]},${point[1]}`).join(" ")}
                  fill="none"
                  stroke={getThemeColor(stroke.strokeColor)}
                  strokeWidth={stroke.strokeWidth * (excalidrawAPI?.getAppState().zoom.value || 1)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null;
            }))}
            {historyShowPointer && sessionPlaybackOverlay.map(stroke => {
              if (!stroke.pointer?.scene) return null;
              const [x, y] = mapCanvasToScreen(stroke.pointer.scene.x, stroke.pointer.scene.y);
              return <g key={`${stroke.id}-pointer`} transform={`translate(${x} ${y})`}><circle r="7" className="drawerator-session-pointer-ring"/><circle r="2.5" className="drawerator-session-pointer-core"/></g>;
            })}
          </svg>
        )}

        {renderGlobalModifiersOverlay()}
        {renderIannixOverlay()}
        {renderBezierEditorOverlay()}
      </div>

      {dockPreview && (
        <div className={`panel-dock-preview panel-dock-preview-${dockPreview}`} aria-hidden="true" />
      )}

      {/* Command Palette Overlay */}
      {showCommandPalette && (
        <div className={`excalidraw theme--${theme}`}>
          <div id="command-palette-overlay" onClick={() => setShowCommandPalette(false)}>
            <div className="command-palette-card" onClick={(e) => e.stopPropagation()}>
              <div className="command-palette-header">
                <input
                  ref={paletteInputRef}
                  id="command-palette-input"
                  type="text"
                  value={commandSearch}
                  onChange={(e) => {
                    setCommandSearch(e.target.value);
                    setSelectedIndex(0);
                  }}
                  placeholder="Type a command or ask AI (e.g. 'draw a flow chart')..."
                  onKeyDown={(e) => {
                    const filtered = getFilteredCommands();
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setSelectedIndex(prev => (prev + 1) % filtered.length);
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setSelectedIndex(prev => (prev - 1 + filtered.length) % filtered.length);
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      const slashInvocation = parseSlashInvocation(commandSearch);
                      if (slashInvocation?.error) {
                        setSceneExchangeStatus(slashInvocation.error);
                      } else if (slashInvocation?.command) {
                        executeCommand(slashInvocation.command, slashInvocation.args, "slash");
                      } else if (filtered[selectedIndex]) {
                        executeCommand(filtered[selectedIndex]);
                      }
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setShowCommandPalette(false);
                    }
                  }}
                />
              </div>
              <div className="command-palette-results">
                {getFilteredCommands().map((cmd, idx) => (
                  <div
                    key={cmd.id}
                    className={`command-palette-item ${idx === selectedIndex ? "active" : ""}`}
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span className="command-name">{cmd.name}</span>
                      <span className="command-category">{cmd.category}</span>
                    </div>
                    {cmd.id === "ask-ai" && (
                      <span className="command-badge">AI Query</span>
                    )}
                  </div>
                ))}
                {getFilteredCommands().length === 0 && (
                  <div className="command-palette-empty">No matching commands found</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {satoriMode && (
        <button 
          id="btn-exit-satori" 
          onClick={() => setSatoriMode(false)} 
          title="Exit Satori Mode"
        >
          .
        </button>
      )}

      {/* Custom Right-Click Context Menu */}
      {customContextMenu && (
        <div 
          className="custom-floating-context-menu"
          style={{
            left: `${customContextMenu.x}px`,
            top: `${customContextMenu.y}px`
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {customContextMenu.showRestore && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleRestoreOriginalStroke();
                setCustomContextMenu(null);
              }}
              className="custom-floating-context-menu-btn"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              Restore Original Stroke
            </button>
          )}
          {customContextMenu.showToLine && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleConvertType("line");
                setCustomContextMenu(null);
              }}
              className="custom-floating-context-menu-btn"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
              </svg>
              Convert to Line
            </button>
          )}
          {customContextMenu.showToFreehand && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleConvertType("freedraw");
                setCustomContextMenu(null);
              }}
              className="custom-floating-context-menu-btn"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.24 9.12l-8.62 8.62a1 1 0 01-1.41 0l-2.01-2.01a1 1 0 010-1.41l8.62-8.62m3.42 3.42l1.58-1.58a2.5 2.5 0 00-3.54-3.54l-1.58 1.58m3.54 3.54M3 21c3-3 7-1 10-4" />
              </svg>
              Convert to Freehand Pencil
            </button>
          )}
          {customContextMenu.showToSpline && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                convertSelectedToBezier();
                setCustomContextMenu(null);
              }}
              className="custom-floating-context-menu-btn"
              title="Convert selected paths to a canonical cubic spline"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 17c4-8 6-8 10-2s6 6 6-8" />
              </svg>
              Convert to Spline
            </button>
          )}
          {customContextMenu.showFromSpline && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                convertSelectedFromBezier();
                setCustomContextMenu(null);
              }}
              className="custom-floating-context-menu-btn"
              title="Convert selected splines back to native Excalidraw paths"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7c4 8 6 8 10 2s6-6 6 8" />
              </svg>
              Convert from Spline
            </button>
          )}

          {customContextMenu.showAddCursor && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void commandRegistry.execute("iannix.cursor.addToSelectedCurves", {}, { source: "context-menu", record: true });
                setCustomContextMenu(null);
              }}
              className="custom-floating-context-menu-btn"
              title="Mark selected paths as curves and attach perpendicular runtime cursors"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
                <circle cx="12" cy="12" r="3" />
                <path strokeLinecap="round" d="M12 2v5M12 17v5M2 12h5M17 12h5" />
              </svg>
              Add Cursor to Selected Curves
            </button>
          )}

          {/* Separator and Curve Operations */}
          <div className="custom-floating-context-menu-separator" />
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSimplifyStroke("rdp");
              setCustomContextMenu(null);
            }}
            className="custom-floating-context-menu-btn"
            title="Simplify the path coordinates using the Ramer-Douglas-Peucker (RDP) algorithm"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 20l4-12 6 8 6-12" />
            </svg>
            Simplify Path (RDP)
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSimplifyStroke("vw");
              setCustomContextMenu(null);
            }}
            className="custom-floating-context-menu-btn"
            title="Simplify the path coordinates using the Visvalingam-Whyatt (VW) area-based algorithm"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12l6-8 6 12 4-4" />
            </svg>
            Simplify Path (VW)
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSimplifyStroke("smooth");
              setCustomContextMenu(null);
            }}
            className="custom-floating-context-menu-btn"
            title="Smooth the path coordinates using a Laplacian moving-average filter without changing point density"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12c2.5-6 5.5-6 8 0s5.5 6 8 0" />
            </svg>
            Smooth Path (Laplacian)
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSimplifyStroke("taubin");
              setCustomContextMenu(null);
            }}
            className="custom-floating-context-menu-btn"
            title="Smooth the path coordinates using the Taubin algorithm to prevent shrinkage"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
            Smooth Path (Taubin)
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSimplifyStroke("resample");
              setCustomContextMenu(null);
            }}
            className="custom-floating-context-menu-btn"
            title="Space the path vertices at exactly equal distances along the curve"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            Resample Uniformly
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSimplifyStroke("close");
              setCustomContextMenu(null);
            }}
            className="custom-floating-context-menu-btn"
            title="Close the path by connecting start and end points, and smooth the joint"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4z" />
            </svg>
            Close & Smooth Joint
          </button>
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSimplifyStroke("snap");
              setCustomContextMenu(null);
            }}
            className="custom-floating-context-menu-btn"
            title="Snap all points of the selected curve individually to the nearest grid intersection"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: "8px" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18" />
            </svg>
            Snap Points to Grid
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
