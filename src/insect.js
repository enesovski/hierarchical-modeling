// The insect: the ant from assets/models/ant.obj as a scene-graph hierarchy.
//
//   thorax (root, global position/orientation)
//   ├── head
//   │   ├── scapeL ── funiculusL        (antenna: base segment + elbow)
//   │   ├── scapeR ── funiculusR
//   │   ├── mandibleL
//   │   └── mandibleR
//   ├── petiole ── gaster               (waist + abdomen)
//   └── femur{L,R}{1,2,3} ── tibia ── tarsus   (6 legs, 3 segments each)
//
// Parts, parents and joint pivots come from ant.obj + ant.rig.json (exported
// from Ant.blend). The pose is a flat object { "node.dof": degrees } (see DOFS);
// angles are offsets from the modelled pose, so all zeros = the ant as modelled.
// Axes: +Z forward, +Y up, +X to the ant's left.

import * as m4 from "./math.js";
import { createNode, addChild, forEachNode } from "./scene-graph.js";

const { translation: T, rotationX: Rx, rotationY: Ry, rotationZ: Rz, rotationAxis, multiplyAll: mul } = m4;
const rad = m4.degToRad;
const UP = [0, 1, 0];

// ---------------------------------------------------------------------------
// Degrees of freedom
// ---------------------------------------------------------------------------

// { key, group, node, name, min, max, step, axis, sign }; group is the UI section.
//   axis "yaw":   turn about the vertical through the joint
//   axis "raise": turn about the horizontal axis across the segment; + lifts its tip
//   sign:         +1 / -1, so mirrored parts move the same way for the same angle
// A node's rotations are applied in the order its DOFs are declared.
export const DOFS = [];

function addDof(group, node, name, min, max, { axis = null, sign = 1, step = 1 } = {}) {
    DOFS.push({ key: `${node}.${name}`, group, node, name, min, max, step, axis, sign });
}

const SIDES = [
    { id: "L", sign: 1 },
    { id: "R", sign: -1 },
];

addDof("Body", "global", "x", -10, 10, { step: 0.1 });
addDof("Body", "global", "y", -1, 4, { step: 0.1 });
addDof("Body", "global", "z", -10, 10, { step: 0.1 });
addDof("Body", "global", "yaw", -180, 180);
addDof("Body", "global", "pitch", -90, 90);
addDof("Body", "global", "roll", -180, 180);

addDof("Head", "head", "yaw", -40, 40, { axis: "yaw" });                  // + turns left
addDof("Head", "head", "pitch", -30, 40, { axis: "raise", sign: -1 });    // + nods down
for (const { id, sign } of SIDES) {
    const group = "Antennae & mandibles";
    addDof(group, `scape${id}`, "yaw", -30, 40, { axis: "yaw", sign });               // + outward
    addDof(group, `scape${id}`, "pitch", -40, 50, { axis: "raise" });                 // + raises
    addDof(group, `funiculus${id}`, "bend", -50, 50, { axis: "raise", sign: -1 });    // + bends down
    addDof(group, `mandible${id}`, "open", -15, 35, { axis: "yaw", sign });           // + opens
}
addDof("Abdomen", "petiole", "yaw", -30, 30, { axis: "yaw" });
addDof("Abdomen", "petiole", "pitch", -30, 30, { axis: "raise" });  // + raises
addDof("Abdomen", "gaster", "yaw", -30, 30, { axis: "yaw" });
addDof("Abdomen", "gaster", "pitch", -40, 40, { axis: "raise" });   // + raises
for (const { id: side, sign } of SIDES) {
    for (const pair of [1, 2, 3]) {
        const group = `Leg ${side}${pair}`;
        addDof(group, `femur${side}${pair}`, "swing", -45, 45, { axis: "yaw", sign: -sign });  // + forward
        addDof(group, `femur${side}${pair}`, "lift", -40, 50, { axis: "raise" });              // + raises the leg
        addDof(group, `tibia${side}${pair}`, "bend", -40, 40, { axis: "raise", sign: -1 });    // + bends the knee down
        addDof(group, `tarsus${side}${pair}`, "bend", -40, 40, { axis: "raise", sign: -1 });   // + bends the foot down
    }
}

export function createDefaultPose() {
    const pose = {};
    resetPose(pose);
    return pose;
}

