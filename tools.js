// --- STROKE INTERACTIVE ACTIONS & AI DRIVEN API ---

function setupCanvasEvents() {
  let lastScreenPos = { x: 0, y: 0 };

  // Mouse Down / Touch Start
  canvas.addEventListener("mousedown", (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    lastScreenPos = { x: e.clientX, y: e.clientY };
    state.lastMousePos = worldPos;

    if (state.currentTool === 'pan' || (e.button === 1)) {
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
      // 1. Check if clicking close to a handle of the already selected path (only if showPointsEditor is active)
      if (state.selectedPathId && state.showPointsEditor) {
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
        openEditorForPath(closest.path);
      } else {
        // Clear selection
        state.selectedPathId = null;
        state.selectedPointIndex = null;
        state.showPointsEditor = false;
        document.getElementById("properties-panel").classList.add("hidden");
      }
      redraw();
    } else if (state.currentTool === 'box-select') {
      state.isDrawingBox = true;
      state.boxStart = worldPos;
      state.boxEnd = worldPos;
      redraw();
    } else if (state.currentTool === 'lasso-select') {
      state.isDrawingLasso = true;
      state.lassoPoints = [worldPos];
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
        
        // Update duration if necessary
        if (state.selectedPointIndex === path.points.length - 1) {
          path.playback.duration = path.points[path.points.length - 1].t;
        }
        
        openEditorForPath(path);
        redraw();
      }
    } else if (state.isDrawingBox) {
      state.boxEnd = worldPos;
      redraw();
    } else if (state.isDrawingLasso) {
      state.lassoPoints.push(worldPos);
      redraw();
    }
  });

  // Mouse Up / End
  window.addEventListener("mouseup", () => {
    if (state.isDrawing && state.activePath) {
      // Apply curve smoothing interpolation
      if (state.activePath.points.length > 3) {
        if (brushSettings.curve === 'chaikin') {
          state.activePath.points = smoothPoints(state.activePath.points);
        } else if (brushSettings.curve === 'catmull') {
          state.activePath.points = catmullRomSpline(state.activePath.points);
        } else if (brushSettings.curve === 'hobby') {
          state.activePath.points = hobbySpline(state.activePath.points);
        }
      }
      
      const duration = state.activePath.points[state.activePath.points.length - 1].t;
      state.activePath.playback = {
        speed: 1.0,
        isPlaying: false,
        currentTime: duration,
        duration: duration
      };
      
      paths.push(state.activePath);
      saveCanvasToLocalStorage();
      state.activePath = null;
      redraw();
    }
    
    if (state.isDraggingPath || state.isDraggingPoint) {
      saveCanvasToLocalStorage();
    }

    if (state.isDrawingBox) {
      const xMin = Math.min(state.boxStart.x, state.boxEnd.x);
      const xMax = Math.max(state.boxStart.x, state.boxEnd.x);
      const yMin = Math.min(state.boxStart.y, state.boxEnd.y);
      const yMax = Math.max(state.boxStart.y, state.boxEnd.y);
      
      const selectedPaths = paths.filter(path => {
        return path.points.some(pt => pt.x >= xMin && pt.x <= xMax && pt.y >= yMin && pt.y <= yMax);
      });
      
      if (selectedPaths.length > 0) {
        state.selectedPathId = selectedPaths[0].id;
        openEditorForPath(selectedPaths[0]);
      } else {
        state.selectedPathId = null;
        state.showPointsEditor = false;
        document.getElementById("properties-panel").classList.add("hidden");
      }
      
      state.isDrawingBox = false;
      state.boxStart = null;
      state.boxEnd = null;
      redraw();
    }

    if (state.isDrawingLasso) {
      function isPointInPolygon(p, poly) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i].x, yi = poly[i].y;
          const xj = poly[j].x, yj = poly[j].y;
          const intersect = ((yi > p.y) !== (yj > p.y))
              && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      }
      
      const selectedPaths = paths.filter(path => {
        return path.points.some(pt => isPointInPolygon(pt, state.lassoPoints));
      });
      
      if (selectedPaths.length > 0) {
        state.selectedPathId = selectedPaths[0].id;
        openEditorForPath(selectedPaths[0]);
      } else {
        state.selectedPathId = null;
        state.showPointsEditor = false;
        document.getElementById("properties-panel").classList.add("hidden");
      }
      
      state.isDrawingLasso = false;
      state.lassoPoints = [];
      redraw();
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

  // Double Click toggles point editing
  canvas.addEventListener("dblclick", (e) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);
    const closest = findClosestPath(worldPos);
    if (closest) {
      state.selectedPathId = closest.path.id;
      state.showPointsEditor = !state.showPointsEditor;
      openEditorForPath(closest.path);
      redraw();
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
      state.showPointsEditor = false;
      document.getElementById("properties-panel").classList.add("hidden");
      redraw();
    }
  });
}

