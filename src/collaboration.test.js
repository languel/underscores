import test from "node:test";
import assert from "node:assert/strict";
import { CollaborationController, consumeCollaborationGestureEnd } from "./collaboration/CollaborationController.js";
import { decryptJson, encryptJson } from "./collaboration/crypto.js";
import { addPrecedingElementMarkers, reconcileCollaborationElements } from "./collaboration/reconciliation.js";
import {
  collaborationAuthoredStateSignature,
  collaborationDocumentDigest,
  collaborationDocumentSignature,
  mergeCollaborationAppState,
  mergeCollaborationDocuments,
  stampCollaborationDocument,
  toCollaborationSceneDocument,
} from "./collaboration/sceneDocument.js";
import {
  createCollaborationUrl,
  generateRoomCredentials,
  parseCollaborationUrl,
  redactCollaborationUrl,
} from "./collaboration/roomUrl.js";
import { CollaborationRoomCache } from "./collaboration/storage.js";

const scene = ({ elements = [], scripts = [], background = "#ffffff" } = {}) => ({
  type: "excalidraw",
  version: 2,
  elements,
  appState: { viewBackgroundColor: background, scrollX: 42, theme: "dark" },
  files: { local: { id: "local" } },
  underscores: {
    version: 13,
    kind: "scene",
    score: { time: 91, tempo: 120 },
    p5Scripts: scripts,
    authoredState: {},
  },
});

const element = (id, version = 1, versionNonce = 1, patch = {}) => ({
  id,
  type: "rectangle",
  version,
  versionNonce,
  isDeleted: false,
  ...patch,
});

const freedraw = (id, points, version = 1, versionNonce = 1) => element(id, version, versionNonce, {
  type: "freedraw",
  points,
  x: 100,
  y: 100,
  width: Math.max(0, ...points.map(point => point[0])),
  height: Math.max(0, ...points.map(point => point[1])),
});

