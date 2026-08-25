import React, { useEffect, useRef, useState } from "react";

const PeopleIcon = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const statusLabel = status => ({
  connecting: "Connecting",
  connected: "Connected",
  degraded: "Connection limited",
  error: "Connection error",
  disconnected: "Not sharing",
}[status] || status);

export default function CollaborationMenu({ controller, state }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef(null);
  const active = Boolean(state?.active);
  const identity = state?.identity || controller?.getIdentity?.() || { name: "Guest", color: "#1971c2" };
  const peers = state?.peers || [];
  const peopleCount = Number(state?.peerCount || 0) + 1;

  useEffect(() => {
    if (!open) return undefined;
    const close = event => {
      if (event.key === "Escape" || (event.type === "pointerdown" && !rootRef.current?.contains(event.target))) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [open]);

  const run = async action => {
    setError("");
    try { await action(); }
    catch (reason) { setError(reason?.message || String(reason)); }
  };

  const copy = () => run(async () => {
    await controller.copyLink();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  });

  return (
    <div className="underscores-collaboration" ref={rootRef}>
      <button
        id="btn-collaboration-header"
        className={active ? "active" : ""}
        type="button"
        title={active ? `${peopleCount} ${peopleCount === 1 ? "person" : "people"} in this room` : "Multiplayer"}
        aria-label={active ? `Multiplayer, ${peopleCount} ${peopleCount === 1 ? "person" : "people"}` : "Multiplayer"}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <PeopleIcon />
        {active && (
          <span className="underscores-collaboration-facepile" aria-hidden="true">
            {[{ color: identity.color }, ...peers].slice(0, 3).map((peer, index) => (
              <span key={peer.peerId || `local-${index}`} style={{ background: peer.color }} />
            ))}
          </span>
        )}
      </button>
      {open && (
        <div className="underscores-collaboration-popover" role="dialog" aria-label="Multiplayer room">
          <div className="underscores-collaboration-heading">
            <strong>Multiplayer</strong>
            <span className={`underscores-collaboration-status is-${state.status}`}>{statusLabel(state.status)}</span>
          </div>

          {!active ? (
            <button className="underscores-collaboration-primary" type="button" onClick={() => run(() => controller.createRoom())}>
              Create room
            </button>
          ) : (
            <>
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
              {state.capacityWarning && <div className="underscores-collaboration-warning">Room is above the 16-person target.</div>}
              <div className="underscores-collaboration-actions">
                <button type="button" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
                <button type="button" onClick={() => run(() => controller.leaveRoom())}>Leave</button>
              </div>
            </>
          )}
          {(error || state.error) && <div className="underscores-collaboration-error" role="status">{error || state.error}</div>}
        </div>
      )}
    </div>
  );
}
