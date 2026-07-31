import test from "node:test";
import assert from "node:assert/strict";
import {
  createMediaSemanticFrame,
  FACE_DISPLAY_GROUPS,
  FACE_GROUPS,
  listMediaFeatureDefinitions,
  normalizedPointToMediaSpaces,
  resolveMediaFeatureDefinition,
} from "./mediaLandmarkOntology.js";

test("MediaPipe ontology retains official pose and hand indices with aliases", () => {
  assert.equal(resolveMediaFeatureDefinition("pose.left_index").index, 19);
  assert.equal(resolveMediaFeatureDefinition("left_hand.index_finger_tip").index, 8);
  assert.equal(resolveMediaFeatureDefinition("right_hand.thumb_tip").index, 4);
  assert.equal(resolveMediaFeatureDefinition("LH").id, "left_hand");
  assert.equal(resolveMediaFeatureDefinition("HEAD_outline").id, "body.head_outline");
  assert.equal(resolveMediaFeatureDefinition("body.head_outline").id, "body.head_outline");
});

test("face vertices remain numeric while official connection groups stay named", () => {
  assert.equal(resolveMediaFeatureDefinition("face.468").index, 468);
  assert.equal(resolveMediaFeatureDefinition("face.478"), null);
  assert.ok(FACE_GROUPS["face.face_oval"].includes(152));
  assert.deepEqual(listMediaFeatureDefinitions("face.468").map(item => item.id), ["face.468"]);
});

test("face display groups cover the complete refined mesh without overlap", () => {
  const seen = new Set();
  Object.values(FACE_DISPLAY_GROUPS).forEach(group => group.indices.forEach(index => {
    assert.equal(seen.has(index), false, `face landmark ${index} appears in more than one display group`);
    seen.add(index);
  }));
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 478 }, (_, index) => index));
});

test("normalized media coordinates map through a rotated processor rectangle", () => {
  const spaces = normalizedPointToMediaSpaces(
    { x: 1, y: 0.5, z: -0.2 },
    { x: 100, y: 200, width: 200, height: 100, angle: Math.PI / 2 },
  );
  assert.deepEqual(spaces.local, { x: 200, y: 50, z: -0.2 });
  assert.ok(Math.abs(spaces.scene.x - 200) < 1e-9);
  assert.ok(Math.abs(spaces.scene.y - 350) < 1e-9);
});

test("semantic frames resolve points, aggregates, outlines, and scale-normalized pinch", () => {
  const hand = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  hand[0] = { x: 0.5, y: 0.8 };
  hand[4] = { x: 0.5, y: 0.4 };
  hand[8] = { x: 0.51, y: 0.4 };
  hand[9] = { x: 0.5, y: 0.5 };
  const face = Array.from({ length: 478 }, (_, index) => ({ x: index / 478, y: 0.4 }));
  const frame = createMediaSemanticFrame({
    streamId: "holistic-1",
    element: { x: 0, y: 0, width: 100, height: 200, angle: 0 },
    result: { leftHandLandmarks: hand, faceLandmarks: face, updatedAt: 10 },
    now: 20,
  });
  assert.equal(frame.feature("left_hand.index_finger_tip").scene.x, 51);
  assert.equal(frame.feature("left_hand").points.length, 21);
  assert.ok(frame.feature("face.face_oval").points.length > 30);
  assert.deepEqual(frame.feature("body.head_outline").points, frame.feature("face.face_oval").points);
  assert.equal(frame.feature("left_hand.pinch").active, true);
  assert.equal(frame.feature("left_hand.pinch").confidence, null);
  assert.equal(frame.ageMs, 10);
});
