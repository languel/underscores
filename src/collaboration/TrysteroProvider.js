import { CollaborationProvider } from "./CollaborationProvider.js";

export class TrysteroCollaborationProvider extends CollaborationProvider {
  constructor({ appId = "org.languel.underscores.multiplayer.v1" } = {}) {
    super({ persistence: false, binaryTransfer: true, roles: false, directPeerToPeer: true });
    this.appId = appId;
    this.room = null;
    this.actions = null;
    this.listeners = new Set();
    this.peers = new Set();
    this.state = { status: "disconnected", error: "" };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener({ type: "status", ...this.state });
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    this.listeners.forEach(listener => listener(event));
  }

  async connect({ roomId, secret }) {
    if (this.room) await this.disconnect();
    this.state = { status: "connecting", error: "" };
    this.emit({ type: "status", ...this.state });
    try {
      const { joinRoom } = await import("trystero");
      this.room = joinRoom({ appId: this.appId, password: secret }, roomId, {
        onJoinError: details => {
          const message = details?.error?.message || "A peer connection could not be established.";
          this.state = { status: "degraded", error: message };
          this.emit({ type: "status", ...this.state });
        },
      });
      this.actions = {
        reliable: this.room.makeAction("us-scene-v1"),
        ephemeral: this.room.makeAction("us-presence-v1"),
        binary: this.room.makeAction("us-file-v1"),
      };
      this.actions.reliable.onMessage = (data, context) => this.emit({ type: "message", channel: "reliable", data, peerId: context.peerId });
      this.actions.ephemeral.onMessage = (data, context) => this.emit({ type: "message", channel: "ephemeral", data, peerId: context.peerId });
      this.actions.binary.onMessage = (data, context) => this.emit({ type: "binary", data, metadata: context.metadata, peerId: context.peerId });
      this.actions.binary.onReceiveProgress = (progress, context) => this.emit({ type: "binary-progress", progress, metadata: context.metadata, peerId: context.peerId });
      this.room.onPeerJoin = peerId => {
        this.peers.add(peerId);
        this.emit({ type: "peer-join", peerId });
      };
      this.room.onPeerLeave = peerId => {
        this.peers.delete(peerId);
        this.emit({ type: "peer-leave", peerId });
      };
      this.state = { status: "connected", error: "" };
      this.emit({ type: "status", ...this.state });
      return this;
    } catch (error) {
      this.state = { status: "error", error: error?.message || String(error) };
      this.emit({ type: "status", ...this.state });
      throw error;
    }
  }

  async sendReliable(data, peerId) {
    if (!this.actions) throw new Error("The multiplayer provider is not connected.");
    return this.actions.reliable.send(data, peerId ? { target: peerId } : undefined);
  }

  async sendEphemeral(data, peerId) {
    if (!this.actions) return;
    return this.actions.ephemeral.send(data, peerId ? { target: peerId } : undefined);
  }

  async sendBinary(data, metadata, peerId, onProgress) {
    if (!this.actions) throw new Error("The multiplayer provider is not connected.");
    return this.actions.binary.send(data, { ...(peerId ? { target: peerId } : {}), metadata, onProgress });
  }

  getPeers() {
    return [...this.peers];
  }

  async disconnect() {
    this.room?.leave?.();
    this.room = null;
    this.actions = null;
    this.peers.clear();
    this.state = { status: "disconnected", error: "" };
    this.emit({ type: "status", ...this.state });
  }
}
