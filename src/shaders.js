export const vertexShaderSource = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat4 uNormalMatrix;

out vec3 vNormal;
out vec3 vViewPos;
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

uniform int uRenderMode;
uniform vec3 uColor;
uniform bool uHasTexture;
uniform sampler2D uTexture;
uniform vec2 uUvScale;

uniform vec3 uLightDir;
uniform float uSpecular;
uniform float uShininess;

out vec4 outColor;

const vec3 LIGHT_COLOR = vec3(1.0);
const vec3 AMBIENT = vec3(0.28);

void main() {
    bool textured = (uRenderMode == 1 || uRenderMode == 3) && uHasTexture;
    bool lit = uRenderMode >= 2;

    vec3 albedo = textured ? texture(uTexture, vTexCoord * uUvScale).rgb : uColor;
    vec3 color = albedo;

    if (lit) {
        vec3 n = normalize(vNormal);
        vec3 l = uLightDir;
        vec3 v = normalize(-vViewPos);
        vec3 h = normalize(l + v);

        float diffuse = max(dot(n, l), 0.0);
        float specular = diffuse > 0.0 ? pow(max(dot(n, h), 0.0), uShininess) : 0.0;

        color = albedo * (AMBIENT + diffuse * LIGHT_COLOR) + uSpecular * specular * LIGHT_COLOR;
    }

    outColor = vec4(color, 1.0);
}
`;
