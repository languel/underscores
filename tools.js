// --- STROKE INTERACTIVE ACTIONS & AI DRIVEN API ---

function setupCanvasEvents() {
  let lastScreenPos = { x: 0, y: 0 };

  // Mouse Down / Touch Start
  canvas.addEventListener("mousedown", (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    lastScreenPos = { x: e.clientX, y: e.clientY };
    state.lastMousePos = worldPos;

    if (state.currentTool === 'pan' || (e.button === 1)) {
      // Middle click or Pan tool
      state.isPanning = true;
      canvas.style.cursor = "grabbing";
    } else if (state.currentTool === 'draw') {
      state.isDrawing = true;
      state.drawStartTime = Date.now();
      state.activePath = {
        id: "path_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
        points: [{ x: worldPos.x, y: worldPos.y, t: 0, pressure: e.pressure || 0.5 }],
        properties: { ...brushSettings }
      };
    } else if (state.currentTool === 'erase') {
      const closest = findClosestPath(worldPos);
      if (closest) {
        removePath(closest.path.id);
      }
    } else if (state.currentTool === 'select') {
      // 1. Check if clicking close to a handle of the already selected path
      if (state.selectedPathId) {
        const path = paths.find(p => p.id === state.selectedPathId);
        if (path) {
          const pointIdx = path.points.findIndex(p => distance(worldPos, p) < 8 / state.zoom);
          if (pointIdx !== -1) {
            state.isDraggingPoint = true;
            state.selectedPointIndex = pointIdx;
            return;
          }
        }
      }

      // 2. Check if clicking on another path
      const closest = findClosestPath(worldPos);
      if (closest) {
        state.selectedPathId = closest.path.id;
        state.isDraggingPath = true;
        
        // Show properties panel
        const props = document.getElementById("properties-panel");
        props.classList.remove("hidden");
        
        // Sync properties panel inputs
        document.getElementById("prop-brush").value = closest.path.properties.brush;
        document.getElementById("prop-width").value = closest.path.properties.width;
        document.getElementById("mod-pressure").checked = closest.path.properties.smooth !== false;
        document.getElementById("mod-wobble").checked = closest.path.properties.wobble !== false;
        
        // Select color dot
        document.querySelectorAll(".color-dot").forEach(dot => {
          dot.classList.toggle("active", dot.dataset.color === closest.path.properties.color);
        });
      } else {
        // Clear selection
        state.selectedPathId = null;
        state.selectedPointIndex = null;
        document.getElementById("properties-panel").classList.add("hidden");
      }
      redraw();
    }
  });

  // Mouse Move
  canvas.addEventListener("mousemove", (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);

    if (state.isPanning) {
      const dx = e.clientX - lastScreenPos.x;
      const dy = e.clientY - lastScreenPos.y;
      state.panX += dx;
      state.panY += dy;
      lastScreenPos = { x: e.clientX, y: e.clientY };
      redraw();
    } else if (state.isDrawing) {
      const t = Date.now() - state.drawStartTime;
      // Add point
      state.activePath.points.push({
        x: worldPos.x,
        y: worldPos.y,
        t: t,
        pressure: e.pressure || 0.5
      });
      redraw();
    } else if (state.isDraggingPath && state.selectedPathId) {
      const dx = worldPos.x - state.lastMousePos.x;
      const dy = worldPos.y - state.lastMousePos.y;
      
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path) {
        path.points.forEach(pt => {
          pt.x += dx;
          pt.y += dy;
        });
        redraw();
      }
      state.lastMousePos = worldPos;
    } else if (state.isDraggingPoint && state.selectedPathId) {
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path && state.selectedPointIndex !== null) {
        path.points[state.selectedPointIndex].x = worldPos.x;
        path.points[state.selectedPointIndex].y = worldPos.y;
        redraw();
      }
    }
  });

  // Mouse Up / End
  window.addEventListener("mouseup", () => {
    if (state.isDrawing && state.activePath) {
      // Simplify path slightly (smooth modulator)
      if (brushSettings.smooth && state.activePath.points.length > 3) {
        state.activePath.points = smoothPoints(state.activePath.points);
      }
      
      paths.push(state.activePath);
      saveCanvasToLocalStorage();
      state.activePath = null;
      redraw();
    }
    
    if (state.isDraggingPath || state.isDraggingPoint) {
      saveCanvasToLocalStorage();
    }

    state.isDrawing = false;
    state.isPanning = false;
    state.isDraggingPath = false;
    state.isDraggingPoint = false;
    
    if (state.currentTool === 'pan') {
      canvas.style.cursor = "grab";
    } else {
      canvas.style.cursor = "crosshair";
    }
  });

  // Wheel (Zoom centered on mouse pointer)
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    adjustZoom(factor, e.clientX, e.clientY);
  }, { passive: false });

  // Keyboards shortcuts (Delete/Backspace to remove selected path, Esc to cancel)
  window.addEventListener("keydown", (e) => {
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") {
      return; // Do not intercept inputs
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (state.selectedPathId) {
        removePath(state.selectedPathId);
        state.selectedPathId = null;
        document.getElementById("properties-panel").classList.add("hidden");
      }
    } else if (e.key === "Escape") {
      state.selectedPathId = null;
      state.selectedPointIndex = null;
      document.getElementById("properties-panel").classList.add("hidden");
      redraw();
    }
  });
}

