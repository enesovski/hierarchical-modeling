// Generates the two preset animations in assets/animations/ (walk, looking-around).
//
// Usage: node tools/make_animations.mjs
//
// The output is the same file the timeline saves and loads (one track of
// keyframes per body part, built with setKey from src/animation.js). The app
// only plays these keyframes; this script is how they were authored.
//
// walk.json uses inverse kinematics so the feet stay planted: the body follows
// a path, every foot has a target on the ground (fixed while the foot is down,
// an arc while it steps), and each leg's 4 angles are solved to reach it. It
// loads the real model and hierarchy (src/insect.js), so the angles fit the ant.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as m4 from "../src/math.js";
import { DOFS, buildInsect, createDefaultPose } from "../src/insect.js";
import { drawHierarchy, updateTransforms } from "../src/scene-graph.js";
import { parseObj } from "../src/obj-loader.js";
import { FPS, TRACKS, createAnimation, setKey, animationToJson } from "../src/animation.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = `${ROOT}assets/animations/`;
const DOF_BY_KEY = new Map(DOFS.map((dof) => [dof.key, dof]));
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const lerp = (a, b, u) => a.map((value, i) => value + (b[i] - value) * u);

function save(file, animation) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(`${OUT_DIR}${file}.json`, animationToJson(animation) + "\n");
    const keys = Object.values(animation.tracks).reduce((sum, keys) => sum + keys.length, 0);
    console.log(`wrote assets/animations/${file}.json (${animation.length} frames, ${keys} keys)`);
}

// Keys every track in `tracks` at `frame` from `pose`.
function keyTracks(animation, tracks, frame, pose) {
    for (const track of tracks) setKey(animation, track, frame, pose);
}

// ---------------------------------------------------------------------------
// The model, loaded the same way as in the browser (meshes stay on the CPU)
// ---------------------------------------------------------------------------

const { parts } = parseObj(readFileSync(`${ROOT}assets/models/ant.obj`, "utf8"));
const rig = JSON.parse(readFileSync(`${ROOT}assets/models/ant.rig.json`, "utf8"));
const root = buildInsect(rig, parts, (data) => data);

const LEGS = ["L1", "L2", "L3", "R1", "R2", "R3"];
const legKeys = (leg) => [`femur${leg}.swing`, `femur${leg}.lift`, `tibia${leg}.bend`, `tarsus${leg}.bend`];

// The foot is the lowest vertex of each tarsus mesh (in the tarsus' own frame).
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

// ---------------------------------------------------------------------------
// Leg IK: damped least squares with a weak pull towards the rest angles, so
// the 4 angles (3 needed for a 3D target) are chosen consistently every frame.
// ---------------------------------------------------------------------------

const RAD = Math.PI / 180;

// Solves A x = b (small dense system) by Gaussian elimination with pivoting.
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

const DAMPING = 0.01;   // keeps steps finite near singular poses
const REST_PULL = 0.002; // prefers solutions close to the modelled pose

