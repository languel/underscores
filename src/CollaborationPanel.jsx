import React, { useState } from "react";

const statusLabel = status => ({
  connecting: "Connecting",
  connected: "Connected",
  degraded: "Connection limited",
  error: "Connection error",
  disconnected: "Not sharing",
}[status] || status || "Not sharing");

export default function CollaborationPanel({ controller, state }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const active = Boolean(state?.active);
  const identity = state?.identity || controller?.getIdentity?.() || { name: "Guest", color: "#1971c2" };
  const peers = state?.peers || [];

  const run = async action => {
    setError("");
    try {
      return await action();
    } catch (reason) {
      setError(reason?.message || String(reason));
      return null;
    }
  };

  const copy = () => run(async () => {
    await controller.copyLink();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  });

  return (
    <div id="underscores-panel-multiplayer" className="underscores-collaboration-panel">
      <div className="underscores-collaboration-panel-toolbar">
        <span className={`underscores-collaboration-status is-${state?.status || "disconnected"}`}>
          {statusLabel(state?.status)}
        </span>
        {active && <span className="underscores-collaboration-count">{peers.length + 1} here</span>}
      </div>

      {!active ? (
        <div className="underscores-collaboration-empty">
          <button className="underscores-collaboration-primary" type="button" onClick={() => run(() => controller.createRoom())}>
            Create room
          </button>
        </div>
      ) : (
        <>
          <section className="underscores-collaboration-section" aria-labelledby="multiplayer-identity-heading">
            <h3 id="multiplayer-identity-heading">You</h3>
            <div className="underscores-collaboration-identity">
              <input
                type="color"
                value={identity.color}
                aria-label="Your pointer color"
                title="Your pointer color"
                onChange={event => run(() => controller.setIdentity({ color: event.target.value }))}
              />
              <input
                type="text"
                value={identity.name}
                maxLength={40}
                aria-label="Your guest name"
                title="Your guest name"
                onChange={event => controller.setIdentity({ name: event.target.value })}
              />
            </div>
          </section>

          <section className="underscores-collaboration-section underscores-collaboration-people" aria-labelledby="multiplayer-people-heading">
            <h3 id="multiplayer-people-heading">People</h3>
            <div className="underscores-collaboration-peers" aria-label="People in room">
              <div className="underscores-collaboration-peer">
                <span style={{ background: identity.color }} />
                <span>{identity.name}</span>
                <small>You</small>
              </div>
              {peers.map(peer => (
                <div className="underscores-collaboration-peer" key={peer.peerId}>
                  <span style={{ background: peer.color }} />
                  <span>{peer.username || "Guest"}</span>
                  <small>{peer.idleState === "away" ? "Away" : "Here"}</small>
                </div>
              ))}
            </div>
          </section>

          {state?.capacityWarning && <div className="underscores-collaboration-warning">Room is above the 16-person target.</div>}
          <div className="underscores-collaboration-actions">
            <button type="button" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
            <button type="button" onClick={() => run(() => controller.leaveRoom())}>Leave room</button>
          </div>
        </>
      )}
      {(error || state?.error) && <div className="underscores-collaboration-error" role="status">{error || state.error}</div>}
    </div>
  );
}
