import { RENDER_MODES } from "../renderer.js";

export function createRenderPanel(container, state) {
    const section = document.createElement("section");
    section.className = "panel-section";
    section.innerHTML = "<h2>Rendering</h2>";

    const select = document.createElement("select");
    RENDER_MODES.forEach((label, index) => select.add(new Option(label, index)));
    select.value = state.renderMode;
    select.addEventListener("change", () => {
        state.renderMode = Number(select.value);
    });
    section.append(select);

    container.append(section);
}
