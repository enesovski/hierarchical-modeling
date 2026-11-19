// The insect: an ant built from primitives as a scene-graph hierarchy.
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
// The pose is a flat object { "node.dof": degrees } (see DOFS). Angles are
// offsets from the rest pose, so all zeros = standing ant.
// Axes: +Z forward, +Y up, +X to the ant's left.

import * as m4 from "./math.js";
import { createNode, addChild, forEachNode } from "./scene-graph.js";

const { translation: T, rotationX: Rx, rotationY: Ry, rotationZ: Rz, scaling: S, multiplyAll: mul } = m4;
const rad = m4.degToRad;

// ---------------------------------------------------------------------------
// Degrees of freedom
// ---------------------------------------------------------------------------

// { key, group, node, name, min, max, step }; group is the UI section.
export const DOFS = [];

function addDof(group, node, name, min, max, step = 1) {
    DOFS.push({ key: `${node}.${name}`, group, node, name, min, max, step });
}

const SIDES = [
    { id: "L", sign: 1 },
    { id: "R", sign: -1 },
];

// Leg pairs from front (1) to back (3). splay: rest angle, positive = forward.
const LEG_PAIRS = [
    { id: 1, z: 0.5, splay: 35 },
    { id: 2, z: 0.0, splay: 0 },
    { id: 3, z: -0.45, splay: -35 },
];

addDof("Body", "global", "x", -10, 10, 0.1);
addDof("Body", "global", "y", -1, 4, 0.1);
addDof("Body", "global", "z", -10, 10, 0.1);
addDof("Body", "global", "yaw", -180, 180);
addDof("Body", "global", "pitch", -90, 90);
addDof("Body", "global", "roll", -180, 180);

