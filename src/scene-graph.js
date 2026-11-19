import { identity, multiply } from "./math.js";

export function createNode(name, computeTransform, shapes = []) {
    return {
        name,
        computeTransform,
        transform: identity(),
        shapes,
        dofs: [],
        child: null,
        sibling: null,
    };
}

export function addChild(parent, child) {
    if (parent.child === null) {
        parent.child = child;
    } else {
        let last = parent.child;
        while (last.sibling !== null) last = last.sibling;
        last.sibling = child;
    }
    return child;
}

export function forEachNode(node, visit) {
    if (node === null) return;
    visit(node);
    forEachNode(node.child, visit);
    forEachNode(node.sibling, visit);
}

export function updateTransforms(root, pose) {
    forEachNode(root, (node) => {
        node.transform = node.computeTransform(pose);
    });
}

export class MatrixStack {
    constructor() {
        this.stack = [];
    }

    push(matrix) {
        this.stack.push(matrix);
    }

    pop() {
        if (this.stack.length === 0) throw new Error("Matrix stack underflow.");
        return this.stack.pop();
    }
}

export function drawHierarchy(root, viewMatrix, drawShape) {
    const stack = new MatrixStack();
    let modelView = viewMatrix;

    function traverse(node) {
        if (node === null) return;
        stack.push(modelView);
        modelView = multiply(modelView, node.transform);
        for (const shape of node.shapes) {
            drawShape(shape, multiply(modelView, shape.matrix), node);
        }
        traverse(node.child);
        modelView = stack.pop();
        traverse(node.sibling);
    }

    traverse(root);
}