// --- CURVE INTERPOLATION ALGORITHMS ---

// 1. Chaikin's Algorithm (Fast neighborhood averaging)
function smoothPoints(pts) {
  const result = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i-1];
    const curr = pts[i];
    const next = pts[i+1];
    
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

// 2. Catmull-Rom Spline (Smooth cubic spline passing through all control points)
function catmullRomSpline(pts, stepsPerSegment = 6) {
  if (pts.length < 3) return pts;
  const result = [];
  
  // Pad endpoints to calculate tangent boundaries
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  
  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2];
    
    for (let step = 0; step < stepsPerSegment; step++) {
      const t = step / stepsPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      
      const x = 0.5 * (
        (2 * p1.x) + 
        (-p0.x + p2.x) * t + 
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + 
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );
      
      const y = 0.5 * (
        (2 * p1.y) + 
        (-p0.y + p2.y) * t + 
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + 
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      );
      
      // Interpolate pressure and time offset
      const pressure = p1.pressure + (p2.pressure - p1.pressure) * t;
      const time = p1.t + (p2.t - p1.t) * t;
      
      result.push({ x, y, t: time, pressure });
    }
  }
  
  result.push(pts[pts.length - 1]);
  return result;
}

// 3. John Hobby's Spline Algorithm (Aesthetically optimal smooth curves through vertices)
function hobbySpline(pts, stepsPerSegment = 6) {
  if (pts.length < 3) return pts;
  
  const n = pts.length;
  const dx = [];
  const dy = [];
  const d = [];
  const alpha = [];
  
  // Calculate chord vectors and lengths
  for (let i = 0; i < n - 1; i++) {
    const delX = pts[i+1].x - pts[i].x;
    const delY = pts[i+1].y - pts[i].y;
    dx.push(delX);
    dy.push(delY);
    d.push(Math.hypot(delX, delY));
    alpha.push(Math.atan2(delY, delX));
  }
  
  // Solve for tangent angles theta (outgoing) and phi (incoming) relative to chord
  const theta = new Array(n).fill(0);
  const phi = new Array(n).fill(0);
  
  // Curvature weightings for interior vertices
  for (let i = 1; i < n - 1; i++) {
    const psi = alpha[i] - alpha[i-1];
    // wrap bend to [-PI, PI]
    const wrappedPsi = Math.atan2(Math.sin(psi), Math.cos(psi));
    
    const totalD = d[i-1] + d[i];
    if (totalD > 0) {
      theta[i] = -wrappedPsi * (d[i] / totalD);
      phi[i] = -wrappedPsi * (d[i-1] / totalD);
    }
  }
  
  // Endpoint curl boundary estimates
  theta[0] = -phi[1] / 2;
  phi[n-1] = -theta[n-2] / 2;
  
  const result = [];
  
  // Generate cubic Bezier points
  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i+1];
    const chordLen = d[i];
    if (chordLen === 0) continue;
    
    const th = theta[i];
    const ph = phi[i+1];
    
    // Hobby velocity calculation
    const mockG = (thAngle, phAngle) => {
      const num = 2 + Math.sqrt(2) * (Math.sin(thAngle) - Math.sin(phAngle)/16) * (Math.sin(phAngle) - Math.sin(thAngle)/16) * (Math.cos(thAngle) - Math.cos(phAngle));
      const den = 1 + (0.5 * (Math.sqrt(5) - 1) * Math.cos(thAngle)) + (0.5 * (3 - Math.sqrt(5)) * Math.cos(phAngle));
      return num / den;
    };
    
    const rho = mockG(th, ph) / 3;
    const sigma = mockG(ph, th) / 3;
    
    // Control points
    const cp1x = p1.x + chordLen * rho * Math.cos(alpha[i] + th);
    const cp1y = p1.y + chordLen * rho * Math.sin(alpha[i] + th);
    const cp2x = p2.x - chordLen * sigma * Math.cos(alpha[i] - ph);
    const cp2y = p2.y - chordLen * sigma * Math.sin(alpha[i] - ph);
    
    // Cubic Bezier interpolation
    for (let step = 0; step < stepsPerSegment; step++) {
      const t = step / stepsPerSegment;
      const mt = 1 - t;
      const mt2 = mt * mt;
      const mt3 = mt2 * mt;
      const t2 = t * t;
      const t3 = t2 * t;
      
      const x = mt3 * p1.x + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * p2.x;
      const y = mt3 * p1.y + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * p2.y;
      
      const pressure = p1.pressure + (p2.pressure - p1.pressure) * t;
      const time = p1.t + (p2.t - p1.t) * t;
      
      result.push({ x, y, t: time, pressure });
    }
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
    'tool-box-select': 'box-select',
    'tool-lasso-select': 'lasso-select',
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
      
      // Hide properties if not using selection tools
      if (!['select', 'box-select', 'lasso-select'].includes(name)) {
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
      state.showPointsEditor = false;
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
    setTimeout(resizeCanvas, 300); // Wait for transition animate
  });

  // Toggle Theme (Light / Dark)
  document.getElementById("btn-theme").addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light-mode");
    localStorage.setItem("drawerator_theme", isLight ? "light" : "dark");
    redraw();
  });

  // Editor Close Button
  document.getElementById("editor-close-btn").addEventListener("click", () => {
    state.selectedPathId = null;
    state.showPointsEditor = false;
    document.getElementById("properties-panel").classList.add("hidden");
    redraw();
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
    document.getElementById("val-width").innerText = `${val}px`;
    if (state.selectedPathId) {
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path) {
        path.properties.width = val;
        saveCanvasToLocalStorage();
        redraw();
      }
    }
  });

  document.getElementById("prop-curve").addEventListener("change", (e) => {
    const val = e.target.value;
    brushSettings.curve = val;
    if (state.selectedPathId) {
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path) {
        path.properties.curve = val;
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

  // Timeline & Playback Events
  document.getElementById("btn-play-path").addEventListener("click", () => {
    if (state.selectedPathId) {
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path) {
        if (!path.playback) {
          const duration = path.points.length > 0 ? path.points[path.points.length - 1].t : 0;
          path.playback = { speed: 1.0, isPlaying: false, currentTime: duration, duration };
        }
        
        path.playback.isPlaying = !path.playback.isPlaying;
        if (path.playback.isPlaying && path.playback.currentTime >= path.playback.duration) {
          path.playback.currentTime = 0;
        }
        document.getElementById("btn-play-path").innerText = path.playback.isPlaying ? "Pause" : "Play";
        redraw();
      }
    }
  });

  document.getElementById("prop-speed").addEventListener("change", (e) => {
    if (state.selectedPathId) {
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path) {
        if (!path.playback) {
          const duration = path.points.length > 0 ? path.points[path.points.length - 1].t : 0;
          path.playback = { speed: 1.0, isPlaying: false, currentTime: duration, duration };
        }
        path.playback.speed = parseFloat(e.target.value);
      }
    }
  });

  document.getElementById("btn-reverse-path").addEventListener("click", () => {
    if (state.selectedPathId) {
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path && path.points.length > 1) {
        path.points.reverse();
        const totalDuration = path.playback ? path.playback.duration : path.points[path.points.length - 1].t;
        path.points.forEach((pt, idx) => {
          pt.t = (idx / (path.points.length - 1)) * totalDuration;
        });
        
        if (path.playback) {
          path.playback.currentTime = totalDuration;
        }
        saveCanvasToLocalStorage();
        openEditorForPath(path);
        redraw();
      }
    }
  });

  document.getElementById("prop-scrubber").addEventListener("input", (e) => {
    if (state.selectedPathId) {
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path && path.playback) {
        const pct = parseFloat(e.target.value) / 100;
        path.playback.currentTime = pct * path.playback.duration;
        document.getElementById("val-time").innerText = Math.round(path.playback.currentTime);
        redraw();
      }
    }
  });

  // Raw Coordinates Data Actions
  document.getElementById("btn-copy-raw").addEventListener("click", () => {
    if (state.selectedPathId) {
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path) {
        const rawJSON = JSON.stringify(path.points.map(pt => ({ x: pt.x, y: pt.y, t: pt.t, pressure: pt.pressure })), null, 2);
        navigator.clipboard.writeText(rawJSON).then(() => {
          const btn = document.getElementById("btn-copy-raw");
          btn.innerText = "Copied!";
          setTimeout(() => btn.innerText = "Copy JSON", 1500);
        });
      }
    }
  });

  document.getElementById("btn-toggle-handles").addEventListener("click", () => {
    if (state.selectedPathId) {
      state.showPointsEditor = !state.showPointsEditor;
      const path = paths.find(p => p.id === state.selectedPathId);
      if (path) {
        openEditorForPath(path);
      }
      redraw();
    }
  });
}
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

    const duration = formattedPoints.length > 0 ? formattedPoints[formattedPoints.length - 1].t : 0;

    const newPath = {
      id: "ai_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      points: formattedPoints,
      playback: {
        speed: 1.0,
        isPlaying: false,
        currentTime: duration,
        duration: duration
      },
      properties: {
        color: properties.color || brushSettings.color,
        width: properties.width || brushSettings.width,
        brush: properties.brush || brushSettings.brush,
        curve: properties.curve || brushSettings.curve,
        wobble: properties.wobble !== false
      }
    };
    
    paths.push(newPath);
    saveCanvasToLocalStorage();
    redraw();
    
    logToolAction(`addPath(points: ${pointsArray.length}, brush: "${newPath.properties.brush}")`, 'ok');
    return newPath.id;
  },

  // Playback & Timing Controls for AI
  playPathPlayback: function(id, speed = 1.0) {
    const path = paths.find(p => p.id === id);
    if (!path) return false;
    if (!path.playback) {
      const duration = path.points.length > 0 ? path.points[path.points.length - 1].t : 0;
      path.playback = { speed, isPlaying: false, currentTime: duration, duration };
    }
    path.playback.speed = speed;
    path.playback.isPlaying = true;
    if (path.playback.currentTime >= path.playback.duration) {
      path.playback.currentTime = 0;
    }
    redraw();
    logToolAction(`playPathPlayback("${id}", speed: ${speed})`, 'ok');
    return true;
  },

  pausePathPlayback: function(id) {
    const path = paths.find(p => p.id === id);
    if (!path) return false;
    if (path.playback) {
      path.playback.isPlaying = false;
    }
    redraw();
    logToolAction(`pausePathPlayback("${id}")`, 'ok');
    return true;
  },

  scrubPathPlayback: function(id, timeMs) {
    const path = paths.find(p => p.id === id);
    if (!path) return false;
    if (!path.playback) {
      const duration = path.points.length > 0 ? path.points[path.points.length - 1].t : 0;
      path.playback = { speed: 1.0, isPlaying: false, currentTime: duration, duration };
    }
    path.playback.currentTime = Math.max(0, Math.min(path.playback.duration, timeMs));
    redraw();
    logToolAction(`scrubPathPlayback("${id}", timeMs: ${timeMs})`, 'ok');
    return true;
  },

  reversePath: function(id) {
    const path = paths.find(p => p.id === id);
    if (!path || path.points.length < 2) return false;
    path.points.reverse();
    const totalDuration = path.playback ? path.playback.duration : path.points[path.points.length - 1].t;
    path.points.forEach((pt, idx) => {
      pt.t = (idx / (path.points.length - 1)) * totalDuration;
    });
    if (path.playback) {
      path.playback.currentTime = totalDuration;
    }
    saveCanvasToLocalStorage();
    if (state.selectedPathId === id) {
      openEditorForPath(path);
    }
    redraw();
    logToolAction(`reversePath("${id}")`, 'ok');
    return true;
  },

  setPathRenderProperties: function(id, props = {}) {
    const path = paths.find(p => p.id === id);
    if (!path) return false;
    if (props.color !== undefined) path.properties.color = props.color;
    if (props.width !== undefined) path.properties.width = props.width;
    if (props.brush !== undefined) path.properties.brush = props.brush;
    if (props.curve !== undefined) path.properties.curve = props.curve;
    if (props.wobble !== undefined) path.properties.wobble = props.wobble;
    saveCanvasToLocalStorage();
    if (state.selectedPathId === id) {
      openEditorForPath(path);
    }
    redraw();
    logToolAction(`setPathRenderProperties("${id}")`, 'ok');
    return true;
  },

  setSelectionMode: function(mode) {
    if (!['select', 'box-select', 'lasso-select'].includes(mode)) return false;
    state.currentTool = mode;
    
    document.querySelectorAll(".tool-btn").forEach(btn => btn.classList.remove("active"));
    const toolBtnId = `tool-${mode}`;
    const btn = document.getElementById(toolBtnId);
    if (btn) btn.classList.add("active");
    
    redraw();
    logToolAction(`setSelectionMode("${mode}")`, 'ok');
    return true;
  },

  selectPathsInBox: function(x1, y1, x2, y2) {
    const xMin = Math.min(x1, x2);
    const xMax = Math.max(x1, x2);
    const yMin = Math.min(y1, y2);
    const yMax = Math.max(y1, y2);
    
    const selectedPaths = paths.filter(path => {
      return path.points.some(pt => pt.x >= xMin && pt.x <= xMax && pt.y >= yMin && pt.y <= yMax);
    });
    
    if (selectedPaths.length > 0) {
      state.selectedPathId = selectedPaths[0].id;
      openEditorForPath(selectedPaths[0]);
      redraw();
      logToolAction(`selectPathsInBox: Selected "${selectedPaths[0].id}"`, 'ok');
      return selectedPaths[0].id;
    }
    logToolAction(`selectPathsInBox: No match`, 'ok');
    return null;
  },

  selectPathsInLasso: function(polygonPoints) {
    if (!Array.isArray(polygonPoints) || polygonPoints.length < 3) return null;
    function isPointInPolygon(p, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y))
            && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }
    
    const selectedPaths = paths.filter(path => {
      return path.points.some(pt => isPointInPolygon(pt, polygonPoints));
    });
    
    if (selectedPaths.length > 0) {
      state.selectedPathId = selectedPaths[0].id;
      openEditorForPath(selectedPaths[0]);
      redraw();
      logToolAction(`selectPathsInLasso: Selected "${selectedPaths[0].id}"`, 'ok');
      return selectedPaths[0].id;
    }
    logToolAction(`selectPathsInLasso: No match`, 'ok');
    return null;
  },

  toggleEditPointsMode: function(id) {
    const path = paths.find(p => p.id === id);
    if (!path) return false;
    state.selectedPathId = id;
    state.showPointsEditor = !state.showPointsEditor;
    openEditorForPath(path);
    redraw();
    logToolAction(`toggleEditPointsMode("${id}", show: ${state.showPointsEditor})`, 'ok');
    return true;
  },

  getSelectedPathData: function() {
    if (!state.selectedPathId) return null;
    const path = paths.find(p => p.id === state.selectedPathId);
    return path ? JSON.parse(JSON.stringify(path)) : null;
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

  drawFreehandPath: function(pointsString, properties = {}) {
    if (!pointsString) return null;
    const parts = pointsString.trim().split(/\s+/);
    const pts = [];
    parts.forEach(part => {
      const coords = part.split(',');
      if (coords.length >= 2) {
        pts.push({ x: parseFloat(coords[0]), y: parseFloat(coords[1]) });
      }
    });
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

function openEditorForPath(path) {
  const props = document.getElementById("properties-panel");
  if (!props) return;
  props.classList.remove("hidden");
  
  // 1. Rendering
  document.getElementById("prop-brush").value = path.properties.brush || 'rough';
  document.getElementById("prop-width").value = path.properties.width || 3;
  document.getElementById("val-width").innerText = `${path.properties.width || 3}px`;
  document.getElementById("prop-curve").value = path.properties.curve || 'linear';
  document.getElementById("mod-wobble").checked = path.properties.wobble !== false;
  
  document.querySelectorAll(".color-dot").forEach(dot => {
    dot.classList.toggle("active", dot.dataset.color === path.properties.color);
  });
  
  // 2. Playback / Timing
  if (!path.playback) {
    const duration = path.points.length > 0 ? path.points[path.points.length - 1].t : 0;
    path.playback = {
      speed: 1.0,
      isPlaying: false,
      currentTime: duration,
      duration: duration
    };
  }
  
  const speedSelect = document.getElementById("prop-speed");
  speedSelect.value = String(path.playback.speed || "1");
  
  document.getElementById("val-time").innerText = Math.round(path.playback.currentTime);
  document.getElementById("val-duration").innerText = Math.round(path.playback.duration);
  document.getElementById("prop-scrubber").value = path.playback.duration > 0 
    ? (path.playback.currentTime / path.playback.duration) * 100 
    : 100;
    
  const playBtn = document.getElementById("btn-play-path");
  playBtn.innerText = path.playback.isPlaying ? "Pause" : "Play";
  
  // 3. Raw Data
  document.getElementById("val-points-count").innerText = path.points.length;
  
  const editBtn = document.getElementById("btn-toggle-handles");
  editBtn.innerText = state.showPointsEditor ? "Move Path" : "Edit Points";
  editBtn.classList.toggle("active", state.showPointsEditor);
}

// Expose API to window object
window.DraweratorAPI = DraweratorAPI;