addDof("Head", "head", "pitch", -30, 40);     // + nods down
addDof("Head", "head", "yaw", -40, 40);       // + turns left
for (const { id } of SIDES) {
    addDof("Antennae & mandibles", `scape${id}`, "yaw", -30, 40);       // + outward
    addDof("Antennae & mandibles", `scape${id}`, "pitch", -40, 50);     // + raises
    addDof("Antennae & mandibles", `funiculus${id}`, "bend", -50, 50);  // + bends down
    addDof("Antennae & mandibles", `mandible${id}`, "open", -15, 35);   // + opens
}
addDof("Abdomen", "petiole", "pitch", -30, 30);  // + raises
addDof("Abdomen", "petiole", "yaw", -30, 30);
addDof("Abdomen", "gaster", "pitch", -40, 40);   // + raises
addDof("Abdomen", "gaster", "yaw", -30, 30);
for (const { id: side } of SIDES) {
    for (const { id: pair } of LEG_PAIRS) {
        const group = `Leg ${side}${pair}`;
        addDof(group, `femur${side}${pair}`, "swing", -45, 45);  // + forward
        addDof(group, `femur${side}${pair}`, "lift", -40, 50);   // + raises the leg
        addDof(group, `tibia${side}${pair}`, "bend", -40, 40);   // + bends the knee down
        addDof(group, `tarsus${side}${pair}`, "bend", -40, 40);  // + bends the foot down
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
// Dimensions (world units)
// ---------------------------------------------------------------------------

const FEMUR = { length: 1.1, thickness: 0.14, restLift: 35 };
const TIBIA = { length: 1.3, thickness: 0.1, restBend: 110 };
const TARSUS = { length: 0.6, thickness: 0.06, restBend: -45 };
const HIP_Y = -0.2;

// Height of the thorax above the ground so the rest-pose feet touch y = 0.
const BODY_HEIGHT = (() => {
    const femurAngle = FEMUR.restLift;
    const tibiaAngle = femurAngle - TIBIA.restBend;
    const tarsusAngle = tibiaAngle - TARSUS.restBend;
    const tipY =
        HIP_Y +
        FEMUR.length * Math.sin(rad(femurAngle)) +
        TIBIA.length * Math.sin(rad(tibiaAngle)) +
        TARSUS.length * Math.sin(rad(tarsusAngle));
    return -tipY + TARSUS.thickness / 2;
})();

// Per-part material: colour (Color/Shading modes), texture name (Texture
// modes, see textures.js) and Blinn-Phong specular settings. Ant cuticle is
// glossy; the compound eyes are the shiniest part.
const MATERIALS = {
    body: { color: [0.42, 0.16, 0.08], texture: "chitin", specular: 0.45, shininess: 40 },
    leg: { color: [0.33, 0.12, 0.06], texture: "leg", specular: 0.35, shininess: 30 },
    joint: { color: [0.22, 0.08, 0.04], texture: "leg", specular: 0.3, shininess: 30 },
    mandible: { color: [0.2, 0.07, 0.03], texture: "leg", specular: 0.5, shininess: 50 },
    eye: { color: [0.05, 0.05, 0.06], texture: "eye", specular: 0.9, shininess: 90 },
};

// ---------------------------------------------------------------------------
// Shape helpers: place a unit primitive inside a node's local frame
// ---------------------------------------------------------------------------

function ellipsoid(mesh, [cx, cy, cz], [sx, sy, sz], material) {
    return { mesh, matrix: mul(T(cx, cy, cz), S(sx, sy, sz)), ...material };
}

// A rod from the joint (origin) along local +X. The unit cylinder runs along Y,
// so it is rotated -90 deg about Z to lie along +X.
function rodX(mesh, length, thickness, material) {
    return {
        mesh,
        matrix: mul(T(length / 2, 0, 0), Rz(-Math.PI / 2), S(thickness, length, thickness)),
        ...material,
    };
}

// A rod from the joint along local +Z (rotate Y onto +Z).
function rodZ(mesh, length, thickness, material) {
    return {
        mesh,
        matrix: mul(T(0, 0, length / 2), Rx(Math.PI / 2), S(thickness, length, thickness)),
        ...material,
    };
}

function ball(mesh, diameter, material) {
    return ellipsoid(mesh, [0, 0, 0], [diameter, diameter, diameter], material);
}

// ---------------------------------------------------------------------------
// Hierarchy
// ---------------------------------------------------------------------------

// meshes: { box, sphere, cylinder } uploaded with createMesh
export function buildInsect(meshes) {
    const { sphere, cylinder } = meshes;

    const thorax = createNode(
        "thorax",
        (p) => mul(
            T(p["global.x"], BODY_HEIGHT + p["global.y"], p["global.z"]),
            Ry(rad(p["global.yaw"])),
            Rx(rad(p["global.pitch"])),
            Rz(rad(p["global.roll"]))
        ),
        [
            ellipsoid(sphere, [0, 0, -0.1], [0.7, 0.55, 1.4], MATERIALS.body),
            ellipsoid(sphere, [0, 0.08, 0.45], [0.65, 0.6, 0.75], MATERIALS.body),
        ]
    );

    // ---- Head with antennae and mandibles ----
    const head = addChild(thorax, createNode(
        "head",
        (p) => mul(T(0, 0.15, 0.8), Ry(rad(p["head.yaw"])), Rx(rad(10 + p["head.pitch"]))),
        [
            ball(sphere, 0.3, MATERIALS.joint), // neck
            ellipsoid(sphere, [0, 0.05, 0.45], [0.9, 0.8, 0.95], MATERIALS.body),
        ]
    ));

    for (const { id, sign } of SIDES) {
        // Eyes are rigidly attached to the head: extra shapes, no joint.
        head.shapes.push(ellipsoid(sphere, [sign * 0.4, 0.15, 0.55], [0.2, 0.25, 0.25], MATERIALS.eye));

        const scape = addChild(head, createNode(
            `scape${id}`,
            (p) => mul(
                T(sign * 0.2, 0.3, 0.75),
                Ry(rad(sign * (25 + p[`scape${id}.yaw`]))),
                Rx(rad(-(45 + p[`scape${id}.pitch`])))
            ),
            [ball(sphere, 0.13, MATERIALS.joint), rodZ(cylinder, 0.8, 0.08, MATERIALS.leg)]
        ));
        addChild(scape, createNode(
            `funiculus${id}`,
            (p) => mul(T(0, 0, 0.8), Rx(rad(85 + p[`funiculus${id}.bend`]))),
            [
                ball(sphere, 0.11, MATERIALS.joint),
                rodZ(cylinder, 1.0, 0.07, MATERIALS.leg),
                ellipsoid(sphere, [0, 0, 1.0], [0.12, 0.12, 0.28], MATERIALS.leg), // club tip
            ]
        ));

        addChild(head, createNode(
            `mandible${id}`,
            (p) => mul(T(sign * 0.2, -0.15, 0.8), Ry(rad(sign * (-15 + p[`mandible${id}.open`])))),
            [rodZ(cylinder, 0.45, 0.1, MATERIALS.mandible)]
        ));
    }

    // ---- Waist and abdomen ----
    const petiole = addChild(thorax, createNode(
        "petiole",
        (p) => mul(T(0, 0.05, -0.8), Ry(rad(p["petiole.yaw"])), Rx(rad(p["petiole.pitch"]))),
        [ellipsoid(sphere, [0, 0.05, -0.2], [0.3, 0.35, 0.4], MATERIALS.body)]
    ));
    addChild(petiole, createNode(
        "gaster",
        (p) => mul(T(0, 0.05, -0.38), Ry(rad(p["gaster.yaw"])), Rx(rad(-15 + p["gaster.pitch"]))),
        [ellipsoid(sphere, [0, 0, -0.85], [1.1, 1.0, 1.7], MATERIALS.body)]
    ));

    // ---- Legs ----
    // Each leg segment is a rod along its local +X. Right legs are turned 180 deg
    // about Y so +X points outward on both sides; after that turn the swing angle
    // needs the opposite sign to move the leg forward, hence -sign * swing.
    for (const { id: side, sign } of SIDES) {
        for (const pair of LEG_PAIRS) {
            const name = `${side}${pair.id}`;
            const femur = addChild(thorax, createNode(
                `femur${name}`,
                (p) => mul(
                    T(sign * 0.3, HIP_Y, pair.z),
                    Ry(sign === 1 ? 0 : Math.PI),
                    Ry(rad(-sign * (pair.splay + p[`femur${name}.swing`]))),
                    Rz(rad(FEMUR.restLift + p[`femur${name}.lift`]))
                ),
                [ball(sphere, 0.22, MATERIALS.joint), rodX(cylinder, FEMUR.length, FEMUR.thickness, MATERIALS.leg)]
            ));
            const tibia = addChild(femur, createNode(
                `tibia${name}`,
                (p) => mul(T(FEMUR.length, 0, 0), Rz(rad(-(TIBIA.restBend + p[`tibia${name}.bend`])))),
                [ball(sphere, 0.17, MATERIALS.joint), rodX(cylinder, TIBIA.length, TIBIA.thickness, MATERIALS.leg)]
            ));
            addChild(tibia, createNode(
                `tarsus${name}`,
                (p) => mul(T(TIBIA.length, 0, 0), Rz(rad(-(TARSUS.restBend + p[`tarsus${name}.bend`])))),
                [ball(sphere, 0.12, MATERIALS.joint), rodX(cylinder, TARSUS.length, TARSUS.thickness, MATERIALS.leg)]
            ));
        }
    }

    // Tell each node which pose keys drive its joint (used by picking later).
    // The root also owns the global position/orientation.
    forEachNode(thorax, (node) => {
        const owner = node === thorax ? "global" : node.name;
        node.dofs = DOFS.filter((d) => d.node === owner).map((d) => d.key);
    });

    return thorax;
}
