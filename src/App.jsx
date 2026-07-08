// Force rebuild timestamp: 2026-07-06T11:15:00
import React, { useState, useEffect, useRef } from "react";
import { Excalidraw, Sidebar, MainMenu, WelcomeScreen, exportToSvg, exportToCanvas, viewportCoordsToSceneCoords, sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import "./App.css";

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

Guidelines:
- All shapes should be sized logically (typical screen coords range from 0 to 1000).
- If the user selected a shape or path, you will receive its coordinates in the context. Use this context to duplicate, resize, move, or offset the shape.
- To move a shape, you can erase the old id using <erase id="[id]"/> and redraw it at the new coordinates!
- Keep your conversational text responses extremely concise and to the point.
`;

const INITIAL_GREETING = "Hello! I am your drawing assistant powered by local AI. You can write prompts like \"draw a flow chart\", \"sketch a house\", or \"clear the canvas\" and I will execute the drawing tools programmatically!";

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

const PRESET_BRUSHES = {
  simple: {
    id: "simple",
    name: "Simple Line",
    code: `(points) => {
  return [points];
}`
  },
  hairy: {
    id: "hairy",
    name: "Hairy Brush (Calligraphy)",
    code: `// @param hairLength = 20 (5..100, step: 1)
// @param spacing = 2 (1..10, step: 1)
(points) => {
  const lines = [];
  // 1. Draw the primary line
  lines.push(points);
  
  // 2. Draw perpendicular hatching strokes along the path
  for (let i = 1; i < points.length; i += spacing) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
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
(points) => {
  const lines = [];
  if (points.length < 2) return lines;
  
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
(points) => {
  const lines = [];
  if (points.length < 2) return lines;
  
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
  simplify: {
    id: "simplify",
    name: "Simplify Brush (RDP)",
    code: `// @param epsilon = 3.0 (0.5..15, step: 0.1)
(points) => {
  if (points.length <= 2) return [points];
  
  function getOrthogonalDistance(p, lineStart, lineEnd) {
    const x = p[0], y = p[1];
    const x1 = lineStart[0], y1 = lineStart[1];
    const x2 = lineEnd[0], y2 = lineEnd[1];
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const den = Math.sqrt(dx * dx + dy * dy);
    return den === 0 ? Math.sqrt((x - x1) ** 2 + (y - y1) ** 2) : Math.abs(dx * (y1 - y) - (x1 - x) * dy) / den;
  }
  
  function simplifyRDP(pts, eps) {
    if (pts.length <= 2) return pts;
    let dmax = 0;
    let index = 0;
    const end = pts.length - 1;
    
    for (let i = 1; i < end; i++) {
      const d = getOrthogonalDistance(pts[i], pts[0], pts[end]);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }
    
    if (dmax > eps) {
      const results1 = simplifyRDP(pts.slice(0, index + 1), eps);
      const results2 = simplifyRDP(pts.slice(index), eps);
      const combined = results1.slice(0, results1.length - 1).concat(results2);
      return combined;
    } else {
      const pStart = pts[0];
      const pEnd = pts[end];
      
      const startPt = [pStart[0], pStart[1]];
      if (pStart.pressure !== undefined) startPt.pressure = pStart.pressure;
      if (pStart.time !== undefined) startPt.time = pStart.time;
      if (pStart.strokeTime !== undefined) startPt.strokeTime = pStart.strokeTime;
      if (pStart.speed !== undefined) startPt.speed = pStart.speed;
      
      const endPt = [pEnd[0], pEnd[1]];
      if (pEnd.pressure !== undefined) endPt.pressure = pEnd.pressure;
      if (pEnd.time !== undefined) endPt.time = pEnd.time;
      if (pEnd.strokeTime !== undefined) endPt.strokeTime = pEnd.strokeTime;
      if (pEnd.speed !== undefined) endPt.speed = pEnd.speed;
      
      return [startPt, endPt];
    }
  }

  const simplified = simplifyRDP(points, epsilon);
  return [simplified];
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
  
  const startX = newAbsolutePoints[0][0];
  const startY = newAbsolutePoints[0][1];

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

  return {
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
};

const parseParameters = (code) => {
  if (!code) return [];
  const params = [];
  const lines = code.split("\n");
  for (const line of lines) {
    const m = /^\s*\/\/\s*@param\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([0-9.-]+)(?:\s*\(([^)]+)\))?/.exec(line);
    if (m) {
      const name = m[1];
      const defaultValue = parseFloat(m[2]);
      let min = defaultValue < 0 ? defaultValue * 2 : 0;
      let max = defaultValue > 0 ? defaultValue * 2 : 100;
      if (min === max) { min = 0; max = 100; }
      let step = defaultValue % 1 === 0 ? 1 : 0.01;
      
      const rangeStr = m[3];
      if (rangeStr) {
        const rangeMatch = /([0-9.-]+)\s*\.\.\s*([0-9.-]+)/.exec(rangeStr);
        if (rangeMatch) {
          min = parseFloat(rangeMatch[1]);
          max = parseFloat(rangeMatch[2]);
        }
        const stepMatch = /step\s*:\s*([0-9.-]+)/.exec(rangeStr);
        if (stepMatch) {
          step = parseFloat(stepMatch[1]);
        }
      }
      
      params.push({
        name,
        default: defaultValue,
        min,
        max,
        step,
        value: defaultValue
      });
    }
  }
  return params;
};

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
  const [theme, setTheme] = useState(() => localStorage.getItem("drawerator_theme") || "dark");
  const [sidebarDocked, setSidebarDocked] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
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
  const [sidebarTab, setSidebarTab] = useState("brush"); // "brush" or "modifiers"
  const [selectedElementIds, setSelectedElementIds] = useState({});
  const [panelPos, setPanelPos] = useState({ x: 40, y: 150 }); // Left side by default
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showContextDropdown, setShowContextDropdown] = useState(false);
  const [contextMenuTab, setContextMenuTab] = useState("main");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteSearch, setAutocompleteSearch] = useState("");
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("drawerator_sidebar_width");
    return saved ? parseInt(saved, 10) : 380;
  });  const [brushPalette, setBrushPalette] = useState(() => {
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
      { id: "simple", name: "Simple Line", code: PRESET_BRUSHES.simple.code, isPreset: true },
      { id: "hairy", name: "Hairy Brush (Calligraphy)", code: PRESET_BRUSHES.hairy.code, isPreset: true },
      { id: "pressure", name: "Calligraphy Pencil (Pressure-Sensitive)", code: PRESET_BRUSHES.pressure.code, isPreset: true },
      { id: "ribbon", name: "Ribbon Brush (Double Track)", code: PRESET_BRUSHES.ribbon.code, isPreset: true },
      { id: "sketchy", name: "Sketchy Multi-line", code: PRESET_BRUSHES.sketchy.code, isPreset: true },
      { id: "walking", name: "Walking Brush (Time-Oscillated)", code: PRESET_BRUSHES.walking.code, isPreset: true },
      { id: "rake", name: "Rake Brush (Variable Teeth)", code: PRESET_BRUSHES.rake.code, isPreset: true },
      { id: "simplify", name: "Simplify Brush (RDP)", code: PRESET_BRUSHES.simplify.code, isPreset: true }
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
        palette[idx] = { ...palette[idx], code: preset.code, name: preset.name, isPreset: true };
      }
    });

    return palette;
  });

  const [activeBrushId, setActiveBrushId] = useState(() => {
    return localStorage.getItem("drawerator_active_brush_id") || "normal";
  });

  const [activeBrushCode, setActiveBrushCode] = useState(() => {
    const id = localStorage.getItem("drawerator_active_brush_id") || "normal";
    if (id === "normal") return "";
    
    const savedPalette = localStorage.getItem("drawerator_brush_palette");
    let currentPalette = [];
    if (savedPalette) {
      try { currentPalette = JSON.parse(savedPalette); } catch (e) {}
    }
    
    const defaultPresets = [
      { id: "simple", name: "Simple Line", code: PRESET_BRUSHES.simple.code, isPreset: true },
      { id: "hairy", name: "Hairy Brush (Calligraphy)", code: PRESET_BRUSHES.hairy.code, isPreset: true },
      { id: "pressure", name: "Calligraphy Pencil (Pressure-Sensitive)", code: PRESET_BRUSHES.pressure.code, isPreset: true },
      { id: "ribbon", name: "Ribbon Brush (Double Track)", code: PRESET_BRUSHES.ribbon.code, isPreset: true },
      { id: "sketchy", name: "Sketchy Multi-line", code: PRESET_BRUSHES.sketchy.code, isPreset: true },
      { id: "walking", name: "Walking Brush (Time-Oscillated)", code: PRESET_BRUSHES.walking.code, isPreset: true },
      { id: "rake", name: "Rake Brush (Variable Teeth)", code: PRESET_BRUSHES.rake.code, isPreset: true },
      { id: "simplify", name: "Simplify Brush (RDP)", code: PRESET_BRUSHES.simplify.code, isPreset: true }
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
  const compiledGeneratorRef = useRef(null);
  const processedModifierVersionsRef = useRef({});
  const evaluatingModifiersRef = useRef(false);
  const [brushSidebarDocked, setBrushSidebarDocked] = useState(false);

  useEffect(() => {
    localStorage.setItem("drawerator_brush_palette", JSON.stringify(brushPalette));
  }, [brushPalette]);

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
    setBrushParams(prev => {
      return parsed.map(newParam => {
        const existing = prev.find(p => p.name === newParam.name);
        if (existing) {
          return { ...newParam, value: existing.value };
        }
        return newParam;
      });
    });
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
    alert("Changes saved successfully!");
  };

  const saveBrushCopy = () => {
    const brush = brushPalette.find(b => b.id === activeBrushId) || {};
    const defaultName = brush.name ? `Copy of ${brush.name.split(" (")[0]}` : "My Custom Brush";
    const name = window.prompt("Enter name for the new brush:", defaultName);
    if (!name || !name.trim()) return;
    
    const newId = `custom-${Date.now()}`;
    const finalCode = updateCodeWithParamValues(activeBrushCode, brushParams);
    const newBrush = {
      id: newId,
      name: name.trim(),
      code: finalCode,
      isPreset: false
    };
    
    setBrushPalette(prev => [...prev, newBrush]);
    setActiveBrushId(newId);
    setActiveBrushCode(finalCode);
    setCustomBrushActive(true);
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

  const [customBrushActive, setCustomBrushActive] = useState(false);
  const [customBrushRoundness, setCustomBrushRoundness] = useState(() => localStorage.getItem("drawerator_custom_brush_roundness") !== "false");
  
  useEffect(() => {
    localStorage.setItem("drawerator_custom_brush_roundness", customBrushRoundness);
  }, [customBrushRoundness]);
  const [showBrushMenu, setShowBrushMenu] = useState(false);
  const [customContextMenu, setCustomContextMenu] = useState(null);

  useEffect(() => {
    const closeMenu = () => setCustomContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("pointerdown", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("pointerdown", closeMenu);
    };
  }, []);

  const [drawingPoints, setDrawingPoints] = useState([]);
  const [shiftHeld, setShiftHeld] = useState(false);
  const isDrawingRef = useRef(false);
  const livePointsRef = useRef([]);
  const rawCursorRef = useRef(null);
  const wasShiftHeldRef = useRef(false);
  const strokeStartTimeRef = useRef(0);
  const lastStrokeColorRef = useRef("#000000");

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

  const getCanvasCoords = (clientX, clientY) => {
    if (!excalidrawAPI) return [clientX, clientY];
    const appState = excalidrawAPI.getAppState();
    const res = viewportCoordsToSceneCoords({ clientX, clientY }, appState);
    if (appState.gridSize) {
      const x = Math.round(res.x / appState.gridSize) * appState.gridSize;
      const y = Math.round(res.y / appState.gridSize) * appState.gridSize;
      return [x, y];
    }
    return [res.x, res.y];
  };

  const mapCanvasToScreen = (cx, cy) => {
    if (!excalidrawAPI) return [cx, cy];
    const appState = excalidrawAPI.getAppState();
    const res = sceneCoordsToViewportCoords({ sceneX: cx, sceneY: cy }, appState);
    return [res.x, res.y];
  };

  const handleCanvasPointerDown = (e) => {
    if (!excalidrawAPI || !customBrushActive || activeBrushId === "normal") return;
    if (e.button !== 0) return;

    const targetElement = e.target;
    if (
      targetElement.tagName === "INPUT" ||
      targetElement.tagName === "TEXTAREA" ||
      targetElement.tagName === "SELECT" ||
      targetElement.tagName === "BUTTON" ||
      targetElement.closest("button") ||
      targetElement.closest("input") ||
      targetElement.closest("textarea") ||
      targetElement.closest(".sidebar") ||
      targetElement.closest(".excalidraw-sidebar") ||
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

    const appState = excalidrawAPI.getAppState();
    if (appState.currentItemStrokeColor && appState.currentItemStrokeColor !== "transparent") {
      lastStrokeColorRef.current = appState.currentItemStrokeColor;
    }

    isDrawingRef.current = true;
    const coords = getCanvasCoords(e.clientX, e.clientY);
    coords.time = Date.now();
    strokeStartTimeRef.current = coords.time;
    coords.strokeTime = 0;
    coords.pressure = e.pressure !== undefined ? e.pressure : 0.5;
    coords.speed = 0;
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
    if (!isDrawingRef.current) return;
    if (e.buttons !== 1) {
      isDrawingRef.current = false;
      rawCursorRef.current = null;
      setShiftHeld(false);
      setDrawingPoints([]);
      return;
    }

    setShiftHeld(e.shiftKey);
    if (e.shiftKey) {
      wasShiftHeldRef.current = true;
    }
    rawCursorRef.current = [e.clientX, e.clientY];

    const targetCoords = getCanvasCoords(e.clientX, e.clientY);
    let coords = targetCoords;
    
    // Stabilizer (Exponential Moving Average / Lazy Mouse) when holding Shift
    if (e.shiftKey && livePointsRef.current.length > 0) {
      const lastPoint = livePointsRef.current[livePointsRef.current.length - 1];
      const betaParam = brushParams.find(p => p.name === "stabilizerDamping");
      const beta = betaParam ? betaParam.value : defaultStabilizerDamping; // Damping factor: lower is smoother / slower follow
      
      let x = lastPoint[0] + (targetCoords[0] - lastPoint[0]) * beta;
      let y = lastPoint[1] + (targetCoords[1] - lastPoint[1]) * beta;

      // Magnetic Grid Snapping for Stabilizer
      const appState = excalidrawAPI?.getAppState();
      if (appState && appState.gridSize) {
        const gridSize = appState.gridSize;
        const snapThreshold = gridSize * 0.45; // Max snapping reach
        
        // Snap X
        const xSnapped = Math.round(x / gridSize) * gridSize;
        const dx = Math.abs(x - xSnapped);
        if (dx < snapThreshold) {
          const t = 1 - (dx / snapThreshold);
          const weight = t * t; // Sticky snap curve
          x = x + (xSnapped - x) * weight;
        }
        
        // Snap Y
        const ySnapped = Math.round(y / gridSize) * gridSize;
        const dy = Math.abs(y - ySnapped);
        if (dy < snapThreshold) {
          const t = 1 - (dy / snapThreshold);
          const weight = t * t; // Sticky snap curve
          y = y + (ySnapped - y) * weight;
        }
      }
      
      coords = [x, y];
    }

    coords.time = Date.now();
    coords.strokeTime = coords.time - (strokeStartTimeRef.current || coords.time);
    coords.pressure = e.pressure !== undefined ? e.pressure : 0.5;
    
    let speed = 0;
    if (livePointsRef.current.length > 0) {
      const prev = livePointsRef.current[livePointsRef.current.length - 1];
      const dx = coords[0] - prev[0];
      const dy = coords[1] - prev[1];
      const dt = coords.time - (prev.time || coords.time);
      const dist = Math.sqrt(dx * dx + dy * dy);
      speed = dt > 0 ? dist / dt : 0;
    }
    coords.speed = speed;

    livePointsRef.current.push(coords);
    setDrawingPoints([...livePointsRef.current]);
  };

  const getBrushGlobals = () => {
    if (!excalidrawAPI) return {};
    const appState = excalidrawAPI.getAppState() || {};
    return {
      gridSize: appState.gridSize || null,
      strokeColor: lastStrokeColorRef.current || "#000000",
      strokeWidth: appState.currentItemStrokeWidth || 2,
      opacity: appState.currentItemOpacity ?? 100,
      zoom: appState.zoom ? appState.zoom.value : 1,
      theme: theme,
      viewBackgroundColor: appState.viewBackgroundColor || (theme === "dark" ? "#121212" : "#ffffff")
    };
  };

  const getLivePreviewPaths = () => {
    if (!customBrushActive || activeBrushId === "normal" || drawingPoints.length < 2) return [];
    const generator = compiledGeneratorRef.current;
    if (!generator) return [];
    try {
      return generator(drawingPoints, getBrushGlobals());
    } catch (e) {
      return [];
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

  const handleSidebarResizeMouseDown = (e) => {
    e.preventDefault();
    const handleMouseMove = (moveEvent) => {
      const newWidth = Math.max(280, Math.min(800, window.innerWidth - moveEvent.clientX));
      setSidebarWidth(newWidth);
      localStorage.setItem("drawerator_sidebar_width", newWidth);
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };
  
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
      
      // Find starting coordinate
      const [startX, startY] = linePoints[0];
      const relativePoints = linePoints.map(([lx, ly]) => [
        lx - startX,
        ly - startY
      ]);

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

    const defaultParams = {};
    const brush = brushPalette.find(b => b.id === activeBrushId);
    if (brush && brush.code) {
      const lines = brush.code.split("\n");
      lines.forEach(line => {
        const match = line.match(/\/\/\s*@param\s+(\w+)\s*=\s*([0-9.-]+)/);
        if (match) {
          defaultParams[match[1]] = parseFloat(match[2]);
        }
      });
    }

    const newMod = {
      id: "custom-" + activeBrushId,
      name: brush ? brush.name : "Custom Brush",
      enabled: true,
      params: defaultParams
    };

    for (const el of selectedStrokeElements) {
      const currentMods = el.customData?.modifiers || [];
      const updatedMods = [...currentMods, newMod];
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
        if ((el.type === "freedraw" || el.type === "line") && el.type !== targetType) {
          count++;
          const nextColor = (el.strokeColor === "transparent" || !el.strokeColor) ? lastStrokeColorRef.current : el.strokeColor;
          return {
            ...el,
            type: targetType,
            strokeColor: nextColor,
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
          
          const absolutePoints = el.points.map((p) => {
            const absPt = [el.x + p[0], el.y + p[1]];
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
            const gridSize = appState.gridSize || 20;
            simplifiedAbs = absolutePoints.map((p) => {
              const sx = Math.round(p[0] / gridSize) * gridSize;
              const sy = Math.round(p[1] / gridSize) * gridSize;
              const snappedPt = [sx, sy];
              if (p.pressure !== undefined) snappedPt.pressure = p.pressure;
              if (p.time !== undefined) snappedPt.time = p.time;
              if (p.strokeTime !== undefined) snappedPt.strokeTime = p.strokeTime;
              if (p.speed !== undefined) snappedPt.speed = p.speed;
              return snappedPt;
            });
          }

          return updateElementGeometry(el, simplifiedAbs);
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

      setCustomContextMenu({
        x: e.clientX,
        y: e.clientY,
        showRestore: hasBrush,
        showToLine: hasFreehand,
        showToFreehand: hasLine
      });
    } else {
      setCustomContextMenu(null);
    }
  };

  const evaluateModifierStack = (originalPoints, modifiers, globals) => {
    let currentPoints = originalPoints.map(p => {
      const copy = [p[0], p[1]];
      if (p.pressure !== undefined) copy.pressure = p.pressure;
      if (p.time !== undefined) copy.time = p.time;
      if (p.strokeTime !== undefined) copy.strokeTime = p.strokeTime;
      if (p.speed !== undefined) copy.speed = p.speed;
      return copy;
    });
    
    let generatedLines = [currentPoints];

    for (const mod of modifiers) {
      if (!mod.enabled) continue;

      try {
        if (mod.id === "rdp") {
          const epsilon = mod.params?.epsilon ?? 3.0;
          currentPoints = simplifyRDP(currentPoints, epsilon);
          generatedLines = [currentPoints];
        } else if (mod.id === "smooth") {
          const iterations = mod.params?.iterations ?? 10;
          const weight = mod.params?.weight ?? 0.4;
          currentPoints = smoothPathTaubin(currentPoints, weight, -0.53, iterations, false);
          generatedLines = [currentPoints];
        } else if (mod.id === "hobby") {
          const tension = mod.params?.tension ?? 1.0;
          currentPoints = solveHobbySpline(currentPoints, tension);
          generatedLines = [currentPoints];
        } else if (mod.id === "snap") {
          const size = globals.gridSize || 20;
          currentPoints = currentPoints.map(p => {
            const sx = Math.round(p[0] / size) * size;
            const sy = Math.round(p[1] / size) * size;
            const copy = [sx, sy];
            if (p.pressure !== undefined) copy.pressure = p.pressure;
            if (p.time !== undefined) copy.time = p.time;
            if (p.strokeTime !== undefined) copy.strokeTime = p.strokeTime;
            if (p.speed !== undefined) copy.speed = p.speed;
            return copy;
          });
          generatedLines = [currentPoints];
        } else if (mod.id.startsWith("custom-")) {
          const brushId = mod.id.replace("custom-", "");
          const brush = brushPalette.find(b => b.id === brushId);
          if (brush) {
            const params = [];
            if (brush.code) {
              const lines = brush.code.split("\n");
              lines.forEach(line => {
                const match = line.match(/\/\/\s*@param\s+(\w+)\s*=\s*([0-9.-]+)\s*\(([^)]+)\)/);
                if (match) {
                  const pName = match[1];
                  const pVal = mod.params && mod.params[pName] !== undefined ? mod.params[pName] : parseFloat(match[2]);
                  params.push({ name: pName, value: pVal });
                }
              });
            }
            const processedCode = updateCodeWithParamValues(brush.code, params);
            const { generator } = compileUserBrush(processedCode, params);
            if (generator) {
              const res = generator(currentPoints, globals);
              if (Array.isArray(res) && res.length > 0) {
                generatedLines = res;
                currentPoints = res[0] || currentPoints;
              }
            }
          }
        }
      } catch (err) {
        console.error("Modifier execution error:", mod.id, err);
      }
    }

    return { primaryPoints: currentPoints, allLines: generatedLines };
  };

  const updateModifiedElementInScene = (elId, newModifiers, forceOriginalPoints = null) => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    const parentEl = elements.find(el => el.id === elId);
    if (!parentEl) return;

    let originalPoints = forceOriginalPoints || parentEl.customData?.originalPoints;
    if (!originalPoints || originalPoints.length === 0) {
      originalPoints = parentEl.points.map(p => {
        const absPt = [parentEl.x + p[0], parentEl.y + p[1]];
        if (p.pressure !== undefined) absPt.pressure = p.pressure;
        if (p.time !== undefined) absPt.time = p.time;
        if (p.strokeTime !== undefined) absPt.strokeTime = p.strokeTime;
        if (p.speed !== undefined) absPt.speed = p.speed;
        return absPt;
      });
    }

    const globals = getBrushGlobals();
    const { primaryPoints, allLines } = evaluateModifierStack(originalPoints, newModifiers, globals);

    const updatedParent = updateElementGeometry(parentEl, primaryPoints);
    updatedParent.customData = {
      ...(parentEl.customData || {}),
      originalPoints: originalPoints,
      modifiers: newModifiers,
      version: (parentEl.customData?.version || 0) + 1
    };

    processedModifierVersionsRef.current[parentEl.id] = updatedParent.customData.version;

    const nextElements = elements.map(el => {
      if (el.id === parentEl.id) {
        return updatedParent;
      }
      if (el.customData?.parentId === parentEl.id && el.customData?.isModifierGenerated) {
        return { ...el, isDeleted: true };
      }
      return el;
    });

    evaluatingModifiersRef.current = true;
    try {
      excalidrawAPI.updateScene({
        elements: nextElements,
        commitToHistory: true
      });
    } finally {
      evaluatingModifiersRef.current = false;
    }
  };

  const handleCanvasPointerUp = (e) => {
    if (!isDrawingRef.current) {
      rawCursorRef.current = null;
      setShiftHeld(false);
      return;
    }
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

    if (!excalidrawAPI || !customBrushActive || activeBrushId === "normal") {
      setDrawingPoints([]);
      return;
    }

    // Restore the real stroke color in Excalidraw appState
    excalidrawAPI.updateScene({
      appState: {
        currentItemStrokeColor: lastStrokeColorRef.current
      }
    });

    // Wait a brief tick for Excalidraw to finish writing the element
    setTimeout(() => {
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

          const defaultParams = {};
          const brush = brushPalette.find(b => b.id === activeBrushId);
          if (brush && brush.code) {
            const lines = brush.code.split("\n");
            lines.forEach(line => {
              const match = line.match(/\/\/\s*@param\s+(\w+)\s*=\s*([0-9.-]+)/);
              if (match) {
                defaultParams[match[1]] = parseFloat(match[2]);
              }
            });
          }

          const initialMod = {
            id: "custom-" + activeBrushId,
            name: brush ? brush.name : "Custom Brush",
            enabled: true,
            params: defaultParams
          };

          const pointsToUse = (livePointsRef.current && livePointsRef.current.length >= 2)
            ? [...livePointsRef.current]
            : lastElement.points.map(p => [lastElement.x + p[0], lastElement.y + p[1]]);

          updateModifiedElementInScene(lastElement.id, [initialMod], pointsToUse);
        }
      } catch (err) {
        console.error("Error processing custom brush as modifier:", err);
      } finally {
        setDrawingPoints([]);
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

  // Sync initial sidebar open state once excalidrawAPI is loaded
  useEffect(() => {
    if (excalidrawAPI) {
      const appState = excalidrawAPI.getAppState();
      setIsSidebarOpen(appState.activeSidebar === "ai-sidebar");
    }
  }, [excalidrawAPI]);

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
    setShowSettings(false);
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

    const messagesPayload = newHistory.map(h => {
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

  // --- COMMAND PALETTE LOGIC ---
  const COMMANDS = [
    { id: "toggle-satori", name: "Toggle Satori Mode (Zen) /satori", category: "View", action: () => setSatoriMode(prev => !prev) },
    { id: "toggle-theme", name: "Toggle Dark/Light Theme", category: "View", action: (api) => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); api?.updateScene({ appState: { theme: next } }); } },
    { id: "toggle-chat", name: "Toggle AI Assistant Chat", category: "AI Chat", action: (api) => api.toggleSidebar({ name: "ai-sidebar" }) },
    { id: "new-chat", name: "Reset Conversation (New Chat)", category: "AI Chat", action: () => clearChat() },
    { id: "copy-transcript", name: "Copy Conversation Transcript", category: "AI Chat", action: () => copyTranscript() },
    { id: "settings", name: "Open Local AI Settings", category: "AI Chat", action: () => setShowSettings(true) },
    { id: "clear-canvas", name: "Clear Sketchboard Canvas", category: "Canvas", action: (api) => api.updateScene({ elements: [] }) },
    { id: "toggle-transparency", name: "Toggle Canvas Background Transparency", category: "Canvas", action: (api) => toggleBackgroundTransparency(api) },
    { id: "reset-view", name: "Reset Zoom & Pan View", category: "Canvas", action: (api) => api.updateScene({ appState: { zoom: { value: 1 }, scrollX: 0, scrollY: 0 } }) },
    { id: "tool-select", name: "Select Pointer/Selection Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "selection", locked: tool.locked ?? false } } }); } },
    { id: "tool-rect", name: "Select Rectangle Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "rectangle", locked: tool.locked ?? false } } }); } },
    { id: "tool-ellipse", name: "Select Ellipse/Circle Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "ellipse", locked: tool.locked ?? false } } }); } },
    { id: "tool-line", name: "Select Straight Line Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "line", locked: tool.locked ?? false } } }); } },
    { id: "tool-freedraw", name: "Select Pencil/Freedraw Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "freedraw", locked: tool.locked ?? false } } }); } },
    { id: "tool-eraser", name: "Select Eraser Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "eraser", locked: tool.locked ?? false } } }); } },
    { id: "tool-hand", name: "Select Hand/Pan Tool", category: "Tools", action: (api) => { const tool = api.getAppState().activeTool || {}; api.updateScene({ appState: { activeTool: { ...tool, type: "hand", locked: tool.locked ?? false } } }); } },
    { id: "restore-original-stroke", name: "Restore Original Stroke (Recover Brush Replacement)", category: "Brushes", action: () => handleRestoreOriginalStroke() },
    { id: "convert-to-line", name: "Convert Selected Strokes to Straight Lines", category: "Brushes", action: () => handleConvertType("line") },
    { id: "convert-to-freedraw", name: "Convert Selected Lines to Freehand Pencil", category: "Brushes", action: () => handleConvertType("freedraw") }
  ];

  const paletteInputRef = useRef(null);
  const lastNonTransparentColorRef = useRef(theme === "dark" ? "#121212" : "#ffffff");

  // Toggle Command Palette on Cmd + / and Satori Mode on Opt + Shift + Z
  useEffect(() => {
    const handleKeyDown = (e) => {
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
      // Opt + Shift + D (Theme toggle)
      if (e.altKey && e.shiftKey && e.code === "KeyD") {
        e.preventDefault();
        e.stopPropagation();
        const nextTheme = theme === "dark" ? "light" : "dark";
        setTheme(nextTheme);
        excalidrawAPI?.updateScene({ appState: { theme: nextTheme } });
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
        setShowSettings(prev => !prev);
      }
      // Ctrl + Option + A (Toggle AI Chat Panel)
      if (e.ctrlKey && e.altKey && e.code === "KeyA") {
        e.preventDefault();
        e.stopPropagation();
        excalidrawAPI?.toggleSidebar({ name: "ai-sidebar" });
      }
      // Ctrl + Option + P (Toggle Custom Brush Panel)
      if (e.ctrlKey && e.altKey && e.code === "KeyP") {
        e.preventDefault();
        e.stopPropagation();
        excalidrawAPI?.toggleSidebar({ name: "brush-sidebar" });
      }

      // Keyboard shortcuts check for non-input focus
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (
        activeEl.tagName === "INPUT" ||
        activeEl.tagName === "TEXTAREA" ||
        activeEl.contentEditable === "true"
      );

      if (!isInputFocused) {
        // Shift + P (Toggle Custom Brush Mode)
        if (e.shiftKey && !e.ctrlKey && !e.altKey && e.code === "KeyP") {
          e.preventDefault();
          e.stopPropagation();
          const nextState = !customBrushActive;
          setCustomBrushActive(nextState);
          if (nextState) {
            if (activeBrushId === "normal") {
              setActiveBrushId("hairy");
            }
            excalidrawAPI?.updateScene({ appState: { activeTool: { type: "freedraw" } } });
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

      // [ and ] shortcuts to increase/decrease stroke width for pen and line
      if ((e.key === "[" || e.key === "]") && excalidrawAPI) {
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
            const currentWidth = appState.currentItemStrokeWidth || 1;
            let newWidth = currentWidth;
            if (e.key === "[") {
              newWidth = Math.max(1, currentWidth - 1);
            } else {
              newWidth = Math.min(20, currentWidth + 1);
            }

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
  }, [theme, excalidrawAPI, customBrushActive, activeBrushId]);

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
        if (instance.device && (instance.device.viewport.isMobile || instance.device.editor.isMobile)) {
          instance.device = {
            ...instance.device,
            viewport: { ...instance.device.viewport, isMobile: false },
            editor: { ...instance.device.editor, isMobile: false }
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
      cmd.category.toLowerCase().includes(query)
    );
    
    if (commandSearch.trim() !== "") {
      matches.unshift({
        id: "ask-ai",
        name: `Ask AI: "${commandSearch}"`,
        category: "AI Query"
      });
    }
    
    return matches;
  };

  const openAISidebar = () => {
    if (!excalidrawAPI) return;
    const appState = excalidrawAPI.getAppState();
    if (appState.activeSidebar !== "ai-sidebar") {
      excalidrawAPI.toggleSidebar({ name: "ai-sidebar" });
    }
  };

  const executeCommand = (cmd) => {
    setShowCommandPalette(false);
    if (cmd.id === "ask-ai") {
      openAISidebar();
      sendChatMessage(commandSearch);
    } else {
      cmd.action(excalidrawAPI);
    }
  };

  const handlePanelDragStart = (e) => {
    if (e.button !== 0) return; // Only left click
    setIsDraggingPanel(true);
    dragStartRef.current = {
      x: e.clientX - panelPos.x,
      y: e.clientY - panelPos.y
    };
    e.preventDefault();
  };

  useEffect(() => {
    if (isDraggingPanel) {
      const handleMouseMove = (e) => {
        setPanelPos({
          x: e.clientX - dragStartRef.current.x,
          y: e.clientY - dragStartRef.current.y
        });
      };
      const handleMouseUp = () => {
        setIsDraggingPanel(false);
      };
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDraggingPanel]);

  const getSelectedElements = () => {
    if (!excalidrawAPI) return [];
    const appState = excalidrawAPI.getAppState();
    const selectedIds = appState.selectedElementIds || {};
    const elements = excalidrawAPI.getSceneElements();
    return elements.filter(el => selectedIds[el.id] && !el.isDeleted);
  };

  const getScriptParams = (code) => {
    const params = [];
    if (!code) return params;
    const lines = code.split("\n");
    lines.forEach(line => {
      const match = line.match(/\/\/\s*@param\s+(\w+)\s*=\s*([0-9.-]+)\s*\(([^)]+)\)/);
      if (match) {
        const pName = match[1];
        const pVal = parseFloat(match[2]);
        const rangeMatch = match[3].match(/([0-9.-]+)\.\.([0-9.-]+)/);
        const min = rangeMatch ? parseFloat(rangeMatch[1]) : 0;
        const max = rangeMatch ? parseFloat(rangeMatch[2]) : 100;
        params.push({ name: pName, default: pVal, min, max });
      }
    });
    return params;
  };

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

  const renderModifiersTab = () => {
    if (!excalidrawAPI) {
      return <div className="modifiers-panel-empty" style={{ textAlign: "center", opacity: 0.6, padding: "20px" }}>Excalidraw is loading...</div>;
    }

    const selectedElements = getSelectedElements();
    if (selectedElements.length !== 1) {
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
            {selectedElements.length === 0 
              ? "Select exactly one object on the canvas to configure its modifier stack."
              : "Modifier stack editing is limited to one selected object at a time."}
          </p>
        </div>
      );
    }

    const element = selectedElements[0];
    const isShape = ["rectangle", "ellipse", "diamond"].includes(element.type);

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
              padding: "8px 16px",
              borderRadius: "6px",
              background: "#6c5ce7",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "13px"
            }}
          >
            Convert to Path
          </button>
        </div>
      );
    }

    const modifiers = element.customData?.modifiers || [];
    const isMuted = !!element.customData?.muteModifiers;

    const handleToggleMute = () => {
      const nextElements = excalidrawAPI.getSceneElements().map(el => {
        if (el.id === element.id) {
          const originalPoints = el.customData?.originalPoints;
          const mute = !isMuted;
          let updatedPoints = el.points;
          
          if (mute && originalPoints) {
            updatedPoints = originalPoints.map(p => {
              const relPt = [p[0] - el.x, p[1] - el.y];
              if (p.pressure !== undefined) relPt.pressure = p.pressure;
              return relPt;
            });
          }
          
          return {
            ...el,
            points: updatedPoints,
            customData: {
              ...(el.customData || {}),
              muteModifiers: mute
            }
          };
        }
        return el;
      });
      excalidrawAPI.updateScene({ elements: nextElements });
      
      if (isMuted) {
        setTimeout(() => {
          updateModifiedElementInScene(element.id, modifiers);
        }, 50);
      }
    };

    const handleToggleHideOriginal = () => {
      const nextElements = excalidrawAPI.getSceneElements().map(el => {
        if (el.id === element.id) {
          const hide = !el.customData?.hideOriginal;
          let savedOpacity = el.customData?.savedOpacity;
          
          if (hide) {
            if (el.opacity > 0) {
              savedOpacity = el.opacity;
            } else if (savedOpacity === undefined) {
              savedOpacity = 100;
            }
          }
          
          const newOpacity = hide ? 0 : (savedOpacity ?? 100);
          
          return {
            ...el,
            opacity: newOpacity,
            customData: {
              ...(el.customData || {}),
              hideOriginal: hide,
              savedOpacity: savedOpacity
            }
          };
        }
        return el;
      });
      
      evaluatingModifiersRef.current = true;
      try {
        excalidrawAPI.updateScene({ elements: nextElements });
      } finally {
        evaluatingModifiersRef.current = false;
      }
      
      setTimeout(() => {
        const updatedParent = excalidrawAPI.getSceneElements().find(el => el.id === element.id);
        if (updatedParent) {
          updateModifiedElementInScene(element.id, updatedParent.customData?.modifiers || []);
        }
      }, 50);
    };

    const handleAddModifier = (type) => {
      let newMod = null;
      if (type === "rdp") {
        newMod = { id: "rdp", name: "Simplify (RDP)", enabled: true, params: { epsilon: 3.0 } };
      } else if (type === "smooth") {
        newMod = { id: "smooth", name: "Laplacian Smooth", enabled: true, params: { iterations: 10, weight: 0.4 } };
      } else if (type === "hobby") {
        newMod = { id: "hobby", name: "Hobby Spline", enabled: true, params: { tension: 1.0 } };
      } else if (type === "snap") {
        newMod = { id: "snap", name: "Snap to Grid", enabled: true, params: {} };
      } else if (type.startsWith("custom-")) {
        const brushId = type.replace("custom-", "");
        const brush = brushPalette.find(b => b.id === brushId);
        if (brush) {
          const defaultParams = {};
          const scriptParams = getScriptParams(brush.code);
          scriptParams.forEach(p => {
            defaultParams[p.name] = p.default;
          });
          newMod = {
            id: type,
            name: `Script: ${brush.name}`,
            enabled: true,
            params: defaultParams
          };
        }
      }

      if (newMod) {
        const updated = [...modifiers, newMod];
        updateModifiedElementInScene(element.id, updated);
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
      updateModifiedElementInScene(element.id, updated);
    };

    const handleToggleModifierEnabled = (modIndex) => {
      const updated = modifiers.map((mod, idx) => {
        if (idx === modIndex) {
          return { ...mod, enabled: !mod.enabled };
        }
        return mod;
      });
      updateModifiedElementInScene(element.id, updated);
    };

    const handleRemoveModifier = (modIndex) => {
      const updated = modifiers.filter((_, idx) => idx !== modIndex);
      updateModifiedElementInScene(element.id, updated);
    };

    const handleMoveModifier = (modIndex, direction) => {
      const newIndex = modIndex + direction;
      if (newIndex < 0 || newIndex >= modifiers.length) return;
      const updated = [...modifiers];
      const temp = updated[modIndex];
      updated[modIndex] = updated[newIndex];
      updated[newIndex] = temp;
      updateModifiedElementInScene(element.id, updated);
    };

    return (
      <div className="modifiers-panel-container" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{
          display: "flex", 
          flexDirection: "column",
          gap: "8px",
          padding: "10px 12px", 
          borderRadius: "8px", 
          background: "var(--color-bg-secondary, #2a2b36)",
          border: "1px solid var(--color-border, #3a3b46)"
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "13px", fontWeight: "bold" }}>Mute Stack (Edit Base)</span>
            <input 
              type="checkbox" 
              checked={isMuted} 
              onChange={handleToggleMute} 
              style={{ width: "16px", height: "16px", cursor: "pointer" }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--color-border-primary, #3a3b46)", paddingTop: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: "bold" }}>Hide Original Path</span>
            <input 
              type="checkbox" 
              checked={!!element.customData?.hideOriginal} 
              onChange={handleToggleHideOriginal} 
              style={{ width: "16px", height: "16px", cursor: "pointer" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label style={{ fontSize: "11px", fontWeight: "bold", opacity: 0.7 }}>ADD MODIFIER</label>
          <select 
            onChange={(e) => {
              if (e.target.value) {
                handleAddModifier(e.target.value);
                e.target.value = "";
              }
            }}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              background: "var(--color-bg-primary, #1e1f29)",
              color: "inherit",
              border: "1px solid var(--color-border, #3a3b46)",
              cursor: "pointer",
              width: "100%"
            }}
          >
            <option value="">-- Choose Modifier to Add --</option>
            <option value="rdp">Simplify (RDP)</option>
            <option value="smooth">Laplacian Smooth</option>
            <option value="hobby">Hobby Spline</option>
            <option value="snap">Snap to Grid</option>
            <optgroup label="Custom Scripts">
              {brushPalette.map(b => (
                <option key={b.id} value={`custom-${b.id}`}>{b.name}</option>
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
                      border: "1px solid var(--color-border, #3a3b46)",
                      borderRadius: "8px",
                      background: "var(--color-bg-secondary, #2a2b36)",
                      padding: "10px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      opacity: mod.enabled ? 1 : 0.6
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "11px", opacity: 0.5, fontWeight: "bold" }}>#{index + 1}</span>
                        <strong style={{ fontSize: "13px" }}>{mod.name}</strong>
                      </div>
                      
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <button
                          onClick={() => handleToggleModifierEnabled(index)}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "4px",
                            color: mod.enabled ? "#6c5ce7" : "inherit",
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
                        borderTop: "1px solid var(--color-border, #3a3b46)",
                        paddingTop: "8px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px"
                      }}>
                        {mod.id === "rdp" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                              <span>Tolerance (epsilon):</span>
                              <strong>{mod.params?.epsilon?.toFixed(1) ?? "3.0"}px</strong>
                            </div>
                            <input 
                              type="range"
                              min="0.5"
                              max="15.0"
                              step="0.1"
                              value={mod.params?.epsilon ?? 3.0}
                              onChange={(e) => handleUpdateModifierParams(index, "epsilon", parseFloat(e.target.value))}
                              style={{ width: "100%", cursor: "pointer" }}
                            />
                          </div>
                        )}

                        {mod.id === "smooth" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                                <span>Iterations:</span>
                                <strong>{mod.params?.iterations ?? 10}</strong>
                              </div>
                              <input 
                                type="range"
                                min="1"
                                max="40"
                                step="1"
                                value={mod.params?.iterations ?? 10}
                                onChange={(e) => handleUpdateModifierParams(index, "iterations", parseInt(e.target.value, 10))}
                                style={{ width: "100%", cursor: "pointer" }}
                              />
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                                <span>Weight:</span>
                                <strong>{mod.params?.weight ?? 0.4}</strong>
                              </div>
                              <input 
                                type="range"
                                min="0.1"
                                max="0.9"
                                step="0.05"
                                value={mod.params?.weight ?? 0.4}
                                onChange={(e) => handleUpdateModifierParams(index, "weight", parseFloat(e.target.value))}
                                style={{ width: "100%", cursor: "pointer" }}
                              />
                            </div>
                          </div>
                        )}

                        {mod.id === "hobby" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                              <span>Tension:</span>
                              <strong>{mod.params?.tension?.toFixed(1) ?? "1.0"}</strong>
                            </div>
                            <input 
                              type="range"
                              min="0.5"
                              max="3.0"
                              step="0.1"
                              value={mod.params?.tension ?? 1.0}
                              onChange={(e) => handleUpdateModifierParams(index, "tension", parseFloat(e.target.value))}
                              style={{ width: "100%", cursor: "pointer" }}
                            />
                          </div>
                        )}

                        {mod.id === "snap" && (
                          <div style={{ fontSize: "11px", opacity: 0.6 }}>
                            Uses active scene grid (or 20px default).
                          </div>
                        )}

                        {mod.id.startsWith("custom-") && (() => {
                          const brushId = mod.id.replace("custom-", "");
                          const brush = brushPalette.find(b => b.id === brushId);
                          if (!brush) return null;
                          const scriptParams = getScriptParams(brush.code);
                          if (scriptParams.length === 0) {
                            return <div style={{ fontSize: "11px", opacity: 0.6 }}>No parameters found.</div>;
                          }
                          return (
                            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              {scriptParams.map(sp => {
                                const val = mod.params && mod.params[sp.name] !== undefined ? mod.params[sp.name] : sp.default;
                                return (
                                  <div key={sp.name} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                                      <span>{sp.name}:</span>
                                      <strong>{val}</strong>
                                    </div>
                                    <input 
                                      type="range"
                                      min={sp.min}
                                      max={sp.max}
                                      step={(sp.max - sp.min) / 100 || 0.1}
                                      value={val}
                                      onChange={(e) => handleUpdateModifierParams(index, sp.name, parseFloat(e.target.value))}
                                      style={{ width: "100%", cursor: "pointer" }}
                                    />
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

        {modifiers.length > 0 && (
          <button
            onClick={() => handleBakeModifiers(element)}
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: "#6c5ce7",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "13px",
              marginTop: "8px",
              transition: "opacity 0.2s"
            }}
            onMouseOver={(e) => e.target.style.opacity = 0.9}
            onMouseOut={(e) => e.target.style.opacity = 1}
          >
            Bake Modifiers (Apply)
          </button>
        )}
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

  const handleBakeModifiers = (parentElement) => {
    if (!excalidrawAPI) return;
    const elements = excalidrawAPI.getSceneElements();
    
    let originalPoints = parentElement.customData?.originalPoints;
    if (!originalPoints || originalPoints.length === 0) return;
    
    const globals = getBrushGlobals();
    const { primaryPoints, allLines } = evaluateModifierStack(originalPoints, parentElement.customData.modifiers, globals);
    
    const updatedParent = updateElementGeometry(parentElement, primaryPoints);
    updatedParent.customData = {
      ...(parentElement.customData || {}),
      originalPoints: null,
      modifiers: [],
      hideOriginal: false,
      version: (parentElement.customData?.version || 0) + 1
    };
    
    if (parentElement.customData?.hideOriginal) {
      updatedParent.opacity = parentElement.customData.savedOpacity ?? 100;
    }
    
    const childElements = [];
    const baseId = parentElement.id;
    const groupId = `${baseId}-baked-group`;
    
    if (allLines.length > 1) {
      const cx = parentElement.x + parentElement.width / 2;
      const cy = parentElement.y + parentElement.height / 2;
      const angle = parentElement.angle || 0;

      for (let idx = 1; idx < allLines.length; idx++) {
        const linePoints = allLines[idx];
        if (!Array.isArray(linePoints) || linePoints.length < 1) continue;

        const rotatedPoints = linePoints.map(p => {
          if (angle !== 0) {
            return rotatePoint(p[0], p[1], cx, cy, angle);
          }
          return [p[0], p[1]];
        });

        const [startX, startY] = rotatedPoints[0];
        const relativePoints = rotatedPoints.map(([rx, ry]) => {
          const relPt = [rx - startX, ry - startY];
          const origPt = linePoints.find(p => p[0] === rx && p[1] === ry) || linePoints[0];
          if (origPt && origPt.pressure !== undefined) relPt.pressure = origPt.pressure;
          return relPt;
        });

        const xCoords = relativePoints.map(p => p[0]);
        const yCoords = relativePoints.map(p => p[1]);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        const minY = Math.min(...yCoords);
        const maxY = Math.max(...yCoords);

        childElements.push({
          type: "line",
          x: startX,
          y: startY,
          points: relativePoints,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
          strokeColor: parentElement.strokeColor,
          strokeWidth: parentElement.strokeWidth,
          backgroundColor: parentElement.backgroundColor,
          fillStyle: parentElement.fillStyle,
          strokeStyle: parentElement.strokeStyle,
          roughness: parentElement.roughness,
          roundness: parentElement.roundness,
          opacity: updatedParent.opacity,
          groupIds: parentElement.groupIds && parentElement.groupIds.length > 0 
            ? [...parentElement.groupIds, groupId] 
            : [groupId],
          id: `${baseId}-baked-${idx}-${Date.now()}`,
          seed: Math.floor(Math.random() * 1000000),
          version: 2,
          versionNonce: Math.floor(Math.random() * 1000000),
          isDeleted: false,
          updated: Date.now(),
          angle: 0,
          boundElements: null,
          link: null,
          locked: parentElement.locked,
          frameId: parentElement.frameId,
          lastCommittedPoint: null,
          startBinding: null,
          endBinding: null
        });
      }
      
      if (updatedParent.groupIds) {
        if (!updatedParent.groupIds.includes(groupId)) {
          updatedParent.groupIds.push(groupId);
        }
      } else {
        updatedParent.groupIds = [groupId];
      }
    }

    const nextElements = elements.map(el => {
      if (el.id === parentElement.id) {
        return updatedParent;
      }
      return el;
    }).concat(childElements);

    excalidrawAPI.updateScene({
      elements: nextElements,
      commitToHistory: true
    });
  };

  const renderGlobalModifiersOverlay = () => {
    if (!excalidrawAPI) return null;
    const elements = excalidrawAPI.getSceneElements();
    
    const modifierElements = elements.filter(el => el.customData?.modifiers && !el.isDeleted);
    if (modifierElements.length === 0) return null;

    const paths = [];

    modifierElements.forEach(parentEl => {
      if (parentEl.customData?.muteModifiers) return;

      const originalPoints = parentEl.customData?.originalPoints;
      if (!originalPoints || originalPoints.length === 0) return;

      const globals = getBrushGlobals();
      const { allLines } = evaluateModifierStack(originalPoints, parentEl.customData.modifiers, globals);
      
      if (allLines.length > 1) {
        const cx = parentEl.x + parentEl.width / 2;
        const cy = parentEl.y + parentEl.height / 2;
        const angle = parentEl.angle || 0;

        for (let idx = 1; idx < allLines.length; idx++) {
          const linePoints = allLines[idx];
          const screenPoints = linePoints.map(p => {
            let rx = p[0];
            let ry = p[1];
            if (angle !== 0) {
              const rotated = rotatePoint(p[0], p[1], cx, cy, angle);
              rx = rotated[0];
              ry = rotated[1];
            }
            return mapCanvasToScreen(rx, ry);
          });

          paths.push({
            points: screenPoints,
            strokeColor: parentEl.strokeColor,
            strokeWidth: parentEl.strokeWidth,
            opacity: parentEl.customData?.hideOriginal 
              ? (parentEl.customData.savedOpacity ?? 100) / 100
              : parentEl.opacity / 100
          });
        }
      }
    });

    if (paths.length === 0) return null;

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
          return (
            <polyline
              key={idx}
              points={pointsString}
              fill="none"
              stroke={p.strokeColor}
              strokeWidth={p.strokeWidth * (excalidrawAPI.getAppState().zoom.value || 1)}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={p.opacity}
              style={theme === "dark" ? { filter: "invert(93%) hue-rotate(180deg)" } : undefined}
            />
          );
        })}
      </svg>
    );
  };

  const renderModifiersPropertiesPanel = () => {
    if (!excalidrawAPI) return null;
    const selectedElements = getSelectedElements();
    if (selectedElements.length === 0) return null;

    const panelStyle = {
      position: "fixed",
      left: `${panelPos.x}px`,
      top: `${panelPos.y}px`,
      zIndex: 9999,
      width: "320px",
      background: theme === "dark" ? "rgba(30, 31, 41, 0.9)" : "rgba(255, 255, 255, 0.95)",
      backdropFilter: "blur(12px)",
      border: "1px solid var(--color-border-primary, #3a3b46)",
      borderRadius: "12px",
      boxShadow: "0 10px 25px rgba(0, 0, 0, 0.25)",
      color: theme === "dark" ? "#fff" : "#121214",
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      borderTop: "3px solid #6c5ce7"
    };

    const headerStyle = {
      padding: "10px 14px",
      background: theme === "dark" ? "#15161e" : "#f1f2f6",
      borderBottom: "1px solid var(--color-border-primary, #3a3b46)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      cursor: isDraggingPanel ? "grabbing" : "grab",
      userSelect: "none"
    };

    const titleStyle = {
      fontSize: "12px",
      fontWeight: "bold",
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      opacity: 0.9,
      display: "flex",
      alignItems: "center",
      gap: "6px"
    };

    const bodyStyle = {
      padding: "16px",
      maxHeight: "420px",
      overflowY: "auto",
      display: panelCollapsed ? "none" : "flex",
      flexDirection: "column",
      gap: "16px"
    };

    return (
      <div style={panelStyle}>
        {/* Header Drag Handle */}
        <div style={headerStyle} onMouseDown={handlePanelDragStart}>
          <div style={titleStyle}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span>Modifiers & Effects</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {/* Collapse / Expand Toggle */}
            <button
              onClick={() => setPanelCollapsed(!panelCollapsed)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px",
                color: "inherit",
                display: "flex",
                alignItems: "center"
              }}
              title={panelCollapsed ? "Expand Panel" : "Collapse Panel"}
            >
              {panelCollapsed ? (
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              ) : (
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={bodyStyle} className="modifiers-panel-body">
          {renderModifiersTab()}
        </div>
      </div>
    );
  };

  const renderBrushConfigForm = () => {
    const activeBrush = brushPalette.find(b => b.id === activeBrushId) || {};
    
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", height: "100%" }}>
        {/* Brush Selector Dropdown */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-primary)", opacity: 0.8 }}>Select Brush Style</label>
          <select
            value={activeBrushId}
            onChange={(e) => {
              const val = e.target.value;
              setActiveBrushId(val);
              if (val !== "normal") {
                setCustomBrushActive(true);
                excalidrawAPI?.updateScene({ appState: { activeTool: { type: "freedraw" } } });
              } else {
                setCustomBrushActive(false);
                excalidrawAPI?.updateScene({ appState: { activeTool: { type: "selection" } } });
              }
            }}
            className="custom-brush-select"
          >
            <option value="normal" style={{ background: "var(--island-bg-color)", color: "var(--color-primary)" }}>Normal Pencil (Default)</option>
            {brushPalette.map((brush) => (
              <option key={brush.id} value={brush.id} style={{ background: "var(--island-bg-color)", color: "var(--color-primary)" }}>
                {brush.name} {brush.isPreset ? "" : "⭐"}
              </option>
            ))}
          </select>
        </div>

        {/* Uniform Parameters Sliders */}
        {activeBrushId !== "normal" && brushParams.length > 0 && (
          <div style={{ 
            display: "flex", 
            flexDirection: "column", 
            gap: "8px", 
            padding: "10px", 
            borderRadius: "6px", 
            border: "1px solid var(--border-color)", 
            background: "var(--input-bg-color, rgba(0, 0, 0, 0.02))",
            marginTop: "2px"
          }}>
            <label style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-primary)", opacity: 0.8 }}>Brush Parameters</label>
            {brushParams.map((param) => (
              <div key={param.name} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <div style={{ display: "flex", width: "100%", justifyContent: "space-between", fontSize: "11px" }}>
                  <span style={{ fontFamily: "monospace", color: "var(--color-primary)" }}>{param.name}</span>
                  <span style={{ color: "var(--color-primary)", opacity: 0.7 }}>{param.value.toFixed(param.step % 1 === 0 ? 0 : 2)}</span>
                </div>
                <input
                  type="range"
                  min={param.min}
                  max={param.max}
                  step={param.step}
                  value={param.value}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setBrushParams(prev => prev.map(p => p.name === param.name ? { ...p, value: val } : p));
                  }}
                  style={{ width: "100%", cursor: "pointer", accentColor: "var(--color-primary)" }}
                />
              </div>
            ))}
          </div>
        )}

        {/* Editor controls if not normal */}
        {activeBrushId !== "normal" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", flexGrow: 1, minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-primary)", opacity: 0.8 }}>
                JS Line Algorithm Code
              </span>
            </div>

            {/* Monospace Code Editor Textarea */}
            <textarea
              value={activeBrushCode}
              onChange={(e) => setActiveBrushCode(e.target.value)}
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
                height: "350px",
                flexGrow: 1,
                outline: "none"
              }}
              spellCheck="false"
            />

            {/* Action buttons row */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "2px" }}>
              {!activeBrush.isPreset && (
                <button
                  onClick={saveBrushChanges}
                  className="palette-action-btn primary"
                  title="Save changes to this custom brush code"
                >
                  Save Changes
                </button>
              )}
              <button
                onClick={saveBrushCopy}
                className="palette-action-btn secondary"
                title="Save this code as a new custom brush copy"
              >
                {activeBrush.isPreset ? "Save a Copy" : "Save Copy"}
              </button>
              {!activeBrush.isPreset && (
                <button
                  onClick={deleteBrush}
                  className="palette-action-btn danger"
                  title="Delete this custom brush"
                >
                  Delete
                </button>
              )}
            </div>

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



        {/* Stroke Selection Actions */}
        <div style={{
          borderTop: "1px solid var(--border-color)",
          paddingTop: "10px",
          marginTop: "4px",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}>
          <label style={{ fontSize: "11px", fontWeight: "600", color: "var(--color-primary)", opacity: 0.8 }}>Selection Utilities</label>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <button
              onClick={handleRestoreOriginalStroke}
              className="palette-action-btn"
              style={{ flexGrow: 1, padding: "6px 8px", fontSize: "11px" }}
              title="Restore selected custom brush strokes back to original pencil lines"
            >
              Restore Original Stroke
            </button>
            <button
              onClick={() => handleConvertType("line")}
              className="palette-action-btn"
              style={{ flexGrow: 1, padding: "6px 8px", fontSize: "11px" }}
              title="Convert selected freehand pencil strokes to straight lines"
            >
              Convert to Line
            </button>
            <button
              onClick={() => handleConvertType("freedraw")}
              className="palette-action-btn"
              style={{ flexGrow: 1, padding: "6px 8px", fontSize: "11px" }}
              title="Convert selected straight lines to freehand pencil strokes"
            >
              Convert to Freehand
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleDockSettingsClick = () => {
    const appState = excalidrawAPI?.getAppState() || {};
    if (appState.activeSidebar === "brush-sidebar") {
      excalidrawAPI.toggleSidebar({ name: "brush-sidebar" });
    } else {
      excalidrawAPI.toggleSidebar({ name: "brush-sidebar" });
      setShowBrushMenu(false);
    }
  };

  return (
    <div 
      id="root" 
      className={`${satoriMode ? "satori-mode" : ""} ${showToolbarHints ? "" : "hide-toolbar-hints"} ${showBottomNotifications ? "" : "hide-bottom-notifications"} ${isSidebarOpen ? "sidebar-open" : ""}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` }}
    >
      {/* Floating top left Theme button next to Excalidraw's hamburger menu */}
      {!satoriMode && !zenMode && (
        <div 
          className={`excalidraw theme--${theme}`} 
          style={{ 
            position: "absolute", 
            left: "68px", 
            top: "15px", 
            zIndex: 5,
            width: "36px",
            height: "36px",
            pointerEvents: "none"
          }}
        >
          <button 
            id="btn-theme-header-left" 
            className="theme-btn-top-left"
            style={{ pointerEvents: "auto" }}
            onClick={() => {
              const nextTheme = theme === "dark" ? "light" : "dark";
              setTheme(nextTheme);
              excalidrawAPI?.updateScene({ appState: { theme: nextTheme } });
            }}
            title="Toggle theme mode"
          >
            {theme === "dark" ? (
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z" />
              </svg>
            ) : (
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>
        </div>
      )}

      <div 
        id="canvas-container" 
        onPointerDownCapture={handleCanvasPointerDown}
        onPointerMoveCapture={handleCanvasPointerMove}
        onPointerUpCapture={handleCanvasPointerUp} 
        onContextMenuCapture={handleCanvasContextMenu}
        style={{ width: "100%", height: "100%", position: "relative" }}
        className={drawingPoints.length > 0 ? "custom-brush-drawing" : ""}
      >
        <Excalidraw 
          theme={theme} 
          excalidrawAPI={(api) => setExcalidrawAPI(api)} 
          getFormFactor={(width, height) => {
            if (forceDesktopLayout) {
              return "desktop";
            }
            return width < 768 ? "phone" : "desktop";
          }}
          initialData={{
            appState: {
              currentItemRoughness: 0
            }
          }}
          onChange={(elements, appState) => {
            applyForceDesktopOverride(false);

            // Sync selected element IDs state to trigger panel re-renders
            const selectedIds = appState.selectedElementIds || {};
            if (JSON.stringify(selectedIds) !== JSON.stringify(selectedElementIds)) {
              setSelectedElementIds(selectedIds);
            }

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

              for (const el of elements) {
                if (el.customData?.modifiers && !el.isDeleted) {
                  if (el.version > (el.customData.excalidrawVersion || 0)) {
                    el.customData.excalidrawVersion = el.version;
                    
                    if (!el.customData.muteModifiers) {
                      needsUpdate = true;
                      targetElId = el.id;
                      targetMods = el.customData.modifiers;
                      
                      if (appState.editingLinearElement && appState.editingLinearElement.elementId === el.id) {
                        targetPoints = el.points.map(p => [el.x + p[0], el.y + p[1]]);
                      }
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
            // Track if AI sidebar or brush sidebar is open
            setIsSidebarOpen(appState.activeSidebar === "ai-sidebar" || appState.activeSidebar === "brush-sidebar");
            
            // Auto activate custom brush if the sidebar is opened
            if (appState.activeSidebar === "brush-sidebar") {
              if (!customBrushActive) {
                setCustomBrushActive(true);
                if (activeBrushId === "normal") {
                  setActiveBrushId("hairy");
                }
              }
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
          renderTopRightUI={() => (
            <div className="drawerator-top-right-wrapper">
              {/* Brush Sidebar Toggle (pencil and scribble icon) */}
              <button 
                id="btn-brush-header"
                className={excalidrawAPI?.getAppState().activeSidebar === "brush-sidebar" ? "active" : ""}
                onClick={() => excalidrawAPI?.toggleSidebar({ name: "brush-sidebar" })}
                title="Toggle Custom Brush Lab"
              >
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.24 9.12l-8.62 8.62a1 1 0 01-1.41 0l-2.01-2.01a1 1 0 010-1.41l8.62-8.62m3.42 3.42l1.58-1.58a2.5 2.5 0 00-3.54-3.54l-1.58 1.58m3.54 3.54l-3.54-3.54 M3 21c3-3 7-1 10-4" />
                </svg>
              </button>

              {/* Chat Toggle (right of library) */}
              <button 
                id="btn-chat-header" 
                onClick={() => excalidrawAPI?.toggleSidebar({ name: "ai-sidebar" })}
                title="Toggle AI panel"
              >
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
            </div>
          )}
        >
          {/* Main Hamburguer Menu */}
          <MainMenu>
            <MainMenu.DefaultItems.ClearCanvas />
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Export />
            <MainMenu.Separator />
            <MainMenu.DefaultItems.ToggleTheme />
            <MainMenu.DefaultItems.ChangeCanvasBackground />
            <MainMenu.Item onSelect={() => {
              setActiveSettingsTab("preferences");
              setShowSettings(true);
            }}>
              Preferences
            </MainMenu.Item>
            <MainMenu.Separator />
            <MainMenu.ItemCustom>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "10px 16px",
                  cursor: "pointer",
                  color: "var(--popup-text-color)",
                  fontSize: "14px",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 0.2s"
                }}
                className="dropdown-menu-item-custom"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <span>Force Desktop Layout</span>
                <input 
                  type="checkbox" 
                  checked={forceDesktopLayout} 
                  onChange={(e) => {
                    setForceDesktopLayout(e.target.checked);
                    localStorage.setItem("drawerator_force_desktop_layout", e.target.checked);
                  }}
                  style={{
                    cursor: "pointer",
                    accentColor: "var(--color-primary)"
                  }}
                />
              </label>
            </MainMenu.ItemCustom>
            <MainMenu.ItemCustom>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "10px 16px",
                  cursor: "pointer",
                  color: "var(--popup-text-color)",
                  fontSize: "14px",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 0.2s"
                }}
                className="dropdown-menu-item-custom"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <span>Show Toolbar Hints</span>
                <input 
                  type="checkbox" 
                  checked={showToolbarHints} 
                  onChange={(e) => {
                    setShowToolbarHints(e.target.checked);
                    localStorage.setItem("drawerator_show_toolbar_hints", e.target.checked);
                  }}
                  style={{
                    cursor: "pointer",
                    accentColor: "var(--color-primary)"
                  }}
                />
              </label>
            </MainMenu.ItemCustom>
            <MainMenu.ItemCustom>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "10px 16px",
                  cursor: "pointer",
                  color: "var(--popup-text-color)",
                  fontSize: "14px",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 0.2s"
                }}
                className="dropdown-menu-item-custom"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <span>Show Bottom Alerts</span>
                <input 
                  type="checkbox" 
                  checked={showBottomNotifications} 
                  onChange={(e) => {
                    setShowBottomNotifications(e.target.checked);
                    localStorage.setItem("drawerator_show_bottom_notifications", e.target.checked);
                  }}
                  style={{
                    cursor: "pointer",
                    accentColor: "var(--color-primary)"
                  }}
                />
              </label>
            </MainMenu.ItemCustom>
            <MainMenu.Separator />
            <MainMenu.Item onSelect={() => excalidrawAPI?.toggleSidebar({ name: "ai-sidebar" })}>
              Toggle AI Assistant
            </MainMenu.Item>
          </MainMenu>

          {/* Welcome Screen brand styling & quick start triggers */}
          <WelcomeScreen>
            <WelcomeScreen.Center>
              <WelcomeScreen.Center.Logo />
              <WelcomeScreen.Center.Heading>Drawerator AI Board</WelcomeScreen.Center.Heading>
              <WelcomeScreen.Center.Menu>
                <WelcomeScreen.Center.MenuItemLoadScene />
                <WelcomeScreen.Center.MenuItemHelp />
                <button 
                  className="header-btn" 
                  onClick={() => excalidrawAPI?.toggleSidebar({ name: "ai-sidebar" })}
                  style={{ width: "100%", padding: "10px", marginTop: "10px", fontSize: "13px", fontWeight: "600", borderRadius: "8px", background: "var(--color-accent)", color: "var(--color-btn-text)", border: "none", cursor: "pointer" }}
                >
                  Open AI Drawing Assistant
                </button>
              </WelcomeScreen.Center.Menu>
            </WelcomeScreen.Center>
          </WelcomeScreen>

          {/* Custom Native Sidebar */}
          <Sidebar name="ai-sidebar" docked={sidebarDocked} onDock={setSidebarDocked}>
            <div 
              className="sidebar-resize-handle"
              onMouseDown={handleSidebarResizeMouseDown}
            />
            <Sidebar.Header>
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", paddingRight: "10px", gap: "10px" }}>
                {/* Model Selector Pill */}
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "4px",
                  background: "var(--button-hover-bg, rgba(0, 0, 0, 0.05))",
                  padding: "4px 8px 4px 6px",
                  borderRadius: "12px",
                  cursor: "pointer",
                  position: "relative",
                  overflow: "hidden"
                }}>
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-secondary)", flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <select 
                    value={aiSettings.model} 
                    onChange={(e) => {
                      const updated = { ...aiSettings, model: e.target.value };
                      setAiSettings(updated);
                      localStorage.setItem("drawerator_ai_settings", JSON.stringify(updated));
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      fontSize: "11px",
                      fontWeight: "600",
                      color: "var(--color-secondary)",
                      cursor: "pointer",
                      outline: "none",
                      padding: "0 10px 0 0",
                      margin: 0,
                      width: "auto",
                      maxWidth: "150px",
                      appearance: "none",
                      WebkitAppearance: "none",
                      MozAppearance: "none"
                    }}
                  >
                    {modelsList.length > 0 ? (
                      modelsList.map((m, idx) => (
                        <option key={idx} value={m} style={{ background: "var(--island-bg-color)", color: "var(--color-primary)" }}>{m}</option>
                      ))
                    ) : (
                      <option value="" style={{ background: "var(--island-bg-color)", color: "var(--color-primary)" }}>{aiSettings.model || "Select Model"}</option>
                    )}
                  </select>
                  {/* Custom tiny down arrow */}
                  <span style={{ 
                    position: "absolute", 
                    right: "6px", 
                    top: "50%", 
                    transform: "translateY(-50%)", 
                    fontSize: "7px", 
                    color: "var(--color-secondary)",
                    pointerEvents: "none"
                  }}>▼</span>
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
                  <button className="header-btn" onClick={() => setShowSettings(true)} title="AI settings">
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            </Sidebar.Header>
            
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
          </Sidebar>

          {/* Custom Brush Sidebar Dock */}
          <Sidebar name="brush-sidebar" docked={brushSidebarDocked} onDock={setBrushSidebarDocked}>
            <div 
              className="sidebar-resize-handle"
              onMouseDown={handleSidebarResizeMouseDown}
            />
            <Sidebar.Header>
              <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center", paddingRight: "10px", gap: "10px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--color-primary)" }}>Custom Brush Lab 🧪</span>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  {/* Settings Button (Cog) */}
                  <button 
                    className="header-btn" 
                    onClick={() => {
                      setActiveSettingsTab("preferences");
                      setShowSettings(true);
                    }}
                    title="Drawerator Settings"
                  >
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>

                  {/* Toggle Corner Style (Sharp / Smooth) */}
                  <button 
                    className={`header-btn ${!customBrushRoundness ? "active" : ""}`}
                    onClick={() => setCustomBrushRoundness(prev => !prev)}
                    title={customBrushRoundness ? "Toggle Sharp Corners (Shift+R)" : "Toggle Smooth Corners (Shift+R)"}
                  >
                    {customBrushRoundness ? (
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 20c8 0 16-8 16-16" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16V4" />
                      </svg>
                    )}
                  </button>

                  {/* Enable Custom Brush Button (Paintbrush) */}
                  <button 
                    className={`header-btn ${customBrushActive ? "active" : ""}`}
                    onClick={() => {
                      const nextState = !customBrushActive;
                      setCustomBrushActive(nextState);
                      if (nextState) {
                        if (activeBrushId === "normal") {
                          setActiveBrushId("hairy");
                        }
                        excalidrawAPI?.updateScene({ appState: { activeTool: { type: "freedraw" } } });
                      } else {
                        excalidrawAPI?.updateScene({ appState: { activeTool: { type: "selection" } } });
                      }
                    }}
                    title={customBrushActive ? "Disable Custom Brush Mode" : "Enable Custom Brush Mode"}
                  >
                    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.24 9.12l-8.62 8.62a1 1 0 01-1.41 0l-2.01-2.01a1 1 0 010-1.41l8.62-8.62m3.42 3.42l1.58-1.58a2.5 2.5 0 00-3.54-3.54l-1.58 1.58m3.54 3.54l-3.54-3.54" />
                    </svg>
                  </button>

                  {/* Apply to Selected Strokes Button (Sparkles) */}
                  {activeBrushId !== "normal" && (
                    <button 
                      className="header-btn"
                      onClick={handleApplyBrushToSelected}
                      title="Apply active brush style to selected canvas strokes"
                    >
                      <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21L8.188 15.904L3 15L8.188 14.096L9 9L9.813 14.096L15 15L9.813 15.904Z M19.071 4.929L17.657 6.343 M15 3h2 M21 5v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </Sidebar.Header>
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px", height: "calc(100% - 50px)", overflowY: "auto" }}>
              {renderBrushConfigForm()}
            </div>
          </Sidebar>
        </Excalidraw>

        {/* Live Preview SVG Overlay */}
        {customBrushActive && activeBrushId !== "normal" && drawingPoints.length >= 2 && (
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
            {getLivePreviewPaths().map((linePoints) => {
              return linePoints.map(([cx, cy]) => mapCanvasToScreen(cx, cy));
            }).map((line, idx) => {
              const pointsString = line.map(([x, y]) => `${x},${y}`).join(" ");
              return (
                <polyline
                  key={idx}
                  points={pointsString}
                  fill="none"
                  stroke={lastStrokeColorRef.current}
                  strokeWidth={(excalidrawAPI?.getAppState().currentItemStrokeWidth || 2) * (excalidrawAPI?.getAppState().zoom.value || 1)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={(excalidrawAPI?.getAppState().currentItemOpacity ?? 100) / 100}
                  style={theme === "dark" ? { filter: "invert(93%) hue-rotate(180deg)" } : undefined}
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

        {renderGlobalModifiersOverlay()}
        {renderModifiersPropertiesPanel()}
      </div>

      {/* Settings Modal Dialog Overlay */}
      {showSettings && (
        <div className={`excalidraw theme--${theme}`}>
          <div id="settings-overlay" onClick={() => setShowSettings(false)}>
            <div className="settings-card" onClick={(e) => e.stopPropagation()}>
              <div className="settings-title-row">
                <h3>Settings</h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  style={{ background: "transparent", border: "none", color: "var(--color-secondary)", fontSize: "20px", cursor: "pointer" }}
                >
                  &times;
                </button>
              </div>

              {/* Settings Tabs */}
              <div style={{ display: "flex", gap: "10px", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px", marginBottom: "15px" }}>
                <button
                  onClick={() => setActiveSettingsTab("ai")}
                  style={{
                    background: activeSettingsTab === "ai" ? "var(--color-accent)" : "transparent",
                    color: activeSettingsTab === "ai" ? "var(--color-btn-text)" : "var(--color-primary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  AI Configuration
                </button>
                <button
                  onClick={() => setActiveSettingsTab("preferences")}
                  style={{
                    background: activeSettingsTab === "preferences" ? "var(--color-accent)" : "transparent",
                    color: activeSettingsTab === "preferences" ? "var(--color-btn-text)" : "var(--color-primary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "6px",
                    padding: "6px 12px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer"
                  }}
                >
                  Board Preferences
                </button>
              </div>
              
              {activeSettingsTab === "ai" && (
                <>
                  <div className="settings-row">
                    <label>API Provider</label>
                    <select 
                      value={aiSettings.provider}
                      onChange={(e) => {
                        const val = e.target.value;
                        let defaultUrl = "http://localhost:11434";
                        if (val === "lmstudio") defaultUrl = "http://localhost:1234";
                        else if (val === "openai") defaultUrl = "https://api.openai.com";
                        
                        const updated = { ...aiSettings, provider: val, url: defaultUrl, model: "" };
                        setAiSettings(updated);
                        testAIConnection(updated);
                      }}
                    >
                      <option value="ollama">Ollama</option>
                      <option value="lmstudio">LM Studio</option>
                      <option value="openai">OpenAI Compatible</option>
                    </select>
                  </div>

                  <div className="settings-row">
                    <label>API Endpoint URL</label>
                    <input 
                      type="text" 
                      value={aiSettings.url} 
                      onChange={(e) => {
                        const updated = { ...aiSettings, url: e.target.value };
                        setAiSettings(updated);
                      }}
                    />
                  </div>

                  <div className="settings-row">
                    <label>Active Model Name</label>
                    {aiSettings.provider !== "openai" && modelsList.length > 0 ? (
                      <select 
                        value={aiSettings.model} 
                        onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                      >
                        {modelsList.map((m, idx) => (
                          <option key={idx} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        type="text" 
                        value={aiSettings.model} 
                        onChange={(e) => setAiSettings({ ...aiSettings, model: e.target.value })}
                        placeholder="e.g. gpt-4o or llama3"
                      />
                    )}
                  </div>

                  {connectionStatus === "error" && (
                    <div style={{
                      marginTop: "15px",
                      padding: "10px",
                      background: "rgba(255, 0, 0, 0.08)",
                      border: "1px solid rgba(255, 0, 0, 0.15)",
                      borderRadius: "6px",
                      fontSize: "12px",
                      lineHeight: "1.4",
                      color: "var(--color-primary)",
                      fontFamily: "var(--font-sans)"
                    }}>
                      <strong style={{ color: "#e06c75", display: "block", marginBottom: "4px" }}>CORS / Connection Troubleshooting:</strong>
                      If you are running the app via <code>file://</code> or a hosted domain, your browser will block local backend connections unless CORS is enabled:
                      <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                        <li style={{ marginBottom: "4px" }}><strong>Ollama:</strong> Run Ollama with the environment variable <code>OLLAMA_ORIGINS="*"</code>. On macOS, run <code>launchctl setenv OLLAMA_ORIGINS "*"</code> in terminal, restart the Ollama app, and refresh this page.</li>
                        <li><strong>LM Studio:</strong> Turn on the <strong>Enable CORS</strong> setting in the LM Studio local server tab.</li>
                      </ul>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "24px" }}>
                    <div className="status-indicator">
                      <span className={`status-dot ${connectionStatus}`}></span>
                      <span>
                        {connectionStatus === "ok" ? "Backend Reachable" : 
                         connectionStatus === "error" ? "Connection Failed" : "Checking..."}
                      </span>
                    </div>
                    <button 
                      className="header-btn" 
                      onClick={saveSettings}
                      style={{ background: "var(--color-accent)", color: "var(--color-btn-text)", border: "none", fontWeight: "600", padding: "8px 16px" }}
                    >
                      Save
                    </button>
                  </div>
                </>
              )}
              {activeSettingsTab === "preferences" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <label style={{ margin: 0, cursor: "pointer" }}>Force Desktop Layout</label>
                    <input 
                      type="checkbox" 
                      checked={forceDesktopLayout} 
                      onChange={(e) => {
                        setForceDesktopLayout(e.target.checked);
                        localStorage.setItem("drawerator_force_desktop_layout", e.target.checked);
                      }}
                      style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                    />
                  </div>

                  <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <label style={{ margin: 0, cursor: "pointer" }}>Show Toolbar Hints</label>
                    <input 
                      type="checkbox" 
                      checked={showToolbarHints} 
                      onChange={(e) => {
                        setShowToolbarHints(e.target.checked);
                        localStorage.setItem("drawerator_show_toolbar_hints", e.target.checked);
                      }}
                      style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                    />
                  </div>

                  <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <label style={{ margin: 0, cursor: "pointer" }}>Show Bottom Alerts</label>
                    <input 
                      type="checkbox" 
                      checked={showBottomNotifications} 
                      onChange={(e) => {
                        setShowBottomNotifications(e.target.checked);
                        localStorage.setItem("drawerator_show_bottom_notifications", e.target.checked);
                      }}
                      style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                    />
                  </div>

                  <div className="settings-row" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <label style={{ margin: 0 }}>Default Stabilizer Damping (Lazy Mouse)</label>
                      <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--color-secondary)" }}>
                        {defaultStabilizerDamping.toFixed(2)}
                      </span>
                    </div>
                    <input 
                      type="range" 
                      min="0.01" 
                      max="0.5" 
                      step="0.01" 
                      value={defaultStabilizerDamping} 
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setDefaultStabilizerDamping(val);
                        localStorage.setItem("drawerator_default_stabilizer_damping", val);
                      }}
                      style={{ width: "100%", cursor: "pointer", accentColor: "var(--color-accent)" }}
                    />
                    <div style={{ fontSize: "10px", color: "var(--color-secondary)", marginTop: "-2px" }}>
                      Lower values make the stabilizer lazy/smoother. Defaults to 0.12.
                    </div>
                  </div>

                  <hr style={{ border: "none", borderTop: "1px solid var(--border-color)", margin: "8px 0" }} />

                  {excalidrawAPI && (() => {
                    const appState = excalidrawAPI.getAppState() || {};
                    return (
                      <>
                        <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={{ margin: 0, cursor: "pointer" }}>Grid Mode</label>
                          <input 
                            type="checkbox" 
                            checked={appState.gridModeEnabled || false} 
                            onChange={(e) => {
                              excalidrawAPI.updateScene({ appState: { gridModeEnabled: e.target.checked } });
                            }}
                            style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                          />
                        </div>

                        <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={{ margin: 0, cursor: "pointer" }}>Zen Mode</label>
                          <input 
                            type="checkbox" 
                            checked={appState.zenModeEnabled || false} 
                            onChange={(e) => {
                              excalidrawAPI.updateScene({ appState: { zenModeEnabled: e.target.checked } });
                            }}
                            style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                          />
                        </div>

                        <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={{ margin: 0, cursor: "pointer" }}>View Mode</label>
                          <input 
                            type="checkbox" 
                            checked={appState.viewModeEnabled || false} 
                            onChange={(e) => {
                              excalidrawAPI.updateScene({ appState: { viewModeEnabled: e.target.checked } });
                            }}
                            style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                          />
                        </div>

                        <div className="settings-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <label style={{ margin: 0, cursor: "pointer" }}>Snap to Objects</label>
                          <input 
                            type="checkbox" 
                            checked={appState.objectsSnapModeEnabled || false} 
                            onChange={(e) => {
                              excalidrawAPI.updateScene({ appState: { objectsSnapModeEnabled: e.target.checked } });
                            }}
                            style={{ cursor: "pointer", accentColor: "var(--color-primary)" }}
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

            </div>
          </div>
        </div>
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
                      if (filtered[selectedIndex]) {
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
