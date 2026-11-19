export function identity() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
}

export function multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
            out[c * 4 + r] = sum;
        }
    }
    return out;
}

export function multiplyAll(...matrices) {
    return matrices.reduce((acc, m) => multiply(acc, m), identity());
}

export function translation(x, y, z) {
    const m = identity();
    m[12] = x;
    m[13] = y;
    m[14] = z;
    return m;
}

export function scaling(x, y, z) {
    const m = identity();
    m[0] = x;
    m[5] = y;
    m[10] = z;
    return m;
}

export function rotationX(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    const m = identity();
    m[5] = c; m[6] = s;
    m[9] = -s; m[10] = c;
    return m;
}

export function rotationY(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    const m = identity();
    m[0] = c; m[2] = -s;
    m[8] = s; m[10] = c;
    return m;
}

export function rotationZ(rad) {
    const c = Math.cos(rad), s = Math.sin(rad);
    const m = identity();
    m[0] = c; m[1] = s;
    m[4] = -s; m[5] = c;
    return m;
}

export function transpose(a) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) out[r * 4 + c] = a[c * 4 + r];
    }
    return out;
}

export function invert(a) {
    const left = [], right = [];
    for (let r = 0; r < 4; r++) {
        left.push([a[r], a[4 + r], a[8 + r], a[12 + r]]);
        right.push([0, 0, 0, 0]);
        right[r][r] = 1;
    }
    for (let col = 0; col < 4; col++) {
        let pivot = col;
        for (let r = col + 1; r < 4; r++) {
            if (Math.abs(left[r][col]) > Math.abs(left[pivot][col])) pivot = r;
        }
        if (Math.abs(left[pivot][col]) < 1e-12) throw new Error("Matrix is not invertible.");
        [left[col], left[pivot]] = [left[pivot], left[col]];
        [right[col], right[pivot]] = [right[pivot], right[col]];

        const p = left[col][col];
        for (let c = 0; c < 4; c++) {
            left[col][c] /= p;
            right[col][c] /= p;
        }
        for (let r = 0; r < 4; r++) {
            if (r === col) continue;
            const f = left[r][col];
            if (f === 0) continue;
            for (let c = 0; c < 4; c++) {
                left[r][c] -= f * left[col][c];
                right[r][c] -= f * right[col][c];
            }
        }
    }
    const out = new Float32Array(16);
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) out[c * 4 + r] = right[r][c];
    }
    return out;
}

export function normalMatrix(modelView) {
    return transpose(invert(modelView));
}

export function perspective(fovyRad, aspect, near, far) {
    const f = 1 / Math.tan(fovyRad / 2);
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
}

export function lookAt(eye, target, up) {
    const z = normalize(subtract(eye, target));
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    const m = identity();
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
    m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
    m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
    m[12] = -dot(x, eye);
    m[13] = -dot(y, eye);
    m[14] = -dot(z, eye);
    return m;
}

export function rotationAxis([x, y, z], rad) {
    const c = Math.cos(rad), s = Math.sin(rad), t = 1 - c;
    const m = identity();
    m[0] = c + x * x * t;     m[4] = x * y * t - z * s; m[8] = x * z * t + y * s;
    m[1] = y * x * t + z * s; m[5] = c + y * y * t;     m[9] = y * z * t - x * s;
    m[2] = z * x * t - y * s; m[6] = z * y * t + x * s; m[10] = c + z * z * t;
    return m;
}

export function transformPoint(m, [x, y, z]) {
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
}

export function transformDirection(m, [x, y, z]) {
    return [
        m[0] * x + m[4] * y + m[8] * z,
        m[1] * x + m[5] * y + m[9] * z,
        m[2] * x + m[6] * y + m[10] * z,
    ];
}

export function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

export function normalize(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
}

export const degToRad = (deg) => (deg * Math.PI) / 180;
