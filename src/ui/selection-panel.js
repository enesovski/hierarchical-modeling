export function createSelectionPanel(container, state) {
    const section = document.createElement("section");
    section.className = "panel-section";
    section.innerHTML = `
        <h2>Direct posing</h2>
        <p class="hint">Click a part to select it, drag it to pose. Drag the body
        to move the ant, Shift-drag the body to turn it. Click empty space to deselect.</p>
    `;

    const label = document.createElement("p");
    section.append(label);
    container.append(section);

    let shown;
    function sync() {
        const node = state.selectedNode;
        if (node === shown) return;
        shown = node;
        label.textContent = node
            ? `Selected: ${node.name} (${node.dofs.map((k) => k.split(".")[1]).join(", ")})`
            : "Selected: none";
    }
    sync();

    return { sync };
}
