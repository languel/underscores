import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceScoreCollisionState,
  allocateIannixRoleLabels,
  createDefaultIannixData,
  dampCursorTransform,
  enforceRuntimeCursorHostVisibility,
  evaluateScoreFrame,
  getCursorTransform,
  getElementCenter,
  getElementCorePaths,
  getObjectTimeState,
  isRuntimeCursor,
  normalizeIannixData,
  pathsIntersect,
  reconcileRuntimeCursorHosts,
  samplePath,
  snapCursorHostToCurveStart,
  sweptPathsIntersect,
} from "./iannixEngine.js";
import { createBezierHostGeometry } from "./bezierGeometry.js";

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

test("runtime cursor hosts remain invisible even when an interaction restores their style", () => {
  const cursor = line("cursor", [[0, 0], [0, 20]], createDefaultIannixData({
    role: "cursor",
    cursor: { curveId: "curve", sourceOpacity: 70, sourceStrokeColor: "#ff3300" },
  }));
  cursor.opacity = 100;
  cursor.strokeColor = "#00ff00";
  const hidden = enforceRuntimeCursorHostVisibility(cursor);
  assert.equal(hidden.opacity, 0);
  assert.equal(hidden.strokeColor, "transparent");
  assert.equal(hidden.customData.iannix.cursor.sourceOpacity, 100);
  assert.equal(hidden.customData.iannix.cursor.sourceStrokeColor, "#00ff00");
  assert.equal(enforceRuntimeCursorHostVisibility(hidden), hidden);
});

test("scene import reconciliation restores a linked cursor host before installation", () => {
  const curve = line("curve", [[20, 30], [120, 30]], createDefaultIannixData({ role: "curve" }));
  const cursor = line("cursor", [[300, 400], [300, 440]], createDefaultIannixData({
    role: "cursor",
    cursor: { curveId: "curve", sourceOpacity: 75, sourceStrokeColor: "#ff3300" },
  }));
  cursor.opacity = 0;
  cursor.strokeColor = "transparent";

  const reconciled = reconcileRuntimeCursorHosts([curve, cursor]);
  const restoredCursor = reconciled[1];
  assert.deepEqual(getElementCenter(restoredCursor), [20, 30]);
  assert.equal(restoredCursor.opacity, 0);
  assert.equal(restoredCursor.strokeColor, "transparent");
  assert.equal(restoredCursor.customData.iannix.cursor.curveId, "curve");
  assert.equal(restoredCursor.customData.iannix.cursor.sourceOpacity, 75);
  assert.equal(restoredCursor.customData.iannix.cursor.sourceStrokeColor, "#ff3300");
});

