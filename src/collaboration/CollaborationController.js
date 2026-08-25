import { decryptJson, encryptJson } from "./crypto.js";
import {
  collaborationAuthoredStateSignature,
  collaborationDocumentDigest,
  collaborationDocumentSignature,
  mergeCollaborationDocuments,
  prepareDocumentForBroadcast,
  stampCollaborationDocument,
  toCollaborationSceneDocument,
} from "./sceneDocument.js";
import { createCollaborationUrl, generateRoomCredentials, parseCollaborationUrl, validateRoomCredentials } from "./roomUrl.js";
import { CollaborationRoomCache } from "./storage.js";
import { TrysteroCollaborationProvider } from "./TrysteroProvider.js";

export const COLLABORATION_IDENTITY_KEY = "underscores_multiplayer_identity_v1";
export const COLLABORATION_ACTOR_KEY = "underscores_multiplayer_actor_v1";
export const COLLABORATION_FILE_MAX_BYTES = 4 * 1024 * 1024;
export const COLLABORATION_SOFT_CAPACITY = 16;
export const COLLABORATION_FULL_SYNC_MS = 20_000;
export const COLLABORATION_UPDATE_THROTTLE_MS = 50;
export const COLLABORATION_PRESENCE_THROTTLE_MS = 33;
export const COLLABORATION_AWAY_MS = 60_000;
export const COLLABORATION_GESTURE_SETTLE_MS = 50;

export const consumeCollaborationGestureEnd = (payload, pointerState) => {
  if (!pointerState || !payload) return false;
  if (payload.button === "down") {
    pointerState.down = true;
    return false;
  }
  if (payload.button === "up" && pointerState.down) {
    pointerState.down = false;
    return true;
  }
  return false;
};

const DEFAULT_COLORS = Object.freeze(["#e03131", "#f08c00", "#2f9e44", "#1971c2", "#7048e8", "#c2255c", "#0b7285", "#5f3dc4"]);
const normalizeIdentityColor = value => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#1971c2";
const toExcalidrawCollaboratorColor = value => {
  const color = normalizeIdentityColor(value);
  return { background: color, stroke: color };
};
const clone = value => value === undefined ? undefined : structuredClone(value);
const randomId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const storage = () => globalThis.localStorage;

const loadIdentity = () => {
  try {
    const saved = JSON.parse(storage()?.getItem(COLLABORATION_IDENTITY_KEY) || "null");
    if (saved?.name && saved?.color) return { name: String(saved.name).slice(0, 40), color: String(saved.color) };
  } catch { /* use an anonymous identity */ }
  const index = Math.floor(Math.random() * DEFAULT_COLORS.length);
  return { name: `Guest ${Math.floor(100 + Math.random() * 900)}`, color: DEFAULT_COLORS[index] };
};

const loadActorId = () => {
  try {
    const saved = globalThis.sessionStorage?.getItem(COLLABORATION_ACTOR_KEY);
    if (saved) return saved;
    const id = randomId();
    globalThis.sessionStorage?.setItem(COLLABORATION_ACTOR_KEY, id);
    return id;
  } catch {
    return randomId();
  }
};

const elementRevisionSignature = elements => JSON.stringify((elements || []).map(element => [
  element.id,
  element.version,
  element.versionNonce,
  Boolean(element.isDeleted),
  // Excalidraw mutates a freedraw element's points while the gesture is in
  // progress without necessarily advancing its version. Include the authored
  // path so the completed stroke cannot be mistaken for its one-point draft.
  element.type === "freedraw" ? element.points : null,
]));

const fileIdsInDocument = document => [...new Set((document?.elements || [])
  .filter(element => !element.isDeleted && element.type === "image" && element.fileId)
  .map(element => element.fileId))];

const fileBytes = file => new TextEncoder().encode(JSON.stringify(file));