function solveLeg(pose, leg, target) {
    const keys = legKeys(leg);
    for (let iteration = 0; iteration < 30; iteration++) {
        const foot = footPositions(pose)[leg];
        const error = target.map((t, i) => t - foot[i]);
        if (Math.hypot(...error) < 1e-4) return;

        // J: 3 x 4, foot motion per radian of each angle (finite differences).
        const J = keys.map((key) => {
            const saved = pose[key];
            pose[key] = saved + 0.5;
            const moved = footPositions(pose)[leg];
            pose[key] = saved;
            return moved.map((m, i) => (m - foot[i]) / (0.5 * RAD));
        });
        // (J^T J + (damping + pull) I) step = J^T error - pull * angles
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

// ---------------------------------------------------------------------------
// Walk: tripod gait along a closed path (walk, turn, walk back, turn back)
// ---------------------------------------------------------------------------

const CYCLE = 1.0;          // seconds per gait cycle; each leg is down for half of it
const STEP_HEIGHT = 0.45;   // how high a foot lifts while stepping
const FRAMES_PER_KEY = 3;   // 10 keys per 1 s gait cycle at 30 fps
const TRIPOD_OFFSET = { L1: 0, R2: 0, L3: 0, R1: 0.5, L2: 0.5, R3: 0.5 };

// Path segments: [seconds, start { z, yaw }, end { z, yaw }]. Walking at yaw 180
// moves towards -z; the path ends where it started, so the animation loops.
const PATH = [
    [4, { z: -3, yaw: 0 }, { z: 3, yaw: 0 }],
    [3, { z: 3, yaw: 0 }, { z: 3, yaw: 180 }],     // turn left on the spot
    [4, { z: 3, yaw: 180 }, { z: -3, yaw: 180 }],
    [3, { z: -3, yaw: 180 }, { z: -3, yaw: 0 }],   // turn back on the spot
];
const WALK_DURATION = PATH.reduce((sum, [seconds]) => sum + seconds, 0);

function bodyAt(time) {
    let t = ((time % WALK_DURATION) + WALK_DURATION) % WALK_DURATION;
    for (const [seconds, a, b] of PATH) {
        if (t <= seconds) {
            const u = t / seconds;
            return { "global.z": a.z + (b.z - a.z) * u, "global.yaw": a.yaw + (b.yaw - a.yaw) * u };
        }
        t -= seconds;
    }
}

// Where a foot rests (all leg angles 0) when the body is where it is at `time`.
function homeAt(time, leg) {
    return footPositions({ ...createDefaultPose(), ...bodyAt(time) })[leg];
}

// Foot target: planted while down (at the home position of mid-stance, so the
// leg sweeps evenly back and forth), an arc from one plant to the next while up.
function footTarget(time, leg) {
    const phase = (((time / CYCLE + TRIPOD_OFFSET[leg]) % 1) + 1) % 1;
    if (phase < 0.5) {
        const touchdown = time - phase * CYCLE;
        return homeAt(touchdown + CYCLE / 4, leg);
    }
    const liftoff = time - (phase - 0.5) * CYCLE;
    const from = homeAt(liftoff - CYCLE / 4, leg);
    const to = homeAt(liftoff + CYCLE / 2 + CYCLE / 4, leg);
    const s = (phase - 0.5) / 0.5;
    const p = lerp(from, to, s * s * (3 - 2 * s));
    p[1] += STEP_HEIGHT * Math.sin(Math.PI * s);
    return p;
}

function makeWalk() {
    const animation = createAnimation("walk");
    animation.length = WALK_DURATION * FPS;   // loops: the last key blends back into frame 0
    const tracks = TRACKS.filter((track) => track !== "Head");   // the head is left free
    const pose = createDefaultPose();
    const worstMiss = Object.fromEntries(LEGS.map((leg) => [leg, 0]));

    // Two passes: the first only warms up the IK so the recorded loop starts
    // from the same leg angles it ends with.
    for (const record of [false, true]) {
        for (let frame = 0; frame < animation.length; frame += FRAMES_PER_KEY) {
            const time = frame / FPS;
            Object.assign(pose, bodyAt(time));
            for (const leg of LEGS) solveLeg(pose, leg, footTarget(time, leg));

            // Small secondary motion so the body does not look stiff.
            const wave = Math.sin((2 * Math.PI * time) / CYCLE);
            pose["gaster.yaw"] = 4 * wave;
            pose["scapeL.pitch"] = 8 + 6 * wave;
            pose["scapeR.pitch"] = 8 - 6 * wave;

            if (!record) continue;
            keyTracks(animation, tracks, frame, pose);
            const feet = footPositions(pose);
            for (const leg of LEGS) {
                const miss = Math.hypot(...m4.subtract(feet[leg], footTarget(time, leg)));
                worstMiss[leg] = Math.max(worstMiss[leg], miss);
            }
        }
    }
    // How far each foot ends up from its target (0 = perfectly planted).
    console.log("walk: worst foot miss per leg", Object.entries(worstMiss).map(([l, d]) => `${l} ${d.toFixed(2)}`).join(", "));
    return animation;
}

// ---------------------------------------------------------------------------
// Looking around: the head scans left, down (sniffing), right and up while the
// antennae keep twitching; the body leans along and all six feet stay planted.
// ---------------------------------------------------------------------------

// Lowest point of the body parts (not legs or antennae), to keep them above the ground.
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
    animation.length = 180;              // 6 s
    animation.interpolation = "ease";    // glances settle at each key, like a real look
    const LEG_TRACKS = TRACKS.filter((track) => track.startsWith("Leg"));
    const standing = footPositions(createDefaultPose());
    let lowest = Infinity, worstMiss = 0;

    // Body lean with the look direction; the abdomen swings a little against it.
    // Legs are re-solved at every body key so the feet stay where they stand.
    const bodyKeys = [
        [0, {}],
        [25, { "global.yaw": 8, "global.roll": -3, "gaster.yaw": -6 }],
        [75, { "global.pitch": 7, "global.y": -0.15, "gaster.pitch": 8 }],    // lean in to sniff
        [105, { "global.yaw": -8, "global.roll": 3, "gaster.yaw": 6 }],
        [140, { "global.pitch": -6, "global.y": 0.15, "gaster.pitch": -6 }],  // rise to look up
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

    // Head: look left, then down at the ground, right, and up.
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

    // Antennae twitch more often than the head turns (a key every 12 frames);
    // the mandibles open while sniffing the ground.
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
