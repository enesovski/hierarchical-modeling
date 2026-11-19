// Unit primitives centred at the origin, each 1 unit across, so a part's
// size is simply the scale applied to it:
//   box:      1 x 1 x 1 cube
//   sphere:   diameter 1
//   cylinder: diameter 1, height 1 along the Y axis
// Each returns { positions, normals, uvs, indices } with smooth normals and UVs,
// ready for lighting and texturing.

export function createBox() {
    const positions = [], normals = [], uvs = [], indices = [];
    // For every face: outward normal n, and in-face axes u, v with u x v = n
    // so the triangles are counter-clockwise when seen from outside.
    const faces = [
        { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
        { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
        { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
        { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
        { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
        { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    ];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

    for (const { n, u, v } of faces) {
        const base = positions.length / 3;
        for (const [cu, cv] of corners) {
            for (let i = 0; i < 3; i++) {
                positions.push(0.5 * (n[i] + cu * u[i] + cv * v[i]));
                normals.push(n[i]);
            }
            uvs.push((cu + 1) / 2, (cv + 1) / 2);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return { positions, normals, uvs, indices };
}

export function createSphere(latitudeBands = 24, longitudeBands = 32) {
    const positions = [], normals = [], uvs = [], indices = [];

    for (let lat = 0; lat <= latitudeBands; lat++) {
        const theta = (lat / latitudeBands) * Math.PI; // 0 at +Y pole, PI at -Y pole
        const sinT = Math.sin(theta), cosT = Math.cos(theta);
        for (let lon = 0; lon <= longitudeBands; lon++) {
            const phi = (lon / longitudeBands) * 2 * Math.PI;
            const nx = sinT * Math.sin(phi);
            const ny = cosT;
            const nz = sinT * Math.cos(phi);
            normals.push(nx, ny, nz);
            positions.push(0.5 * nx, 0.5 * ny, 0.5 * nz);
            uvs.push(lon / longitudeBands, 1 - lat / latitudeBands);
        }
    }

    const row = longitudeBands + 1;
    for (let lat = 0; lat < latitudeBands; lat++) {
        for (let lon = 0; lon < longitudeBands; lon++) {
            const a = lat * row + lon; // upper-left of the quad
            const b = a + row;         // lower-left
            indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    return { positions, normals, uvs, indices };
}

export function createCylinder(segments = 24) {
    const positions = [], normals = [], uvs = [], indices = [];

    // Side wall: two rings (bottom and top) with radial normals.
    for (let i = 0; i <= segments; i++) {
        const phi = (i / segments) * 2 * Math.PI;
        const x = Math.sin(phi), z = Math.cos(phi);
        for (const y of [-0.5, 0.5]) {
            positions.push(0.5 * x, y, 0.5 * z);
            normals.push(x, 0, z);
            uvs.push(i / segments, y + 0.5);
        }
    }
    for (let i = 0; i < segments; i++) {
        const a = i * 2; // bottom of this column; a + 1 is its top
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }

    // Caps: a centre vertex plus their own ring so the normals stay flat (+Y / -Y).
    for (const y of [-0.5, 0.5]) {
        const ny = Math.sign(y);
        const center = positions.length / 3;
        positions.push(0, y, 0);
        normals.push(0, ny, 0);
        uvs.push(0.5, 0.5);
        for (let i = 0; i <= segments; i++) {
            const phi = (i / segments) * 2 * Math.PI;
            const x = Math.sin(phi), z = Math.cos(phi);
            positions.push(0.5 * x, y, 0.5 * z);
            normals.push(0, ny, 0);
            uvs.push(0.5 + 0.5 * x, 0.5 + 0.5 * z);
        }
        for (let i = 0; i < segments; i++) {
            const a = center + 1 + i;
            if (ny > 0) indices.push(center, a, a + 1);
            else indices.push(center, a + 1, a);
        }
    }
    return { positions, normals, uvs, indices };
}
