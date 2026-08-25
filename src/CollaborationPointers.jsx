import React, { useEffect, useRef, useState } from "react";
import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw/dist/excalidraw.production.min.js";

const validColor = value => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#1971c2";

export default function CollaborationPointers({ controller, active, excalidrawAPI }) {
  const [renderTick, setRenderTick] = useState(0);
  const trailsRef = useRef(new Map());

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
  const now = Date.now();
  const peerIds = new Set(peers.map(peer => peer.peerId));
  peers.forEach(peer => {
    const previous = trailsRef.current.get(peer.peerId);
    if (peer.tool === "freedraw" && peer.pointer && peer.button === "down" && peer.idleState !== "away") {
      const points = previous?.points ? [...previous.points] : [];
      const last = points[points.length - 1];
      if (!last || Math.hypot(last.x - peer.pointer.x, last.y - peer.pointer.y) >= 1.5) {
        points.push({ x: peer.pointer.x, y: peer.pointer.y });
      }
      // A bounded trail is enough to make the remote gesture feel continuous
      // while keeping overlay work constant for long drawing sessions.
      trailsRef.current.set(peer.peerId, { points: points.slice(-160), releasedAt: 0, color: peer.color });
    } else if (previous && !previous.releasedAt) {
      trailsRef.current.set(peer.peerId, { ...previous, releasedAt: now });
    }
  });
  trailsRef.current.forEach((trail, peerId) => {
    if (!peerIds.has(peerId) || (trail.releasedAt && now - trail.releasedAt > 180)) trailsRef.current.delete(peerId);
  });

  const trails = [...trailsRef.current.entries()].map(([peerId, trail]) => ({
    peerId,
    color: validColor(trail.color),
    points: trail.points.map(point => {
      const viewport = sceneCoordsToViewportCoords({ sceneX: point.x, sceneY: point.y }, appState);
      return `${viewport.x - appState.offsetLeft},${viewport.y - appState.offsetTop}`;
    }).join(" "),
  })).filter(trail => trail.points);

  return (
    <div className="underscores-collaboration-pointers" aria-hidden="true" data-render-tick={renderTick}>
      <svg className="underscores-collaboration-trails">
        {trails.map(trail => (
          <polyline
            key={trail.peerId}
            points={trail.points}
            fill="none"
            stroke={trail.color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
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
