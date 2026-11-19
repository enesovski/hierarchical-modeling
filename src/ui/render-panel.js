import { RENDER_MODES } from "../renderer.js";

function addSlider(section, label, min, max, get, set) {
    const row = document.createElement("label");
    row.className = "slider-row";

    const name = document.createElement("span");
    name.textContent = label;

    const input = document.createElement("input");
    input.type = "range";
    input.min = min;
    input.max = max;
    input.value = get();

    const output = document.createElement("output");
    output.textContent = get();

    input.addEventListener("input", () => {
        set(Number(input.value));
        output.textContent = input.value;
    });

    row.append(name, input, output);
    section.append(row);
}

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

    const { light } = state;
    addSlider(section, "light azimuth", -180, 180, () => light.azimuth, (v) => { light.azimuth = v; });
    addSlider(section, "light elevation", 5, 90, () => light.elevation, (v) => { light.elevation = v; });

    container.append(section);
}
