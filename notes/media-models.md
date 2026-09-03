# 3D model inputs

Underscores treats a 3D file as a Media source, alongside an image or movie. Drop a model on the canvas, choose one with the Media panel file picker, or create a source with `/model`. The source is stored in the browser's local media catalog and can be reused by multiple preview rectangles.

## Supported formats

- **OBJ**: geometry-only meshes. Materials and textures are only available when the source includes the paths expected by the OBJ loader.
- **OBJ ZIP archives**: a `.zip` can contain one or more OBJ files plus optional MTL and image textures. Underscores selects `scene.obj`, `model.obj`, or `bunny.obj` when present, otherwise the shortest OBJ path; companion files are resolved inside the archive.
- **glTF / GLB**: scenes, materials, animation clips, and morph targets. GLB is the recommended single-file format because it bundles external resources.
- **USD / USDA / USDC / USDZ**: loaded by the bundled Three.js USD loader. Feature and material coverage depends on the source file.

Local files remain available after a reload in the same browser profile. A JSON `.gltf` can still reference `.bin` buffers and textures; those resources must be resolvable by the browser. Remote URLs must allow CORS. If a source is present in the catalog but its local file is unavailable, use **Relink** in Media.

## Preview controls

Select a model source in **Media** to see its runtime preview. When glTF animation clips or morph targets are present, the panel exposes:

- animation selection, play/pause, loop, and playback speed;
- one blendshape slider per discovered morph target;
- a standard-model picker for the Khronos Damaged Helmet, Khronos Animated Morph Cube, CORS-enabled GitHub Utah Teapot and Stanford Bunny, and CORS-friendly Three.js Walt Head examples.

Dragging the source icon onto the canvas creates a normal Media preview object. Its URL, source identity, and dimensions are persisted with the media source; the rendered WebGL scene remains runtime state. Multiple previews can refer to one source without duplicating the stored file.

Canvas model previews are interactive by default. Click the model surface to focus it, then use the same Blender-style controls as a Three.js node: Option-drag to orbit, Shift-Option-drag to pan, Ctrl-Option-drag to zoom, and two-finger trackpad gestures for orbit/pan/zoom. W/S/A/D/Q/E and arrow keys work while the preview is focused. Animation and blendshape settings remain source-level controls in Media, so changing them updates every preview that uses that source.

## Livecode playback

Three.js Livecode nodes receive an allow-listed `loadModel` helper. It returns `{ scene, animations, format }`; no loader import or DOM access is needed in authored code.

```js
const asset = await loadModel(
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/AnimatedMorphCube/glTF-Binary/AnimatedMorphCube.glb",
);
scene.add(asset.scene);

const mixer = new THREE.AnimationMixer(asset.scene);
if (asset.animations[0]) mixer.clipAction(asset.animations[0]).play();

tick(({ delta }) => mixer.update(delta));
```

Morph targets are ordinary Three.js mesh data and can be driven from parameters:

```js
// @param smile = 0.5 (0..1 step:0.01)
asset.scene.traverse(object => {
  if (object.morphTargetInfluences) object.morphTargetInfluences.fill(__.params.smile);
});
```

Use `onDispose` for listeners, mixers, or resources that are not owned by the scene graph. Linked and free Livecode transport modes continue to control the node clock; model source playback controls are local to the media source.

## Standard examples

The command palette and Media panel use these stable example IDs:

```text
/model example=damaged-helmet
/model example=animated-morph-cube
/model example=mit-teapot
/model example=stanford-bunny-zip
/model example=three-walt-head
```

The examples are sourced from the [Khronos glTF Sample Assets catalog](https://github.khronos.org/glTF-Assets/), CORS-enabled GitHub mirrors of the [Utah teapot](https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/teapot.obj) and [Stanford Bunny](https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/stanford-bunny.obj), and a [Three.js OBJ sample](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/obj/walt/WaltHead.obj). The `/model example=stanford-bunny-zip` id is retained for existing scenes and commands, but now points to the CORS-friendly standalone OBJ; dropped ZIP archives remain supported and are unpacked in memory with companion MTL/textures when included. Network availability and CORS policy are properties of the remote host, so a failed remote load is reported in the Media panel without changing the authored scene.
