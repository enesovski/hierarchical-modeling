export function createBox() {
    const positions = [], normals = [], uvs = [], indices = [];
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
