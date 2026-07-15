import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceScoreCollisionState,
  allocateIannixRoleLabels,
  createDefaultIannixData,
  dampCursorTransform,
  evaluateScoreFrame,
  getCursorTransform,
  getElementCorePaths,
  getObjectTimeState,
  isRuntimeCursor,
  normalizeIannixData,
  pathsIntersect,
  samplePath,
  sweptPathsIntersect,
} from "./iannixEngine.js";

const line = (id, points, iannix = null) => {
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    id,
    type: "line",
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    angle: 0,
    points: points.map(point => [point[0] - x, point[1] - y]),
    isDeleted: false,
    customData: iannix ? { iannix } : {},
  };
};

test("only an active linked cursor transfers visual ownership to the runtime", () => {
  const cursor = line("cursor", [[0, 0], [0, 20]], createDefaultIannixData({
    role: "cursor",
    cursor: { curveId: "curve" },
  }));
  assert.equal(isRuntimeCursor(cursor), true);
  assert.equal(isRuntimeCursor({
    ...cursor,
    customData: { iannix: { ...cursor.customData.iannix, active: false } },
  }), false);
  assert.equal(isRuntimeCursor({
    ...cursor,
    customData: {
      iannix: {
        ...cursor.customData.iannix,
        cursor: { ...cursor.customData.iannix.cursor, curveId: null },
      },
    },
  }), false);
});

test("normalizes role-independent timing without discarding role settings", () => {
  const data = normalizeIannixData({
    role: "cursor",
    time: { duration: 8, loopMode: "loop" },
    cursor: { curveId: "curve-1" },
  });
  assert.equal(data.role, "cursor");
  assert.equal(data.time.duration, 8);
  assert.equal(data.time.start, 0);
  assert.equal(data.cursor.curveId, "curve-1");
  assert.equal(data.trigger.duration, 0.35);
});

test("legacy edited MIDI patterns remain custom when templates are introduced", () => {
  const normalized = normalizeIannixData({
    role: "trigger",
    trigger: { midiPattern: "midi://midi_out/note 2 72 90 0.25" },
  });

  assert.equal(normalized.trigger.midiTemplate, "custom");
  assert.equal(normalized.trigger.midiPattern, "midi://midi_out/note 2 72 90 0.25");
});

test("batch role labels are unique, deterministic, and avoid scene conflicts", () => {
  const elements = [
    line("existing", [[0, 0], [10, 0]], createDefaultIannixData({ role: "curve", label: "Curve 1" })),
    line("first", [[0, 10], [10, 10]]),
    line("second", [[0, 20], [10, 20]]),
  ];
  const labels = allocateIannixRoleLabels(elements, ["first", "second"], "curve");
  assert.equal(labels.get("first"), "Curve 2");
  assert.equal(labels.get("second"), "Curve 3");
});

test("reapplying a role preserves an existing unique custom label", () => {
  const elements = [
    line("cursor", [[0, 0], [10, 0]], createDefaultIannixData({ role: "cursor", label: "Soloist" })),
  ];
  const labels = allocateIannixRoleLabels(elements, ["cursor"], "cursor");
  assert.equal(labels.get("cursor"), "Soloist");
});

test("one-shot object time is seekable and clamps after completion", () => {
  const timing = { start: 2, duration: 4, rate: 1, loopMode: "once" };
  assert.deepEqual(getObjectTimeState(1, timing).progress, 0);
  assert.deepEqual(getObjectTimeState(4, timing).progress, 0.5);
  const completed = getObjectTimeState(8, timing);
  assert.equal(completed.progress, 1);
  assert.equal(completed.active, false);
  assert.equal(completed.complete, true);
});

test("loop and ping-pong object clocks derive deterministic progress", () => {
  assert.equal(getObjectTimeState(6, { start: 0, duration: 4, rate: 1, loopMode: "loop" }).progress, 0.5);
  assert.equal(getObjectTimeState(6, { start: 0, duration: 4, rate: 1, loopMode: "pingPong" }).progress, 0.5);
  assert.equal(getObjectTimeState(4.5, { start: 0, duration: 4, rate: 1, loopMode: "pingPong" }).progress, 0.875);
});

test("core line geometry ignores modifier render tracks", () => {
  const element = line("curve", [[10, 20], [110, 20]]);
  element.customData.originalPoints = [[10, 20], [60, 40], [110, 20]];
  element.points = [[0, 0], [100, 100]];
  assert.deepEqual(getElementCorePaths(element)[0], [[10, 20], [60, 40], [110, 20]]);
});

test("path sampling uses distance rather than source point index", () => {
  const sampled = samplePath([[0, 0], [90, 0], [100, 0]], 0.5);
  assert.deepEqual(sampled.point, [50, 0]);
  assert.equal(sampled.angle, 0);
});

test("cursor transform places its center on the curve and follows tangent change", () => {
  const cursor = line("cursor", [[0, -5], [0, 5]]);
  const curve = line("curve", [[0, 0], [50, 0], [50, 50]]);
  const transform = getCursorTransform(cursor, curve, 0.75, true);
  assert.deepEqual(transform.position, [50, 25]);
  assert.equal(transform.angle, Math.PI / 2);
});

test("visual cursor damping eases position and uses the shortest angle path", () => {
  const previous = {
    anchor: [0, 0],
    position: [0, 0],
    translate: [0, 0],
    angle: Math.PI * 0.9,
    tangentAngle: Math.PI * 0.9,
  };
  const target = {
    anchor: [0, 0],
    position: [100, 0],
    translate: [100, 0],
    angle: -Math.PI * 0.9,
    tangentAngle: -Math.PI * 0.9,
  };
  const damped = dampCursorTransform(previous, target, 0.8, 1 / 60);
  assert.ok(damped.position[0] > 0 && damped.position[0] < 100);
  assert.deepEqual(damped.translate, damped.position);
  assert.ok(damped.angle > previous.angle);
  assert.deepEqual(dampCursorTransform(previous, target, 0, 1 / 60), target);
});

test("path collision detects direct and swept crossings", () => {
  const trigger = [[[5, -5], [5, 5]]];
  assert.equal(pathsIntersect([[[0, 0], [10, 0]]], trigger), true);
  assert.equal(sweptPathsIntersect(
    [[[0, -1], [0, 1]]],
    [[[10, -1], [10, 1]]],
    trigger,
  ), true);
});

test("score frame links cursor to curve and reports trigger collision", () => {
  const curveData = createDefaultIannixData({ role: "curve" });
  const cursorData = createDefaultIannixData({
    role: "cursor",
    time: { start: 0, duration: 10, rate: 1, loopMode: "once" },
    cursor: { curveId: "curve" },
  });
  const triggerData = createDefaultIannixData({ role: "trigger" });
  const elements = [
    line("curve", [[0, 0], [100, 0]], curveData),
    line("cursor", [[0, -10], [0, 10]], cursorData),
    line("trigger", [[50, -20], [50, 20]], triggerData),
  ];
  const frame = evaluateScoreFrame(elements, 5);
  assert.equal(frame.cursors.length, 1);
  assert.deepEqual(frame.cursors[0].transform.position, [50, 0]);
  assert.equal(frame.collisions.has("cursor:trigger"), true);
});

test("paused collisions do not consume the first playback entry", () => {
  const collision = new Set(["cursor:trigger"]);
  const paused = advanceScoreCollisionState(collision, new Set(), false);
  assert.deepEqual(paused.entered, []);
  assert.equal(paused.active.size, 0);
  const playing = advanceScoreCollisionState(collision, paused.active, true);
  assert.deepEqual(playing.entered, ["cursor:trigger"]);
});
