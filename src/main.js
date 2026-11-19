import * as m4 from "./math.js";
import { createMesh } from "./gl-utils.js";
import { createBox, createSphere, createCylinder } from "./primitives.js";
import { updateTransforms } from "./scene-graph.js";
import { DOFS, buildInsect, createDefaultPose } from "./insect.js";
import { createRenderer } from "./renderer.js";
import { OrbitCamera, attachOrbitControls } from "./camera.js";
import { createPicker } from "./picking.js";
import { attachDragPosing } from "./drag-pose.js";
import { createOutline } from "./outline.js";
import { createPosePanel } from "./ui/pose-panel.js";
import { createCameraPanel } from "./ui/camera-panel.js";
import { createSelectionPanel } from "./ui/selection-panel.js";

const canvas = document.getElementById("glCanvas");
const panel = document.getElementById("panel");
const gl = canvas.getContext("webgl2");

if (!gl) {
    throw new Error("WebGL2 is not supported.");
}

const meshes = {
    box: createMesh(gl, createBox()),
    sphere: createMesh(gl, createSphere()),
    cylinder: createMesh(gl, createCylinder()),
};

const insect = buildInsect(meshes);
const pose = createDefaultPose();
const renderer = createRenderer(gl);
const camera = new OrbitCamera();
const outline = createOutline(gl);

// Ground slab outside the hierarchy; its top face is at y = 0.
const staticShapes = [
    {
        mesh: meshes.box,
        matrix: m4.multiply(m4.translation(0, -0.05, 0), m4.scaling(30, 0.1, 30)),
        color: [0.55, 0.5, 0.4],
    },
];

const state = {
    lighting: true,
    selectedNode: null,
};

// Drag posing registers first so a click on a part is not also a camera drag.
const picker = createPicker(gl, insect, staticShapes);
const dragPosing = attachDragPosing(canvas, { picker, camera, root: insect, pose, state });
attachOrbitControls(canvas, camera, { shouldStart: () => !dragPosing.isDragging() });
createCameraPanel(panel, camera);
const selectionPanel = createSelectionPanel(panel, state);
const posePanel = createPosePanel(panel, pose, DOFS);

window.addEventListener("keydown", (e) => {
    if (e.key === "l" || e.key === "L") state.lighting = !state.lighting;
});

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * dpr);
    const height = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
}

function frame() {
    resizeCanvas();
    updateTransforms(insect, pose);
    posePanel.sync();
    selectionPanel.sync();

    const view = camera.viewMatrix();
    const projection = camera.projectionMatrix(canvas.width / canvas.height);
    renderer.render({ root: insect, staticShapes, view, projection, lighting: state.lighting });
    outline.draw({ root: insect, staticShapes, view, projection, selectedNode: state.selectedNode });
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Console handle for debugging.
window.app = { pose, camera, state, insect };
