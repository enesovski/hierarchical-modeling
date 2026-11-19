// Keyframe animation of the pose object, with one track per body part.
//
// An animation is { name, fps, length, loop, interpolation, tracks }:
//   length  number of frames (the timeline runs 0..length)
//   tracks  { [track]: [{ frame, values }] }, sorted by frame
// A track is one DOF group from src/insect.js ("Head", "Leg L1", ...), i.e. a
// row on the timeline; `values` is a snapshot { "node.dof": degrees } of that
// group's DOFs. Each track is interpolated between its own keyframes and
// written into the shared `pose`; tracks without keyframes leave the pose alone.

import { DOFS } from "./insect.js";

export const FPS = 30;
export const TRACKS = [...new Set(DOFS.map((dof) => dof.group))];
const DOFS_OF_TRACK = new Map(TRACKS.map((track) => [track, DOFS.filter((dof) => dof.group === track)]));

export const INTERPOLATIONS = {
    linear: "Linear",
    ease: "Ease in/out",
    smooth: "Smooth (Catmull-Rom)",
};

const FILE_VERSION = 2;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const round2 = (v) => Math.round(v * 100) / 100;
const mod = (a, n) => ((a % n) + n) % n;

// The track that holds a scene-graph node's DOFs (the root holds "Body").
export function trackOfNode(node) {
    return DOFS.find((dof) => dof.key === node?.dofs[0])?.group ?? null;
}

export function createAnimation(name = "untitled") {
    return { name, fps: FPS, length: 120, loop: true, interpolation: "smooth", tracks: {} };
}

export const keysOf = (animation, track) => animation.tracks[track] ?? [];

// Stores the current pose of one track at `frame`; a key already there is replaced.
export function setKey(animation, track, frame, pose) {
    const values = {};
    for (const { key } of DOFS_OF_TRACK.get(track)) values[key] = round2(pose[key]);

    const keys = (animation.tracks[track] ??= []);
    const existing = keys.find((k) => k.frame === frame);
    if (existing) {
        existing.values = values;
        return existing;
    }
    const added = { frame, values };
    keys.push(added);
    keys.sort((a, b) => a.frame - b.frame);
    return added;
}

export function removeKey(animation, track, key) {
    const keys = keysOf(animation, track);
    keys.splice(keys.indexOf(key), 1);
    if (keys.length === 0) delete animation.tracks[track];
}

// Moves a key to another frame; a different key already there is dropped.
export function moveKey(animation, track, key, frame) {
    const keys = keysOf(animation, track);
    const other = keys.find((k) => k !== key && k.frame === frame);
    if (other) keys.splice(keys.indexOf(other), 1);
    key.frame = frame;
    keys.sort((a, b) => a.frame - b.frame);
}

// Catmull-Rom spline through p1 (u = 0) and p2 (u = 1); p0 and p3 set the
// tangents, so the motion flows through keyframes instead of stopping at them.
function catmullRom(p0, p1, p2, p3, u) {
    const u2 = u * u, u3 = u2 * u;
    return 0.5 * (
        2 * p1 +
        (p2 - p0) * u +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
        (3 * p1 - p0 - 3 * p2 + p3) * u3
    );
}

// Finds the segment around `frame`: keys a -> b, their neighbours, and u in [0, 1].
// A looping track is periodic: after its last key it blends back into its first.
function findSegment(keys, frame, loop, length) {
    const n = keys.length;
    if (loop) {
        const first = keys[0].frame;
        const t = first + mod(frame - first, length);   // fold into one period
        let i = n - 1;
        while (keys[i].frame > t) i--;
        const next = (i + 1) % n;
        const start = keys[i].frame;
        const end = next === 0 ? first + length : keys[next].frame;
        return {
            before: keys[(i - 1 + n) % n], a: keys[i], b: keys[next], after: keys[(i + 2) % n],
            u: end > start ? (t - start) / (end - start) : 0,
        };
    }
    // Before the first / after the last key: hold it (all four points equal).
    const hold = frame <= keys[0].frame ? keys[0] : frame >= keys[n - 1].frame ? keys[n - 1] : null;
    if (hold) return { before: hold, a: hold, b: hold, after: hold, u: 0 };
    let i = 0;
    while (frame >= keys[i + 1].frame) i++;
    return {
        before: keys[Math.max(i - 1, 0)], a: keys[i], b: keys[i + 1], after: keys[Math.min(i + 2, n - 1)],
        u: (frame - keys[i].frame) / (keys[i + 1].frame - keys[i].frame),
    };
}