export class CollaborationController {
  constructor({
    getCallbacks = () => ({}),
    providerFactory = () => new TrysteroCollaborationProvider(),
    cache = new CollaborationRoomCache(),
    location = globalThis.location,
    history = globalThis.history,
  } = {}) {
    this.getCallbacks = getCallbacks;
    this.providerFactory = providerFactory;
    this.cache = cache;
    this.location = location;
    this.history = history;
    this.actorId = loadActorId();
    this.identity = loadIdentity();
    this.provider = null;
    this.providerUnsubscribe = null;
    this.roomId = "";
    this.secret = "";
    this.roomUrl = "";
    this.currentDocument = null;
    this.listeners = new Set();
    this.presences = new Map();
    this.elementActors = new Map();
    this.pendingUpdate = null;
    this.pendingPresence = null;
    this.updateTimer = null;
    this.presenceTimer = null;
    this.gestureCheckpointTimer = null;
    this.fullSyncTimer = null;
    this.idleRefreshTimer = null;
    this.peerRefreshTimer = null;
    this.presenceSequence = 0;
    this.peerRosterSignature = "";
    this.peerCollaboratorSignature = "";
    this.remoteApplyChain = Promise.resolve();
    this.localPublishSuspendedUntil = 0;
    this.lastBroadcastSignature = "";
    this.lastSentSnapshotByPeer = new Map();
    this.state = {
      active: false,
      status: "disconnected",
      roomId: "",
      peerCount: 0,
      peers: [],
      error: "",
      capacityWarning: false,
      initialized: false,
    };
    this.onVisibilityChange = () => {
      this.publishPresence({}, { immediate: true });
      if (globalThis.document?.visibilityState === "hidden") void this.checkpoint({ broadcast: true });
    };
    this.onPageHide = () => void this.checkpoint({ broadcast: true });
  }

