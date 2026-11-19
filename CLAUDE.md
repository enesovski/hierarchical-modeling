# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Bilkent CS465/575 Assignment 2: a WebGL application to model, pose and animate a hierarchical **insect**. `requirements.txt` holds the **assignment spec and grading rubric**. It is *not* a Python dependency file, so never `pip install -r` it. `ROADMAP.md` is the prioritized, point-driven plan with checkboxes, so keep it up to date as features land.

## Running

There is no build step, package manager, linter or test suite. The app is static HTML + ES modules, so serve it over HTTP. Module scripts, textures and OBJ files fail to load from `file://`.

```bash
python serve.py
```

Then open http://localhost:8000. `serve.py` is `http.server` with `Cache-Control: no-store`. Plain `python -m http.server` lets the browser serve stale CSS and JS after edits. Check the browser console for shader compile and link errors. `.claude/launch.json` defines the same server as `static-server` for the preview pane.

## Code style

The user wants clean code with **short comments**: a line or two explaining *why*, not paragraphs. Work happens on two parallel branches (`rendering` and `interaction`; see "Parallel work" in `ROADMAP.md` for which files each owns). Stay within the current branch's files, and keep `main.js` edits to small wiring blocks.

## Hard constraints (from the spec)

- **WebGL from scratch.** Do not use three.js, Babylon or any other WebGL wrapper. The context is WebGL2 (`src/main.js`).
- The model must be built from a **tree traversal with a matrix stack** (push/pop around child transforms, sibling/child links), like `figure.js` in the course samples. Graders check for this, so do not flatten it into a list of precomputed world matrices.
- Any adapted external code must have a comment at the top of that segment naming the source and describing how it was modified.
- Both group members are quizzed on the code at the demo. Prefer clear, explainable code over clever abstractions.

## Architecture

`src/main.js` only wires things together. Each frame it runs `updateTransforms(insect, pose)`, then `posePanel.sync()`, then `renderer.render(scene)`. App-level flags live in `state` (`renderMode`, `light`, `selectedNode`). For console debugging it exposes `window.app = { pose, camera, state, insect }`. UI panels live in `src/ui/`. Each one is a `createXPanel(container, ...)` function that appends its own `<section>` to `#panel`.