test("selection import reconciliation can resolve a cursor against destination support", () => {
  const curve = line("existing-curve", [[50, 60], [150, 160]], createDefaultIannixData({ role: "curve" }));
  const cursor = line("pasted-cursor", [[500, 500], [500, 520]], createDefaultIannixData({
    role: "cursor",
    cursor: { curveId: "existing-curve" },
  }));
  cursor.opacity = 100;
  cursor.strokeColor = "#00ff00";

  const [restoredCursor] = reconcileRuntimeCursorHosts([cursor], [curve, cursor]);
  assert.deepEqual(getElementCenter(restoredCursor), [50, 60]);
  assert.equal(restoredCursor.opacity, 0);
  assert.equal(restoredCursor.strokeColor, "transparent");
  assert.equal(restoredCursor.customData.iannix.cursor.sourceStrokeColor, "#00ff00");
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

test("snapping a cursor host bakes the curve start pose into selectable geometry", () => {
  const cursor = line("cursor", [[0, -5], [0, 5]]);
  cursor.x = 80;
  cursor.y = 90;
  cursor.customData.originalPoints = [[80, 90], [80, 100]];
  const curve = line("curve", [[0, 0], [100, 100]]);
  const snapped = snapCursorHostToCurveStart(cursor, curve, true);
  assert.deepEqual(getElementCenter(snapped), [0, 0]);
  assert.ok(Math.abs(snapped.angle - Math.PI / 4) < 0.000001);
  assert.deepEqual(snapped.customData.originalPoints, [[0, -5], [0, 5]]);
  const runtimeTransform = getCursorTransform(snapped, curve, 0, true);
  assert.ok(Math.abs(runtimeTransform.translate[0]) < 0.000001);
  assert.ok(Math.abs(runtimeTransform.translate[1]) < 0.000001);
  assert.ok(Math.abs(runtimeTransform.angle) < 0.000001);
});

test("cursor transform follows canonical Bezier arc length instead of the host chord", () => {
  const cursor = line("cursor", [[0, -5], [0, 5]]);
  const curve = line("curve", [[0, 0], [100, 0]]);
  const canonical = createBezierHostGeometry([
    { x: 0, y: 0, in: null, out: [0, 80], mode: "smooth" },
    { x: 100, y: 0, in: [0, 80], out: null, mode: "smooth" },
  ]);
  Object.assign(curve, canonical.bounds, { points: canonical.points });
  curve.customData.draweratorGeometry = canonical.geometry;
  const transform = getCursorTransform(cursor, curve, 0.5, true);
  assert.ok(Math.abs(transform.position[0] - 50) < 0.5);
  assert.ok(transform.position[1] > 40);
});

test("cursor tangent follows the smooth display path of rounded native lines", () => {
  const cursor = line("cursor", [[0, -5], [0, 5]]);
  const curve = line("curve", [[0, 50], [50, 0], [100, 50]]);
  curve.roundness = { type: 2 };
  const before = getCursorTransform(cursor, curve, 0.499, true);
  const after = getCursorTransform(cursor, curve, 0.501, true);
  assert.ok(Math.abs(before.angle - after.angle) < 0.1);
  assert.ok(before.position[1] < 5);
  assert.ok(after.position[1] < 5);
});

test("cursor tangent follows a fitted cubic for native freehand paths", () => {
  const cursor = line("cursor", [[0, -5], [0, 5]]);
  const curve = line("curve", [[0, 50], [25, 15], [50, 0], [75, 15], [100, 50]]);
  curve.type = "freedraw";
  const before = getCursorTransform(cursor, curve, 0.499, true);
  const after = getCursorTransform(cursor, curve, 0.501, true);
  assert.ok(Math.abs(before.angle - after.angle) < 0.1);
});

test("visual cursor damping keeps position on-path and uses the shortest angle path", () => {
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
  assert.deepEqual(damped.position, target.position);
  assert.deepEqual(damped.translate, target.translate);
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

test("point-like freedraw triggers use their rendered stroke diameter", () => {
  const trigger = line("dot", [[50, 0]], createDefaultIannixData({ role: "trigger" }));
  trigger.type = "freedraw";
  trigger.points = [[0, 0], [0, 0], [0, 0], [0, 0]];
  trigger.strokeWidth = 4;

  const path = getElementCorePaths(trigger)[0];
  const xs = path.map(point => point[0]);
  const ys = path.map(point => point[1]);
  assert.ok(Math.abs(Math.min(...xs) - (50 - 8.5)) < 0.001);
  assert.ok(Math.abs(Math.max(...xs) - (50 + 8.5)) < 0.001);
  assert.ok(Math.abs(Math.min(...ys) - -8.5) < 0.001);
  assert.ok(Math.abs(Math.max(...ys) - 8.5) < 0.001);
});

test("multi-point freedraw trigger keeps its centerline and adds rendered stroke collision geometry", () => {
  const trigger = line("stroke", [[10, 20], [30, 40], [60, 10]], createDefaultIannixData({ role: "trigger" }));
  trigger.type = "freedraw";
  trigger.strokeWidth = 12;
  const paths = getElementCorePaths(trigger);
  assert.deepEqual(paths[0], [[10, 20], [30, 40], [60, 10]]);
  assert.ok(paths.length > 1);
  assert.equal(pathsIntersect([[[-10, 30], [4, 30]]], paths), true);
});

test("vertical freedraw triggers collide across their visible stroke width", () => {
  const trigger = line("vertical", [[50, -20], [50, 20]], createDefaultIannixData({ role: "trigger" }));
  trigger.type = "freedraw";
  trigger.strokeWidth = 4;
  const paths = getElementCorePaths(trigger);
  assert.equal(pathsIntersect([[[42, -5], [42, 5]]], paths), true);
  assert.equal(pathsIntersect([[[30, -5], [30, 5]]], paths), false);
});

test("a cursor crossing an Excalidraw point-like freedraw trigger collides between score frames", () => {
  const curve = line("curve", [[0, 0], [100, 0]], createDefaultIannixData({ role: "curve" }));
  const cursor = line("cursor", [[0, -20], [0, 20]], createDefaultIannixData({
    role: "cursor",
    time: { start: 0, duration: 10, rate: 1, loopMode: "once" },
    cursor: { curveId: "curve" },
  }));
  const trigger = line("dot", [[50, 0]], createDefaultIannixData({ role: "trigger" }));
  trigger.type = "freedraw";
  trigger.width = 1;
  trigger.height = 1;
  trigger.points = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];
  trigger.strokeWidth = 4;

  const previous = evaluateScoreFrame([curve, cursor, trigger], 4.8);
  const current = evaluateScoreFrame([curve, cursor, trigger], 5.2, previous.nextCursorPaths);
  assert.equal(current.collisions.has("cursor:dot"), true);
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

test("score frame can skip collision work for visual-only consumers", () => {
  const elements = [
    line("curve", [[0, 0], [100, 0]], createDefaultIannixData({ role: "curve" })),
    line("cursor", [[0, -10], [0, 10]], createDefaultIannixData({
      role: "cursor",
      time: { start: 0, duration: 10, rate: 1, loopMode: "once" },
      cursor: { curveId: "curve" },
    })),
    line("trigger", [[50, -20], [50, 20]], createDefaultIannixData({ role: "trigger" })),
  ];

  const frame = evaluateScoreFrame(elements, 5, new Map(), { detectCollisions: false });
  assert.equal(frame.cursors.length, 1);
  assert.equal(frame.collisions.size, 0);
  assert.equal(frame.triggerDurations.get("trigger"), 0.35);
});

test("paused collisions do not consume the first playback entry", () => {
  const collision = new Set(["cursor:trigger"]);
  const paused = advanceScoreCollisionState(collision, new Set(), false);
  assert.deepEqual(paused.entered, []);
  assert.equal(paused.active.size, 0);
  const playing = advanceScoreCollisionState(collision, paused.active, true);
  assert.deepEqual(playing.entered, ["cursor:trigger"]);
});

test("a sustained cursor-trigger collision enters once and can retrigger after exit", () => {
  const collision = new Set(["cursor:trigger"]);
  const first = advanceScoreCollisionState(collision, new Set(), true, {
    nowMs: 0,
    triggerDurations: new Map([["trigger", 1]]),
  });
  assert.deepEqual(first.entered, ["cursor:trigger"]);

  const sustained = advanceScoreCollisionState(collision, first.active, true, {
    nowMs: 100,
    lockouts: first.lockouts,
    triggerDurations: new Map([["trigger", 1]]),
  });
  assert.deepEqual(sustained.entered, []);

  const exited = advanceScoreCollisionState(new Set(), sustained.active, true, {
    nowMs: 200,
    lockouts: sustained.lockouts,
    triggerDurations: new Map([["trigger", 1]]),
  });
  assert.equal(exited.active.size, 0);

  const earlyReentry = advanceScoreCollisionState(collision, exited.active, true, {
    nowMs: 500,
    lockouts: exited.lockouts,
    triggerDurations: new Map([["trigger", 1]]),
  });
  assert.deepEqual(earlyReentry.entered, []);

  const released = advanceScoreCollisionState(new Set(), earlyReentry.active, true, {
    nowMs: 600,
    lockouts: earlyReentry.lockouts,
    triggerDurations: new Map([["trigger", 1]]),
  });
  const reentered = advanceScoreCollisionState(collision, released.active, true, {
    nowMs: 1001,
    lockouts: released.lockouts,
    triggerDurations: new Map([["trigger", 1]]),
  });
  assert.deepEqual(reentered.entered, ["cursor:trigger"]);
});

test("a trigger is globally latched when multiple cursors collide", () => {
  const duration = new Map([["trigger", 1]]);
  const first = advanceScoreCollisionState(
    new Set(["cursor-a:trigger", "cursor-b:trigger"]),
    new Set(),
    true,
    { nowMs: 0, triggerDurations: duration },
  );
  assert.deepEqual(first.entered, ["cursor-a:trigger"]);

  const handoff = advanceScoreCollisionState(
    new Set(["cursor-b:trigger"]),
    first.active,
    true,
    { nowMs: 250, lockouts: first.lockouts, triggerDurations: duration },
  );
  assert.deepEqual(handoff.entered, []);
});

test("independent cursor latches allow multiple cursors to voice one trigger", () => {
  const duration = new Map([["trigger", 1]]);
  const first = advanceScoreCollisionState(
    new Set(["cursor-a:trigger", "cursor-b:trigger"]),
    new Set(),
    true,
    { nowMs: 0, triggerDurations: duration, latchTriggersAcrossCursors: false },
  );
  assert.deepEqual(first.entered, ["cursor-a:trigger", "cursor-b:trigger"]);

  const exited = advanceScoreCollisionState(
    new Set(),
    first.active,
    true,
    {
      nowMs: 100,
      lockouts: first.lockouts,
      triggerDurations: duration,
      latchTriggersAcrossCursors: false,
    },
  );
  const earlyReentry = advanceScoreCollisionState(
    new Set(["cursor-a:trigger"]),
    exited.active,
    true,
    {
      nowMs: 500,
      lockouts: exited.lockouts,
      triggerDurations: duration,
      latchTriggersAcrossCursors: false,
    },
  );
  assert.deepEqual(earlyReentry.entered, []);
});
