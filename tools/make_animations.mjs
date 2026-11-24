import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as m4 from "../src/math.js";
import { DOFS, buildInsect, createDefaultPose } from "../src/insect.js";
import { drawHierarchy, updateTransforms } from "../src/scene-graph.js";
import { parseObj } from "../src/obj-loader.js";
import { TRACKS, createAnimation, setKey, samplePose, animationToJson } from "../src/animation.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = `${ROOT}assets/animations/`;
const DOF_BY_KEY = new Map(DOFS.map((dof) => [dof.key, dof]));
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function save(file, animation) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(`${OUT_DIR}${file}.json`, animationToJson(animation) + "\n");
    const keys = Object.values(animation.tracks).reduce((sum, keys) => sum + keys.length, 0);
    console.log(`wrote assets/animations/${file}.json (${animation.length} frames, ${keys} keys)`);
}

function keyTracks(animation, tracks, frame, pose) {
    for (const track of tracks) setKey(animation, track, frame, pose);
}

const { parts } = parseObj(readFileSync(`${ROOT}assets/models/ant.obj`, "utf8"));
const rig = JSON.parse(readFileSync(`${ROOT}assets/models/ant.rig.json`, "utf8"));
const root = buildInsect(rig, parts, (data) => data);

const LEGS = ["L1", "L2", "L3", "R1", "R2", "R3"];
const legKeys = (leg) => [`femur${leg}.swing`, `femur${leg}.lift`, `tibia${leg}.bend`, `tarsus${leg}.bend`];

const footLocal = {};
drawHierarchy(root, m4.identity(), (shape, world, node) => {
    if (!node.name.startsWith("tarsus")) return;
    const p = shape.mesh.positions;
    let lowest = 0;
    for (let i = 1; i < p.length / 3; i++) if (p[3 * i + 1] < p[3 * lowest + 1]) lowest = i;
    footLocal[node.name.slice(6)] = [p[3 * lowest], p[3 * lowest + 1], p[3 * lowest + 2]];
});

function footPositions(pose) {
    updateTransforms(root, pose);
    const feet = {};
    drawHierarchy(root, m4.identity(), (shape, world, node) => {
        const leg = node.name.slice(6);
        if (node.name.startsWith("tarsus")) feet[leg] = m4.transformPoint(world, footLocal[leg]);
    });
    return feet;
}

const RAD = Math.PI / 180;

function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
        let pivot = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
        [M[c], M[pivot]] = [M[pivot], M[c]];
        for (let r = c + 1; r < n; r++) {
            const f = M[r][c] / M[c][c];
            for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
        }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        let sum = M[r][n];
        for (let k = r + 1; k < n; k++) sum -= M[r][k] * x[k];
        x[r] = sum / M[r][r];
    }
    return x;
}

const DAMPING = 0.01;
const REST_PULL = 0.002;

function solveLeg(pose, leg, target) {
    const keys = legKeys(leg);
    for (let iteration = 0; iteration < 30; iteration++) {
        const foot = footPositions(pose)[leg];
        const error = target.map((t, i) => t - foot[i]);
        if (Math.hypot(...error) < 1e-4) return;

        const J = keys.map((key) => {
            const saved = pose[key];
            pose[key] = saved + 0.5;
            const moved = footPositions(pose)[leg];
            pose[key] = saved;
            return moved.map((m, i) => (m - foot[i]) / (0.5 * RAD));
        });
        const angles = keys.map((key) => pose[key] * RAD);
        const A = keys.map((_, r) => keys.map((_, c) =>
            J[r].reduce((s, v, i) => s + v * J[c][i], 0) + (r === c ? DAMPING + REST_PULL : 0)));
        const b = keys.map((_, r) => J[r].reduce((s, v, i) => s + v * error[i], 0) - REST_PULL * angles[r]);
        const step = solveLinear(A, b);

        keys.forEach((key, i) => {
            const { min, max } = DOF_BY_KEY.get(key);
            pose[key] = clamp(pose[key] + clamp(step[i] / RAD, -10, 10), min, max);
        });
    }
}

const CYCLE_FRAMES = 40;
const KEY_EVERY = 5;
const STRIDE = 0.6;
const STEP_HEIGHT = 0.3;
const TRIPOD_OFFSET = { L1: 0, R2: 0, L3: 0, R1: 0.5, L2: 0.5, R3: 0.5 };
const restFeet = footPositions(createDefaultPose());

function footTarget(frame, leg) {
    const phase = (((frame / CYCLE_FRAMES + TRIPOD_OFFSET[leg]) % 1) + 1) % 1;
    const p = [...restFeet[leg]];
    if (phase < 0.5) {
        p[2] += STRIDE * (0.5 - phase / 0.5);
    } else {
        const s = (phase - 0.5) / 0.5;
        p[2] += STRIDE * (s * s * (3 - 2 * s) - 0.5);
        p[1] += STEP_HEIGHT * Math.sin(Math.PI * s);
    }
    return p;
}

function walkPoseAt(frame, pose) {
    const wave = Math.sin((2 * Math.PI * frame) / CYCLE_FRAMES);
    pose["global.y"] = 0.03 * (1 - Math.cos((4 * Math.PI * frame) / CYCLE_FRAMES)) / 2;
    pose["global.roll"] = 2 * wave;
    pose["gaster.yaw"] = 5 * wave;
    pose["scapeL.pitch"] = 8 + 6 * wave;
    pose["scapeR.pitch"] = 8 - 6 * wave;
    for (const leg of LEGS) solveLeg(pose, leg, footTarget(frame, leg));
}

