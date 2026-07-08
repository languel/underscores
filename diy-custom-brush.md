# Taking a Line for a Walk: A DIY Guide to Custom Brushes in Drawerator

> *"A drawing is simply a line going for a walk."* — Paul Klee

Welcome, creative coders! This guide will teach you how to write custom JavaScript brushes to transform simple mouse or stylus strokes into dynamic, algorithmic drawings inside Excalidraw.

Inspired by creative coding principles, this tutorial explains the math, geometry, and coordinates behind Drawerator's custom brush laboratory.

---

## 1. The Core Data Concept

At its heart, any drawing gesture is a series of captures in time. When you drag your cursor or pen across the canvas, Drawerator collects a sequence of coordinates.

### The Input: `points`
Your brush function receives a single parameter: `points`. This is an array of absolute coordinates captured during drawing:

```javascript
[
  [120.5, 340.2], // First point (pointer down)
  [122.1, 341.0], // Second point
  [125.0, 343.5], // ...
  [130.8, 348.1]  // Last point (pointer up)
]
```

### The Output: `lines`
Your function must return an **array of lines**. Each line is itself an array of coordinates. Drawerator takes each individual line in your output and creates a native Excalidraw stroke for it.

*   To draw a single path, return: `[points]`
*   To draw three parallel tracks, return: `[track1, track2, track3]`
*   To draw cross-hatch bristles, return: `[mainStroke, bristle1, bristle2, bristle3, ...]`

---

## 2. The Geometry of the Walk

To make a line interesting, we need to calculate its direction, perpendicular offsets, and movement qualities at any given moment.

### Vector Math Basics: Tangents & Normals
If we are at point $i$ (`points[i]`), the direction of movement (the **tangent vector**) is pointing toward the next point $i+1$:

```javascript
const dx = points[i+1][0] - points[i][0];
const dy = points[i+1][1] - points[i][1];
```

The length of this step (the distance) is:
$$\text{len} = \sqrt{dx^2 + dy^2}$$

If the length is greater than $0$, we can normalize the direction to a **unit vector** (length of $1$):
```javascript
const tx = dx / len;
const ty = dy / len;
```

To draw parallel lines or extrude shapes outwards, we need a direction perpendicular to the line (the **normal vector**). In 2D space, you can get a perpendicular vector by swapping the components and inverting one sign:
```javascript
const nx = -ty; // Perpendicular X offset
const ny = tx;  // Perpendicular Y offset
```

---

## 3. Dynamic Gesture Parameters

To make brushes feel organic, we map gesture metrics (like speed) to visual parameters (like thickness or opacity).

### Estimating Speed
While we don't have direct access to system clock ticks, we can estimate **speed** by measuring the distance between consecutive points. If points are close together, the pointer moved slowly. If they are far apart, the pointer moved quickly.

```javascript
// Euclidean distance between successive points:
const speed = Math.sqrt(dx * dx + dy * dy);
```

#### Smoothing Speed
Because input sampling can be jittery, we smooth the speed value using a **moving average window** over neighboring points:

```javascript
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
  smoothDists.push(count > 0 ? sum / count : 0);
}
```

---

## 4. Real-time Coordinate Metadata & Global Context

To support advanced algorithmic effects (like stylus pressure rendering, speed dampening, and grid matching), Drawerator enriches the points and passes a global context configuration object to your brush function.

### Point-Specific Properties
Each point element in the `points` array is a standard `[x, y]` array, but is decorated with several properties:
* **`point.time`**: Absolute timestamp in milliseconds (e.g. `Date.now()`).
* **`point.strokeTime`**: Elapsed time in milliseconds since the start of the current stroke gesture. Useful for animations, walking lines, or time-based brush behavior.
* **`point.pressure`**: Stylus pressure value ranging from `0.0` (lightest) to `1.0` (hardest). Defaults to `0.5` for mouse drawings.
* **`point.speed`**: Calculated velocity at that coordinate step, measured in canvas distance units per millisecond.

### The `globals` Context Object
Your brush function is invoked with a second argument: `globals`. This object exposes the current state of Excalidraw's canvas:
```javascript
(points, globals) => {
  const { 
    gridSize,            // Size of grid cells (in pixels, or null if disabled)
    strokeColor,         // Currently active drawing color (hex code)
    strokeWidth,         // Current stroke width selected (1, 2, 3...)
    opacity,             // Active opacity level (0 to 100)
    zoom,                // Current zoom level (1 = 100%)
    theme,               // Active theme ("light" or "dark")
    viewBackgroundColor  // Color of the canvas background
  } = globals || {};

  // Your code here...
}
```

