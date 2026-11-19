// Selection outline drawn around the selected part's silhouette.
//   1. Mask pass: draw only the selected node's shapes in white into an
//      off-screen texture (everything else stays black).
//   2. Outline pass: a full-screen triangle; each pixel outside the mask that
//      has a mask pixel within OUTLINE_WIDTH_PX gets the outline colour.
// The outline therefore has the same pixel width at any zoom. Only the ground
// (static shapes) can hide it: it stays visible where other insect parts are
// in front of the selected one, but not through the ground.

import * as m4 from "./math.js";
import { createProgram, drawMesh } from "./gl-utils.js";
import { drawHierarchy } from "./scene-graph.js";

const OUTLINE_WIDTH_PX = 3;          // CSS pixels, scaled by devicePixelRatio
const OUTLINE_COLOR = [1.0, 0.62, 0.1];

const maskVertexSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uModelView;
uniform mat4 uProjection;
void main() {
    gl_Position = uProjection * uModelView * vec4(aPosition, 1.0);
}
`;

const maskFragmentSource = `#version 300 es
precision highp float;
out vec4 outColor;
void main() {
    outColor = vec4(1.0);
}
`;

// One triangle that covers the whole screen, built from gl_VertexID (no buffers).
const outlineVertexSource = `#version 300 es
void main() {
    vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Samples the mask on rings around the pixel (16 directions x 3 radii) instead
// of a full square, which is far cheaper and looks the same at this width.
const outlineFragmentSource = `#version 300 es
precision highp float;
uniform sampler2D uMask;
uniform float uWidth;     // device pixels
uniform vec3 uColor;
out vec4 outColor;

const int DIRECTIONS = 16;
const float TAU = 6.2831853;

bool inMask(ivec2 p) {
    ivec2 size = textureSize(uMask, 0);
    p = clamp(p, ivec2(0), size - 1);
    return texelFetch(uMask, p, 0).r > 0.5;
}

void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    if (inMask(pixel)) discard;              // inside the part: leave it as rendered

    float nearest = 1e9;
    for (int i = 0; i < DIRECTIONS; i++) {
        float angle = TAU * float(i) / float(DIRECTIONS);
        vec2 dir = vec2(cos(angle), sin(angle));
        for (int r = 1; r <= 3; r++) {
            float dist = uWidth * float(r) / 3.0;
            if (inMask(pixel + ivec2(round(dir * dist)))) nearest = min(nearest, dist);
        }
    }
    if (nearest > uWidth) discard;
    outColor = vec4(uColor, 1.0);
}
`;

export function createOutline(gl) {
    const maskProgram = createProgram(gl, maskVertexSource, maskFragmentSource);
    const maskUniforms = {
        modelView: gl.getUniformLocation(maskProgram, "uModelView"),
        projection: gl.getUniformLocation(maskProgram, "uProjection"),
    };
    const outlineProgram = createProgram(gl, outlineVertexSource, outlineFragmentSource);
    const outlineUniforms = {
        mask: gl.getUniformLocation(outlineProgram, "uMask"),
        width: gl.getUniformLocation(outlineProgram, "uWidth"),
        color: gl.getUniformLocation(outlineProgram, "uColor"),
    };
    const emptyVao = gl.createVertexArray(); // the full-screen triangle needs no attributes

    // Mask texture + depth buffer (for the ground) + framebuffer, resized with the canvas.
    const maskTexture = gl.createTexture();
    const depthBuffer = gl.createRenderbuffer();
    const framebuffer = gl.createFramebuffer();
    let width = 0, height = 0;

    function resize(w, h) {
        if (w === width && h === height) return;
        width = w;
        height = h;
        gl.bindTexture(gl.TEXTURE_2D, maskTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, maskTexture, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Call after the scene is rendered. Does nothing when nothing is selected.
    function draw({ root, staticShapes, view, projection, selectedNode }) {
        if (!selectedNode) return;
        resize(gl.canvas.width, gl.canvas.height);

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(maskProgram);
        gl.uniformMatrix4fv(maskUniforms.projection, false, projection);

        // 1a. The ground goes into the depth buffer only (no colour), so it can
        //     hide the selected part, e.g. when the camera looks from below.
        gl.colorMask(false, false, false, false);
        for (const shape of staticShapes) {
            gl.uniformMatrix4fv(maskUniforms.modelView, false, m4.multiply(view, shape.matrix));
            drawMesh(gl, shape.mesh);
        }
        gl.colorMask(true, true, true, true);

        // 1b. Mask: only the selected node's shapes, depth-tested against the
        //     ground. Other insect parts are not drawn, so they cannot cut holes.
        drawHierarchy(root, view, (shape, modelView, node) => {
            if (node !== selectedNode) return;
            gl.uniformMatrix4fv(maskUniforms.modelView, false, modelView);
            drawMesh(gl, shape.mesh);
        });

        // 2. Outline over the rendered scene (a flat overlay, so no depth test).
        gl.disable(gl.DEPTH_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.useProgram(outlineProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, maskTexture);
        gl.uniform1i(outlineUniforms.mask, 0);
        gl.uniform1f(outlineUniforms.width, OUTLINE_WIDTH_PX * (window.devicePixelRatio || 1));
        gl.uniform3fv(outlineUniforms.color, OUTLINE_COLOR);
        gl.bindVertexArray(emptyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.enable(gl.DEPTH_TEST);
    }

    return { draw };
}
