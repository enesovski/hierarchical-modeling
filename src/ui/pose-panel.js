// Posture sliders, generated from DOFS and grouped into collapsible sections.

import { resetPose } from "../insect.js";

function formatValue(value, step) {
    return step < 1 ? value.toFixed(1) : String(Math.round(value));
}

export function createPosePanel(container, pose, dofs) {
    const section = document.createElement("section");
    section.className = "panel-section";
    section.innerHTML = "<h2>Posture</h2>";

    const resetButton = document.createElement("button");
    resetButton.textContent = "Reset pose";
    resetButton.addEventListener("click", () => resetPose(pose));
    section.append(resetButton);

    const groups = new Map();
    const rows = [];

    for (const dof of dofs) {
        if (!groups.has(dof.group)) {
            const details = document.createElement("details");
            details.innerHTML = `<summary>${dof.group}</summary>`;
            section.append(details);
            groups.set(dof.group, details);
        }

        const row = document.createElement("label");
        row.className = "slider-row";

        const name = document.createElement("span");
        name.textContent = `${dof.node} ${dof.name}`;

        const input = document.createElement("input");
        input.type = "range";
        input.min = dof.min;
        input.max = dof.max;
        input.step = dof.step;
        input.value = pose[dof.key];

        const output = document.createElement("output");
        output.textContent = formatValue(pose[dof.key], dof.step);

        input.addEventListener("input", () => {
            pose[dof.key] = Number(input.value);
            output.textContent = formatValue(pose[dof.key], dof.step);
        });

        row.append(name, input, output);
        groups.get(dof.group).append(row);
        rows.push({ dof, input, output });
    }

    container.append(section);

    // Call every frame so sliders follow pose changes made elsewhere
    // (reset, picking, animation playback).
    function sync() {
        for (const { dof, input, output } of rows) {
            const value = pose[dof.key];
            if (Number(input.value) === value) continue;
            input.value = value;
            output.textContent = formatValue(value, dof.step);
        }
    }

    return { sync };
}
