import * as m4 from "./math.js";
import { createProgram, drawMesh } from "./gl-utils.js";
import { drawHierarchy, forEachNode } from "./scene-graph.js";

const pickVertexSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uModelView;
uniform mat4 uProjection;
void main() {
    gl_Position = uProjection * uModelView * vec4(aPosition, 1.0);
}
`;

const pickFragmentSource = `#version 300 es
precision highp float;
uniform vec3 uIdColor;
out vec4 outColor;
void main() {
    outColor = vec4(uIdColor, 1.0);
}
`;

function idToColor(id) {
    return [(id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255];
}

function colorToId([r, g, b]) {
    return r | (g << 8) | (b << 16);
}

export function createPicker(gl, root, staticShapes) {
    const program = createProgram(gl, pickVertexSource, pickFragmentSource);
    const uniforms = {
        modelView: gl.getUniformLocation(program, "uModelView"),
        projection: gl.getUniformLocation(program, "uProjection"),
        idColor: gl.getUniformLocation(program, "uIdColor"),
    };

    const nodes = [null];
    const idOf = new Map();
    forEachNode(root, (node) => {
        idOf.set(node, nodes.length);
        nodes.push(node);
    });

    const framebuffer = gl.createFramebuffer();
    const colorBuffer = gl.createRenderbuffer();
    const depthBuffer = gl.createRenderbuffer();
    let width = 0, height = 0;

    function resize(w, h) {
        if (w === width && h === height) return;
        width = w;
        height = h;
        gl.bindRenderbuffer(gl.RENDERBUFFER, colorBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, w, h);
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorBuffer);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
    }

    function drawWithId(shape, modelView, id) {
        gl.uniformMatrix4fv(uniforms.modelView, false, modelView);
        gl.uniform3fv(uniforms.idColor, idToColor(id));
        drawMesh(gl, shape.mesh);
    }

    function pick(view, projection, u, v) {
        resize(gl.canvas.width, gl.canvas.height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(program);
        gl.uniformMatrix4fv(uniforms.projection, false, projection);

        for (const shape of staticShapes) {
            drawWithId(shape, m4.multiply(view, shape.matrix), 0);
        }
        drawHierarchy(root, view, (shape, modelView, node) => {
            drawWithId(shape, modelView, idOf.get(node));
        });

        const x = Math.min(Math.floor(u * width), width - 1);
        const y = Math.min(Math.floor((1 - v) * height), height - 1);
        const pixel = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        return nodes[colorToId(pixel)] ?? null;
    }

    return { pick };
}
