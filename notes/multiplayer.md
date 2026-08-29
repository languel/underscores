# Anonymous multiplayer

Underscores multiplayer is an anonymous, room-based collaboration layer built
around the existing Excalidraw scene. It uses direct WebRTC peers discovered
through Trystero, so a room does not require an account or a project server.
Room traffic is encrypted with the secret in the room link, and the scene is
still represented by ordinary Excalidraw elements. Object-specific Underscores
state continues to travel in each element's `customData`; authored scene-wide
state travels in the scene exchange document.

## Joining a room

Use the people button in the top-right corner to create a room and copy its
link. Open the complete link in a second browser or browser profile. The room
credential is in the URL hash as `#room=<room-id>,<secret>`; it is not stored as
a separate local setting. The people menu shows connection status, peer count,
guest identity, and the leave action.

Each browser keeps its own camera, zoom, selection, active tool, theme, and
playback position. A remote scene update must not reframe another person's
viewport. Presence shares a guest name/color, pointer, selection, and idle
state, but presence is not a permission system. Native Excalidraw locks are
shared conventions in this anonymous all-editor room.

The multiplayer panel also includes an ephemeral room chat below the people
roster. Messages use participant-colored bubbles and render the same Markdown,
fenced code, and LaTeX forms as the assistant chat. `@` context tags can attach
PNG previews, including `@selection-as-png` and `@canvas-as-png`; attached PNGs
can be dragged onto the canvas and canvas PNGs can be dropped back into the
composer. Chat has its own font-size control, compact participant roster,
transcript copy, and clear-chat actions. Chat messages are exchanged in the
room hello/update flow but are not part of the authored scene document or scene
exports.

## Livecode and the shared clock

Livecode nodes are scene elements, so creating a second node, changing its
source, moving it, locking it, or deleting it is collaborative. The node's
`customData.underscoresLivecode` payload is included automatically.

The p5 and other visual nodes use **Linked** clock mode by default. Their
`draw()` loop advances when the shared score transport is playing and pauses
when it is stopped. Select **Free** in the node's Clock control for an
independent local animation loop. A hidden/background browser tab may pause its
own rendering for browser resource saving; judge runtime behavior in a visible
client.

## Recommended two-client smoke test

1. Start the development server and open the board in two different browsers
   or profiles. Use the same full room link in both windows.
2. Keep both windows visible side by side and wait for each people menu to show
   the other peer.
3. Draw a multi-point pen stroke, then create a second Livecode node. Confirm
   the stroke and node appear in the other client without changing its camera.
4. Edit the node source, move it, lock it, and delete it. Confirm those authored
   changes arrive while each client keeps its own viewport and selection.
5. Start the global score transport and confirm a Linked p5 `draw()` loop
   advances in both visible clients. Stop the transport and confirm both pause;
   switch one node to Free and confirm that node keeps animating locally.
6. Close one browser, reconnect it with the same link, and verify the remaining
   client stays usable. A brand-new browser cannot recover a room if every
   previous peer is offline and no local room cache exists.

Opening a duplicate tab is less representative because some browsers clone
`sessionStorage` when duplicating a tab. Separate browser profiles avoid that
identity ambiguity. A localhost port is not a limitation for this test: both
clients can use the same origin while WebRTC supplies separate peers.

## Runtime boundary

Multiplayer synchronizes authored elements, element `customData`, scene
background/grid, Livecode source and runtime settings, score configuration,
scripts, mixer/routing, palettes, relationships, arrangements, and playlists.
It does not synchronize camera, selection, current tool, theme, playback
position, runtime physics poses, automation frames, webcam/mic streams, MIDI,
OSC, or other device-owned runtime state. Image files are transferred on
demand; URL-backed media remains URL-backed, and local audio/video remains
local with an explicit missing/relink state when unavailable.

The current provider is a direct WebRTC mesh intended for small rooms (roughly
6–16 peers). It has no accounts, durable server history, teacher authority,
voice, view-only roles, or room-wide lockdown. Chat is intentionally transient
room-session state rather than durable server history. Those other capabilities
require a trusted persistent provider in a later phase.

If the people menu briefly reports a limited connection while a peer is still
visible, one browser-to-browser ICE path timed out while another path succeeded.
This is common on restrictive networks without TURN. The room does not need a
guest service running in either client: Trystero uses its discovery relay for
signaling, then browsers attempt direct WebRTC connections. A room with at
least one reachable peer remains usable; only a room with no reachable peers
stays degraded.
