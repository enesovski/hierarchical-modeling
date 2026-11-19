import * as m4 from "./math.js";
import { drawHierarchy, updateTransforms } from "./scene-graph.js";
import { DOFS } from "./insect.js";

const DOF_BY_KEY = new Map(DOFS.map((dof) => [dof.key, dof]));
const EPSILON = 1;
const DAMPING = 0.05;
const MAX_STEP = 5;
const ITERATIONS = 4;
const CLICK_TOLERANCE_PX = 3;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const meshCentre = (shape) => shape.centre ?? [0, 0, 0];

const shapeCentre = (shape) => m4.transformPoint(shape.matrix, meshCentre(shape));

function handlePosition(root, node) {
    const offPivot = node.shapes.filter((shape) => Math.hypot(...shapeCentre(shape)) > 1e-6);
    const handles = new Set(offPivot.length > 0 ? offPivot : node.shapes);
    const sum = [0, 0, 0];
    drawHierarchy(root, m4.identity(), (shape, world) => {
        if (!handles.has(shape)) return;
        const p = m4.transformPoint(world, meshCentre(shape));
        sum[0] += p[0];
        sum[1] += p[1];
        sum[2] += p[2];
    });
    return sum.map((s) => s / handles.size);
}

function project(viewProjection, [x, y, z], width, height) {
    const m = viewProjection;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [((cx / cw + 1) / 2) * width, ((1 - cy / cw) / 2) * height];
}

function dragKeys(node, root, shiftKey) {
    if (node !== root) return node.dofs;
    return shiftKey ? ["global.yaw", "global.pitch"] : ["global.x", "global.z"];
}

function handleOnScreen(drag) {
    updateTransforms(drag.root, drag.pose);
    return project(drag.viewProjection, handlePosition(drag.root, drag.node), drag.width, drag.height);
}

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

function blockedByLimit(pose, key, step) {
    const { min, max } = DOF_BY_KEY.get(key);
    return (step > 0 && pose[key] >= max) || (step < 0 && pose[key] <= min);
}

function solveStep(drag, target) {
    const { pose } = drag;
    const current = handleOnScreen(drag);
    const error = [target[0] - current[0], target[1] - current[1]];
    const startDistance = Math.hypot(error[0], error[1]);
    if (startDistance < 0.5) return false;

    const column = new Map(drag.keys.map((key) => {
        const saved = pose[key];
        pose[key] = saved + EPSILON;
        const moved = handleOnScreen(drag);
        pose[key] = saved;
        return [key, [(moved[0] - current[0]) / EPSILON, (moved[1] - current[1]) / EPSILON]];
    }));

    let active = drag.keys;
    let steps = dampedLeastSquares(active.map((key) => column.get(key)), error);
    while (active.length > 1) {
        const free = active.filter((key, i) => !blockedByLimit(pose, key, steps[i]));
        if (free.length === active.length || free.length === 0) break;
        active = free;
        steps = dampedLeastSquares(active.map((key) => column.get(key)), error);
    }

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

export function attachDragPosing(canvas, { picker, camera, root, pose, state }) {
    let drag = null;
    let down = null;

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
        if (!node) return;

        state.selectedNode = node;
        drag = {
            root, pose, node,
            keys: dragKeys(node, root, e.shiftKey),
            viewProjection: m4.multiply(projection, view),
            width: mouse.width,
            height: mouse.height,
        };
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