// Simple path smoothing algorithm (Chaikin's Algorithms / averaging neighbors)
function smoothPoints(pts) {
  const result = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i-1];
    const curr = pts[i];
    const next = pts[i+1];
    
    // Average
    result.push({
      x: prev.x * 0.25 + curr.x * 0.5 + next.x * 0.25,
      y: prev.y * 0.25 + curr.y * 0.5 + next.y * 0.25,
      t: curr.t,
      pressure: curr.pressure
    });
  }
  result.push(pts[pts.length - 1]);
  return result;
}

function removePath(id) {
  paths = paths.filter(p => p.id !== id);
  saveCanvasToLocalStorage();
  if (state.selectedPathId === id) {
    state.selectedPathId = null;
    document.getElementById("properties-panel").classList.add("hidden");
  }
  redraw();
  logToolAction(`erase_path(${id})`, 'ok');
}

// --- UI BUTTON INTERACTION ---
function setupUIEvents() {
  // Toolbar Buttons
  const tools = {
    'tool-select': 'select',
    'tool-draw': 'draw',
    'tool-erase': 'erase',
    'tool-pan': 'pan'
  };

  Object.entries(tools).forEach(([id, name]) => {
    document.getElementById(id).addEventListener("click", () => {
      document.querySelectorAll(".tool-btn").forEach(btn => btn.classList.remove("active"));
      document.getElementById(id).classList.add("active");
      state.currentTool = name;
      
      if (name === 'pan') {
        canvas.style.cursor = "grab";
      } else {
        canvas.style.cursor = "crosshair";
      }
      
      // Hide properties if not selecting
      if (name !== 'select') {
        document.getElementById("properties-panel").classList.add("hidden");
      }
    });
  });

  // Clear Button
  document.getElementById("btn-clear").addEventListener("click", () => {
    if (confirm("Clear all drawings from infinite canvas?")) {
      paths = [];
      state.selectedPathId = null;
      state.selectedPointIndex = null;
      document.getElementById("properties-panel").classList.add("hidden");
      saveCanvasToLocalStorage();
      redraw();
      logToolAction("clear_canvas()", 'ok');
    }
  });

  // Viewport Control Buttons
  document.getElementById("zoom-in-btn").addEventListener("click", () => {
    adjustZoom(1.2, canvas.width / 2, canvas.height / 2);
  });
  document.getElementById("zoom-out-btn").addEventListener("click", () => {
    adjustZoom(0.8, canvas.width / 2, canvas.height / 2);
  });
  document.getElementById("reset-view-btn").addEventListener("click", resetViewport);

  // Settings Modal toggles
  document.getElementById("btn-settings").addEventListener("click", () => {
    document.getElementById("settings-overlay").classList.remove("hidden");
  });
  document.getElementById("settings-close-btn").addEventListener("click", () => {
    document.getElementById("settings-overlay").classList.add("hidden");
  });
  document.getElementById("settings-overlay").addEventListener("click", (e) => {
    if (e.target === document.getElementById("settings-overlay")) {
      document.getElementById("settings-overlay").classList.add("hidden");
    }
  });

  // Toggle AI Panel
  document.getElementById("btn-toggle-ai").addEventListener("click", () => {
    const sidebar = document.getElementById("ai-sidebar");
    sidebar.classList.toggle("collapsed");
    document.getElementById("btn-toggle-ai").classList.toggle("active", !sidebar.classList.contains("collapsed"));
    setTimeout(resizeCanvas, 300); // Wait for transit animate
  });

  // Color selection
  document.querySelectorAll(".color-dot").forEach(dot => {
    dot.addEventListener("click", (e) => {
      document.querySelectorAll(".color-dot").forEach(d => d.classList.remove("active"));
      dot.classList.add("active");
      
      const newColor = dot.dataset.color;
      brushSettings.color = newColor;
      
      // If path is selected, change its color
      if (state.selectedPathId) {
        const path = paths.find(p => p.id === state.selectedPathId);
        if (path) {
          path.properties.color = newColor;
          saveCanvasToLocalStorage();
          redraw();
        }
      }
    });
  });

  // Properties form listeners
  document.getElementById("prop-brush").addEventListener("change", (e) => {
    const val = e.target.value;
    brushSettings.brush = val;
    if (state.selectedPathId) {
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path) {
        path.properties.brush = val;
        saveCanvasToLocalStorage();
        redraw();
      }
    }
  });

  document.getElementById("prop-width").addEventListener("input", (e) => {
    const val = parseInt(e.target.value);
    brushSettings.width = val;
    if (state.selectedPathId) {
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path) {
        path.properties.width = val;
        saveCanvasToLocalStorage();
        redraw();
      }
    }
  });

  document.getElementById("mod-pressure").addEventListener("change", (e) => {
    const val = e.target.checked;
    brushSettings.smooth = val;
    if (state.selectedPathId) {
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path) {
        path.properties.smooth = val;
        saveCanvasToLocalStorage();
        redraw();
      }
    }
  });

  document.getElementById("mod-wobble").addEventListener("change", (e) => {
    const val = e.target.checked;
    brushSettings.wobble = val;
    if (state.selectedPathId) {
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path) {
        path.properties.wobble = val;
        saveCanvasToLocalStorage();
        redraw();
      }
    }
  });
}

