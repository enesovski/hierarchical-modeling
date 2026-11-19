// Direct manipulation: click a part to select it, drag to pose it.
//
// While dragging, the selected part's joint angles are adjusted so that the
// part's centre follows the cursor on screen. Each step:
//   1. measure how far the centre moves on screen when each angle changes by
//      1 degree (finite differences -> a 2 x k Jacobian J, in pixels/degree),
//   2. solve for the angle changes that move it towards the cursor with damped
//      least squares:  dAngles = J^T (J J^T + lambda I)^-1 * error,
//      where lambda keeps the step finite when J is (nearly) singular,
//   3. keep the step only if the part actually gets closer (otherwise halve it),
//      and leave out DOFs already at their limit, so the part never shakes.
// This works from any camera direction and for joints with 1 or 2 DOFs.
// The angles are written into `pose`, so the sliders follow automatically.

import * as m4 from "./math.js";
import { drawHierarchy, updateTransforms } from "./scene-graph.js";
import { DOFS } from "./insect.js";

const DOF_BY_KEY = new Map(DOFS.map((dof) => [dof.key, dof]));
const EPSILON = 1;          // finite-difference step (degrees, or units for x/z)
const DAMPING = 0.05;       // lambda as a fraction of trace(J J^T), so it scales with zoom
const MAX_STEP = 5;         // largest change of one DOF per iteration
const ITERATIONS = 4;       // solver steps per mouse move (stops early when done)
const CLICK_TOLERANCE_PX = 3;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Centre of a shape in its node's local frame.
const shapeCentre = (shape) => [shape.matrix[12], shape.matrix[13], shape.matrix[14]];

// World position of a node's "handle": the average centre of its shapes,
// skipping the joint balls that sit on the pivot (they would barely move
// when the joint rotates). Uses the renderer's matrix-stack traversal with an
// identity view, so `world` is the shape's world matrix.
function handlePosition(root, node) {
    const offPivot = node.shapes.filter((shape) => Math.hypot(...shapeCentre(shape)) > 1e-6);
    const handles = new Set(offPivot.length > 0 ? offPivot : node.shapes);
    const sum = [0, 0, 0];
    drawHierarchy(root, m4.identity(), (shape, world) => {
        if (!handles.has(shape)) return;
        sum[0] += world[12];
        sum[1] += world[13];
        sum[2] += world[14];
    });
    return sum.map((s) => s / handles.size);
}

// World point -> CSS pixels from the canvas' top-left corner.
function project(viewProjection, [x, y, z], width, height) {
    const m = viewProjection;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [((cx / cw + 1) / 2) * width, ((1 - cy / cw) / 2) * height];
}

// The root (thorax) owns the global DOFs: drag moves the ant over the ground,
// Shift-drag turns it. Every other part drags its own joint angles.
function dragKeys(node, root, shiftKey) {
    if (node !== root) return node.dofs;
    return shiftKey ? ["global.yaw", "global.pitch"] : ["global.x", "global.z"];
}

// Screen position of the dragged part's handle for the current pose.
function handleOnScreen(drag) {
    updateTransforms(drag.root, drag.pose);
    return project(drag.viewProjection, handlePosition(drag.root, drag.node), drag.width, drag.height);
}

// Damped least squares for a 2 x k Jacobian (k columns [dx, dy]):
// steps = J^T (J J^T + lambda I)^-1 * error. J J^T is 2 x 2, so it is inverted directly.
function dampedLeastSquares(columns, error) {
    let a = 0, b = 0, d = 0;
    for (const [jx, jy] of columns) {
        a += jx * jx;
        b += jx * jy;
        d += jy * jy;
    }
    const lambda = DAMPING * (a + d) + 1e-9;
    a += lambda;
    d += lambda;
    const det = a * d - b * b;
    const w = [(d * error[0] - b * error[1]) / det, (a * error[1] - b * error[0]) / det];
    return columns.map(([jx, jy]) => jx * w[0] + jy * w[1]);
}

