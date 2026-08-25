/**
 * Transport boundary for Underscores collaboration providers.
 *
 * Providers only see opaque encrypted envelopes. Scene merging, identity,
 * persistence, and file semantics remain owned by CollaborationController.
 */
export class CollaborationProvider {
  constructor(capabilities = {}) {
    this.capabilities = Object.freeze({
      persistence: false,
      binaryTransfer: false,
      roles: false,
      directPeerToPeer: false,
      ...capabilities,
    });
  }

  subscribe() { throw new Error("CollaborationProvider.subscribe() is not implemented."); }
  connect() { throw new Error("CollaborationProvider.connect() is not implemented."); }
  disconnect() { throw new Error("CollaborationProvider.disconnect() is not implemented."); }
  sendReliable() { throw new Error("CollaborationProvider.sendReliable() is not implemented."); }
  sendEphemeral() { throw new Error("CollaborationProvider.sendEphemeral() is not implemented."); }
  sendBinary() { throw new Error("CollaborationProvider.sendBinary() is not implemented."); }
}
