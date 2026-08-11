import test from "node:test";
import assert from "node:assert/strict";
import { getShaderStatuses, publishShaderStatus } from "./shaderStatus.js";

test("shader diagnostics persist until the shader compiles or unmounts", () => {
  publishShaderStatus({
    elementId: "shader-test",
    nodeId: "node-test",
    label: "Test shader",
    kind: "error",
    message: "fragment compile failed",
  });

  assert.deepEqual(getShaderStatuses()["shader-test"], {
    elementId: "shader-test",
    nodeId: "node-test",
    label: "Test shader",
    kind: "error",
    message: "fragment compile failed",
  });

  publishShaderStatus({ elementId: "shader-test", kind: "clear" });
  assert.equal(getShaderStatuses()["shader-test"], undefined);
});
