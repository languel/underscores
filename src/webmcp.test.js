import test from "node:test";
import assert from "node:assert/strict";
import {
  UNDERSCORES_WEBMCP_TOOL_NAMES,
  buildWebMCPCommandCatalog,
  buildWebMCPScoreContext,
  createUnderscoresWebMCPTools,
  getUnderscoresWebMCPStatus,
  registerUnderscoresWebMCP,
} from "./webmcp.js";

const createFakeApi = () => {
  let elements = [
    {
      id: "curve-a",
      type: "line",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      points: [[0, 0], [100, 50]],
      version: 1,
      versionNonce: 11,
      isDeleted: false,
      strokeColor: "#00b8e8",
      customData: { score: { role: "curve", label: "Main curve", active: true } },
    },
    {
      id: "deleted-a",
      type: "rectangle",
      version: 2,
      versionNonce: 22,
      isDeleted: true,
    },
  ];
  const appState = { selectedElementIds: { "curve-a": true } };
  const calls = [];
  let walkthroughStatus = { status: "idle" };
  const update = (id, transform) => {
    elements = elements.map(element => element.id === id
      ? { ...transform(element), version: element.version + 1, versionNonce: element.versionNonce + 1 }
      : element);
  };
  const api = {
    apiVersion: 12,
    commands: {
      list: () => [
        { id: "scene.create.objects", title: "Create objects", category: "Scene", ai: { expose: true, description: "Create objects." } },
        { id: "scene.patch.objects", title: "Patch objects", category: "Scene", ai: { expose: true, description: "Patch objects." } },
        { id: "score.roles.assign", title: "Assign roles", category: "Score", ai: { expose: true, description: "Assign roles." } },
        { id: "physics.system.create", title: "Create physics system", category: "Physics", args: { name: "string?" }, ai: { expose: true, description: "Create a physics system." } },
        { id: "scene.delete", title: "Delete objects", category: "Scene", ai: { expose: true, description: "Delete objects." } },
        { id: "excalidraw.file.save", title: "Save file", category: "File", ai: { expose: true, description: "Save a file." } },
        { id: "private.command", title: "Private", category: "Internal", ai: { expose: false } },
      ],
      execute: async (id, args, options) => {
        calls.push({ id, args, options });
        if (id === "scene.create.objects") {
          const created = args.objects.map((spec, index) => ({
            id: spec.id || `created-${index}`,
            type: spec.type,
            x: spec.x || 0,
            y: spec.y || 0,
            width: spec.width || 100,
            height: spec.height || 100,
            version: 1,
            versionNonce: 30 + index,
            isDeleted: false,
          }));
          elements = [...elements, ...created];
          return { elementIds: created.map(element => element.id) };
        }
        if (id === "scene.patch.objects") {
          args.patches.forEach(item => update(item.id, element => ({ ...element, ...item.patch })));
          return { elementIds: args.patches.map(item => item.id) };
        }
        if (id === "score.roles.assign") {
          args.elementIds.forEach(elementId => update(elementId, element => ({
            ...element,
            customData: {
              ...(element.customData || {}),
              score: { role: args.role === "none" ? null : args.role, label: args.label || "", active: args.active !== false },
            },
          })));
          return { elementIds: args.elementIds };
        }
        if (id === "physics.system.create") {
          return { id: "system-created", name: args.name || "World" };
        }
        throw new Error(`Unexpected command: ${id}`);
      },
    },
    scene: {
      get: () => elements,
      getAppState: () => appState,
    },
    collaboration: {
      getStatus: () => ({ roomId: "room-a", connected: true }),
      getPeers: () => [{ id: "peer-a" }],
    },
    walkthroughs: {
      list: () => [{ id: "guided-onboarding-v1", title: "Welcome", revision: 1, stepCount: 9 }],
      status: () => walkthroughStatus,
      start: async (id, options) => (walkthroughStatus = { status: "running", id, ...options }),
      pause: () => (walkthroughStatus = { ...walkthroughStatus, status: "paused" }),
      resume: () => (walkthroughStatus = { ...walkthroughStatus, status: "running" }),
      next: async () => walkthroughStatus,
      previous: async () => walkthroughStatus,
      stop: async options => (walkthroughStatus = { ...walkthroughStatus, status: "stopped", ...options }),
      setRate: (rate, options) => (walkthroughStatus = { ...walkthroughStatus, rate, ...options }),
    },
    physics: {
      world: { get: () => ({ pausedEditMode: "author" }) },
      systems: { list: () => [{ id: "system-a", name: "World", clock: { mode: "realtime" } }] },
      bodies: { list: () => [] },
      constraints: { list: () => [] },
      populations: { list: () => [] },
    },
  };
  return { api, calls };
};

const toolNamed = (tools, name) => tools.find(tool => tool.name === name);

