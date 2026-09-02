# 3D model inputs

Underscores treats a 3D file as a Media source, alongside an image or movie. Drop a model on the canvas, choose one with the Media panel file picker, or create a source with `/model`. The source is stored in the browser's local media catalog and can be reused by multiple preview rectangles.

## Supported formats

- **OBJ**: geometry-only meshes. Materials and textures are only available when the source includes the paths expected by the OBJ loader.
- **glTF / GLB**: scenes, materials, animation clips, and morph targets. GLB is the recommended single-file format because it bundles external resources.
- **USD / USDA / USDC / USDZ**: loaded by the bundled Three.js USD loader. Feature and material coverage depends on the source file.

Local files remain available after a reload in the same browser profile. A JSON `.gltf` can still reference `.bin` buffers and textures; those resources must be resolvable by the browser. Remote URLs must allow CORS. If a source is present in the catalog but its local file is unavailable, use **Relink** in Media.

## Preview controls

Select a model source in **Media** to see its runtime preview. When glTF animation clips or morph targets are present, the panel exposes:

- animation selection, play/pause, loop, and playback speed;
- one blendshape slider per discovered morph target;
- a standard-model picker for the Khronos Damaged Helmet, Khronos Animated Morph Cube, and MIT Utah Teapot examples.

Dragging the source icon onto the canvas creates a normal Media preview object. Its URL, source identity, and dimensions are persisted with the media source; the rendered WebGL scene remains runtime state. Multiple previews can refer to one source without duplicating the stored file.

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
```

The examples are sourced from the [Khronos glTF Sample Assets catalog](https://github.khronos.org/glTF-Assets/) and the [MIT 6.837 Utah teapot](https://groups.csail.mit.edu/graphics/classes/6.837/F03/models/teapot.obj). The MIT teapot is a useful geometry smoke test, while the Khronos samples exercise physically based materials, animation, and morph targets. Network availability and CORS policy are properties of the remote host, so a failed remote load is reported in the Media panel without changing the authored scene.
