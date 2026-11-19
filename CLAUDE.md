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

`src/main.js` only wires things together. Each frame it runs `updateTransforms(insect, pose)`, then `posePanel.sync()`, then `renderer.render(scene)`. App-level flags live in `state` (`lighting`, `selectedNode`). For console debugging it exposes `window.app = { pose, camera, state, insect }`. UI panels live in `src/ui/`. Each one is a `createXPanel(container, ...)` function that appends its own `<section>` to `#panel`.

- **Pose = single source of truth.** `pose` is a flat object `{ "node.dof": degrees }`, and `DOFS` in `src/insect.js` declares every key with its UI group, min, max and step (the sliders are generated from it). Angles are *offsets from the rest pose* baked into each node's `computeTransform`, so an all-zero pose is the standing ant. Sliders, picking/dragging, keyframe interpolation and save/load must all read or write this object; do not add parallel joint state. `node.dofs` lists the keys a node owns (the root `thorax` owns the `global.*` keys).
- **Scene graph** (`src/scene-graph.js`): left-child/right-sibling nodes. `node.transform` is the joint transform relative to the parent and is inherited by children. Each entry in `node.shapes` (`{ mesh, matrix, color }`) carries an instance matrix that is *not* inherited, so it is the place to size or offset a primitive without affecting children.
- **Traversal** (`drawHierarchy` in `src/scene-graph.js`) is the graded matrix-stack recursion: push, multiply, draw, recurse into the child, pop, recurse into the sibling. It calls `drawShape(shape, modelView, node)`, so the renderer and the picking pass share it and each brings its own draw function. Do not duplicate the recursion.
- **Renderer** (`src/renderer.js`): draws `staticShapes` (the ground, outside the hierarchy), then the insect. The selected part is not tinted; `src/outline.js` draws an orange outline around it afterwards (mask pass of `scene.selectedNode` into an off-screen texture, then a full-screen pass that colours pixels within 3 px of the mask). The ground is written to the mask's depth buffer first, so only the ground hides the outline; other insect parts deliberately do not.
- **Picking and drag posing** (`src/picking.js`, `src/drag-pose.js`): `createPicker(gl, root, staticShapes).pick(view, projection, u, v)` renders an ID-colour pass to an off-screen framebuffer and reads one pixel. `attachDragPosing` is registered *before* `attachOrbitControls`, and the camera's `shouldStart` checks `isDragging()`. Dragging solves for the joint angles with damped least squares on a finite-difference screen-space Jacobian of the node's handle (the average of its off-pivot shape centres). A step is kept only if the handle gets closer (else halved), and DOFs pinned at a limit are dropped from the solve; together these stop the part from shaking when the cursor is out of reach.
- **Camera** (`src/camera.js`): `OrbitCamera` stores target, distance, yaw and pitch in degrees. `attachOrbitControls` takes a `shouldStart(event)` option so picking can claim a click before the camera does.
- **Ant frame conventions** (`src/insect.js`): +Z forward, +Y up, +X is the ant's left. Leg segments run along local +X, and right legs are pre-rotated 180° about Y, which is why their swing angle uses `-sign`. Antennae and mandibles run along local +Z. `BODY_HEIGHT` is derived from the leg geometry so the rest-pose feet touch y = 0; changing leg dimensions keeps that automatically.
- **One mesh format** (`createMesh` in `src/gl-utils.js`: flat `positions`/`normals`/`uvs`/`indices`, with 32-bit indices chosen automatically). Primitives are unit-sized (box 1×1×1, sphere and cylinder diameter 1, cylinder along Y), so a shape's scale equals its size. Phase 6 OBJ parts must produce this same format.
- **Shaders** (`src/shaders.js`) use fixed attribute locations (`ATTRIB` in `gl-utils.js`). Lighting is currently a placeholder diffuse term toggled by **L**. Phase 3 replaces it with Blinn-Phong, textures and a render-mode switch, and Phase 5 adds an ID-color picking pass. Face culling is off.
