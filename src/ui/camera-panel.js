export function createCameraPanel(container, camera) {
    const section = document.createElement("section");
    section.className = "panel-section";
    section.innerHTML = "<h2>Camera</h2>";

    const resetButton = document.createElement("button");
    resetButton.textContent = "Reset view";
    resetButton.addEventListener("click", () => camera.reset());
    section.append(resetButton);

    container.append(section);
}
