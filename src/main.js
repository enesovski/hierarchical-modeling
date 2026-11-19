import * as m4 from "./math.js";
import { createMesh } from "./gl-utils.js";
import { createBox, createSphere, createCylinder } from "./primitives.js";
import { updateTransforms } from "./scene-graph.js";
import { DOFS, buildInsect, createDefaultPose } from "./insect.js";
import { createRenderer } from "./renderer.js";
import { OrbitCamera, attachOrbitControls } from "./camera.js";
import { createPosePanel } from "./ui/pose-panel.js";
import { createCameraPanel } from "./ui/camera-panel.js";

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

attachOrbitControls(canvas, camera);
createCameraPanel(panel, camera);
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

    renderer.render({
        root: insect,
        staticShapes,
        view: camera.viewMatrix(),
        projection: camera.projectionMatrix(canvas.width / canvas.height),
        lighting: state.lighting,
        selectedNode: state.selectedNode,
    });
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Console handle for debugging.
window.app = { pose, camera, state, insect };
