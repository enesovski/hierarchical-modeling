// GLSL ES 3.00 shaders. Phase 3 extends these with Blinn-Phong lighting,
// textures and a render-mode switch.

export const vertexShaderSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat4 uNormalMatrix;

out vec3 vNormal;     // view space
out vec3 vViewPos;    // view space
out vec2 vTexCoord;

void main() {
    vec4 viewPos = uModelView * vec4(aPosition, 1.0);
    vViewPos = viewPos.xyz;
    vNormal = mat3(uNormalMatrix) * aNormal;
    vTexCoord = aTexCoord;
    gl_Position = uProjection * viewPos;
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vViewPos;
in vec2 vTexCoord;

uniform vec3 uColor;
uniform bool uLighting;   // false = flat uniform colour per part

out vec4 outColor;

void main() {
    vec3 color = uColor;
    if (uLighting) {
        // Temporary diffuse term so shapes are readable; replaced in Phase 3.
        vec3 n = normalize(vNormal);
        vec3 l = normalize(vec3(0.4, 0.8, 0.6)); // view space
        color *= 0.35 + 0.65 * max(dot(n, l), 0.0);
    }
    outColor = vec4(color, 1.0);
}
`;
