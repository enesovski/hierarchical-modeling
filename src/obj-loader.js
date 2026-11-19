function createPart() {
    return { positions: [], normals: [], uvs: [], indices: [], lookup: new Map() };
}

function addCorner(part, corner, v, vt, vn) {
    let index = part.lookup.get(corner);
    if (index === undefined) {
        const [pi, ti, ni] = corner.split("/").map((s) => (s ? Number(s) - 1 : -1));
        index = part.positions.length / 3;
        part.positions.push(...v[pi]);
        part.uvs.push(...(ti >= 0 ? vt[ti] : [0, 0]));
        part.normals.push(...(ni >= 0 ? vn[ni] : [0, 1, 0]));
        part.lookup.set(corner, index);
    }
    part.indices.push(index);
}

export function parseObj(text) {
    const v = [], vt = [], vn = [];
    const parts = {};
    let part = null;
    let materialLibrary = null;

    for (const line of text.split("\n")) {
        const [keyword, ...args] = line.trim().split(/\s+/);
        if (keyword === "v") v.push(args.slice(0, 3).map(Number));
        else if (keyword === "vt") vt.push(args.slice(0, 2).map(Number));
        else if (keyword === "vn") vn.push(args.slice(0, 3).map(Number));
        else if (keyword === "o") part = parts[args[0]] = createPart();
        else if (keyword === "mtllib") materialLibrary = args.join(" ");
        else if (keyword === "f") {
            part ??= parts.default = createPart();
            for (let i = 1; i + 1 < args.length; i++) {
                addCorner(part, args[0], v, vt, vn);
                addCorner(part, args[i], v, vt, vn);
                addCorner(part, args[i + 1], v, vt, vn);
            }
        }
    }
    for (const p of Object.values(parts)) delete p.lookup;
    return { parts, materialLibrary };
}

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
    return response.text();
}

export async function loadObj(url) {
    const { parts, materialLibrary } = parseObj(await fetchText(url));

    let diffuseMap = null;
    if (materialLibrary) {
        const mtlUrl = new URL(materialLibrary, new URL(url, location.href));
        const match = (await fetchText(mtlUrl)).match(/^\s*map_Kd\s+(.+)$/m);
        if (match) diffuseMap = new URL(match[1].trim(), mtlUrl).href;
    }
    return { parts, diffuseMap };
}
