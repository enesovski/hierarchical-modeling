import * as m4 from "./math.js";
import { createMesh } from "./gl-utils.js";
import { createBox } from "./primitives.js";
import { updateTransforms } from "./scene-graph.js";
import { DOFS, buildInsect, createDefaultPose } from "./insect.js";
import { createRenderer } from "./renderer.js";
import { loadTexture, loadTextures } from "./textures.js";
import { loadObj } from "./obj-loader.js";
import { OrbitCamera, attachOrbitControls } from "./camera.js";
import { createPicker } from "./picking.js";
import { attachDragPosing } from "./drag-pose.js";
import { createOutline } from "./outline.js";
import { AnimationPlayer } from "./animation.js";
import { createPosePanel } from "./ui/pose-panel.js";
import { createCameraPanel } from "./ui/camera-panel.js";
import { createRenderPanel } from "./ui/render-panel.js";
import { createSelectionPanel } from "./ui/selection-panel.js";
import { createTimeline } from "./ui/timeline.js";

const canvas = document.getElementById("glCanvas");
const panel = document.getElementById("panel");
const gl = canvas.getContext("webgl2");

if (!gl) {
    throw new Error("WebGL2 is not supported.");
}

const [antModel, antRig] = await Promise.all([
    loadObj("./assets/models/ant.obj"),
    fetch("./assets/models/ant.rig.json").then((response) => response.json()),
]);
const insect = buildInsect(antRig, antModel.parts, (data) => createMesh(gl, data));
const pose = createDefaultPose();
const player = new AnimationPlayer(pose);

const textures = loadTextures(gl);
textures.ant = loadTexture(gl, antModel.diffuseMap);
const renderer = createRenderer(gl, textures);
const camera = new OrbitCamera();
const outline = createOutline(gl);

const staticShapes = [
    {
        mesh: createMesh(gl, createBox()),
        matrix: m4.multiply(m4.translation(0, -0.05, 0), m4.scaling(30, 0.1, 30)),
        color: [0.55, 0.5, 0.4],
        texture: "ground",
        uvScale: [8, 8],
        specular: 0.05,
        shininess: 8,
    },
];

const state = {
    renderMode: 3,
    light: { azimuth: 35, elevation: 55 },
    selectedNode: null,
};

const picker = createPicker(gl, insect, staticShapes);
const dragPosing = attachDragPosing(canvas, { picker, camera, root: insect, pose, state });
attachOrbitControls(canvas, camera, { shouldStart: () => !dragPosing.isDragging() });
createCameraPanel(panel, camera);
createRenderPanel(panel, state);
const selectionPanel = createSelectionPanel(panel, state);
const timeline = createTimeline(document.getElementById("timeline"), player, pose, state);
const posePanel = createPosePanel(panel, pose, DOFS);

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

let lastTime = null;

function frame(now) {
    const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    resizeCanvas();
    player.update(dt);
    timeline.sync();
    updateTransforms(insect, pose);
    posePanel.sync();
    selectionPanel.sync();

    const view = camera.viewMatrix();
    const projection = camera.projectionMatrix(canvas.width / canvas.height);
    renderer.render({
        root: insect, staticShapes, view, projection,
        renderMode: state.renderMode, light: state.light,
    });
    outline.draw({ root: insect, staticShapes, view, projection, selectedNode: state.selectedNode });
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

window.app = { pose, camera, state, insect, player };