### Grid Snapping inside Custom Brushes
By utilizing `globals.gridSize`, custom brushes can dynamically snap coordinate offsets or vertices directly to the canvas grid during drawing. For example:
```javascript
const snapValue = (val, gridSize) => {
  return gridSize ? Math.round(val / gridSize) * gridSize : val;
};
```

---

## 4.5. Gesture Shortcuts: Alt/Option Auto-Close
To streamline drawing closed loops (like triangles or polygons), Drawerator includes a built-in gesture shortcut:
* **Option / Alt Key (on release)**: If you hold the **`Option`** (Alt) key when releasing your mouse or stylus, the drawing pipeline automatically appends a final point that is identical to the first coordinate point.
* This automatically closes the path. When **Smooth** mode is active, the loop is welded and smoothed cleanly at the joint; when **Sharp** mode is active, the loop closes with sharp vertices.

---

---

## 5. Code Recipes for Custom Brushes

Paste these snippets into the **JS Line Algorithm Code** editor in Drawerator to see them in action.

### Recipe 1: The Simple Line (Base Case)
Just returns the path unmodified.

```javascript
(points) => {
  return [points];
}
```

### Recipe 2: Ribbon Brush (Double Parallel Track)
Calculates perpendicular normal vectors and offsets lines outwards on both sides.

```javascript
(points) => {
  const lines = [];
  const leftTrack = [];
  const rightTrack = [];
  
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    if (len > 0) {
      // Normal vector * offset distance (12 pixels)
      const nx = -dy / len * 12;
      const ny = dx / len * 12;
      
      leftTrack.push([x2 + nx, y2 + ny]);
      rightTrack.push([x2 - nx, y2 - ny]);
    }
  }
  
  lines.push(points);       // Center line
  lines.push(leftTrack);    // Left offset line
  lines.push(rightTrack);   // Right offset line
  return lines;
}
```

### Recipe 3: Furry Hatching Brush
Creates thin, perpendicular bristle strokes at regular intervals along the drawing path.

```javascript
(points) => {
  const lines = [];
  lines.push(points); // Draw the primary spine line
  
  // Draw perpendicular bristles every 2 points
  for (let i = 1; i < points.length; i += 2) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    if (len > 0) {
      const nx = -dy / len * 18; // Bristle length: 18px
      const ny = dx / len * 18;
      
      // Add a line element from the path out to the normal offset
      lines.push([[x2, y2], [x2 + nx, y2 + ny]]);
    }
  }
  return lines;
}
```

### Recipe 4: Wave Ribbon Brush
Outputs offset tracks that oscillate using a Sine wave based on the point index, creating a textured pattern.

```javascript
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
      // Sine wave amplitude based on index position
      const frequency = 0.5;
      const amplitude = 15;
      const offset = Math.sin(i * frequency) * amplitude;
      
      const nx = -dy / len * offset;
      const ny = dx / len * offset;
      
      waveTrack.push([x2 + nx, y2 + ny]);
    }
  }
  
  lines.push(points);
  lines.push(waveTrack);
  return lines;
}
```

### Recipe 5: Simplify Brush (RDP)
Uses the Ramer-Douglas-Peucker (RDP) algorithm to dynamically reduce the points of the curve *while* drawing it. Includes a robust handler for closed loops.

```javascript
// @param epsilon = 3.0 (0.5..15, step: 0.1)
(points) => {
  if (points.length <= 2) return [points];
  
  function getOrthogonalDistance(p, lineStart, lineEnd) {
    const x = p[0], y = p[1];
    const x1 = lineStart[0], y1 = lineStart[1];
    const x2 = lineEnd[0], y2 = lineEnd[1];
    
    const dx = x2 - x1;
    const dy = y2 - y1;
    const den = Math.sqrt(dx * dx + dy * dy);
    // If start and end are identical (closed loop), calculate distance directly to starting point
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
      return results1.slice(0, results1.length - 1).concat(results2);
    } else {
      const pStart = pts[0];
      const pEnd = pts[end];
      
      const startPt = [pStart[0], pStart[1]];
      if (pStart.pressure !== undefined) startPt.pressure = pStart.pressure;
      
      const endPt = [pEnd[0], pEnd[1]];
      if (pEnd.pressure !== undefined) endPt.pressure = pEnd.pressure;
      
      return [startPt, endPt];
    }
  }

  const simplified = simplifyRDP(points, epsilon);
  return [simplified];
}
```

---

## 6. Exercises for Students

1.  **The Dotted Trail**: Modify the *Furry Brush* algorithm to output only single-point lines (dots) at varying distances from the center line.
2.  **Pressure-Sensitive Splatter**: Create a brush that increases the offset distance of secondary lines the faster you move the cursor.
3.  **Sharp Corner Accent**: Calculate the angle change between point $i-1$, $i$, and $i+1$. Draw custom spikes or loops whenever the angle turns sharply.