test("room links keep credentials in the hash and redact the secret", () => {
  const credentials = generateRoomCredentials();
  const link = createCollaborationUrl(credentials, "https://example.test/board?scene=ignored#u=old");
  assert.match(link, /\?scene=ignored#room=/);
  assert.deepEqual(parseCollaborationUrl(link), credentials);
  assert.equal(new URL(link).searchParams.has("room"), false);
  assert.doesNotMatch(redactCollaborationUrl(link), new RegExp(credentials.secret));
  assert.match(redactCollaborationUrl(link), /\[redacted\]$/);
});

test("pointer presence updates do not checkpoint until a real gesture ends", () => {
  const state = { down: false };
  assert.equal(consumeCollaborationGestureEnd({ button: "up" }, state), false);
  assert.equal(consumeCollaborationGestureEnd({ button: "up" }, state), false);
  assert.equal(consumeCollaborationGestureEnd({ button: "down" }, state), false);
  assert.equal(consumeCollaborationGestureEnd({ button: "up" }, state), true);
  assert.equal(consumeCollaborationGestureEnd({ button: "up" }, state), false);
});

test("controller does not publish an active in-progress element", async t => {
  const provider = new FakeProvider();
  const active = freedraw("active-stroke", [[0, 0]], 1, 5);
  const callbacks = {
    getDocument: () => scene(),
    getAppState: () => ({ newElement: { id: active.id } }),
    isPointerGestureActive: () => true,
    getFiles: () => ({}),
    getPresence: () => ({ selectedElementIds: {} }),
    applyCollaborators: () => {},
  };
  const location = { href: "https://example.test/board" };
  const controller = new CollaborationController({
    getCallbacks: () => callbacks,
    providerFactory: () => provider,
    cache: new CollaborationRoomCache(null),
    location,
    history: { replaceState: (_state, _title, href) => { location.href = href; } },
  });
  t.after(() => controller.leaveRoom({ keepUrl: true, resumeSolo: false }));
  await controller.createRoom();
  const reliableBefore = provider.sent.filter(item => item.channel === "reliable").length;
  assert.equal(controller.publishDocument(scene({ elements: [active] }), { immediate: true }), false);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(provider.sent.filter(item => item.channel === "reliable").length, reliableBefore);
  assert.equal(controller.currentDocument.elements.length, 0);
});

test("controller can publish a renderable multi-point gesture prefix", async t => {
  const provider = new FakeProvider();
  const active = freedraw("active-stroke", [[0, 0], [12, 8]], 2, 6);
  const callbacks = {
    getDocument: () => scene(),
    getAppState: () => ({ newElement: { id: active.id } }),
    isPointerGestureActive: () => true,
    getFiles: () => ({}),
    getPresence: () => ({ selectedElementIds: {} }),
    applyCollaborators: () => {},
  };
  const location = { href: "https://example.test/board" };
  const controller = new CollaborationController({
    getCallbacks: () => callbacks,
    providerFactory: () => provider,
    cache: new CollaborationRoomCache(null),
    location,
    history: { replaceState: (_state, _title, href) => { location.href = href; } },
  });
  t.after(() => controller.leaveRoom({ keepUrl: true, resumeSolo: false }));
  await controller.createRoom();
  assert.equal(
    controller.publishDocument(scene({ elements: [active] }), { immediate: true, allowActiveGesture: true }),
    true,
  );
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(controller.currentDocument.elements[0].points, active.points);
  assert.ok(provider.sent.some(item => item.channel === "reliable"));
});

test("controller publishes a programmatic Livecode element while the pointer is idle", async t => {
  const provider = new FakeProvider();
  const livecode = element("livecode-node", 1, 9, {
    customData: {
      underscoresLivecode: {
        version: 1,
        nodeId: "node-2",
        kind: "p5",
        source: "draw = () => line(0, 0, random(width), random(height))",
        runtime: { running: true, transportMode: "free" },
      },
    },
  });
  const callbacks = {
    getDocument: () => scene(),
    // Excalidraw can retain this marker after updateScene() has completed.
    getAppState: () => ({ newElement: { id: livecode.id } }),
    isPointerGestureActive: () => false,
    getFiles: () => ({}),
    getPresence: () => ({ selectedElementIds: {} }),
    applyCollaborators: () => {},
  };
  const location = { href: "https://example.test/board" };
  const controller = new CollaborationController({
    getCallbacks: () => callbacks,
    providerFactory: () => provider,
    cache: new CollaborationRoomCache(null),
    location,
    history: { replaceState: (_state, _title, href) => { location.href = href; } },
  });
  t.after(() => controller.leaveRoom({ keepUrl: true, resumeSolo: false }));
  await controller.createRoom();
  assert.equal(controller.publishDocument(scene({ elements: [livecode] }), { immediate: true }), true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(controller.currentDocument.elements[0].customData.underscoresLivecode.nodeId, "node-2");
  assert.ok(provider.sent.some(item => item.channel === "reliable"));
});

test("AES-GCM collaboration envelopes round-trip and reject a wrong key", async () => {
  const first = generateRoomCredentials();
  const second = generateRoomCredentials();
  const envelope = await encryptJson({ value: "private scene" }, first.secret);
  assert.deepEqual(await decryptJson(envelope, first.secret), { value: "private scene" });
  await assert.rejects(() => decryptJson(envelope, second.secret), /could not be decrypted/);
});

test("canonical collaboration scenes omit local runtime state and files", () => {
  const document = toCollaborationSceneDocument(scene());
  assert.deepEqual(document.appState, { viewBackgroundColor: "#ffffff" });
  assert.equal(document.files, undefined);
  assert.equal(document.underscores.score.time, undefined);
  assert.equal(document.underscores.version, 13);
  assert.equal(document.underscores.collaboration.schemaVersion, 1);
});

test("canonical collaboration signatures ignore camera and selection state", () => {
  const first = scene({ elements: [element("shared")] });
  const second = {
    ...first,
    appState: {
      ...first.appState,
      scrollX: 900,
      scrollY: -420,
      zoom: { value: 2.5 },
      selectedElementIds: { shared: true },
      activeTool: { type: "rectangle" },
    },
  };
  assert.equal(collaborationDocumentSignature(first), collaborationDocumentSignature(second));
  assert.deepEqual(mergeCollaborationDocuments(first, second).appState, { viewBackgroundColor: "#ffffff" });
});

test("remote authored app state preserves each editor's local viewport and tool", () => {
  const local = {
    scrollX: 320,
    scrollY: -180,
    zoom: { value: 1.75 },
    selectedElementIds: { local: true },
    activeTool: { type: "freedraw" },
    viewBackgroundColor: "#ffffff",
  };
  const merged = mergeCollaborationAppState(local, { viewBackgroundColor: "#121212" });
  assert.equal(merged.scrollX, 320);
  assert.equal(merged.scrollY, -180);
  assert.deepEqual(merged.zoom, { value: 1.75 });
  assert.deepEqual(merged.selectedElementIds, { local: true });
  assert.deepEqual(merged.activeTool, { type: "freedraw" });
  assert.equal(merged.viewBackgroundColor, "#121212");
});

test("authored-state signatures ignore element-only edits", () => {
  const first = scene({ elements: [element("shared", 1, 2)] });
  const second = scene({ elements: [element("shared", 2, 3, { x: 100 })] });
  assert.equal(collaborationAuthoredStateSignature(first), collaborationAuthoredStateSignature(second));
});

test("metadata merge resolves whole records by Lamport clock and actor id", () => {
  const base = stampCollaborationDocument(scene({ scripts: [{ id: "main", source: "one" }] }), null, "a").document;
  const left = stampCollaborationDocument(scene({ scripts: [{ id: "main", source: "left" }] }), base, "a").document;
  const right = stampCollaborationDocument(scene({ scripts: [{ id: "main", source: "right" }] }), base, "z").document;
  const mergedLeftRight = mergeCollaborationDocuments(left, right);
  const mergedRightLeft = mergeCollaborationDocuments(right, left);
  assert.equal(mergedLeftRight.underscores.p5Scripts[0].source, "right");
  assert.equal(mergedRightLeft.underscores.p5Scripts[0].source, "right");
});

test("element reconciliation preserves active local edits and remote tombstones", () => {
  const local = [element("active", 3, 5), element("deleted", 1, 3)];
  const remote = addPrecedingElementMarkers([
    element("deleted", 2, 4, { isDeleted: true }),
    element("active", 4, 6, { x: 500 }),
  ]);
  const merged = reconcileCollaborationElements(local, remote, { editingElement: { id: "active" } });
  assert.equal(merged.find(item => item.id === "active").x, undefined);
  assert.equal(merged.find(item => item.id === "deleted").isDeleted, true);
  assert.deepEqual(merged.map(item => item.id), ["deleted", "active"]);
});

test("element reconciliation protects a freedraw while it is the active new element", () => {
  const complete = freedraw("stroke", [[0, 0], [12, 8], [24, 18]], 1, 7);
  const staleDraft = addPrecedingElementMarkers([freedraw("stroke", [[0, 0]], 1, 7)]);
  const merged = reconcileCollaborationElements([complete], staleDraft, { newElement: { id: "stroke" } });
  assert.deepEqual(merged[0].points, complete.points);
});

test("document hashes are stable across object key order", async () => {
  const first = stampCollaborationDocument(scene({ elements: [element("a")] }), null, "actor").document;
  const second = JSON.parse(JSON.stringify(first));
  second.appState = { viewBackgroundColor: second.appState.viewBackgroundColor };
  assert.equal(await collaborationDocumentDigest(first), await collaborationDocumentDigest(second));
});

test("room cache recovers encrypted snapshots and image blobs without IndexedDB", async () => {
  const cache = new CollaborationRoomCache(null);
  const credentials = generateRoomCredentials();
  const document = scene({ elements: [element("image", 1, 2, { type: "image", fileId: "file-1" })] });
  const file = { id: "file-1", mimeType: "image/png", dataURL: "data:image/png;base64,AA==" };
  await cache.saveRoom(credentials.roomId, await encryptJson(document, credentials.secret));
  await cache.saveFile(credentials.roomId, file.id, await encryptJson(file, credentials.secret));
  const restoredRoom = await cache.loadRoom(credentials.roomId);
  const restoredFile = await cache.loadFile(credentials.roomId, file.id);
  assert.deepEqual(await decryptJson(restoredRoom.encryptedSnapshot, credentials.secret), document);
  assert.deepEqual(await decryptJson(restoredFile.encryptedFile, credentials.secret), file);
});

class FakeProvider {
  constructor() {
    this.listeners = new Set();
    this.sent = [];
    this.capabilities = { persistence: false, binaryTransfer: true };
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async connect() { this.emit({ type: "status", status: "connected", error: "" }); }
  async disconnect() {}
  async sendReliable(data, peerId) { this.sent.push({ channel: "reliable", data, peerId }); }
  async sendEphemeral(data, peerId) { this.sent.push({ channel: "ephemeral", data, peerId }); }
  async sendBinary(data, metadata, peerId) { this.sent.push({ channel: "binary", data, metadata, peerId }); }
  emit(event) { this.listeners.forEach(listener => listener(event)); }
}

class LinkedProvider extends FakeProvider {
  constructor(id) {
    super();
    this.id = id;
    this.peer = null;
  }

  async sendReliable(data, peerId) {
    await super.sendReliable(data, peerId);
    if (!this.peer) return;
    queueMicrotask(() => this.peer.emit({ type: "message", channel: "reliable", peerId: this.id, data }));
  }

  async sendEphemeral(data, peerId) {
    await super.sendEphemeral(data, peerId);
    if (!this.peer) return;
    queueMicrotask(() => this.peer.emit({ type: "message", channel: "ephemeral", peerId: this.id, data }));
  }
}

test("controller creates, publishes, receives, and leaves through the provider contract", async t => {
  const provider = new FakeProvider();
  const applied = [];
  const callbacks = {
    getDocument: () => scene({ elements: [element("local")] }),
    getAppState: () => ({}),
    getFiles: () => ({}),
    getPresence: () => ({ selectedElementIds: {} }),
    applyDocument: document => applied.push(structuredClone(document)),
    applyCollaborators: () => {},
  };
  const location = { href: "https://example.test/board" };
  const history = { replaceState: (_state, _title, href) => { location.href = href; } };
  const controller = new CollaborationController({ getCallbacks: () => callbacks, providerFactory: () => provider, location, history });
  t.after(() => controller.leaveRoom({ keepUrl: true, resumeSolo: false }));
  const created = await controller.createRoom();
  const credentials = parseCollaborationUrl(created.url);
  assert.equal(controller.getStatus().active, true);
  controller.publishDocument(scene({ elements: [element("local", 2, 7)] }), { immediate: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(provider.sent.some(item => item.channel === "reliable"));

  const remote = stampCollaborationDocument(scene({ elements: [element("remote", 1, 4)] }), null, "remote-actor").document;
  provider.emit({
    type: "message",
    channel: "reliable",
    peerId: "peer-1",
    data: await encryptJson({ protocol: 1, kind: "snapshot", actorId: "remote-actor", document: remote }, credentials.secret),
  });
  const deadline = Date.now() + 1_000;
  while (applied.length === 0 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  await controller.remoteApplyChain;
  assert.ok(applied.at(-1).elements.some(item => item.id === "remote"));

  const beforeReconcile = applied.length;
  controller.publishDocument(scene({ elements: [element("local", 2, 7)] }), { immediate: true });
  const reconcileDeadline = Date.now() + 1_000;
  while (applied.length === beforeReconcile && Date.now() < reconcileDeadline) {
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.ok(applied.at(-1).elements.some(item => item.id === "remote"), "a local undo must not remove a remote element");

  // An explicit tombstone is different from an omitted element. This is the
  // shape emitted by a whole-scene clear, and it must be allowed to delete an
  // object that was previously authored by another peer.
  controller.publishDocument(scene({ elements: [
    element("local", 2, 7),
    element("remote", 2, 5, { isDeleted: true }),
  ] }), { immediate: true });
  await controller.remoteApplyChain;
  assert.equal(controller.currentDocument.elements.find(item => item.id === "remote")?.isDeleted, true);

  provider.emit({ type: "status", status: "degraded", error: `relay failed for ${credentials.secret}` });
  assert.equal(controller.getStatus().error, "relay failed for [redacted]");

  await controller.leaveRoom();
  assert.equal(controller.getStatus().active, false);
  assert.equal(location.href, "https://example.test/board");
});

test("a failed peer path does not mark an already connected room as unavailable", async t => {
  const provider = new FakeProvider();
  const callbacks = {
    getDocument: () => scene(),
    getAppState: () => ({}),
    getFiles: () => ({}),
    getPresence: () => ({ selectedElementIds: {} }),
    applyCollaborators: () => {},
  };
  const location = { href: "https://example.test/board" };
  const controller = new CollaborationController({
    getCallbacks: () => callbacks,
    providerFactory: () => provider,
    cache: new CollaborationRoomCache(null),
    location,
    history: { replaceState: (_state, _title, href) => { location.href = href; } },
  });
  t.after(() => controller.leaveRoom({ keepUrl: true, resumeSolo: false }));
  await controller.createRoom();

  provider.emit({ type: "peer-error", peerId: "unreachable", error: "ICE timeout" });
  assert.equal(controller.getStatus().status, "degraded");
  assert.match(controller.getStatus().error, /ICE timeout/);

  provider.emit({ type: "peer-join", peerId: "reachable" });
  await new Promise(resolve => setTimeout(resolve, 0));
  controller.handleReliableMessage({
    protocol: 1,
    kind: "hello",
    actorId: "reachable-actor",
    identity: { name: "Guest", color: "#1971c2" },
    digest: "",
  }, "reachable");
  assert.equal(controller.getStatus().status, "connected");
  assert.equal(controller.getStatus().error, "");
});

test("controller applies one linked-room snapshot and forwards a later authored edit", async t => {
  const firstProvider = new LinkedProvider("first");
  const secondProvider = new LinkedProvider("second");
  firstProvider.peer = secondProvider;
  secondProvider.peer = firstProvider;
  const firstApplied = [];
  const secondApplied = [];
  let firstAppState = {};
  const firstCallbacks = {
    getDocument: () => scene({ elements: [element("room-seed")] }),
    getAppState: () => firstAppState,
    isPointerGestureActive: () => false,
    getFiles: () => ({}),
    getPresence: () => ({ selectedElementIds: {} }),
    applyDocument: document => firstApplied.push(structuredClone(document)),
    applyCollaborators: () => {},
  };
  const secondCallbacks = {
    getDocument: () => scene(),
    getAppState: () => ({}),
    getFiles: () => ({}),
    getPresence: () => ({ selectedElementIds: {} }),
    applyDocument: document => secondApplied.push(structuredClone(document)),
    applyCollaborators: () => {},
  };
  const firstLocation = { href: "https://example.test/board" };
  const secondLocation = { href: "https://example.test/board" };
  const firstHistory = { replaceState: (_state, _title, href) => { firstLocation.href = href; } };
  const secondHistory = { replaceState: (_state, _title, href) => { secondLocation.href = href; } };
  const first = new CollaborationController({
    getCallbacks: () => firstCallbacks,
    providerFactory: () => firstProvider,
    cache: new CollaborationRoomCache(null),
    location: firstLocation,
    history: firstHistory,
  });
  const second = new CollaborationController({
    getCallbacks: () => secondCallbacks,
    providerFactory: () => secondProvider,
    cache: new CollaborationRoomCache(null),
    location: secondLocation,
    history: secondHistory,
  });
  t.after(async () => {
    await first.leaveRoom({ keepUrl: true, resumeSolo: false });
    await second.leaveRoom({ keepUrl: true, resumeSolo: false });
  });

  const created = await first.createRoom();
  await second.joinRoom(created.url);
  firstProvider.emit({ type: "peer-join", peerId: "second" });
  secondProvider.emit({ type: "peer-join", peerId: "first" });
  await new Promise(resolve => setTimeout(resolve, 25));
  await first.remoteApplyChain;
  await second.remoteApplyChain;

  assert.equal(secondApplied.length, 1, "the joiner should apply one initial snapshot");
  assert.ok(secondApplied[0].elements.some(item => item.id === "room-seed"));

  first.publishDocument(scene({ elements: [element("room-seed"), element("later-edit", 1, 3)] }), { immediate: true });
  await new Promise(resolve => setTimeout(resolve, 75));
  await second.remoteApplyChain;
  assert.ok(secondApplied.at(-1).elements.some(item => item.id === "later-edit"));

  const livecode = element("second-livecode", 1, 4, {
    customData: {
      underscoresLivecode: {
        version: 1,
        nodeId: "peer-p5",
        kind: "p5",
        source: "draw = () => line(0, 0, random(width), random(height))",
        runtime: { running: true, transportMode: "linked" },
      },
    },
  });
  firstAppState = { newElement: { id: livecode.id } };
  assert.equal(first.publishDocument(scene({
    elements: [element("room-seed"), element("later-edit", 1, 3), livecode],
  }), { immediate: true }), true);
  await new Promise(resolve => setTimeout(resolve, 75));
  await second.remoteApplyChain;
  assert.equal(
    secondApplied.at(-1).elements.find(item => item.id === livecode.id)?.customData?.underscoresLivecode?.nodeId,
    "peer-p5",
    "an idle programmatic Livecode node should reach the linked peer",
  );

  const secondSnapshotCount = secondApplied.length;
  firstProvider.emit({
    type: "message",
    channel: "reliable",
    peerId: "second",
    data: await encryptJson({
      protocol: 1,
      kind: "snapshot",
      actorId: "first",
      document: first.currentDocument,
    }, first.secret),
  });
  await second.remoteApplyChain;
  assert.equal(secondApplied.length, secondSnapshotCount, "duplicate snapshots should not re-import the scene");
});

test("two-peer room smoke preserves a continuous freedraw after the gesture settles", async t => {
  const firstProvider = new LinkedProvider("first-stroke");
  const secondProvider = new LinkedProvider("second-stroke");
  firstProvider.peer = secondProvider;
  secondProvider.peer = firstProvider;
  let firstDocument = scene();
  const secondApplied = [];
  const callbacks = (getDocument, applyDocument = () => {}) => ({
    getDocument,
    getAppState: () => ({}),
    getFiles: () => ({}),
    getPresence: () => ({ selectedElementIds: {} }),
    applyDocument,
    applyCollaborators: () => {},
  });
  const firstLocation = { href: "https://example.test/board" };
  const secondLocation = { href: "https://example.test/board" };
  const first = new CollaborationController({
    getCallbacks: () => callbacks(() => firstDocument),
    providerFactory: () => firstProvider,
    cache: new CollaborationRoomCache(null),
    location: firstLocation,
    history: { replaceState: (_state, _title, href) => { firstLocation.href = href; } },
  });
  const second = new CollaborationController({
    getCallbacks: () => callbacks(() => scene(), document => secondApplied.push(structuredClone(document))),
    providerFactory: () => secondProvider,
    cache: new CollaborationRoomCache(null),
    location: secondLocation,
    history: { replaceState: (_state, _title, href) => { secondLocation.href = href; } },
  });
  t.after(async () => {
    await first.leaveRoom({ keepUrl: true, resumeSolo: false });
    await second.leaveRoom({ keepUrl: true, resumeSolo: false });
  });

  const created = await first.createRoom();
  await second.joinRoom(created.url);
  firstProvider.emit({ type: "peer-join", peerId: "second-stroke" });
  secondProvider.emit({ type: "peer-join", peerId: "first-stroke" });
  await new Promise(resolve => setTimeout(resolve, 400));
  await first.remoteApplyChain;
  await second.remoteApplyChain;

  const draft = freedraw("stroke", [[0, 0]], 1, 17);
  firstDocument = scene({ elements: [draft] });
  assert.equal(first.publishDocument(firstDocument, { immediate: true }), true);
  await new Promise(resolve => setTimeout(resolve, 25));
  await second.remoteApplyChain;
  assert.equal(second.currentDocument.elements[0].points.length, 1);

  const complete = freedraw("stroke", [[0, 0], [8, 5], [18, 14], [32, 21]], 1, 17);
  firstDocument = scene({ elements: [complete] });
  first.checkpointAfterGesture();
  await new Promise(resolve => setTimeout(resolve, 125));
  await first.remoteApplyChain;
  await second.remoteApplyChain;

  assert.deepEqual(first.currentDocument.elements[0].points, complete.points);
  assert.deepEqual(second.currentDocument.elements[0].points, complete.points);
  assert.deepEqual(secondApplied.at(-1).elements[0].points, complete.points);
});

test("pointer-only presence refreshes collaborators without rerendering status subscribers", async t => {
  const collaboratorFrames = [];
  const controller = new CollaborationController({
    getCallbacks: () => ({ applyCollaborators: collaborators => collaboratorFrames.push(collaborators) }),
    cache: new CollaborationRoomCache(null),
  });
  t.after(() => controller.leaveRoom({ keepUrl: true, resumeSolo: false }));
  let statusNotifications = 0;
  const unsubscribe = controller.subscribe(() => { statusNotifications += 1; });
  t.after(unsubscribe);

  controller.handlePresenceMessage({
    protocol: 1,
    kind: "presence",
    actorId: "remote",
    identity: { name: "Peer", color: "#1971c2" },
    pointer: { x: 1, y: 2 },
    sequence: 1,
  }, "peer");
  await new Promise(resolve => setTimeout(resolve, 70));
  const afterRosterJoin = statusNotifications;

  for (let sequence = 2; sequence <= 20; sequence += 1) {
    controller.handlePresenceMessage({
      protocol: 1,
      kind: "presence",
      actorId: "remote",
      identity: { name: "Peer", color: "#1971c2" },
      pointer: { x: sequence, y: sequence * 2 },
      sequence,
    }, "peer");
  }
  await new Promise(resolve => setTimeout(resolve, 70));

  assert.equal(statusNotifications, afterRosterJoin);
  assert.equal(collaboratorFrames.length, 1, "pointer-only packets do not redraw Excalidraw collaborators");
  assert.equal(collaboratorFrames.at(-1).get("peer").pointer, null);
  assert.deepEqual(controller.getPeers()[0].pointer, { x: 20, y: 40 });
});

test("guest hex colors are passed to Excalidraw as matching pointer colors", async t => {
  const collaboratorFrames = [];
  const controller = new CollaborationController({
    getCallbacks: () => ({ applyCollaborators: collaborators => collaboratorFrames.push(collaborators) }),
    cache: new CollaborationRoomCache(null),
  });
  t.after(() => controller.leaveRoom({ keepUrl: true, resumeSolo: false }));

  controller.handlePresenceMessage({
    protocol: 1,
    kind: "presence",
    actorId: "remote",
    identity: { name: "Purple", color: "#8e44ad" },
    pointer: { x: 1, y: 2, tool: "pointer" },
    sequence: 1,
  }, "peer-purple");
  await new Promise(resolve => setTimeout(resolve, 70));
  const collaborator = collaboratorFrames.at(-1).get("peer-purple");
  assert.deepEqual(collaborator.color, { background: "#8e44ad", stroke: "#8e44ad" });
  assert.equal(collaborator.pointer, null, "native Excalidraw pointers are explicitly cleared; Underscores renders the color-matched overlay");
});

test("initialized remote edits do not publish redundant controller status", async t => {
  const applied = [];
  const controller = new CollaborationController({
    getCallbacks: () => ({
      applyDocument: document => applied.push(structuredClone(document)),
      getAppState: () => ({}),
      getFiles: () => ({}),
    }),
    cache: new CollaborationRoomCache(null),
  });
  t.after(() => controller.leaveRoom({ keepUrl: true, resumeSolo: false }));
  controller.currentDocument = stampCollaborationDocument(scene({ elements: [element("shared")] }), null, "local").document;
  controller.state.initialized = true;
  let statusNotifications = 0;
  const unsubscribe = controller.subscribe(() => { statusNotifications += 1; });
  t.after(unsubscribe);

  const remote = stampCollaborationDocument(scene({ elements: [element("shared", 2, 7, { x: 100 })] }), controller.currentDocument, "remote").document;
  await controller.queueRemoteDocument(remote, "peer", "update", "remote");

  assert.equal(applied.length, 1);
  assert.equal(statusNotifications, 1);
});
