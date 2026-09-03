# Physics marionette case study

The marionette is a small paper-doll study: ordinary Excalidraw primitives become an articulated character, then movement becomes sound, camera input, and a recordable performance. Run `/walkthrough start physics-marionette-study-v1` for the staged version, or run `/physics demo marionette` to jump straight to the rig.

## 1. Construct the costume

The starter uses four deliberately legible pieces: a circular head, a block torso, and two contrasting arm bars. They remain normal selectable canvas objects. Their physics metadata is authored separately in the relationship graph, so you can still recolor, resize, or replace a piece without rewriting the lesson.

The default palette is a small Bauhaus study: yellow head, warm red body, blue left arm, and green right arm. The colors are not part of the solver; they are visual cues that make each body easy to identify in Outliner and the Physics debug overlay.

## 2. Read the rig

The generated `Marionette` world contains four dynamic, authored-rigid bodies:

- a world pin holds the head above the body;
- a damped spring connects the head and torso as a flexible neck;
- a revolute joint connects each arm to the torso at its shoulder.

The graph is inspectable through the Physics panel or the script bridge:

```js
const graph = __.api.relations.get();
const world = graph.systems.find(system => system.name === "Marionette");
const bodies = graph.bodies.filter(body => body.systemId === world?.id);
const joints = graph.constraints.filter(constraint => constraint.systemId === world?.id);
console.log({ world: world?.name, bodies: bodies.length, joints: joints.length });
```

Reset restores the authored pose. Apply Current Pose makes the evaluated arrangement the new reset pose. This distinction is useful in a classroom: a learner can experiment freely, then decide which pose is worth keeping.

## 3. Pose with the mouse

Press Play, then drag an unselected body or joint. Physics uses a temporary spring grab, so the gesture feels soft and does not rewrite the drawing on every pointer move. Pause to inspect the result. Use Apply Current Pose only when the new arrangement should become authored state.

If a body is selected, Excalidraw keeps its normal transform gesture. Start a live pose on an unselected body or visible joint. This preserves the ability to move, resize, and snap the actual canvas object while the physics world is running.

## 4. Turn contact into a wind chime

Create a body-to-body collision mapping from the command palette or Physics panel. The command below adds a short Expressive Synth hit mapping to the active world:

```js
await __.api.commands.execute("physics.mapping.create", {
  collisionClass: "body-body",
  target: "expressive-voice",
});
```

Mappings are always Source → Filter → Transform → Target. The starter listens for collision impulse, rejects very small contacts, maps the remaining value into a useful range, and sends a bowed voice. Change `program`, `noteExpression`, or the filter in the mapping card to make the doll sound like glass, wood, or a cluster of chimes.

Enable audio in Synth with a user gesture if the browser has not started the internal synth yet. The mapping remains authored even while audio is unavailable.

## 5. Add a second MediaPipe rig

Create a separate p5 node with the **MediaPipe · Schlemmer pose** example while the physics doll remains on the canvas. Add a Holistic source from Media and select it when the camera is available. The figurine uses discs, hoops, blocks, cylinders, and wedges, giving the lesson a second visual language without replacing the paper doll.

When no completed Holistic frame exists, the example uses a deterministic T-pose. This makes the lesson reproducible in a classroom without camera permissions.

The bridge exposes both streams and physics through the same application API. A small controller can inspect the latest landmark and use a physics grab or a named event to drive a body:

```js
const holistic = __.streams.list().find(stream => stream.kind === "holistic");
const nose = holistic?.feature("pose.nose", { space: "normalized" });
const physics = __.api.physics;
const world = physics.systems.list().find(system => system.name === "Marionette");
const head = physics.bodies.list(world?.id).find(body => body.id.endsWith("-head-body"));
if (world && head && nose) {
  const point = [nose.position.x * __.element.width, nose.position.y * __.element.height];
  physics.grab(world.id, head.id, point, { livePose: true });
  physics.moveGrab(world.id, point, { livePose: true });
}
```

For a sustained controller, keep the grab/release lifecycle in one node and emit a semantic event such as `marionette.pose` rather than creating a new body or constraint every frame. The two rigs can run at the same time because the camera, selection, and runtime motion are local while authored graph state stays shared.

## 6. Record and review a take

Start `/record start`, press Play, and make a short gesture with the mouse or camera. Stop with `/record stop`. History captures command and scene changes with a recoverable baseline; it does not bake the live solver into a stream of hundreds of geometry edits.

Use `/history play` or the History panel's playhead to review the take. Export the session when you need a portable performance, or choose **Create walkthrough** to turn a useful range into a new guided lesson. Stop the Marionette walkthrough with **Restore** to return to the patch that existed before the case study, or **Keep** to leave the costume and rig in the current patch.

## Related commands

```text
/physics demo marionette       Create the complete four-part starter
/physics play                  Run the active physics world
/physics pause                 Freeze the world for inspection
/physics apply                 Make the current pose the reset pose
/physics mapping               Add a collision mapping
/record start                  Record a History take
/record stop                   Finish the take
/history play                  Replay from the captured baseline
```