function logToolAction(msg, status = 'ok') {
  const logger = document.getElementById("log-list");
  
  // Clear empty state
  const empty = logger.querySelector(".empty");
  if (empty) empty.remove();
  
  const item = document.createElement("div");
  item.className = `log-item ${status === 'error' ? 'error' : ''}`;
  item.innerHTML = `
    <span class="status-dot ${status}"></span>
    <span>${msg}</span>
  `;
  logger.appendChild(item);
  logger.scrollTop = logger.scrollHeight;
}

// --- GLOBAL EXPOSED DRAWING API FOR AI DRIVING ---
const DraweratorAPI = {
  // Add a fully formed path to the infinite canvas
  addPath: function(pointsArray, properties = {}) {
    if (!Array.isArray(pointsArray) || pointsArray.length === 0) {
      logToolAction("addPath: Invalid coordinates array", "error");
      return null;
    }
    
    // Convert coords array to path points structure
    const formattedPoints = pointsArray.map((pt, idx) => ({
      x: pt.x,
      y: pt.y,
      t: pt.t || idx * 20, // default time steps
      pressure: pt.pressure || 0.5
    }));

    const newPath = {
      id: "ai_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      points: formattedPoints,
      properties: {
        color: properties.color || brushSettings.color,
        width: properties.width || brushSettings.width,
        brush: properties.brush || brushSettings.brush,
        smooth: properties.smooth !== false,
        wobble: properties.wobble !== false
      }
    };
    
    paths.push(newPath);
    saveCanvasToLocalStorage();
    redraw();
    
    logToolAction(`addPath(points: ${pointsArray.length}, brush: "${newPath.properties.brush}")`, 'ok');
    return newPath.id;
  },

  // Helper: Draw standard geometric shapes
  drawRectangle: function(x, y, width, height, properties = {}) {
    // Generate polygonal outline points
    const pts = [];
    const step = 8; // Segment length for hand-drawn wobble
    
    // Draw 4 edges with segments
    const drawEdge = (x1, y1, x2, y2) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(2, Math.floor(len / step));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        pts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
      }
    };

    drawEdge(x, y, x + width, y); // Top
    drawEdge(x + width, y, x + width, y + height); // Right
    drawEdge(x + width, y + height, x, y + height); // Bottom
    drawEdge(x, y + height, x, y); // Left

    return this.addPath(pts, properties);
  },

  drawCircle: function(x, y, radius, properties = {}) {
    const pts = [];
    const steps = 40; // Segments to form rough circle
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      pts.push({
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius
      });
    }
    return this.addPath(pts, properties);
  },

  drawLine: function(x1, y1, x2, y2, properties = {}) {
    const pts = [{ x: x1, y: y1 }, { x: x2, y: y2 }];
    return this.addPath(pts, properties);
  },

  // Erase stroke
  erasePath: function(id) {
    if (paths.some(p => p.id === id)) {
      removePath(id);
      return true;
    }
    logToolAction(`erasePath: id "${id}" not found`, 'error');
    return false;
  },

  // Clear drawing board
  clearCanvas: function() {
    paths = [];
    state.selectedPathId = null;
    state.selectedPointIndex = null;
    saveCanvasToLocalStorage();
    redraw();
    logToolAction("clearCanvas()", 'ok');
    return true;
  },

  // Move path by offset delta
  movePath: function(id, dx, dy) {
    const path = paths.find(p => p.id === id);
    if (path) {
      path.points.forEach(pt => {
        pt.x += dx;
        pt.y += dy;
      });
      saveCanvasToLocalStorage();
      redraw();
      logToolAction(`movePath(${id}, dx: ${dx}, dy: ${dy})`, 'ok');
      return true;
    }
    logToolAction(`movePath: id "${id}" not found`, 'error');
    return false;
  },

  // Export path entities (JSON) for AI context learning
  getCanvasPaths: function() {
    return JSON.stringify(paths.map(p => ({
      id: p.id,
      brush: p.properties.brush,
      color: p.properties.color,
      width: p.properties.width,
      points_count: p.points.length,
      bounds: getPathBounds(p)
    })), null, 2);
  },

  // Adjust camera transforms
  panTo: function(x, y) {
    state.panX = x;
    state.panY = y;
    redraw();
    logToolAction(`panTo(x: ${x}, y: ${y})`, 'ok');
    return true;
  },

  zoomTo: function(level) {
    state.zoom = Math.max(0.1, Math.min(20, level));
    document.getElementById("zoom-level").innerText = `${Math.round(state.zoom * 100)}%`;
    redraw();
    logToolAction(`zoomTo(level: ${level})`, 'ok');
    return true;
  }
};

function getPathBounds(path) {
  if (path.points.length === 0) return { minX:0, minY:0, maxX:0, maxY:0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  path.points.forEach(p => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  return { minX, minY, maxX, maxY };
}

// Expose API to window object
window.DraweratorAPI = DraweratorAPI;
