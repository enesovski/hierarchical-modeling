// WebGL2 helpers: shader compilation and mesh upload.

// Fixed attribute locations, matched by layout(location = N) in the vertex shader.
export const ATTRIB = { position: 0, normal: 1, texCoord: 2 };

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compile error:\n${log}`);
    }
    return shader;
}

export function createProgram(gl, vertexSource, fragmentSource) {
    const program = gl.createProgram();
    gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`Program link error:\n${gl.getProgramInfoLog(program)}`);
    }
    return program;
}

function uploadAttribute(gl, location, data, size) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
}

// Uploads a mesh { positions, normals, uvs, indices } (flat number arrays) into a VAO.
// Primitives and (later) OBJ files both produce this format.
export function createMesh(gl, { positions, normals, uvs, indices }) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    uploadAttribute(gl, ATTRIB.position, positions, 3);
    uploadAttribute(gl, ATTRIB.normal, normals, 3);
    uploadAttribute(gl, ATTRIB.texCoord, uvs, 2);

    // 16-bit indices are enough for primitives; large OBJ meshes need 32-bit.
    const vertexCount = positions.length / 3;
    const use32 = vertexCount > 65535;
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(
        gl.ELEMENT_ARRAY_BUFFER,
        use32 ? new Uint32Array(indices) : new Uint16Array(indices),
        gl.STATIC_DRAW
    );

    gl.bindVertexArray(null);
    return {
        vao,
        indexCount: indices.length,
        indexType: use32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
}

export function drawMesh(gl, mesh) {
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, mesh.indexType, 0);
}