test("WebMCP exposes a narrow, strict composition tool catalog", () => {
  const { api } = createFakeApi();
  const tools = createUnderscoresWebMCPTools({ api });
  assert.deepEqual(tools.map(tool => tool.name), UNDERSCORES_WEBMCP_TOOL_NAMES);
  tools.forEach(tool => assert.equal(tool.inputSchema.additionalProperties, false));
  assert.equal(toolNamed(tools, "get_score_context").annotations.readOnlyHint, true);
  assert.equal(toolNamed(tools, "create_score_objects").annotations.readOnlyHint, false);
  assert.equal(toolNamed(tools, "create_score_objects").inputSchema.properties.objects.maxItems, 50);
  assert.equal(toolNamed(tools, "patch_score_objects").inputSchema.properties.patches.items.additionalProperties, false);
});

test("WebMCP discovers and controls local guided walkthrough playback", async () => {
  const { api } = createFakeApi();
  const tools = createUnderscoresWebMCPTools({ api });
  const catalog = await toolNamed(tools, "get_guided_walkthroughs").execute({});
  assert.equal(catalog.walkthroughs[0].id, "guided-onboarding-v1");
  const status = await toolNamed(tools, "control_guided_walkthrough").execute({ action: "start", id: "guided-onboarding-v1", instant: true });
  assert.equal(status.status, "running");
  assert.equal(status.instant, true);
});

test("score context is bounded, semantic, revisioned, and collaboration-aware", () => {
  const { api } = createFakeApi();
  const context = buildWebMCPScoreContext({
    api,
    getContext: () => ({ transport: { time: 2.5, tempo: 96, playing: false }, walkthrough: { status: "paused", stepId: "p5" } }),
  }, {});
  assert.match(context.revision, /^u1-2-/);
  assert.deepEqual(context.transport, { time: 2.5, tempo: 96, playing: false });
  assert.deepEqual(context.walkthrough, { status: "paused", stepId: "p5" });
  assert.deepEqual(context.collaboration, {
    active: false,
    status: null,
    initialized: false,
    capacityWarning: false,
    peerCount: 1,
  });
  assert.equal(Object.hasOwn(context.collaboration, "roomId"), false);
  assert.equal(context.scene.liveElementCount, 1);
  assert.equal(context.scene.tombstoneCount, 1);
  assert.deepEqual(context.scene.selectedElementIds, ["curve-a"]);
  assert.equal(context.scene.elements.length, 1);
  assert.equal(context.scene.elements[0].score.role, "curve");
  assert.equal(context.scene.elements[0].score.label, "Main curve");
  assert.equal(context.scene.elements[0].selected, true);

  const withTombstone = buildWebMCPScoreContext({ api }, { includeDeleted: true, maxElements: 1 });
  assert.equal(withTombstone.scene.matchedElementCount, 2);
  assert.equal(withTombstone.scene.returnedElementCount, 1);
  assert.equal(withTombstone.scene.truncated, true);
  assert.deepEqual(withTombstone.physics.systems, [{ id: "system-a", name: "World", clock: { mode: "realtime" } }]);
});

test("command catalog mirrors the assistant allowlist without exposing blocked operations", () => {
  const { api } = createFakeApi();
  const catalog = buildWebMCPCommandCatalog({ api });
  assert.equal(catalog.totalExposed, 6);
  assert.equal(catalog.totalCallable, 5);
  assert.equal(catalog.commands.some(command => command.id === "excalidraw.file.save"), false);
  assert.equal(catalog.commands.find(command => command.id === "scene.delete").policy, "confirmation-required");
  assert.equal(catalog.commands.some(command => command.id === "physics.system.create"), true);
});

test("generic WebMCP command execution uses the shared command registry and guards policy", async () => {
  const { api, calls } = createFakeApi();
  const tools = createUnderscoresWebMCPTools({ api });
  const execute = toolNamed(tools, "execute_underscores_command");
  const created = await execute.execute({
    commandId: "scene.create.objects",
    args: { objects: [{ id: "generic-a", type: "ellipse" }] },
  });
  assert.equal(created.ok, true);
  assert.equal(created.command, "scene.create.objects");
  assert.deepEqual(created.elementIds, ["generic-a"]);
  assert.equal(calls.at(-1).options.source, "webmcp");
  await assert.rejects(
    execute.execute({ commandId: "scene.delete", args: { elementIds: ["generic-a"] } }),
    /confirm: true/,
  );
  await assert.rejects(
    execute.execute({ commandId: "excalidraw.file.save", args: {} }),
    /intentionally not available/,
  );
  await assert.rejects(
    execute.execute({ commandId: "private.command", args: {} }),
    /not available through WebMCP/,
  );
  await assert.rejects(
    execute.execute({ commandId: "physics.system.create", args: { apiKey: "nope" } }),
    /Sensitive field/,
  );
});

