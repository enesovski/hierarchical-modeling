import * as m4 from "./math.js";

const ROTATE_DEG_PER_PX = 0.4;
const PAN_PER_PX = 0.0015;
const ZOOM_PER_WHEEL = 0.001;
const MIN_DISTANCE = 2;
const MAX_DISTANCE = 60;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export class OrbitCamera {
    constructor() {
        this.reset();
    }

    reset() {
        this.target = [0, 0.8, 0];
        this.distance = 11;
        this.yaw = 40;
        this.pitch = 22;
        this.fovy = 45;
    }

    get eye() {
        const yaw = m4.degToRad(this.yaw);
        const pitch = m4.degToRad(this.pitch);
        const [tx, ty, tz] = this.target;
        return [
            tx + this.distance * Math.cos(pitch) * Math.sin(yaw),
            ty + this.distance * Math.sin(pitch),
            tz + this.distance * Math.cos(pitch) * Math.cos(yaw),
        ];
    }

    viewMatrix() {
        return m4.lookAt(this.eye, this.target, [0, 1, 0]);
    }

    projectionMatrix(aspect) {
        return m4.perspective(m4.degToRad(this.fovy), aspect, 0.1, 200);
    }

    rotate(dxPx, dyPx) {
        this.yaw -= dxPx * ROTATE_DEG_PER_PX;
        this.pitch = clamp(this.pitch + dyPx * ROTATE_DEG_PER_PX, -89, 89);
    }

    pan(dxPx, dyPx) {
        const view = this.viewMatrix();
        const right = [view[0], view[4], view[8]];
        const up = [view[1], view[5], view[9]];
        const scale = this.distance * PAN_PER_PX;
        for (let i = 0; i < 3; i++) {
            this.target[i] += (-right[i] * dxPx + up[i] * dyPx) * scale;
        }
    }

    zoom(wheelDelta) {
        const factor = Math.exp(wheelDelta * ZOOM_PER_WHEEL);
        this.distance = clamp(this.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
    }
}

export function attachOrbitControls(canvas, camera, { shouldStart = () => true } = {}) {
    let drag = null;

    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    canvas.addEventListener("pointerdown", (e) => {
        if (!shouldStart(e)) return;
        const pan = e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey);
        drag = { mode: pan ? "pan" : "rotate", x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.x = e.clientX;
        drag.y = e.clientY;
        if (drag.mode === "pan") camera.pan(dx, dy);
        else camera.rotate(dx, dy);
    });

    const endDrag = () => { drag = null; };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        camera.zoom(e.deltaY);
    }, { passive: false });
}
