// Keyframe timeline under the 3D view: transport buttons, a frame ruler and
// one row (track) per body part with a diamond for every keyframe.
//
//   ruler / empty row   click or drag to move the playhead (scrub)
//   diamond             click to jump to it, drag to retime it
//   K / "Key"           key the selected part at the playhead
//   Delete              remove the selected keyframe
// Clicking a part in the 3D view selects its row.

import {
    TRACKS, INTERPOLATIONS, createAnimation, keysOf, setKey, removeKey, moveKey,
    trackOfNode, animationToJson, parseAnimation,
} from "../animation.js";

const PRESETS = [
    { label: "Walk", url: "./assets/animations/walk.json" },
    { label: "Looking around", url: "./assets/animations/looking-around.json" },
];

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(label, title, onClick) {
    const b = el("button", "", label);
    b.title = title;
    b.addEventListener("click", () => {
        onClick();
        b.blur();   // so Space toggles playback instead of pressing this button again
    });
    return b;
}

// A "nice" ruler step so the ruler shows roughly ten labels.
function rulerStep(length) {
    return [1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find((s) => length / s <= 12) ?? 1200;
}

function downloadText(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export function createTimeline(container, player, pose, state) {
    let selectedTrack = null;
    let selectedKey = null;          // a key object inside selectedTrack
    let lastSelectedNode = null;

    // ---- Toolbar ----
    const toolbar = el("div", "tl-toolbar");
    const playButton = button("▶", "Play (Space)", () => player.play());
    const pauseButton = button("❚❚", "Pause (Space)", () => player.pause());
    const stopButton = button("■", "Stop: back to frame 0", () => player.stop());
    const frameLabel = el("output", "tl-frame");

    const keyButton = button("Key", "Key the selected part at the playhead (K)", keySelected);
    const keyAllButton = button("Key all", "Key every part at the playhead", keyAll);
    const deleteButton = button("Delete key", "Delete the selected keyframe (Delete)", deleteSelected);

    const nameInput = el("input", "tl-name");
    nameInput.type = "text";
    nameInput.title = "Animation name (used as the file name)";
    nameInput.addEventListener("input", () => { player.animation.name = nameInput.value; });

    const lengthInput = el("input", "tl-length");
    lengthInput.type = "number";
    lengthInput.min = 1;
    lengthInput.title = "Length in frames (30 fps)";
    lengthInput.addEventListener("change", () => {
        player.animation.length = Math.max(1, Math.round(Number(lengthInput.value)) || 1);
        player.seek(Math.min(player.frame, player.animation.length));
        refresh();
    });

    const interpolationSelect = el("select");
    for (const [value, label] of Object.entries(INTERPOLATIONS)) interpolationSelect.add(new Option(label, value));
    interpolationSelect.addEventListener("change", () => {
        player.animation.interpolation = interpolationSelect.value;
        player.seek(player.frame);
    });

    const loopBox = el("input");
    loopBox.type = "checkbox";
    loopBox.addEventListener("change", () => {
        player.animation.loop = loopBox.checked;
        player.seek(player.frame);
    });
    const loopLabel = el("label", "tl-check");
    loopLabel.append(loopBox, " Loop");

    const fileInput = el("input");
    fileInput.type = "file";
    fileInput.accept = ".json,application/json";
    fileInput.hidden = true;
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        fileInput.value = "";   // allow loading the same file again
        if (!file) return;
        try {
            loadAnimation(parseAnimation(await file.text()), `Loaded "${file.name}".`);
        } catch (error) {
            show(`Could not load "${file.name}": ${error.message}`);
        }
    });

    const message = el("span", "tl-message");
    const show = (text) => { message.textContent = text; };

    toolbar.append(
        playButton, pauseButton, stopButton, frameLabel,
        el("span", "tl-sep"), keyButton, keyAllButton, deleteButton,
        el("span", "tl-sep"),
        button("Save", "Download the animation as JSON", () => {
            const name = player.animation.name.trim() || "animation";
            downloadText(`${name}.json`, animationToJson(player.animation));
        }),
        button("Load", "Load an animation JSON file", () => fileInput.click()),
        button("New", "Start an empty animation", () => {
            loadAnimation(createAnimation(), "New animation: pose a part, then press K to key it.");
        }),
        el("span", "tl-sep"),
        ...PRESETS.map((preset) => button(preset.label, `Load and play the "${preset.label}" preset`, () => loadPreset(preset))),
        el("span", "tl-sep"),
        nameInput, lengthInput, interpolationSelect, loopLabel,
        fileInput, message
    );

    // ---- Ruler + rows ----
    const body = el("div", "tl-body");
    const rulerRow = el("div", "tl-row tl-ruler");
    const rulerLane = el("div", "tl-lane");
    rulerRow.append(el("div", "tl-label"), rulerLane);
    body.append(rulerRow);

    const rows = new Map();   // track -> { row, lane }
    for (const track of TRACKS) {
        const row = el("div", "tl-row");
        const label = el("div", "tl-label", track);
        const lane = el("div", "tl-lane");
        row.append(label, lane);
        body.append(row);
        rows.set(track, { row, lane });

        label.addEventListener("click", () => select(track, null));
        lane.addEventListener("pointerdown", (e) => {
            if (e.target !== lane) return;   // diamonds handle their own clicks
            select(track, null);
            startScrub(e, lane);
        });
    }
    rulerLane.addEventListener("pointerdown", (e) => startScrub(e, rulerLane));

    const playhead = el("div", "tl-playhead");
    body.append(playhead);
    container.append(toolbar, body);

    // ---- Helpers ----
    const frameAt = (lane, clientX) => {
        const rect = lane.getBoundingClientRect();
        const u = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
        return Math.round(u * player.animation.length);
    };
    const percent = (frame) => `${(100 * frame) / player.animation.length}%`;

    // Pointer drag helper: calls onMove(clientX) until the button is released.
    function drag(e, target, onMove, onEnd = () => {}) {
        target.setPointerCapture(e.pointerId);
        const move = (ev) => onMove(ev.clientX);
        const up = () => {
            target.removeEventListener("pointermove", move);
            target.removeEventListener("pointerup", up);
            target.removeEventListener("pointercancel", up);
            onEnd();
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", up);
        target.addEventListener("pointercancel", up);
        onMove(e.clientX);
    }

    function startScrub(e, lane) {
        player.pause();
        drag(e, lane, (x) => player.seek(frameAt(lane, x)));
    }

    function select(track, key) {
        selectedTrack = track;
        selectedKey = key;
        refresh();
    }

    function keySelected() {
        if (!selectedTrack) {
            show("Select a part first (click it in 3D or click its row), or use Key all.");
            return;
        }
        player.pause();
        const frame = Math.round(player.frame);
        selectedKey = setKey(player.animation, selectedTrack, frame, pose);
        refresh();
        show(`Keyed ${selectedTrack} at frame ${frame}.`);
    }

    function keyAll() {
        player.pause();
        const frame = Math.round(player.frame);
        for (const track of TRACKS) setKey(player.animation, track, frame, pose);
        selectedKey = null;
        refresh();
        show(`Keyed every part at frame ${frame}.`);
    }

    function deleteSelected() {
        if (!selectedKey) {
            show("Click a keyframe diamond first.");
            return;
        }
        removeKey(player.animation, selectedTrack, selectedKey);
        selectedKey = null;
        player.seek(player.frame);
        refresh();
    }

    function loadAnimation(animation, text) {
        player.load(animation);
        selectedKey = null;
        refresh();
        show(text);
    }

    async function loadPreset({ label, url }) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            loadAnimation(parseAnimation(await response.text()), `Loaded preset "${label}".`);
            player.play();
        } catch (error) {
            show(`Could not load ${url}: ${error.message}`);
        }
    }

    // ---- Drawing ----

    function makeDiamond(track, key) {
        const diamond = el("div", "tl-key");
        diamond.style.left = percent(key.frame);
        diamond.title = `${track}, frame ${key.frame}`;
        diamond.classList.toggle("selected", key === selectedKey);
        diamond.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            player.pause();
            select(track, key);
            player.seek(key.frame);
            const lane = rows.get(track).lane;
            // Dragging retimes the key; it is re-sorted on release.
            drag(e, diamond, (x) => {
                const frame = frameAt(lane, x);
                if (frame === key.frame) return;
                moveKey(player.animation, track, key, frame);
                diamond.style.left = percent(frame);
                diamond.title = `${track}, frame ${frame}`;
                player.seek(frame);
            }, refresh);
        });
        return diamond;
    }

    // Rebuilds everything that depends on the animation (not on the playhead).
    function refresh() {
        const animation = player.animation;
        nameInput.value = animation.name;
        lengthInput.value = animation.length;
        interpolationSelect.value = animation.interpolation;
        loopBox.checked = animation.loop;

        const step = rulerStep(animation.length);
        const ticks = [];
        for (let f = 0; f <= animation.length; f += step) {
            const tick = el("span", "tl-tick", String(f));
            tick.style.left = percent(f);
            ticks.push(tick);
        }
        rulerLane.replaceChildren(...ticks);

        for (const [track, { row, lane }] of rows) {
            row.classList.toggle("selected", track === selectedTrack);
            lane.replaceChildren(...keysOf(animation, track).map((key) => makeDiamond(track, key)));
        }
    }

    // Called every frame: playhead, frame counter, selection from the 3D view.
    function sync() {
        if (state.selectedNode !== lastSelectedNode) {
            lastSelectedNode = state.selectedNode;
            const track = trackOfNode(state.selectedNode);
            if (track && track !== selectedTrack) select(track, null);
        }
        const { length } = player.animation;
        frameLabel.textContent = `${Math.round(player.frame)} / ${length}`;
        playButton.classList.toggle("active", player.playing);
        pauseButton.classList.toggle("active", !player.playing);

        // The playhead spans all rows, offset by the label column.
        const laneRect = rulerLane.getBoundingClientRect();
        const bodyRect = body.getBoundingClientRect();
        playhead.style.left = `${laneRect.left - bodyRect.left + (laneRect.width * player.frame) / length}px`;
    }

    window.addEventListener("keydown", (e) => {
        if (e.target instanceof Element && e.target.closest("input, select, textarea")) return;
        if (e.key === "k" || e.key === "K") keySelected();
        else if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
        else if (e.key === " ") {
            e.preventDefault();
            player.playing ? player.pause() : player.play();
        }
    });

    refresh();
    show("Pose a part, move the playhead, press K to key it.");
    return { sync };
}
