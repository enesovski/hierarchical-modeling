export function createCameraPanel(container, camera) {
    const section = document.createElement("section");
    section.className = "panel-section";
    section.innerHTML = `
        <h2>Camera</h2>
        <p class="hint">Drag: rotate · Right/Shift-drag: pan · Wheel: zoom</p>
    `;

    const resetButton = document.createElement("button");
    resetButton.textContent = "Reset view";
    resetButton.addEventListener("click", () => camera.reset());
    section.append(resetButton);

    container.append(section);
}
