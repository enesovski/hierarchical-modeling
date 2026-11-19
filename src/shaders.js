// GLSL ES 3.00 shaders: one program covers all four render modes.
//   0 Color          uniform colour per part, unlit
//   1 Texture        image texture per part, unlit
//   2 Shading        uniform colour, smooth Blinn-Phong shading
//   3 Shaded texture image texture, smooth Blinn-Phong shading
// Lighting is computed per fragment from interpolated vertex normals, which is
// what makes the shading smooth (no faceting across triangles).

export const vertexShaderSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat4 uNormalMatrix;   // inverse-transpose of uModelView

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

uniform int uRenderMode;      // 0..3, see the table at the top of shaders.js
uniform vec3 uColor;
uniform bool uHasTexture;
uniform sampler2D uTexture;
uniform vec2 uUvScale;        // > 1 repeats the texture (ground)

uniform vec3 uLightDir;       // view space, unit vector pointing towards the light
uniform float uSpecular;      // specular strength of this part's material
uniform float uShininess;     // Blinn-Phong exponent

out vec4 outColor;

const vec3 LIGHT_COLOR = vec3(1.0);
const vec3 AMBIENT = vec3(0.28);

void main() {
    bool textured = (uRenderMode == 1 || uRenderMode == 3) && uHasTexture;
    bool lit = uRenderMode >= 2;

    vec3 albedo = textured ? texture(uTexture, vTexCoord * uUvScale).rgb : uColor;
    vec3 color = albedo;

    if (lit) {
        vec3 n = normalize(vNormal);          // re-normalize after interpolation
        vec3 l = uLightDir;
        vec3 v = normalize(-vViewPos);        // the eye is at the origin in view space
        vec3 h = normalize(l + v);            // Blinn-Phong half vector

        float diffuse = max(dot(n, l), 0.0);
        float specular = diffuse > 0.0 ? pow(max(dot(n, h), 0.0), uShininess) : 0.0;

        color = albedo * (AMBIENT + diffuse * LIGHT_COLOR) + uSpecular * specular * LIGHT_COLOR;
    }

    outColor = vec4(color, 1.0);
}
`;