- **Pose = single source of truth.** `pose` is a flat object `{ "node.dof": degrees }`, and `DOFS` in `src/insect.js` declares every key with its UI group, min, max and step (the sliders are generated from it). Angles are *offsets from the rest pose* baked into each node's `computeTransform`, so an all-zero pose is the ant exactly as modelled in `Ant.blend`. Sliders, picking/dragging, keyframe interpolation and save/load must all read or write this object; do not add parallel joint state. `node.dofs` lists the keys a node owns (the root `thorax` owns the `global.*` keys).
- **Scene graph** (`src/scene-graph.js`): left-child/right-sibling nodes. `node.transform` is the joint transform relative to the parent and is inherited by children. Each entry in `node.shapes` (`{ mesh, matrix, color, texture?, specular?, shininess?, uvScale?, centre? }`; insect parts spread a `MATERIALS` entry) carries an instance matrix that is *not* inherited, so it is the place to size or offset a primitive without affecting children. `centre` is the mesh's centre in its own coordinates (OBJ parts set it; primitives are centred at the origin). Drag posing uses it as the part's handle.
- **Traversal** (`drawHierarchy` in `src/scene-graph.js`) is the graded matrix-stack recursion: push, multiply, draw, recurse into the child, pop, recurse into the sibling. It calls `drawShape(shape, modelView, node)`, so the renderer and the picking pass share it and each brings its own draw function. Do not duplicate the recursion.
- **Renderer** (`src/renderer.js`): `createRenderer(gl, textures)` draws `staticShapes` (the ground, outside the hierarchy), then the insect. The selected part is not tinted; `src/outline.js` draws an orange outline around it afterwards (mask pass of `scene.selectedNode` into an off-screen texture, then a full-screen pass that colours pixels within 3 px of the mask). The ground is written to the mask's depth buffer first, so only the ground hides the outline; other insect parts deliberately do not. Textures are looked up by name from `loadTextures` (`src/textures.js`).
- **Picking and drag posing** (`src/picking.js`, `src/drag-pose.js`): `createPicker(gl, root, staticShapes).pick(view, projection, u, v)` renders an ID-colour pass to an off-screen framebuffer and reads one pixel. `attachDragPosing` is registered *before* `attachOrbitControls`, and the camera's `shouldStart` checks `isDragging()`. Dragging solves for the joint angles with damped least squares on a finite-difference screen-space Jacobian of the node's handle (the average of its off-pivot shape centres). A step is kept only if the handle gets closer (else halved), and DOFs pinned at a limit are dropped from the solve; together these stop the part from shaking when the cursor is out of reach.
- **Animation** (`src/animation.js`, `src/ui/timeline.js`): an animation is `{ name, fps, length, loop, interpolation, tracks }` with `tracks = { [group]: [{ frame, values }] }`. A track is one DOF group from `DOFS` (`TRACKS`), i.e. a timeline row; `values` snapshots that group's DOFs. Each track is interpolated on its own and written into the shared `pose`; tracks with no keys leave the pose alone. Looping tracks are periodic (last key blends into the first at `first + length`). `AnimationPlayer.update(dt)` runs in the frame loop before `updateTransforms`; `seek(frame)` shows one frame. `trackOfNode(node)` maps a picked part to its row. Saved files go through `parseAnimation` (drops unknown tracks/keys, clamps values and frames).
- **Layout:** `index.html` stacks the canvas and `#timeline` inside `#viewport`; the sidebar `#panel` holds camera, rendering, selection and posture panels.
- **Preset animations** (`assets/animations/*.json`) are generated by `node tools/make_animations.mjs`, which loads the real model in Node and builds tracks with the app's own `setKey`. Leg IK (damped least squares) keeps the walk's feet planted and all six feet still while looking around. Rerun it after changing the model or rig; it prints the worst foot miss per leg.
- **Camera** (`src/camera.js`): `OrbitCamera` stores target, distance, yaw and pitch in degrees. `attachOrbitControls` takes a `shouldStart(event)` option so picking can claim a click before the camera does.
- **Ant model** (`src/insect.js`, `src/obj-loader.js`, `assets/models/`): `main.js` awaits `loadObj("ant.obj")` (one mesh per `o` part, plus `map_Kd` from `ant.mtl` registered as texture `"ant"`) and `ant.rig.json` (parent and pivot per part, parents first), then calls `buildInsect(rig, parts, uploadMesh)`. Axes: +Z forward, +Y up, +X is the ant's left, with feet at y ≈ 0. OBJ vertices are in rest-pose model space. `createShape` subtracts the pivot so each part's joint is its origin, and a node's transform is `T(pivot − parentPivot)` times one rotation per DOF. Each DOF declares `axis` (`"yaw"` = vertical; `"raise"` = horizontal axis across the segment, `normalize(direction × up)`, + lifts the tip) and `sign` (mirrors left/right). The segment direction points at the only child's pivot, or at the part's own centre. Parts are never pre-rotated.
- **Editing the model:** `Ant.blend` holds the 28 parts (named like the nodes, origin = joint pivot, parented like the tree). After changing it, re-export with `blender -b assets/models/Ant.blend --python tools/export_ant.py`; the OBJ uses Forward −Z / Up Y. Blender is at `D:\SteamLibrary\steamapps\common\Blender\blender.exe`. `gltf_embedded_0.png` is the diffuse map; `gltf_embedded_1.png` is an unused normal map.
- **One mesh format** (`createMesh` in `src/gl-utils.js`: flat `positions`/`normals`/`uvs`/`indices`, with 32-bit indices chosen automatically). OBJ parts and primitives both produce it. Primitives (only the ground box is still used) are unit-sized: box 1×1×1, sphere and cylinder diameter 1, cylinder along Y.
- **Shaders** (`src/shaders.js`) use fixed attribute locations (`ATTRIB` in `gl-utils.js`). One program handles all four render modes (`RENDER_MODES` in `renderer.js`: color, texture, shading, shaded texture) with per-fragment Blinn-Phong in view space. Picking (`picking.js`) and the outline (`outline.js`) have their own small programs. Face culling is off.
- **Textures:** the ground's soil texture is in `assets/textures/` and is generated by `python tools/make_textures.py` (fixed seed). The generator also writes `chitin`/`leg`/`eye`, which the primitive ant used and which are no longer loaded. The ant uses its own diffuse map from `ant.mtl`.
