export const MANIM_DEMO_EXAMPLES = Object.freeze([
  {
    id: "pythagorean-rearrangement",
    label: "Geometry · Pythagorean rearrangement proof",
    name: "Pythagorean rearrangement proof",
    settings: { progressionMode: "cue" },
    source: `// Rearrangement proof: four congruent right triangles leave a c² square.
const a = 3;
const b = 2;
const s = a + b;
const h = s / 2;

const outer = new Rectangle({ width: s, height: s, color: "#e8e8e8", strokeWidth: 3 });
await scene.play(new Create(outer));

await cue("Four right triangles");
const triangles = [
  new Polygon({ vertices: [[-h,-h,0],[-h+a,-h,0],[-h,-h+b,0]], color: "#58c4dd", fillOpacity: 0.35 }),
  new Polygon({ vertices: [[h,-h,0],[h,-h+a,0],[h-b,-h,0]], color: "#83c167", fillOpacity: 0.35 }),
  new Polygon({ vertices: [[h,h,0],[h-a,h,0],[h,h-b,0]], color: "#f0ac5f", fillOpacity: 0.35 }),
  new Polygon({ vertices: [[-h,h,0],[-h,h-a,0],[-h+b,h,0]], color: "#fc6255", fillOpacity: 0.35 }),
];
for (const triangle of triangles) await scene.play(new FadeIn(triangle), { duration: 0.25 });

await cue("The hole has side c");
const cSquare = new Polygon({
  vertices: [[-h+a,-h,0],[h,-h+a,0],[h-a,h,0],[-h,h-a,0]],
  color: "#ffff00",
  fillOpacity: 0.2,
  strokeWidth: 4,
});
await scene.play(new Create(cSquare));

const area = new MathTex({
  latex: "(a+b)^2 = 4\\left(\\frac{ab}{2}\\right)+c^2",
  position: [0,-3.35,0],
  fontSize: 34,
});
await scene.play(new Write(area));

await cue("Simplify the areas");
const theorem = new MathTex({
  latex: "a^2+b^2=c^2",
  position: [0,-3.35,0],
  fontSize: 42,
});
await scene.play(new Transform(area, theorem));`,
  },
  {
    id: "perceptron-and-gate",
    label: "Linear algebra · Perceptron logic gate",
    name: "Perceptron logic gate",
    settings: { progressionMode: "cue" },
    source: `// A single perceptron is a row-vector × column-vector + bias.
// Defaults implement AND. Change x1/x2, weights, or bias in the parameter UI.
// @param x1 = 1 (0..1 step:1)
// @param x2 = 1 (0..1 step:1)
// @param w1 = 1 (0..2 step:0.1)
// @param w2 = 1 (0..2 step:0.1)
// @param bias = -1.5 (-3..1 step:0.1)
const { x1, x2, w1, w2, bias } = __.params;
const z = w1 * x1 + w2 * x2 + bias;
const y = z >= 0 ? 1 : 0;

const weights = new Matrix([[w1, w2]], { fontSize: 38, position: [-2.8, 0.8, 0] });
const input = new Matrix([[x1], [x2]], { fontSize: 38, position: [-0.6, 0.8, 0] });
const multiply = new MathTex({ latex: "\\times", position: [-1.65,0.8,0], fontSize: 34 });
const plusBias = new MathTex({ latex: \`+\\;(\${bias.toFixed(1)})\`, position: [1.0,0.8,0], fontSize: 34 });

await scene.play(new Create(weights));
await scene.play(new Write(multiply));
await scene.play(new Create(input));
await scene.play(new Write(plusBias));

await cue("Dot product");
const dot = new MathTex({
  latex: \`z = (\${w1.toFixed(1)})(\${x1}) + (\${w2.toFixed(1)})(\${x2}) + (\${bias.toFixed(1)}) = \${z.toFixed(1)}\`,
  position: [0,-1.0,0],
  fontSize: 30,
});
await scene.play(new Write(dot));

await cue("Threshold activation");
const threshold = new MathTex({
  latex: \`y = H(z) = \${y}\`,
  position: [0,-2.1,0],
  fontSize: 42,
});
await scene.play(new Write(threshold));

await cue("AND truth-table idea");
const caption = new MathTex({
  latex: "w=[1,1],\\; b=-1.5 \\Rightarrow \\text{AND}",
  position: [0,-3.0,0],
  fontSize: 30,
});
await scene.play(new Write(caption));`,
  },
  {
    id: "double-pendulum",
    label: "Physics · Double pendulum",
    name: "Double pendulum",
    source: `// Numerically integrate a double pendulum, then animate the precomputed trajectory.
// @param theta1 = 115 (20..170 step:1)
// @param theta2 = 65 (20..170 step:1)
// @param gravity = 9.81 (1..20 step:0.1)
// @param duration = 10 (3..20 step:1)
const g = __.params.gravity;
const L1 = 2.0;
const L2 = 1.6;
const m1 = 1.0;
const m2 = 1.0;
let th1 = __.params.theta1 * Math.PI / 180;
let th2 = __.params.theta2 * Math.PI / 180;
let w1 = 0;
let w2 = 0;
const dt = 1 / 120;
const steps = 1200;
const states = [];

function accelerations(a1, a2, v1, v2) {
  const d = a1 - a2;
  const common = 2 * m1 + m2 - m2 * Math.cos(2 * d);
  const aa1 = (
    -g * (2 * m1 + m2) * Math.sin(a1)
    -m2 * g * Math.sin(a1 - 2 * a2)
    -2 * Math.sin(d) * m2 * (v2 * v2 * L2 + v1 * v1 * L1 * Math.cos(d))
  ) / (L1 * common);
  const aa2 = 2 * Math.sin(d) * (
    v1 * v1 * L1 * (m1 + m2)
    + g * (m1 + m2) * Math.cos(a1)
    + v2 * v2 * L2 * m2 * Math.cos(d)
  ) / (L2 * common);
  return [aa1, aa2];
}

for (let i = 0; i < steps; i += 1) {
  states.push([th1, th2]);
  const [a1, a2] = accelerations(th1, th2, w1, w2);
  w1 += a1 * dt;
  w2 += a2 * dt;
  th1 += w1 * dt;
  th2 += w2 * dt;
}

const pivot = [0, 2.4, 0];
const pointAt = index => {
  const i = Math.max(0, Math.min(states.length - 1, Math.round(index)));
  const [a1, a2] = states[i];
  const p1 = [pivot[0] + L1 * Math.sin(a1), pivot[1] - L1 * Math.cos(a1), 0];
  const p2 = [p1[0] + L2 * Math.sin(a2), p1[1] - L2 * Math.cos(a2), 0];
  return [p1, p2];
};

const tracker = new ValueTracker(0);
let [p1, p2] = pointAt(0);
const rod1 = new Line({ start: pivot, end: p1, color: "#58c4dd", strokeWidth: 5 });
const rod2 = new Line({ start: p1, end: p2, color: "#fc6255", strokeWidth: 5 });
const bob1 = new Dot({ point: p1, radius: 0.16, color: "#58c4dd" });
const bob2 = new Dot({ point: p2, radius: 0.2, color: "#fc6255" });
const hinge = new Dot({ point: pivot, radius: 0.08, color: "#e8e8e8" });

rod1.addUpdater(line => {
  const [q1] = pointAt(tracker.getValue());
  line.setStart(pivot).setEnd(q1);
});
rod2.addUpdater(line => {
  const [q1, q2] = pointAt(tracker.getValue());
  line.setStart(q1).setEnd(q2);
});
bob1.addUpdater(dot => dot.moveTo(pointAt(tracker.getValue())[0]));
bob2.addUpdater(dot => dot.moveTo(pointAt(tracker.getValue())[1]));

const title = new MathTex({ latex: "\\text{double pendulum}", position: [0,-3.2,0], fontSize: 30 });
scene.add(hinge, rod1, rod2, bob1, bob2);
await scene.play(new Write(title));
await scene.play(tracker.animateTo(steps - 1, { duration: __.params.duration }));`,
  },
]);
