// --- INFINITE CANVAS & STROKE RENDERER ---

// Main drawing state
const canvas = document.getElementById("drawing-canvas");
const ctx = canvas.getContext("2d");

let paths = []; // List of all path objects

const state = {
  currentTool: 'select', // 'select', 'draw', 'erase', 'pan'
  zoom: 1.0,
  panX: 0,
  panY: 0,
  isDrawing: false,
  isPanning: false,
  isDraggingPath: false,
  isDraggingPoint: false,
  activePath: null,
  selectedPathId: null,
  selectedPointIndex: null,
  dragStart: { x: 0, y: 0 },
  lastMousePos: { x: 0, y: 0 },
  drawStartTime: 0
};

const brushSettings = {
  color: '#6366f1',
  width: 3,
  brush: 'rough', // 'rough', 'pencil', 'felt'
  smooth: true,
  wobble: true
};

// --- INITIALIZATION ---
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
  redraw();
}

window.addEventListener("resize", resizeCanvas);
// Run on load deferred
document.addEventListener("DOMContentLoaded", () => {
  // Load saved theme
  const savedTheme = localStorage.getItem("drawerator_theme") || "dark";
  if (savedTheme === "light") {
    document.body.classList.add("light-mode");
  } else {
    document.body.classList.remove("light-mode");
  }
  
  resizeCanvas();
  loadCanvasFromLocalStorage();
  setupCanvasEvents();
  setupUIEvents();
});

// --- COORDINATE TRANSFORMS ---
// Convert screen coords to world coords
function screenToWorld(screenX, screenY) {
  return {
    x: (screenX - state.panX) / state.zoom,
    y: (screenY - state.panY) / state.zoom
  };
}

// Convert world coords to screen coords
function worldToScreen(worldX, worldY) {
  return {
    x: worldX * state.zoom + state.panX,
    y: worldY * state.zoom + state.panY
  };
}

// --- LOCAL STORAGE PERSISTENCE ---
function saveCanvasToLocalStorage() {
  localStorage.setItem("drawerator_canvas_paths", JSON.stringify(paths));
}

function loadCanvasFromLocalStorage() {
  try {
    const saved = localStorage.getItem("drawerator_canvas_paths");
    if (saved) {
      paths = JSON.parse(saved);
      redraw();
    }
  } catch (e) {
    console.error("Failed to load canvas paths", e);
  }
}

// --- GEOMETRY UTILITIES ---
// Get distance between two points
function distance(p1, p2) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// Find closest point on segment p1-p2 to point p
function closestPointOnSegment(p, p1, p2) {
  const ab = { x: p2.x - p1.x, y: p2.y - p1.y };
  const ap = { x: p.x - p1.x, y: p.y - p1.y };
  const ab2 = ab.x * ab.x + ab.y * ab.y;
  if (ab2 === 0) return p1;
  let t = (ap.x * ab.x + ap.y * ab.y) / ab2;
  t = Math.max(0, Math.min(1, t));
  return { x: p1.x + t * ab.x, y: p1.y + t * ab.y };
}

// Find closest path to a point
function findClosestPath(worldPoint) {
  let closestPath = null;
  let minDistance = 15 / state.zoom; // 15px click threshold in screen pixels

  paths.forEach(path => {
    if (path.points.length < 1) return;
    
    // Check points
    for (let i = 0; i < path.points.length; i++) {
      const dist = distance(worldPoint, path.points[i]);
      if (dist < minDistance) {
        minDistance = dist;
        closestPath = { path, pointIndex: i };
      }
    }
    
    // Check segments
    for (let i = 0; i < path.points.length - 1; i++) {
      const cp = closestPointOnSegment(worldPoint, path.points[i], path.points[i+1]);
      const dist = distance(worldPoint, cp);
      if (dist < minDistance) {
        minDistance = dist;
        closestPath = { path, pointIndex: null }; // Clicked segment, not specific point
      }
    }
  });

  return closestPath;
}

// --- RENDER ALGORITHMS (EXCALIDRAW-STYLE ROUGH DRAWING) ---
function drawRoughLine(x1, y1, x2, y2, color, width, wobble) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (!wobble) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    return;
  }

  // Double-stroke sketchy render
  for (let i = 0; i < 2; i++) {
    const scale = Math.max(0.5, width / 3);
    const offsetLimit = 1.6 * scale;
    
    // Random offset endpoints
    const dx1 = (Math.random() - 0.5) * offsetLimit;
    const dy1 = (Math.random() - 0.5) * offsetLimit;
    const dx2 = (Math.random() - 0.5) * offsetLimit;
    const dy2 = (Math.random() - 0.5) * offsetLimit;
    
    // Midpoint bowing (creates sketchy curves)
    const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * offsetLimit * 1.5;
    const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * offsetLimit * 1.5;

    ctx.beginPath();
    ctx.moveTo(x1 + dx1, y1 + dy1);
    ctx.quadraticCurveTo(midX, midY, x2 + dx2, y2 + dy2);
    ctx.stroke();
  }
}

