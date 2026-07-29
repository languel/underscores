import test from "node:test";
import assert from "node:assert/strict";
import { LIVECODE_KINDS } from "./livecodeNode.js";
import { getLivecodeHelp, LIVECODE_HELP } from "./livecodeHelp.js";

test("every persisted Livecode kind exposes concise adapter-owned in-app help", () => {
  for (const kind of Object.values(LIVECODE_KINDS)) {
    const help = getLivecodeHelp(kind);
    assert.equal(LIVECODE_HELP[kind], help);
    assert.ok(help.title.length > 0);
    assert.ok(help.summary.length > 0);
    assert.ok(help.points.length >= 3);
    assert.ok(help.footer.length > 0);
  }
});

test("unknown node kinds receive the safe Strudel reference", () => {
  assert.equal(getLivecodeHelp("future-adapter"), LIVECODE_HELP[LIVECODE_KINDS.strudel]);
});
