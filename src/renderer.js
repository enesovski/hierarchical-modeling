// Draws the scene with the main shader: static shapes, then the insect hierarchy.

import * as m4 from "./math.js";
import { createProgram, drawMesh } from "./gl-utils.js";
import { drawHierarchy } from "./scene-graph.js";
import { vertexShaderSource, fragmentShaderSource } from "./shaders.js";

const HIGHLIGHT_BOOST = 0.25;

export function createRenderer(gl) {
    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
    const uniforms = {
        modelView: gl.getUniformLocation(program, "uModelView"),
        projection: gl.getUniformLocation(program, "uProjection"),
        normalMatrix: gl.getUniformLocation(program, "uNormalMatrix"),
        color: gl.getUniformLocation(program, "uColor"),
        lighting: gl.getUniformLocation(program, "uLighting"),
    };

    gl.enable(gl.DEPTH_TEST);

    function drawShape(shape, modelView, color = shape.color) {
        gl.uniformMatrix4fv(uniforms.modelView, false, modelView);
        gl.uniformMatrix4fv(uniforms.normalMatrix, false, m4.normalMatrix(modelView));
        gl.uniform3fv(uniforms.color, color);
        drawMesh(gl, shape.mesh);
    }

    // scene: { root, staticShapes, view, projection, lighting, selectedNode }
    function render(scene) {
        gl.clearColor(0.12, 0.14, 0.18, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program);
        gl.uniformMatrix4fv(uniforms.projection, false, scene.projection);
        gl.uniform1i(uniforms.lighting, scene.lighting ? 1 : 0);

        for (const shape of scene.staticShapes) {
            drawShape(shape, m4.multiply(scene.view, shape.matrix));
        }

        drawHierarchy(scene.root, scene.view, (shape, modelView, node) => {
            const color = node === scene.selectedNode
                ? shape.color.map((c) => Math.min(c + HIGHLIGHT_BOOST, 1))
                : shape.color;
            drawShape(shape, modelView, color);
        });
    }

    return { render };
}