export function resetPose(pose) {
    for (const dof of DOFS) pose[dof.key] = 0;
}

// ---------------------------------------------------------------------------
// Materials: colour (Color/Shading modes), texture (Texture modes) and
// Blinn-Phong settings. All parts share the model's diffuse map ("ant").
// ---------------------------------------------------------------------------

const MATERIALS = {
    body: { color: [0.36, 0.17, 0.07], texture: "ant", specular: 0.45, shininess: 40 },
    limb: { color: [0.45, 0.25, 0.1], texture: "ant", specular: 0.35, shininess: 30 },
    mandible: { color: [0.22, 0.09, 0.04], texture: "ant", specular: 0.5, shininess: 50 },
};

function materialFor(name) {
    if (["thorax", "head", "petiole", "gaster"].includes(name)) return MATERIALS.body;
    return name.startsWith("mandible") ? MATERIALS.mandible : MATERIALS.limb;
}

// ---------------------------------------------------------------------------
// Hierarchy
// ---------------------------------------------------------------------------

// OBJ vertices are in model space; move them so the joint pivot is the origin.
// `centre` (bounding-box centre, pivot-relative) is the part's drag handle.
function createShape(name, data, pivot, uploadMesh) {
    const positions = data.positions.map((value, i) => value - pivot[i % 3]);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    positions.forEach((value, i) => {
        min[i % 3] = Math.min(min[i % 3], value);
        max[i % 3] = Math.max(max[i % 3], value);
    });
    return {
        mesh: uploadMesh({ ...data, positions }),
        matrix: m4.identity(),
        centre: min.map((value, i) => (value + max[i]) / 2),
        ...materialFor(name),
    };
}

// Horizontal axis across a segment pointing along `direction`. Rotating by a
// positive angle about it lifts the segment's tip: (d x up) x d points up.
function raiseAxis(direction) {
    return m4.normalize(m4.cross(direction, UP));
}

function rootTransform(pivot) {
    return (p) => mul(
        T(pivot[0] + p["global.x"], pivot[1] + p["global.y"], pivot[2] + p["global.z"]),
        Ry(rad(p["global.yaw"])),
        Rx(rad(p["global.pitch"])),
        Rz(rad(p["global.roll"]))
    );
}

// Translate from the parent's pivot to this joint, then apply the joint's DOFs.
// The axes are fixed in the rest pose; the parts are not pre-rotated.
function jointTransform(dofs, offset, direction) {
    const axes = dofs.map((dof) => (dof.axis === "yaw" ? UP : raiseAxis(direction)));
    return (p) => mul(
        T(...offset),
        ...dofs.map((dof, i) => rotationAxis(axes[i], rad(dof.sign * p[dof.key])))
    );
}

// rig: ant.rig.json ({ parts: [{ name, parent, pivot }] }, parents listed first)
// parts: OBJ mesh data by name (obj-loader.js); uploadMesh: data -> GPU mesh
export function buildInsect(rig, parts, uploadMesh) {
    const nodes = new Map();
    const pivotOf = new Map(rig.parts.map((part) => [part.name, part.pivot]));

    for (const { name, parent, pivot } of rig.parts) {
        if (!parts[name]) throw new Error(`ant.obj has no object "${name}"`);
        const shape = createShape(name, parts[name], pivot, uploadMesh);

        if (parent === null) {
            nodes.set(name, createNode(name, rootTransform(pivot), [shape]));
            continue;
        }

        // A segment points at its only child joint (leg, antenna, waist);
        // otherwise at its own centre (head, tips of chains).
        const children = rig.parts.filter((part) => part.parent === name);
        const direction = children.length === 1
            ? m4.subtract(children[0].pivot, pivot)
            : shape.centre;

        const dofs = DOFS.filter((dof) => dof.node === name);
        const offset = m4.subtract(pivot, pivotOf.get(parent));
        const node = createNode(name, jointTransform(dofs, offset, direction), [shape]);
        addChild(nodes.get(parent), node);
        nodes.set(name, node);
    }

    const root = nodes.get(rig.parts.find((part) => part.parent === null).name);

    // Pose keys each node owns (picking/dragging); the root owns the global ones.
    forEachNode(root, (node) => {
        const owner = node === root ? "global" : node.name;
        node.dofs = DOFS.filter((d) => d.node === owner).map((d) => d.key);
    });

    return root;
}
