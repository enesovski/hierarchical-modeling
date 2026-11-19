// Draws the scene with the main shader: static shapes, then the insect hierarchy.
// A shape is { mesh, matrix, color, texture?, specular?, shininess?, uvScale? }.

import * as m4 from "./math.js";
import { createProgram, drawMesh } from "./gl-utils.js";
import { drawHierarchy } from "./scene-graph.js";
import { vertexShaderSource, fragmentShaderSource } from "./shaders.js";

// Index = value of uRenderMode in the fragment shader.
export const RENDER_MODES = ["Color", "Texture", "Shading", "Shaded texture"];

const DEFAULT_SPECULAR = 0.3;
const DEFAULT_SHININESS = 32;
const NO_UV_SCALE = [1, 1];

// textures: { name: WebGLTexture } from loadTextures
export function createRenderer(gl, textures) {
    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    const uniforms = {};
    for (const name of [
        "uModelView", "uProjection", "uNormalMatrix", "uRenderMode", "uColor",
        "uHasTexture", "uTexture", "uUvScale", "uLightDir", "uSpecular",
        "uShininess",
    ]) {
        uniforms[name] = gl.getUniformLocation(program, name);
    }

    gl.enable(gl.DEPTH_TEST);

    function drawShape(shape, modelView) {
        gl.uniformMatrix4fv(uniforms.uModelView, false, modelView);
        gl.uniformMatrix4fv(uniforms.uNormalMatrix, false, m4.normalMatrix(modelView));
        gl.uniform3fv(uniforms.uColor, shape.color);

        const texture = textures[shape.texture];
        gl.uniform1i(uniforms.uHasTexture, texture ? 1 : 0);
        if (texture) gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform2fv(uniforms.uUvScale, shape.uvScale ?? NO_UV_SCALE);

        gl.uniform1f(uniforms.uSpecular, shape.specular ?? DEFAULT_SPECULAR);
        gl.uniform1f(uniforms.uShininess, shape.shininess ?? DEFAULT_SHININESS);
        drawMesh(gl, shape.mesh);
    }

    // scene: { root, staticShapes, view, projection, renderMode, light }
    // (the selected part is marked afterwards by outline.js)
    // light: { azimuth, elevation } in degrees, a directional light in world space.
    function render(scene) {
        gl.clearColor(0.12, 0.14, 0.18, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program);
        gl.uniformMatrix4fv(uniforms.uProjection, false, scene.projection);
        gl.uniform1i(uniforms.uRenderMode, scene.renderMode);

        gl.activeTexture(gl.TEXTURE0);
        gl.uniform1i(uniforms.uTexture, 0);

        // The light is fixed in the world, so bring its direction into view space
        // (the space the shader lights in). Directions ignore translation.
        const az = m4.degToRad(scene.light.azimuth);
        const el = m4.degToRad(scene.light.elevation);
        const worldDir = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
        gl.uniform3fv(uniforms.uLightDir, m4.normalize(m4.transformDirection(scene.view, worldDir)));

        for (const shape of scene.staticShapes) {
            drawShape(shape, m4.multiply(scene.view, shape.matrix));
        }

        drawHierarchy(scene.root, scene.view, (shape, modelView) => drawShape(shape, modelView));
    }

    return { render };
}
