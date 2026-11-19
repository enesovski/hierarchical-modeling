# Roadmap — Insect Hierarchical Modeling (CS465/575 Assignment 2)

**Demo:** Tue 24 Nov 2026, 15:30 (B-203). **Moodle zip:** same day, 23:55. Grading spec: `requirements.txt`.

Phases are ordered by **points gained per hour of work**, so stopping at any phase still leaves a demo-ready app with as many points as possible. Each phase should end with a working, committed build.

## Point budget (100 total)

| Category | Max | Target | How |
|---|---|---|---|
| 1. Model | 25 | 25 | Primitives (15) first, then swap part meshes for Blender OBJ files (25) in Phase 6 |
| 2. Render | 25 | 25 | Smooth-shaded texture (20) + uniform-color mode (5), toggled by a render-mode menu |
| 3. Animation | 25 | 25 | Keyframes (5) + interpolation (10) + save/load (5) + 2 preset animations (5) |
| 4. Other | 25 | 25 | Mouse picking + drag posing (15) + mouse orbit/pan/zoom camera (10) |

The render category says "you can implement multiple options" with a 25-point cap. One shader with mode switches (color / texture / shading / shaded texture) covers every option for little extra work, so implement all four.

---

## Phase 0: Fix the skeleton ✅
- [x] Moved the stylesheet to `styles/main.css` to match the link in `index.html`.
- [x] Serve over HTTP with `python serve.py` (no-cache dev server). ES modules, texture images and OBJ files do not load from `file://`.

## Phase 1: Hierarchical model with primitives (≈15 + 5 pts) ✅
- [x] `src/math.js`: own column-major `mat4`/`vec3` code (no external math library).
- [x] `src/primitives.js`: unit box, sphere and cylinder, each with **positions + normals + UVs**.
- [x] `src/scene-graph.js` + `src/renderer.js`: left-child/right-sibling nodes, traversed with an explicit **matrix stack** like `figure.js`.
- [x] `src/insect.js`: an **ant** with 28 nodes and 44 DOFs (6 global + head, antennae ×2 segments, mandibles, petiole, gaster, 6 legs × 3 segments). Rest-pose feet touch y = 0.
- [x] Per-part uniform color (press **L** to switch between flat color and the temporary diffuse lighting). **Gradable checkpoint: Model 15 + Color 5.**

## Phase 2: Sliders + camera (≈5 + 10 pts) ✅
- [x] One `pose` state object (`{ "node.dof": degrees }`, defined by `DOFS` in `src/insect.js`) that both the renderer and the UI read and write. Keyframes and save/load in Phase 4 serialize this same object.
- [x] `src/ui/pose-panel.js`: one slider per `DOFS` entry, grouped by body part, plus Reset pose. `sync()` runs every frame, so sliders follow pose changes from any source.
- [x] `src/camera.js`: perspective orbit camera. Drag rotates, the wheel zooms, and right-drag or Shift-drag pans; `src/ui/camera-panel.js` adds Reset view.

**Baseline:** Phases 0–2 are committed on `main`. The remaining work splits into two branches below.

---

## Parallel work: two branches from the baseline

Each branch owns its files. Both will touch `src/main.js` (a few wiring lines each), so expect a small merge there and nowhere else.

| | Branch `rendering` (Phases 3 + 6) | Branch `interaction` (Phases 4 + 5) |
|---|---|---|
| Owns | `shaders.js`, `renderer.js`, `insect.js` shape definitions, new `textures.js`, `obj-loader.js`, `ui/render-panel.js`, `assets/textures/`, `assets/models/` | new `animation.js`, `picking.js`, `ui/animation-panel.js`, `assets/animations/` |
| Hooks already in the baseline | `renderer.render(scene)`; shapes are `{ mesh, matrix, color }` | `drawHierarchy(root, view, drawShape)` for the picking pass; `state.selectedNode` (the renderer already highlights it); `node.dofs`; `attachOrbitControls(..., { shouldStart })` so a click on a part skips the camera |

Shared contract, which neither branch changes alone: the `DOFS` keys and `pose` format in `insect.js` (saved animations depend on them) and the `createMesh` format.

## Phase 3: Render quality (→ 25 pts)
- [ ] Blinn-Phong lighting in the fragment shader using per-vertex normals and a normal matrix (smooth shading, 15).
- [ ] Image texture per part (body, wing, leg), sampled with the primitive UVs (texture 10, shaded texture 20).
- [ ] Render-mode dropdown: color / texture / shading / shaded texture.

## Phase 4: Keyframe animation (→ 25 pts)
- [ ] "Save keyframe" stores a snapshot of `pose` plus a time.
- [ ] Playback linearly interpolates each angle between neighbouring keyframes, with optional looping and ease-in/out.
- [ ] Save the animation as a JSON download and load it with `<input type="file">`.
- [ ] Two preset animations kept as JSON in `assets/animations/` (for example walk and jump/fly), each loadable with one button.

## Phase 5: Direct manipulation by picking (→ 15 pts)
- [ ] Off-screen framebuffer pass with its own small shader that draws each part in a unique ID color through `drawHierarchy`; on click, `gl.readPixels` at the cursor to find the part.
- [ ] Set `state.selectedNode` to highlight the selected part. Dragging changes that joint's angle(s) (`node.dofs` lists its pose keys) and writes back into `pose`, so the sliders stay in sync.
- [ ] Clicking empty space falls through to camera control.

## Phase 6: OBJ model (+10 pts, Model 15 → 25)
- [ ] Model the ant in Blender with **one OBJ per node** in `src/insect.js`, each with its origin at that node's joint pivot and its axes matching the node's local frame (+Z forward, +Y up; leg segments along local +X). Export with normals and UVs into `assets/models/`.
- [ ] Minimal OBJ parser (`v`/`vn`/`vt`/`f`, triangulating faces) that outputs the `createMesh` format. Each node's `shapes` then uses the OBJ mesh with an identity matrix, and the joint transforms stay unchanged.

## Before the demo
- [ ] Test the full flow in Chrome and Firefox from a fresh `python serve.py`.
- [ ] Add attribution comments to any adapted code. Both members must be able to explain the matrix stack, picking and interpolation.
- [ ] Zip the source for Moodle.
