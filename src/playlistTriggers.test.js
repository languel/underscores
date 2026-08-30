import test from "node:test";
import assert from "node:assert/strict";
import { applyPlaylistTargetArgs, executePlaylistJavaScript, parsePlaylistCommand } from "./playlistTriggers.js";

const commands = [
  { id: "playlist.next", name: "Advance Playlist", aliases: ["/playlist next"] },
  { id: "transport.seek", name: "Seek", aliases: ["/seek"] },
];

test("playlist triggers resolve command ids and aliases with JSON args", () => {
  assert.deepEqual(parsePlaylistCommand("playlist.next", commands), { id: "playlist.next", args: {} });
  assert.deepEqual(parsePlaylistCommand("/command transport.seek {\"seconds\":2.5}", commands), { id: "transport.seek", args: { seconds: 2.5 } });
  assert.deepEqual(parsePlaylistCommand("/seek {\"seconds\":3}", commands), { id: "transport.seek", args: { seconds: 3 } });
  assert.deepEqual(parsePlaylistCommand("__.api.commands.execute('transport.seek', {\"seconds\":4})", commands), { id: "transport.seek", args: { seconds: 4 } });
});

test("playlist triggers report unknown commands and malformed args", () => {
  assert.match(parsePlaylistCommand("/command missing {}", commands).error, /Unknown/);
  assert.match(parsePlaylistCommand("transport.seek nope", commands).error, /Invalid playlist trigger JSON/);
  assert.equal(parsePlaylistCommand("/not-a-command", commands), null);
});

test("trusted playlist JavaScript runs through the __ bridge", async () => {
  const calls = [];
  await executePlaylistJavaScript("await __.api.commands.execute('playlist.next');", { api: { commands: { execute: id => calls.push(id) } } });
  assert.deepEqual(calls, ["playlist.next"]);
  await assert.rejects(() => executePlaylistJavaScript("window.alert('nope')", {}), /trusted __ bridge/);
});

test("playlist trigger targets fill implicit command element ids without overriding explicit args", () => {
  assert.deepEqual(applyPlaylistTargetArgs({ seconds: 2 }, { id: "live-node" }), { seconds: 2, elementId: "live-node" });
  assert.deepEqual(applyPlaylistTargetArgs({ elementId: "other-node" }, { id: "live-node" }), { elementId: "other-node" });
  assert.deepEqual(applyPlaylistTargetArgs({ targetId: "other-node" }, { id: "live-node" }), { targetId: "other-node" });
  assert.deepEqual(applyPlaylistTargetArgs({}, null), {});
});
