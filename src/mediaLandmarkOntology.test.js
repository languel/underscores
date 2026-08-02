import test from "node:test";
import assert from "node:assert/strict";
import {
  createMediaSemanticFrame,
  FACE_DISPLAY_GROUPS,
  getHolisticDisplayLayers,
  interpolateHolisticResult,
  FACE_GROUPS,
  mediaLandmarkFeatureId,
  POSE_DISPLAY_GROUPS,
  listMediaFeatureDefinitions,
  normalizedPointToMediaSpaces,
  resolveMediaFeatureDefinition,
} from "./mediaLandmarkOntology.js";

test("Holistic display interpolation smooths geometry without changing result metadata", () => {
  const from = {
    poseLandmarks: [{ x: 0, y: 0.25, z: -1, visibility: 0.5 }],
    leftHandLandmarks: [{ x: 0.2, y: 0.4 }],
  };
  const to = {
    poseLandmarks: [{ x: 1, y: 0.75, z: 1, visibility: 1 }],
    leftHandLandmarks: [{ x: 0.6, y: 0.8 }],
    faceLandmarks: [{ x: 0.3, y: 0.7 }],
    updatedAt: 42,
  };
  const halfway = interpolateHolisticResult(from, to, 0.5);
  assert.deepEqual(halfway.poseLandmarks[0], { x: 0.5, y: 0.5, z: 0, visibility: 0.75 });
  assert.deepEqual(halfway.leftHandLandmarks[0], { x: 0.4, y: 0.6000000000000001 });
  assert.deepEqual(halfway.faceLandmarks[0], to.faceLandmarks[0]);
  assert.equal(halfway.updatedAt, 42);
  assert.deepEqual(interpolateHolisticResult(from, to, 1).poseLandmarks, to.poseLandmarks);
});

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

test("semantic face categories include nose connections while remaining is points-only", () => {
  assert.ok(FACE_GROUPS["face.nose"].includes(168));
  assert.ok(FACE_GROUPS["face.nose"].includes(4));
  Object.entries(FACE_DISPLAY_GROUPS)
    .filter(([id]) => id !== "remaining")
    .forEach(([, group]) => assert.ok(group.connections.length > 0));
  assert.deepEqual(FACE_DISPLAY_GROUPS.remaining.connections, []);
});

test("nose display is a sparse bridge and open nostril-base contour", () => {
  const connections = FACE_DISPLAY_GROUPS.nose.connections.map(connection => connection.join("-"));
  assert.deepEqual(connections, [
    "168-6", "6-197", "197-195", "195-5", "5-4", "4-1", "1-19",
    "19-94", "94-2", "98-97", "97-2", "2-326", "326-327",
  ]);
  assert.equal(connections.includes("327-294"), false, "right outer mesh stays hidden");
  assert.equal(connections.includes("4-45"), false, "left outer mesh stays hidden");
});

test("pose display groups preserve body/head plus the three pose palm/finger references", () => {
  assert.deepEqual(POSE_DISPLAY_GROUPS.head.indices, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(POSE_DISPLAY_GROUPS.body.indices, [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
  assert.deepEqual(POSE_DISPLAY_GROUPS.leftHand.indices, [17, 19, 21]);
  assert.deepEqual(POSE_DISPLAY_GROUPS.rightHand.indices, [18, 20, 22]);
});

test("visible Holistic layers follow selected panel groups, connections, and handedness", () => {
  const hands = Array.from({ length: 21 }, (_, index) => ({ x: index / 20, y: 0.5 }));
  const layers = getHolisticDisplayLayers({
    poseLandmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5 })),
    leftHandLandmarks: hands,
    rightHandLandmarks: hands.map(point => ({ ...point, y: 0.25 })),
    faceLandmarks: Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 })),
  }, {
    poseGroups: { body: true, head: false, leftHand: false, rightHand: false },
    showLeftHand: true,
    showRightHand: false,
    swapHandedness: true,
    faceGroups: { outline: true, eyes: false, iris: false, nose: false, mouth: false, brows: false, remaining: false },
    colors: { poseBody: "#123456", leftHand: "#abcdef", face: "#fedcba" },
  });
  assert.deepEqual(layers.map(layer => layer.id), ["pose:body", "left_hand", "face:outline"]);
  assert.deepEqual(layers[0].connections, POSE_DISPLAY_GROUPS.body.connections);
  assert.equal(layers[1].landmarks[0].y, 0.25, "swapped left-hand display reads the right-hand result");
  assert.equal(layers[2].color, "#fedcba");
  assert.ok(layers[2].connections.length > 0);
});

test("snapshot labels use canonical MediaPipe point identifiers", () => {
  assert.equal(mediaLandmarkFeatureId("pose", 17), "pose.left_pinky");
  assert.equal(mediaLandmarkFeatureId("pose", 22), "pose.right_thumb");
  assert.equal(mediaLandmarkFeatureId("left_hand", 8), "left_hand.index_finger_tip");
  assert.equal(mediaLandmarkFeatureId("right_hand", 4), "right_hand.thumb_tip");
  assert.equal(mediaLandmarkFeatureId("face", 33), "face.33");
});

test("the mouth display group contains both official outer and inner lip contours", () => {
  assert.ok(FACE_GROUPS["face.lips"].includes(61));
  assert.ok(FACE_GROUPS["face.lips"].includes(78));
  assert.ok(FACE_GROUPS["face.lips"].includes(415));
});

test("eyebrow display paths join upper and lower edges only at the inner brow", () => {
  const connections = FACE_DISPLAY_GROUPS.brows.connections.map(connection => connection.join("-"));
  assert.ok(connections.includes("285-336"));
  assert.ok(connections.includes("55-107"));
  assert.equal(connections.includes("285-300"), false);
  assert.equal(connections.includes("55-70"), false);
  assert.equal(connections.includes("276-300"), false, "left outer brow remains open");
  assert.equal(connections.includes("46-70"), false, "right outer brow remains open");
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
