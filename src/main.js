const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl2");

if (!gl) {
    throw new Error("WebGL2 is not supported.");
}

function resize() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
}

window.addEventListener("resize", resize);
resize();

gl.clearColor(0.12, 0.14, 0.18, 1.0);
gl.clear(gl.COLOR_BUFFER_BIT);
