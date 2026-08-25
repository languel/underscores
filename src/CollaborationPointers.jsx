import React, { useEffect, useState } from "react";
import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw/dist/excalidraw.production.min.js";

const validColor = value => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#1971c2";

export default function CollaborationPointers({ controller, active, excalidrawAPI }) {
  const [renderTick, setRenderTick] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    // Presence packets arrive at ~30fps. Keep this overlay isolated from App
    // renders so pointer motion does not rerender the collaboration menu or
    // Excalidraw's React tunnel.
    const timer = window.setInterval(() => setRenderTick(value => value + 1), 33);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active || !excalidrawAPI) return null;
  const appState = excalidrawAPI.getAppState?.();
  if (!appState) return null;
  const peers = controller.getPeers?.() || [];

  return (
    <div className="underscores-collaboration-pointers" aria-hidden="true" data-render-tick={renderTick}>
      {peers.map(peer => {
        if (!peer.pointer || peer.idleState === "away") return null;
        const viewport = sceneCoordsToViewportCoords({ sceneX: peer.pointer.x, sceneY: peer.pointer.y }, appState);
        return (
          <div
            className="underscores-collaboration-pointer"
            key={peer.peerId}
            style={{ left: `${viewport.x - appState.offsetLeft}px`, top: `${viewport.y - appState.offsetTop}px`, "--peer-color": validColor(peer.color) }}
          >
            <span className="underscores-collaboration-pointer-arrow" />
            {peer.username ? <span className="underscores-collaboration-pointer-name">{peer.username}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