// Felt chisel marker renderer
function drawFeltLine(x1, y1, x2, y2, color, width) {
  ctx.fillStyle = color;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;

  // Render chisel markers as series of angled rectangles
  const steps = Math.max(1, Math.floor(len / 2));
  const angle = Math.PI / 4; // 45 degree chisel tip
  const chiselW = width * 1.8;
  const chiselH = width * 0.4;

  ctx.save();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillRect(-chiselW / 2, -chiselH / 2, chiselW, chiselH);
    ctx.rotate(-angle);
    ctx.translate(-px, -py);
  }
  ctx.restore();
}

function drawPath(path) {
  const brush = path.properties.brush || 'rough';
  const color = path.properties.color || '#ffffff';
  const width = path.properties.width || 3;
  const wobble = path.properties.wobble !== false;

  if (path.points.length < 1) return;
  if (path.points.length === 1) {
    // Draw a point/dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(path.points[0].x, path.points[0].y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  for (let i = 0; i < path.points.length - 1; i++) {
    const p1 = path.points[i];
    const p2 = path.points[i+1];
    
    // Apply pressure if available
    const currentWidth = p1.pressure ? width * (0.6 + p1.pressure * 0.8) : width;

    if (brush === 'pencil') {
      ctx.strokeStyle = color;
      ctx.lineWidth = currentWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    } else if (brush === 'felt') {
      drawFeltLine(p1.x, p1.y, p2.x, p2.y, color, currentWidth);
    } else {
      // Default: rough sketch
      drawRoughLine(p1.x, p1.y, p2.x, p2.y, color, currentWidth, wobble);
    }
  }
}

// --- CANVAS REDRAW ---
function redraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  // Apply Infinite Canvas Transforms (Pan & Zoom)
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);

  // 1. Draw Grid Background (Infinite dot grid)
  drawInfiniteGrid();

  // 2. Draw Committed Paths
  paths.forEach(path => {
    drawPath(path);
    // Draw Selection Highlighting
    if (state.currentTool === 'select' && path.id === state.selectedPathId) {
      drawSelectionOutline(path);
    }
  });

  // 3. Draw Active Temporary Drawing Path
  if (state.activePath) {
    drawPath(state.activePath);
  }

  ctx.restore();
}

function drawInfiniteGrid() {
  const dotSize = 1.2;
  const gap = 20;

  // Find canvas corners in world coordinates
  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(canvas.width, canvas.height);

  const startX = Math.floor(topLeft.x / gap) * gap;
  const startY = Math.floor(topLeft.y / gap) * gap;
  const endX = Math.ceil(bottomRight.x / gap) * gap;
  const endY = Math.ceil(bottomRight.y / gap) * gap;

  ctx.fillStyle = document.body.classList.contains("light-mode") ? "rgba(15, 23, 42, 0.08)" : "rgba(255, 255, 255, 0.08)";
  ctx.beginPath();
  for (let x = startX; x <= endX; x += gap) {
    for (let y = startY; y <= endY; y += gap) {
      ctx.rect(x - dotSize / 2, y - dotSize / 2, dotSize, dotSize);
    }
  }
  ctx.fill();
}

function drawSelectionOutline(path) {
  ctx.save();
  const isLight = document.body.classList.contains("light-mode");
  ctx.strokeStyle = isLight ? "rgba(15, 23, 42, 0.4)" : "rgba(248, 250, 252, 0.4)";
  ctx.lineWidth = 1 / state.zoom;
  ctx.setLineDash([4 / state.zoom, 4 / state.zoom]);
  
  // Draw bounding box outline
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  path.points.forEach(p => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  
  const pad = 6 / state.zoom;
  ctx.strokeRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);

  // Draw point handles
  ctx.fillStyle = isLight ? "#0f172a" : "#f8fafc";
  ctx.setLineDash([]);
  ctx.lineWidth = 1.5 / state.zoom;
  ctx.strokeStyle = isLight ? "#ffffff" : "#0f172a";
  
  path.points.forEach((p, idx) => {
    ctx.beginPath();
    const radius = (idx === state.selectedPointIndex) ? 6 / state.zoom : 4 / state.zoom;
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
}

// --- VIEWPORT CONTROL UTILITIES ---
function adjustZoom(factor, centerX, centerY) {
  const prevZoom = state.zoom;
  let newZoom = state.zoom * factor;
  newZoom = Math.max(0.1, Math.min(20, newZoom)); // zoom bounds
  
  // Zoom centered on pointer
  state.panX = centerX - (centerX - state.panX) * (newZoom / prevZoom);
  state.panY = centerY - (centerY - state.panY) * (newZoom / prevZoom);
  state.zoom = newZoom;
  
  document.getElementById("zoom-level").innerText = `${Math.round(state.zoom * 100)}%`;
  redraw();
}

function resetViewport() {
  state.zoom = 1.0;
  state.panX = 0;
  state.panY = 0;
  document.getElementById("zoom-level").innerText = "100%";
  redraw();
}