function makeWalk() {
    const animation = createAnimation("walk");
    animation.length = CYCLE_FRAMES;
    const tracks = TRACKS.filter((track) => track !== "Head");
    const pose = createDefaultPose();

    for (const record of [false, true]) {
        for (let frame = 0; frame < CYCLE_FRAMES; frame += KEY_EVERY) {
            walkPoseAt(frame, pose);
            if (record) keyTracks(animation, tracks, frame, pose);
        }
    }

    const worstMiss = Object.fromEntries(LEGS.map((leg) => [leg, 0]));
    let worstSink = 0;
    const played = createDefaultPose();
    for (let frame = 0; frame < CYCLE_FRAMES; frame += 0.25) {
        samplePose(animation, frame, played);
        const feet = footPositions(played);
        for (const leg of LEGS) {
            worstMiss[leg] = Math.max(worstMiss[leg], Math.hypot(...m4.subtract(feet[leg], footTarget(frame, leg))));
            worstSink = Math.max(worstSink, restFeet[leg][1] - feet[leg][1]);
        }
    }
    console.log("walk: worst foot miss per leg", Object.entries(worstMiss).map(([l, d]) => `${l} ${d.toFixed(3)}`).join(", "),
        `| worst sink below ground ${worstSink.toFixed(3)}`);
    return animation;
}

const BODY_PARTS = new Set(["thorax", "head", "petiole", "gaster"]);
function lowestBodyPoint(pose) {
    updateTransforms(root, pose);
    let lowest = Infinity;
    drawHierarchy(root, m4.identity(), (shape, world, node) => {
        if (!BODY_PARTS.has(node.name)) return;
        const p = shape.mesh.positions;
        for (let i = 0; i < p.length; i += 3) {
            lowest = Math.min(lowest, m4.transformPoint(world, [p[i], p[i + 1], p[i + 2]])[1]);
        }
    });
    return lowest;
}

function makeLookingAround() {
    const animation = createAnimation("looking-around");
    animation.length = 180;
    animation.interpolation = "ease";
    const LEG_TRACKS = TRACKS.filter((track) => track.startsWith("Leg"));
    const standing = footPositions(createDefaultPose());
    let lowest = Infinity, worstMiss = 0;

    const bodyKeys = [
        [0, {}],
        [25, { "global.yaw": 8, "global.roll": -3, "gaster.yaw": -6 }],
        [75, { "global.pitch": 7, "global.y": -0.15, "gaster.pitch": 8 }],
        [105, { "global.yaw": -8, "global.roll": 3, "gaster.yaw": 6 }],
        [140, { "global.pitch": -6, "global.y": 0.15, "gaster.pitch": -6 }],
        [165, {}],
    ];
    for (const [frame, values] of bodyKeys) {
        const pose = { ...createDefaultPose(), ...values };
        for (const leg of LEGS) solveLeg(pose, leg, standing[leg]);
        keyTracks(animation, ["Body", "Abdomen", ...LEG_TRACKS], frame, pose);

        const feet = footPositions(pose);
        for (const leg of LEGS) worstMiss = Math.max(worstMiss, Math.hypot(...m4.subtract(feet[leg], standing[leg])));
        lowest = Math.min(lowest, lowestBodyPoint(pose));
    }

    const headKeys = [
        [0, {}],
        [25, { "head.yaw": 32, "head.pitch": -5 }],
        [50, { "head.yaw": 28, "head.pitch": 8 }],
        [75, { "head.pitch": 28 }],
        [105, { "head.yaw": -32 }],
        [128, { "head.yaw": -26, "head.pitch": -10 }],
        [150, { "head.pitch": -22 }],
        [170, {}],
    ];
    for (const [frame, values] of headKeys) {
        keyTracks(animation, ["Head"], frame, { ...createDefaultPose(), ...values });
    }

    for (let frame = 0; frame < animation.length; frame += 12) {
        const t = (2 * Math.PI * frame) / animation.length;
        const sniffing = frame >= 60 && frame <= 96;
        keyTracks(animation, ["Antennae & mandibles"], frame, {
            ...createDefaultPose(),
            "scapeL.yaw": 12 + 18 * Math.sin(3 * t),
            "scapeR.yaw": 12 - 18 * Math.sin(3 * t),
            "scapeL.pitch": sniffing ? -25 : 15 + 12 * Math.sin(4 * t),
            "scapeR.pitch": sniffing ? -25 : 15 + 12 * Math.cos(4 * t),
            "funiculusL.bend": 15 * Math.sin(6 * t),
            "funiculusR.bend": 15 * Math.cos(6 * t),
            "mandibleL.open": sniffing ? 20 : 0,
            "mandibleR.open": sniffing ? 20 : 0,
        });
    }

    console.log(`looking-around: planted feet miss ${worstMiss.toFixed(2)}, lowest body point y = ${lowest.toFixed(2)} (must be > 0)`);
    return animation;
}

save("walk", makeWalk());
save("looking-around", makeLookingAround());