// Writes the animation's pose at `frame` (may be fractional) into `pose`.
export function samplePose(animation, frame, pose) {
    for (const [track, keys] of Object.entries(animation.tracks)) {
        if (keys.length === 0) continue;
        const { before, a, b, after, u } = findSegment(keys, frame, animation.loop, animation.length);
        const eased = animation.interpolation === "ease" ? u * u * (3 - 2 * u) : u;   // smoothstep

        for (const { key, min, max } of DOFS_OF_TRACK.get(track)) {
            const p1 = a.values[key] ?? 0, p2 = b.values[key] ?? 0;
            const value = animation.interpolation === "smooth"
                ? catmullRom(before.values[key] ?? 0, p1, p2, after.values[key] ?? 0, u)
                : p1 + (p2 - p1) * eased;
            pose[key] = clamp(value, min, max);   // the spline may overshoot a limit
        }
    }
}

// Plays an animation into `pose`. `frame` is fractional while playing.
export class AnimationPlayer {
    constructor(pose) {
        this.pose = pose;
        this.animation = createAnimation();
        this.frame = 0;
        this.playing = false;
    }

    load(animation) {
        this.animation = animation;
        this.playing = false;
        this.seek(0);
    }

    play() {
        if (this.frame >= this.animation.length) this.frame = 0;   // replay a finished animation
        this.playing = true;
    }

    pause() {
        this.playing = false;
    }

    stop() {
        this.playing = false;
        this.seek(0);
    }

    // Jumps to `frame` and shows that pose (timeline scrubbing, clicking a key).
    seek(frame) {
        this.frame = clamp(frame, 0, this.animation.length);
        samplePose(this.animation, this.frame, this.pose);
    }

    update(dt) {
        if (!this.playing) return;
        const { length, fps, loop } = this.animation;
        let frame = this.frame + dt * fps;
        if (frame >= length) {
            if (loop) {
                frame %= length;
            } else {
                frame = length;
                this.playing = false;
            }
        }
        this.seek(frame);
    }
}

// ---------------------------------------------------------------------------
// Save / load as JSON
// ---------------------------------------------------------------------------

export function animationToJson(animation) {
    return JSON.stringify({ version: FILE_VERSION, ...animation }, null, 1);
}

// Parses and validates a saved animation. Unknown tracks and pose keys are
// dropped and values are clamped, so a hand-edited file cannot break the model.
export function parseAnimation(text) {
    const data = JSON.parse(text);
    if (!data || typeof data.tracks !== "object") {
        throw new Error("Not an animation file (no tracks).");
    }

    const animation = createAnimation(typeof data.name === "string" ? data.name : "untitled");
    animation.loop = data.loop !== false;
    if (data.interpolation in INTERPOLATIONS) animation.interpolation = data.interpolation;
    if (Number.isFinite(data.fps) && data.fps > 0) animation.fps = data.fps;
    if (Number.isInteger(data.length) && data.length > 0) animation.length = data.length;

    for (const [track, keys] of Object.entries(data.tracks)) {
        if (!DOFS_OF_TRACK.has(track) || !Array.isArray(keys)) continue;
        for (const key of keys) {
            const frame = Number(key?.frame);
            if (!Number.isFinite(frame) || typeof key.values !== "object") {
                throw new Error(`Track "${track}": each key needs a frame and values.`);
            }
            const values = {};
            for (const { key: dofKey, min, max } of DOFS_OF_TRACK.get(track)) {
                const value = Number(key.values[dofKey]);
                values[dofKey] = Number.isFinite(value) ? clamp(value, min, max) : 0;
            }
            (animation.tracks[track] ??= []).push({ frame: clamp(Math.round(frame), 0, animation.length), values });
        }
        animation.tracks[track]?.sort((a, b) => a.frame - b.frame);
    }
    return animation;
}
