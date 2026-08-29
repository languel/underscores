import React from "react";

const PeopleIcon = () => (
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export default function CollaborationMenu({ state, open = false }) {
  const active = Boolean(state?.active);
  const identity = state?.identity || { color: "#1971c2" };
  const peers = state?.peers || [];
  const peopleCount = Number(state?.peerCount || 0) + 1;

  return (
    <div className="underscores-collaboration">
      <button
        id="btn-collaboration-header"
        className={active || open ? "active" : ""}
        type="button"
        title={active ? `${peopleCount} ${peopleCount === 1 ? "person" : "people"} in this room · open Multiplayer panel` : "Open Multiplayer panel"}
        aria-label={active ? `Multiplayer, ${peopleCount} ${peopleCount === 1 ? "person" : "people"}` : "Multiplayer"}
        aria-expanded={open}
        aria-controls="underscores-panel-multiplayer"
        onClick={() => window.dispatchEvent(new CustomEvent("underscores:multiplayer-panel-toggle"))}
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
    </div>
  );
}
