// Left-child / right-sibling scene graph, as in figure.js.
//   transform: joint transform relative to the parent (inherited by children)
//   shapes:    [{ mesh, matrix, color }]; shape.matrix is NOT inherited
//   computeTransform(pose): rebuilds transform from the joint angles

import { identity, multiply } from "./math.js";

export function createNode(name, computeTransform, shapes = []) {
    return {
        name,
        computeTransform,
        transform: identity(),
        shapes,
        dofs: [],      // pose keys this node's joint reads (filled in by the model)
        child: null,
        sibling: null,
    };
}

// Appends `child` as the last child of `parent`.
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

// Visits every node in the tree (depth-first, children before siblings).
export function forEachNode(node, visit) {
    if (node === null) return;
    visit(node);
    forEachNode(node.child, visit);
    forEachNode(node.sibling, visit);
}

// Recomputes every joint transform from the pose (joint angles in degrees).
export function updateTransforms(root, pose) {
    forEachNode(root, (node) => {
        node.transform = node.computeTransform(pose);
    });
}

// Stack of saved model-view matrices for the hierarchical traversal.
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

// Hierarchical traversal with a matrix stack (as in figure.js).
// Calls drawShape(shape, modelView, node) for every shape. The renderer and the
// picking pass both use this, each with its own drawShape.
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
        traverse(node.child);     // children inherit this node's transform
        modelView = stack.pop();
        traverse(node.sibling);   // siblings start from the parent's transform
    }

    traverse(root);
}