// True if the DOF is already at a limit and `step` pushes it further out.
function blockedByLimit(pose, key, step) {
    const { min, max } = DOF_BY_KEY.get(key);
    return (step > 0 && pose[key] >= max) || (step < 0 && pose[key] <= min);
}

// One solver step that moves the handle towards `target`.
// Returns false when no step gets closer (reached, or as close as the limits allow).
function solveStep(drag, target) {
    const { pose } = drag;
    const current = handleOnScreen(drag);
    const error = [target[0] - current[0], target[1] - current[1]];
    const startDistance = Math.hypot(error[0], error[1]);
    if (startDistance < 0.5) return false;

    // Column of J for each DOF: screen motion of the handle per unit change.
    const column = new Map(drag.keys.map((key) => {
        const saved = pose[key];
        pose[key] = saved + EPSILON;
        const moved = handleOnScreen(drag);
        pose[key] = saved;
        return [key, [(moved[0] - current[0]) / EPSILON, (moved[1] - current[1]) / EPSILON]];
    }));

    // A DOF stuck at its limit cannot help; drop it and let the others solve
    // alone, otherwise they keep compensating for it and the part shakes.
    let active = drag.keys;
    let steps = dampedLeastSquares(active.map((key) => column.get(key)), error);
    while (active.length > 1) {
        const free = active.filter((key, i) => !blockedByLimit(pose, key, steps[i]));
        if (free.length === active.length || free.length === 0) break;
        active = free;
        steps = dampedLeastSquares(active.map((key) => column.get(key)), error);
    }

    // Keep the step only if it brings the part closer; otherwise try half of it.
    // The distance can then only shrink, so the solver cannot oscillate.
    const saved = active.map((key) => pose[key]);
    for (let scale = 1; scale >= 1 / 8; scale /= 2) {
        active.forEach((key, i) => {
            const { min, max } = DOF_BY_KEY.get(key);
            const step = clamp(scale * steps[i], -MAX_STEP, MAX_STEP);
            pose[key] = clamp(saved[i] + step, min, max);
        });
        const p = handleOnScreen(drag);
        if (Math.hypot(target[0] - p[0], target[1] - p[1]) < startDistance) return true;
    }
    active.forEach((key, i) => { pose[key] = saved[i]; });
    updateTransforms(drag.root, pose);
    return false;
}

// Returns { isDragging() } so the orbit camera can ignore clicks on parts.
// Register this before attachOrbitControls so its pointerdown runs first.
export function attachDragPosing(canvas, { picker, camera, root, pose, state }) {
    let drag = null;
    let down = null;   // where the last left click started, to detect plain clicks

    const mousePos = (e) => {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top, width: rect.width, height: rect.height };
    };

    canvas.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const mouse = mousePos(e);
        down = mouse;

        const view = camera.viewMatrix();
        const projection = camera.projectionMatrix(canvas.width / canvas.height);
        updateTransforms(root, pose);
        const node = picker.pick(view, projection, mouse.x / mouse.width, mouse.y / mouse.height);
        if (!node) return; // empty space: the camera handles this click

        state.selectedNode = node;
        drag = {
            root, pose, node,
            keys: dragKeys(node, root, e.shiftKey),
            viewProjection: m4.multiply(projection, view),
            width: mouse.width,
            height: mouse.height,
        };
        // Keep the grab offset so the part does not jump to the cursor.
        const start = project(drag.viewProjection, handlePosition(root, node), mouse.width, mouse.height);
        drag.offset = [start[0] - mouse.x, start[1] - mouse.y];
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const mouse = mousePos(e);
        const target = [mouse.x + drag.offset[0], mouse.y + drag.offset[1]];
        for (let i = 0; i < ITERATIONS && solveStep(drag, target); i++);
    });

    const endDrag = (e) => {
        // A click (no drag) on empty space clears the selection.
        if (!drag && down && e.type === "pointerup") {
            const mouse = mousePos(e);
            if (Math.hypot(mouse.x - down.x, mouse.y - down.y) < CLICK_TOLERANCE_PX) {
                state.selectedNode = null;
            }
        }
        drag = null;
        down = null;
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    return { isDragging: () => drag !== null };
}
