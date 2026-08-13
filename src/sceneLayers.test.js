import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSceneGroupTree,
  groupSceneElements,
  moveSceneElementsToGroup,
  moveSceneGroupToParent,
  moveSceneElementsToGroupParent,
  renameSceneGroup,
  ungroupSceneElements,
} from "./sceneLayers.js";

const element = (id, groupIds = []) => ({ id, groupIds, isDeleted: false });

test("groups selected scene elements without replacing existing nested memberships", () => {
  const source = [element("a", ["outer"]), element("b", ["outer"]), element("c")];
  const result = groupSceneElements(source, ["a", "c"], "inner");
  assert.deepEqual(result.elements.map(item => item.groupIds), [["outer", "inner"], ["outer"], ["inner"]]);
  assert.equal(result.groupId, "inner");
});

test("ungroup removes the shared innermost group from every member", () => {
  const source = [element("a", ["outer", "inner"]), element("b", ["outer", "inner"]), element("c", ["outer"])];
  const result = ungroupSceneElements(source, ["a"]);
  assert.equal(result.groupId, "inner");
  assert.deepEqual(result.elements.map(item => item.groupIds), [["outer"], ["outer"], ["outer"]]);
});

test("builds a nested outliner tree from Excalidraw group ids", () => {
  const tree = buildSceneGroupTree([
    element("back", ["outer", "inner"]),
    element("front", ["outer"]),
    element("root"),
  ]);
  assert.equal(tree.children[0].element.id, "root");
  assert.equal(tree.children[1].id, "outer");
  assert.equal(tree.children[1].children[0].element.id, "front");
  assert.equal(tree.children[1].children[1].id, "inner");
  assert.equal(tree.children[1].children[1].children[0].element.id, "back");
});

test("puts imported IanniX objects below their score and setGroup hierarchy", () => {
  const tree = buildSceneGroupTree([
    { id: "curve", customData: { iannixImport: { scoreId: "orbit", scoreLabel: "Orbit score", group: "motion" } } },
    { id: "trigger", customData: { iannixImport: { scoreId: "orbit", scoreLabel: "Orbit score", group: "events" } } },
    { id: "plain", customData: {} },
  ], { outlinerOrder: true });
  const score = tree.children.find(node => node.kind === "score");
  assert.equal(score.label, "Orbit score");
  assert.deepEqual(score.children.map(node => node.id), ["motion", "events"]);
  assert.equal(score.children[0].children[0].element.id, "curve");
  assert.equal(tree.children.at(-1).element.id, "plain");
});

test("dragging a member outside a nested group removes only its innermost membership", () => {
  const source = [element("a", ["outer", "inner"]), element("b", ["outer", "inner"]), element("c")];
  const result = moveSceneElementsToGroupParent(source, ["a"], "outer");
  assert.deepEqual(result.map(item => item.groupIds), [["outer"], ["outer", "inner"], []]);
});

test("reparents an entire group without flattening its nested children", () => {
  const source = [
    element("a", ["outer", "inner"]),
    element("b", ["outer", "inner", "nested"]),
    element("target", ["destination"]),
  ];
  const result = moveSceneGroupToParent(source, "inner", "destination");
  assert.deepEqual(result.map(item => item.groupIds), [["destination", "inner"], ["destination", "inner", "nested"], ["destination"]]);
});

test("does not allow a group to become a child of its own descendant", () => {
  const source = [element("a", ["outer", "inner"]), element("b", ["outer", "inner", "nested"])];
  assert.equal(moveSceneGroupToParent(source, "outer", "inner"), source);
});

test("moves a leaf element into the exact existing group path", () => {
  const source = [element("a", ["outer", "inner"]), element("target", ["destination", "nested"]), element("root")];
  const result = moveSceneElementsToGroup(source, ["a", "root"], "nested");
  assert.deepEqual(result.map(item => item.groupIds), [["destination", "nested"], ["destination", "nested"], ["destination", "nested"]]);
});

test("renames a group on every member and exposes the label in the outliner tree", () => {
  const source = [element("a", ["group-a"]), element("b", ["group-a"]), element("c")];
  const renamed = renameSceneGroup(source, "group-a", "Performers");
  assert.equal(renamed[0].customData.underscoreGroupLabels["group-a"], "Performers");
  assert.equal(renamed[1].customData.underscoreGroupLabels["group-a"], "Performers");
  assert.equal(renamed[2], source[2]);
  assert.equal(buildSceneGroupTree(renamed).children.find(node => node.id === "group-a").label, "Performers");
});