  callbacks() {
    return this.getCallbacks?.() || {};
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  updateState(patch) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener(this.getStatus()));
  }

  emit(name, detail = {}) {
    this.callbacks().emit?.(name, { ...detail, roomId: this.roomId }, { source: "collaboration" });
  }

  redactError(value) {
    const message = String(value || "");
    return this.secret ? message.split(this.secret).join("[redacted]") : message;
  }

  getStatus() {
    return clone({ ...this.state, identity: this.identity, capabilities: this.provider?.capabilities || null });
  }

  getPeers() {
    const now = Date.now();
    return [...this.presences.entries()].map(([peerId, presence]) => ({
      peerId,
      actorId: presence.actorId,
      username: presence.username,
      color: presence.color,
      pointer: presence.pointer ? { ...presence.pointer } : null,
      button: presence.button || "up",
      selectedElementIds: { ...(presence.selectedElementIds || {}) },
      sequence: Number(presence.sequence || 0),
      updatedAt: Number(presence.updatedAt || 0),
      idleState: now - Number(presence.updatedAt || 0) >= COLLABORATION_AWAY_MS ? "away" : (presence.idleState || "active"),
    })).sort((left, right) => left.peerId.localeCompare(right.peerId));
  }

  getIdentity() {
    return clone(this.identity);
  }

  async setIdentity(patch = {}) {
    const next = {
      name: String(patch.name ?? this.identity.name).trim().slice(0, 40) || this.identity.name,
      color: /^#[0-9a-f]{6}$/i.test(String(patch.color || "")) ? String(patch.color) : this.identity.color,
    };
    this.identity = next;
    try { storage()?.setItem(COLLABORATION_IDENTITY_KEY, JSON.stringify(next)); } catch { /* identity remains in memory */ }
    this.updateState({});
    if (this.state.active) {
      await this.sendReliable({ kind: "hello", actorId: this.actorId, identity: this.identity, digest: await this.currentDigest() });
      this.publishPresence({}, { immediate: true });
    }
    this.emit("collaboration.identity", { identity: next });
    return this.getIdentity();
  }

  async createRoom() {
    const source = this.callbacks().getDocument?.();
    if (!source) throw new Error("The current scene is not ready for multiplayer.");
    const credentials = generateRoomCredentials();
    return this.connect(credentials, { seed: source, creator: true });
  }

  async joinRoom(link) {
    const credentials = typeof link === "object" && link
      ? validateRoomCredentials(link)
      : parseCollaborationUrl(link || this.location?.href || "");
    if (!credentials) throw new Error("The link does not contain a multiplayer room.");
    this.callbacks().persistSolo?.();
    return this.connect(credentials, { seed: null, creator: false });
  }

  async connect(credentials, { seed, creator }) {
    await this.leaveRoom({ keepUrl: true, resumeSolo: false });
    const { roomId, secret } = validateRoomCredentials(credentials);
    this.roomId = roomId;
    this.secret = secret;
    this.roomUrl = createCollaborationUrl({ roomId, secret }, this.location?.href || "http://localhost/");
    this.currentDocument = null;
    this.presences.clear();
    this.peerRosterSignature = "";
    this.peerCollaboratorSignature = "";
    this.elementActors.clear();
    this.lastBroadcastSignature = "";
    this.lastSentSnapshotByPeer.clear();
    this.localPublishSuspendedUntil = 0;
    this.updateState({ active: true, status: "connecting", roomId, peerCount: 0, peers: [], error: "", initialized: false, capacityWarning: false });

    if (seed) {
      const stamped = stampCollaborationDocument(seed, null, this.actorId);
      this.currentDocument = stamped.document;
      stamped.document.elements.forEach(element => this.elementActors.set(element.id, "baseline"));
      this.callbacks().setCollaborationMetadata?.(clone(stamped.document.underscores.collaboration));
      this.updateState({ initialized: true });
    } else {
      const cached = await this.cache.loadRoom(roomId);
      if (cached?.encryptedSnapshot) {
        try {
          this.currentDocument = toCollaborationSceneDocument(await decryptJson(cached.encryptedSnapshot, secret));
          this.currentDocument.elements.forEach(element => this.elementActors.set(element.id, "cache"));
          this.callbacks().setCollaborationMetadata?.(clone(this.currentDocument.underscores.collaboration));
          await this.applyCurrentDocument("cache", { baseline: true });
          await this.requestMissingFiles();
          this.updateState({ initialized: true });
        } catch {
          this.emit("collaboration.cache.error", { message: "The local room cache could not be decrypted." });
        }
      }
    }

    this.provider = this.providerFactory();
    this.providerUnsubscribe = this.provider.subscribe(event => void this.handleProviderEvent(event));
    await this.provider.connect({ roomId, secret, identity: this.identity });
    this.replaceUrl(this.roomUrl);
    globalThis.document?.addEventListener?.("visibilitychange", this.onVisibilityChange);
    globalThis.addEventListener?.("pagehide", this.onPageHide);
    this.fullSyncTimer = globalThis.setInterval(() => void this.checkpoint({ broadcast: true }), COLLABORATION_FULL_SYNC_MS);
    this.idleRefreshTimer = globalThis.setInterval(() => this.refreshPeers(), 15_000);
    this.updateState({ status: "connected" });
    await this.saveCache();
    await this.sendReliable({ kind: "hello", actorId: this.actorId, identity: this.identity, digest: await this.currentDigest(), creator: Boolean(creator) });
    this.publishPresence({}, { immediate: true });
    this.emit("collaboration.room.join", { creator: Boolean(creator), initialized: Boolean(this.currentDocument) });
    return { roomId, url: this.roomUrl, status: this.getStatus() };
  }

  replaceUrl(value) {
    if (!this.history?.replaceState || !value) return;
    this.history.replaceState({}, "", value);
  }

  async copyLink() {
    if (!this.state.active || !this.roomUrl) throw new Error("No multiplayer room is active.");
    if (!globalThis.navigator?.clipboard?.writeText) return this.roomUrl;
    await globalThis.navigator.clipboard.writeText(this.roomUrl);
    return this.roomUrl;
  }

  async leaveRoom({ keepUrl = false, resumeSolo = true } = {}) {
    globalThis.clearTimeout(this.updateTimer);
    globalThis.clearTimeout(this.presenceTimer);
    globalThis.clearTimeout(this.gestureCheckpointTimer);
    globalThis.clearInterval(this.fullSyncTimer);
    globalThis.clearInterval(this.idleRefreshTimer);
    globalThis.clearTimeout(this.peerRefreshTimer);
    this.updateTimer = null;
    this.presenceTimer = null;
    this.gestureCheckpointTimer = null;
    this.peerRefreshTimer = null;
    globalThis.document?.removeEventListener?.("visibilitychange", this.onVisibilityChange);
    globalThis.removeEventListener?.("pagehide", this.onPageHide);
    if (this.state.active) await this.checkpoint({ broadcast: false });
    this.providerUnsubscribe?.();
    this.providerUnsubscribe = null;
    await this.provider?.disconnect?.();
    const previousRoomId = this.roomId;
    this.provider = null;
    this.roomId = "";
    this.secret = "";
    this.roomUrl = "";
    this.presences.clear();
    this.peerRosterSignature = "";
    this.peerCollaboratorSignature = "";
    this.pendingUpdate = null;
    this.pendingPresence = null;
    this.updateState({ active: false, status: "disconnected", roomId: "", peerCount: 0, peers: [], error: "", capacityWarning: false, initialized: false });
    this.callbacks().applyCollaborators?.(new Map());
    if (!keepUrl && this.location?.href) {
      const url = new URL(this.location.href);
      url.hash = "";
      this.replaceUrl(url.toString());
    }
    if (resumeSolo) this.callbacks().resumeSolo?.();
    if (previousRoomId) this.emit("collaboration.room.leave", { previousRoomId });
  }

  async currentDigest() {
    return this.currentDocument ? collaborationDocumentDigest(this.currentDocument) : "";
  }

  async encryptMessage(message) {
    return encryptJson({ protocol: 1, ...message }, this.secret);
  }

  async sendReliable(message, peerId) {
    if (!this.provider || !this.secret) return;
    await this.provider.sendReliable(await this.encryptMessage(message), peerId);
  }

  async sendEphemeral(message, peerId) {
    if (!this.provider || !this.secret) return;
    await this.provider.sendEphemeral(await this.encryptMessage(message), peerId);
  }

  async handleProviderEvent(event) {
    if (!event || !this.state.active) return;
    if (event.type === "status") {
      const error = this.redactError(event.error);
      this.updateState({ status: event.status, error });
      if (error) this.emit("collaboration.connection.error", { message: error });
      return;
    }
    if (event.type === "peer-error") {
      const message = this.redactError(event.error || "A peer connection could not be established.");
      // Keep a usable room usable. If another peer is already present, the
      // failed ICE path is not a room outage and should not paint the whole
      // people menu as disconnected.
      this.updateState({
        status: this.state.peerCount > 0 ? "connected" : "degraded",
        error: this.state.peerCount > 0 ? "" : message,
      });
      this.emit("collaboration.connection.error", { message, peerId: event.peerId || "" });
      return;
    }
    if (event.type === "peer-join") {
      if (this.state.status === "degraded") this.updateState({ status: "connected", error: "" });
      await this.sendReliable({ kind: "hello", actorId: this.actorId, identity: this.identity, digest: await this.currentDigest() }, event.peerId);
      this.publishPresence({}, { immediate: true, peerId: event.peerId });
      return;
    }
    if (event.type === "peer-leave") {
      this.presences.delete(event.peerId);
      this.lastSentSnapshotByPeer.delete(event.peerId);
      this.refreshPeers({ immediate: true });
      return;
    }
    if (event.type === "message") {
      try {
        const message = await decryptJson(event.data, this.secret);
        if (event.channel === "ephemeral") this.handlePresenceMessage(message, event.peerId);
        else await this.handleReliableMessage(message, event.peerId);
      } catch (error) {
        this.emit("collaboration.decrypt.error", { message: error?.message || String(error), peerId: event.peerId });
      }
      return;
    }
    if (event.type === "binary") await this.handleBinaryMessage(event);
  }

  async handleReliableMessage(message, peerId) {
    if (message?.protocol !== 1) return;
    if (message.kind === "hello") {
      this.presences.set(peerId, {
        ...(this.presences.get(peerId) || {}),
        actorId: message.actorId,
        username: message.identity?.name || "Guest",
        color: message.identity?.color || "#1971c2",
        updatedAt: Date.now(),
      });
      this.refreshPeers({ immediate: true });
      const digest = await this.currentDigest();
      if (!this.currentDocument) {
        await this.sendReliable({ kind: "snapshot-request", actorId: this.actorId }, peerId);
      } else if (digest !== message.digest) {
        await this.sendSnapshot(peerId);
      }
      return;
    }
    if (message.kind === "snapshot-request") {
      await this.sendSnapshot(peerId);
      return;
    }
    if (message.kind === "snapshot" || message.kind === "update") {
      if (!message.document) return;
      await this.queueRemoteDocument(message.document, peerId, message.kind, message.actorId);
      return;
    }
    if (message.kind === "file-request" && message.fileId) {
      await this.sendFile(message.fileId, peerId);
    }
  }

  handlePresenceMessage(message, peerId) {
    if (message?.protocol !== 1 || message.kind !== "presence") return;
    const previous = this.presences.get(peerId) || {};
    if (Number(message.sequence || 0) <= Number(previous.sequence || 0)) return;
    this.presences.set(peerId, {
      ...previous,
      actorId: message.actorId || previous.actorId,
      username: message.identity?.name || previous.username || "Guest",
      color: message.identity?.color || previous.color || "#1971c2",
      pointer: message.pointer || null,
      button: message.button || "up",
      selectedElementIds: message.selectedElementIds || {},
      idleState: message.idleState || "active",
      sequence: Number(message.sequence || 0),
      updatedAt: Date.now(),
    });
    this.refreshPeers();
  }

  refreshPeers({ immediate = false } = {}) {
    // Pointer presence is intentionally sent at ~30 fps, but pushing every
    // packet through Excalidraw's collaborator scene update is needlessly
    // expensive. Coalesce to one UI update per frame-ish interval while the
    // latest presence remains in `this.presences`.
    if (!immediate) {
      if (this.peerRefreshTimer) return;
      this.peerRefreshTimer = globalThis.setTimeout(() => {
        this.peerRefreshTimer = null;
        this.refreshPeers({ immediate: true });
      }, 50);
      return;
    }
    const peers = this.getPeers();
    // Pointer packets are high-frequency ephemeral state. Keep them in the
    // controller for the lightweight overlay, but do not force Excalidraw to
    // redraw its interactive canvas for every packet.
    const collaboratorRoster = peers.map(peer => ({
      peerId: peer.peerId,
      username: peer.username,
      color: peer.color,
      button: peer.button || "up",
      selectedElementIds: peer.selectedElementIds || {},
      idleState: peer.idleState || "active",
    }));
    const collaboratorSignature = JSON.stringify(collaboratorRoster);
    if (collaboratorSignature !== this.peerCollaboratorSignature) {
      this.peerCollaboratorSignature = collaboratorSignature;
      const collaborators = new Map(peers.map(peer => [peer.peerId, {
        username: peer.username,
        color: toExcalidrawCollaboratorColor(peer.color),
        // Excalidraw replaces collaborator entries through updateScene(), but
        // explicitly clearing pointer prevents a previously rendered native
        // pointer from surviving while the color-matched overlay is active.
        pointer: null,
        button: peer.button || "up",
        selectedElementIds: peer.selectedElementIds || {},
        idleState: peer.idleState || "active",
      }]));
      this.callbacks().applyCollaborators?.(collaborators);
    }
    const peerCount = peers.length;
    const roster = peers.map(peer => ({
      peerId: peer.peerId,
      actorId: peer.actorId,
      username: peer.username,
      color: peer.color,
      idleState: peer.idleState,
    }));
    const rosterSignature = JSON.stringify(roster);
    if (rosterSignature !== this.peerRosterSignature) {
      this.peerRosterSignature = rosterSignature;
      const capacityWarning = peerCount + 1 > COLLABORATION_SOFT_CAPACITY;
      this.updateState({
        peers: roster,
        peerCount,
        capacityWarning,
        ...(peerCount > 0 && this.state.status === "degraded" ? { status: "connected", error: "" } : {}),
      });
      this.emit("collaboration.presence", { peerCount, peers: roster });
    }
  }

  publishPresence(pointer = {}, { immediate = false, peerId = null } = {}) {
    if (!this.state.active) return;
    const base = this.callbacks().getPresence?.() || {};
    this.pendingPresence = {
      kind: "presence",
      actorId: this.actorId,
      identity: this.identity,
      pointer: pointer.pointer || base.pointer || null,
      button: pointer.button ?? base.button ?? "up",
      selectedElementIds: base.selectedElementIds || {},
      idleState: globalThis.document?.visibilityState === "hidden" ? "away" : (base.idleState || "active"),
      sequence: ++this.presenceSequence,
    };
    const flush = async () => {
      const message = this.pendingPresence;
      this.pendingPresence = null;
      if (message) await this.sendEphemeral(message, peerId);
    };
    if (immediate) {
      globalThis.clearTimeout(this.presenceTimer);
      this.presenceTimer = null;
      void flush();
    } else if (!this.presenceTimer) {
      this.presenceTimer = globalThis.setTimeout(() => {
        this.presenceTimer = null;
        void flush();
      }, COLLABORATION_PRESENCE_THROTTLE_MS);
    }
  }

  publishDocument(source, { immediate = false } = {}) {
    if (!this.state.active || !this.state.initialized || !source) return false;
    // Applying a remote snapshot updates Excalidraw synchronously but React's
    // authored-state setters commit on the following render. Ignore that
    // short settling window so the importing tab cannot publish its old solo
    // state back into the room and start a snapshot ping-pong.
    if (Date.now() < this.localPublishSuspendedUntil) return false;
    const appState = this.callbacks().getAppState?.() || {};
    const activeElementId = appState.newElement?.id || appState.multiElement?.id;
    // Excalidraw may retain newElement after programmatic creation. Only treat
    // it as an unfinished draft while a real pointer gesture is active, or a
    // newly-created Livecode node can be suppressed forever.
    if (
      this.callbacks().isPointerGestureActive?.()
      && activeElementId
      && source.elements?.some(element => element.id === activeElementId)
    ) return false;
    const previous = this.currentDocument;
    const priorSignature = elementRevisionSignature(previous?.elements);
    const stamped = stampCollaborationDocument(source, previous, this.actorId);
    const previousById = new Map((previous?.elements || []).map(element => [element.id, element]));
    const nextById = new Map(stamped.document.elements.map(element => [element.id, element]));
    stamped.document.elements = stamped.document.elements.map(element => {
      const prior = previousById.get(element.id);
      if (!prior || Number(element.version || 0) > Number(prior.version || 0) || Boolean(element.isDeleted) !== Boolean(prior.isDeleted)) {
        this.elementActors.set(element.id, this.actorId);
      }
      return element;
    });
    for (const prior of previous?.elements || []) {
      if (nextById.has(prior.id) || this.elementActors.get(prior.id) !== this.actorId || prior.isDeleted) continue;
      stamped.document.elements.push({
        ...clone(prior),
        isDeleted: true,
        version: Number(prior.version || 0) + 1,
        versionNonce: Math.floor(Math.random() * 0x7fffffff),
        updated: Date.now(),
      });
    }
    const authored = prepareDocumentForBroadcast(stamped.document);
    const reconciled = previous
      ? mergeCollaborationDocuments(previous, authored, appState)
      : stamped.document;
    const sourceSignature = elementRevisionSignature(stamped.document.elements);
    const nextSignature = elementRevisionSignature(reconciled.elements);
    const correctionNeeded = sourceSignature !== nextSignature;
    if (!stamped.changed && priorSignature === nextSignature && !correctionNeeded) return false;
    this.currentDocument = reconciled;
    this.callbacks().setCollaborationMetadata?.(clone(reconciled.underscores.collaboration));
    this.pendingUpdate = prepareDocumentForBroadcast(reconciled);
    if (correctionNeeded) {
      this.remoteApplyChain = this.remoteApplyChain.then(() => this.applyCurrentDocument("reconcile"));
    }
    const flush = async () => {
      const document = this.pendingUpdate;
      this.pendingUpdate = null;
      if (!document) return;
      const signature = collaborationDocumentSignature(document);
      if (signature === this.lastBroadcastSignature) return;
      this.lastBroadcastSignature = signature;
      await this.sendReliable({ kind: "update", actorId: this.actorId, document });
      await this.saveCache();
      this.emit("collaboration.scene.update", { elementCount: document.elements.length });
    };
    if (immediate) {
      globalThis.clearTimeout(this.updateTimer);
      this.updateTimer = null;
      void flush();
    } else if (!this.updateTimer) {
      this.updateTimer = globalThis.setTimeout(() => {
        this.updateTimer = null;
        void flush();
      }, COLLABORATION_UPDATE_THROTTLE_MS);
    }
    return true;
  }

  async queueRemoteDocument(remote, peerId, kind, actorId = peerId) {
    this.remoteApplyChain = this.remoteApplyChain.then(async () => {
      const remoteDocument = toCollaborationSceneDocument(remote);
      const baseline = !this.state.initialized;
      const previousAuthoredSignature = this.currentDocument
        ? collaborationAuthoredStateSignature(this.currentDocument)
        : "";
      remoteDocument.elements.forEach(element => {
        const local = this.currentDocument?.elements?.find(candidate => candidate.id === element.id);
        if (!local || Number(element.version || 0) >= Number(local.version || 0)) this.elementActors.set(element.id, actorId || peerId);
      });
      const mergedDocument = this.currentDocument
        ? mergeCollaborationDocuments(this.currentDocument, remoteDocument, this.callbacks().getAppState?.() || {})
        : remoteDocument;
      const previousSignature = this.currentDocument ? collaborationDocumentSignature(this.currentDocument) : "";
      const nextSignature = collaborationDocumentSignature(mergedDocument);
      if (previousSignature && previousSignature === nextSignature) return;
      this.currentDocument = mergedDocument;
      this.localPublishSuspendedUntil = Math.max(this.localPublishSuspendedUntil, Date.now() + 350);
      this.callbacks().setCollaborationMetadata?.(clone(this.currentDocument.underscores.collaboration));
      const applyAuthoredState = baseline
        || previousAuthoredSignature !== collaborationAuthoredStateSignature(this.currentDocument);
      await this.applyCurrentDocument(peerId, { baseline, applyAuthoredState });
      if (!this.state.initialized) this.updateState({ initialized: true });
      await this.saveCache();
      await this.requestMissingFiles(peerId);
      this.emit("collaboration.scene.receive", { peerId, kind, elementCount: this.currentDocument.elements.length });
    }).catch(error => {
      const message = this.redactError(error?.message || error);
      this.updateState({ error: message });
      this.emit("collaboration.scene.error", { peerId, message });
    });
    return this.remoteApplyChain;
  }

  async applyCurrentDocument(source, options = {}) {
    if (!this.currentDocument) return;
    await this.callbacks().applyDocument?.(this.currentDocument, { source, ...options });
  }

  async sendSnapshot(peerId) {
    if (!this.currentDocument) return;
    const document = prepareDocumentForBroadcast(this.currentDocument);
    const signature = collaborationDocumentSignature(document);
    // A peer may emit both peer-join and hello while its WebRTC data channel
    // is settling. Do not enqueue identical full snapshots for that peer.
    if (peerId && this.lastSentSnapshotByPeer.get(peerId) === signature) return;
    if (peerId) this.lastSentSnapshotByPeer.set(peerId, signature);
    this.lastBroadcastSignature = signature;
    await this.sendReliable({ kind: "snapshot", actorId: this.actorId, document }, peerId);
  }

  async checkpoint({ broadcast = false } = {}) {
    if (!this.state.active) return;
    const source = this.callbacks().getDocument?.();
    // A full snapshot is already the reliable gesture/checkpoint payload. Let
    // the coalesced update observe that signature and discard itself instead
    // of sending the same scene twice.
    if (source && this.state.initialized) this.publishDocument(source, { immediate: false });
    await this.saveCache();
    if (broadcast && this.currentDocument) await this.sendSnapshot();
  }

  checkpointAfterGesture() {
    globalThis.clearTimeout(this.gestureCheckpointTimer);
    this.gestureCheckpointTimer = globalThis.setTimeout(() => {
      this.gestureCheckpointTimer = null;
      if (this.state.active) void this.checkpoint({ broadcast: true });
    }, COLLABORATION_GESTURE_SETTLE_MS);
  }

  async saveCache() {
    if (!this.currentDocument || !this.roomId || !this.secret) return;
    await this.cache.saveRoom(this.roomId, await encryptJson(this.currentDocument, this.secret));
    const files = this.callbacks().getFiles?.() || {};
    for (const fileId of fileIdsInDocument(this.currentDocument)) {
      const file = files[fileId];
      if (!file || fileBytes(file).byteLength > COLLABORATION_FILE_MAX_BYTES) continue;
      await this.cache.saveFile(
        this.roomId,
        fileId,
        await encryptJson(file, this.secret),
        { mimeType: file.mimeType },
      );
    }
  }

  async requestMissingFiles(peerId) {
    const files = this.callbacks().getFiles?.() || {};
    for (const fileId of fileIdsInDocument(this.currentDocument)) {
      if (files[fileId]) continue;
      const cached = await this.cache.loadFile(this.roomId, fileId);
      if (cached?.encryptedFile) {
        try {
          const file = await decryptJson(cached.encryptedFile, this.secret);
          await this.callbacks().addFiles?.([file]);
          continue;
        } catch { /* ask the connected peer */ }
      }
      await this.sendReliable({ kind: "file-request", fileId }, peerId);
    }
  }

  async sendFile(fileId, peerId) {
    const file = this.callbacks().getFiles?.()?.[fileId];
    if (!file) return;
    const bytes = fileBytes(file);
    if (bytes.byteLength > COLLABORATION_FILE_MAX_BYTES) {
      this.emit("collaboration.file.error", { fileId, message: "The image is larger than the 4 MiB multiplayer limit." });
      return;
    }
    const encrypted = await encryptJson({ fileId, file }, this.secret);
    const payload = new TextEncoder().encode(JSON.stringify(encrypted));
    await this.provider?.sendBinary(payload, { protocol: 1, kind: "encrypted" }, peerId, progress => {
      this.emit("collaboration.file.progress", { fileId, peerId, progress });
    });
  }

  async handleBinaryMessage(event) {
    if (event.metadata?.protocol !== 1 || event.metadata?.kind !== "encrypted") return;
    let fileId = "";
    try {
      const envelope = JSON.parse(new TextDecoder().decode(new Uint8Array(event.data)));
      const packet = await decryptJson(envelope, this.secret);
      fileId = String(packet?.fileId || "");
      const file = packet?.file;
      if (!fileId || !file) throw new Error("The received image payload is incomplete.");
      const bytes = fileBytes(file);
      if (bytes.byteLength > COLLABORATION_FILE_MAX_BYTES) throw new Error("The received image exceeds the 4 MiB multiplayer limit.");
      if (file.id !== fileId) throw new Error("The received image id does not match its request.");
      await this.callbacks().addFiles?.([file]);
      await this.cache.saveFile(this.roomId, file.id, await encryptJson(file, this.secret), { mimeType: file.mimeType });
      this.emit("collaboration.file.receive", { fileId: file.id, peerId: event.peerId });
    } catch (error) {
      this.emit("collaboration.file.error", { fileId, message: error?.message || String(error) });
    }
  }
}