test("command sequences compose assistant workflows and preserve per-step revisions", async () => {
  const { api, calls } = createFakeApi();
  const tools = createUnderscoresWebMCPTools({ api });
  const context = await toolNamed(tools, "get_score_context").execute({});
  const result = await toolNamed(tools, "execute_underscores_sequence").execute({
    expectedRevision: context.revision,
    commands: [
      { commandId: "scene.create.objects", args: { objects: [{ id: "sequence-a", type: "rectangle" }] } },
      { commandId: "scene.patch.objects", args: { patches: [{ id: "sequence-a", patch: { x: 42 } }] } },
      { commandId: "physics.system.create", args: { name: "Pendulum World" } },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.completed, 3);
  assert.equal(result.failed, 0);
  assert.deepEqual(calls.map(call => call.id), ["scene.create.objects", "scene.patch.objects", "physics.system.create"]);
  assert.equal(result.results[1].revision, result.results[2].revision);
});

test("WebMCP writes reuse command provenance and return verifiable scene results", async () => {
  const { api, calls } = createFakeApi();
  const tools = createUnderscoresWebMCPTools({ api });
  const revision = (await toolNamed(tools, "get_score_context").execute({})).revision;
  const created = await toolNamed(tools, "create_score_objects").execute({
    expectedRevision: revision,
    objects: [{ id: "circle-a", type: "ellipse", x: 200, y: 100, width: 80, height: 80 }],
  });

  assert.equal(created.ok, true);
  assert.equal(created.command, "scene.create.objects");
  assert.deepEqual(created.elementIds, ["circle-a"]);
  assert.equal(created.elements[0].type, "ellipse");
  assert.notEqual(created.revision, revision);
  assert.equal(calls[0].options.source, "webmcp");
  assert.equal(calls[0].options.record, true);
  assert.match(calls[0].options.invocationId, /.+/);
  assert.equal(Object.hasOwn(calls[0].args, "expectedRevision"), false);

  await assert.rejects(
    toolNamed(tools, "patch_score_objects").execute({
      expectedRevision: revision,
      patches: [{ id: "circle-a", patch: { x: 300 } }],
    }),
    /score changed.*Read get_score_context again/,
  );
  assert.equal(calls.length, 1);
});

test("role assignment uses the shared command layer and reports the updated role", async () => {
  const { api, calls } = createFakeApi();
  const tools = createUnderscoresWebMCPTools({ api });
  const result = await toolNamed(tools, "assign_score_roles").execute({
    elementIds: ["curve-a"],
    role: "trigger",
    label: "Bell",
    active: true,
  });
  assert.equal(calls[0].id, "score.roles.assign");
  assert.deepEqual(calls[0].args, { elementIds: ["curve-a"], role: "trigger", label: "Bell", active: true });
  assert.equal(result.elements[0].score.role, "trigger");
  assert.equal(result.elements[0].score.label, "Bell");
});

test("registration reports active tools and aborts them on disposal", async () => {
  const { api } = createFakeApi();
  const registered = [];
  const events = [];
  class FakeCustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init.detail;
    }
  }
  const documentRef = {
    modelContext: {
      registerTool: async (tool, options) => registered.push({ tool, options }),
    },
    defaultView: {
      CustomEvent: FakeCustomEvent,
      dispatchEvent: event => events.push(event),
    },
  };
  const registration = registerUnderscoresWebMCP({ api, documentRef });
  const status = await registration.ready;
  assert.equal(status.supported, true);
  assert.equal(status.active, true);
  assert.deepEqual(status.tools, UNDERSCORES_WEBMCP_TOOL_NAMES);
  assert.equal(registered.length, UNDERSCORES_WEBMCP_TOOL_NAMES.length);
  registered.forEach(({ options }) => assert.equal(options.signal.aborted, false));
  assert.equal(events.at(-1).type, "underscores:webmcp-ready");
  assert.deepEqual(getUnderscoresWebMCPStatus(documentRef).tools, UNDERSCORES_WEBMCP_TOOL_NAMES);

  registration.dispose();
  registered.forEach(({ options }) => assert.equal(options.signal.aborted, true));
  assert.equal(registration.getStatus().active, false);
  assert.equal(events.at(-1).type, "underscores:webmcp-disposed");
});

test("registration is a progressive-enhancement no-op without browser support", async () => {
  const { api } = createFakeApi();
  const documentRef = {};
  const registration = registerUnderscoresWebMCP({ api, documentRef });
  assert.deepEqual(await registration.ready, { supported: false, active: false, tools: [], errors: [] });
  assert.deepEqual(registration.getStatus(), { supported: false, active: false, tools: [], errors: [] });
  registration.dispose();
});

test("an already-cancelled invocation never reaches the command registry", async () => {
  const { api, calls } = createFakeApi();
  const tool = toolNamed(createUnderscoresWebMCPTools({ api }), "create_score_objects");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    tool.execute({ objects: [{ type: "rectangle", x: 0, y: 0 }] }, { signal: controller.signal }),
    error => error.name === "AbortError",
  );
  assert.equal(calls.length, 0);
});
