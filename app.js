(() => {
    const verNumber = "10.10";
    const SETTINGS_KEY = "playCalcSettings_v1010";
    const INCH_TO_PX = 96;
    const SLOT_RANGE = { min: 0.018, max: 0.022 };
    // Separate ranges for wire height (H) and wire width (W).
    // H maximum set to 0.022 as requested; W keeps the original max 0.028.
    const WIRE_HEIGHT_RANGE = { min: 0.010, max: 0.022 };
    const WIRE_WIDTH_RANGE = { min: 0.010, max: 0.028 };
    const CANVAS_ASPECT = 650 / 440;
    const SPIN_SPEED_RAD_PER_MS = (45 * Math.PI / 180) / 1000;
    const THEMES = {
        light: {
            bg: "#dadada",
            text: "#000000",
            canvasBg: "#f0f0f0",
            slotLine: "#000000",
            wireFill: "#b1afaf"
        },
        dark: {
            bg: "#404040",
            text: "#e8eaed",
            canvasBg: "#2e2e2e",
            slotLine: "#dadce0",
            wireFill: "#606061"
        }
    };
    const slotPresets = ["0.018", "0.022"];
    const wirePresets = [
        "0.010 x 0.020",
        "0.016 x 0.022",
        "0.017 x 0.025",
        "0.0175 x 0.025",
        "0.019 x 0.025",
        "0.021 x 0.025",
        "0.0215 x 0.028"
    ];

    const state = {
        slotSizeIn: 0.018,
        wireHeightIn: 0.017,
        wireWidthIn: 0.025,
        lastValidSlotIn: 0.018,
        lastValidWireHIn: 0.017,
        lastValidWireWIn: 0.025,
        showEquation: false,
        theme: "light",
        displayTheta: 0,
        targetTheta: 0,
        latestThetaTrue: null,
        animationFrame: null,
        spinFrame: null,
        saveTimer: null
    };

    const els = {
        body: document.body,
        slotSlider: document.getElementById("slot-slider"),
        slotInput: document.getElementById("slot-input"),
        slotPreset: document.getElementById("slot-preset"),
        wireHSlider: document.getElementById("wire-h-slider"),
        wireHInput: document.getElementById("wire-h-input"),
        wireWSlider: document.getElementById("wire-w-slider"),
        wireWInput: document.getElementById("wire-w-input"),
        wirePreset: document.getElementById("wire-preset"),
        toggleTheme: document.getElementById("toggle-theme"),
        toggleEquation: document.getElementById("toggle-equation"),
        exportCsv: document.getElementById("export-csv"),
    // angleReadout removed from DOM; keep reference omitted to avoid errors
        messageLine: document.getElementById("message-line"),
        equationText: document.getElementById("equation-text"),
        equationValues: document.getElementById("equation-values"),
        canvas: document.getElementById("slot-canvas")
    };

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function round4(value) {
        return Math.round(value * 10000) / 10000;
    }

    function parseFloatSafe(value, fallback) {
        const num = Number.parseFloat(value);
        return Number.isFinite(num) ? num : fallback;
    }

    function loadSettings() {
        try {
            const raw = window.localStorage.getItem(SETTINGS_KEY);
            if (!raw) {
                return;
            }
            const data = JSON.parse(raw);
            if (typeof data.slotSizeIn === "number") {
                state.slotSizeIn = clamp(data.slotSizeIn, SLOT_RANGE.min, SLOT_RANGE.max);
            }
            if (typeof data.wireHeightIn === "number") {
                state.wireHeightIn = clamp(data.wireHeightIn, WIRE_HEIGHT_RANGE.min, WIRE_HEIGHT_RANGE.max);
            }
            if (typeof data.wireWidthIn === "number") {
                state.wireWidthIn = clamp(data.wireWidthIn, WIRE_WIDTH_RANGE.min, WIRE_WIDTH_RANGE.max);
            }
            if (typeof data.showEquation === "boolean") {
                state.showEquation = data.showEquation;
            }
            if (data.theme === "dark") {
                state.theme = "dark";
            }
            if (state.wireHeightIn > state.slotSizeIn) {
                state.wireHeightIn = state.slotSizeIn;
            }
            state.lastValidSlotIn = state.slotSizeIn;
            state.lastValidWireHIn = state.wireHeightIn;
            state.lastValidWireWIn = state.wireWidthIn;
        } catch (err) {
            console.warn("Failed to load settings", err);
        }
    }

    function persistSettings() {
        const payload = {
            slotSizeIn: round4(state.slotSizeIn),
            wireHeightIn: round4(state.wireHeightIn),
            wireWidthIn: round4(state.wireWidthIn),
            showEquation: state.showEquation,
            theme: state.theme
        };
        try {
            window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
        } catch (err) {
            console.warn("Failed to save settings", err);
        }
    }

    function queueSave() {
        if (state.saveTimer) {
            window.clearTimeout(state.saveTimer);
        }
        state.saveTimer = window.setTimeout(() => {
            state.saveTimer = null;
            persistSettings();
        }, 250);
    }

    function applyTheme() {
        const isDark = state.theme === "dark";
        els.body.classList.toggle("theme-dark", isDark);
        els.body.classList.toggle("theme-light", !isDark);
        els.toggleTheme.textContent = isDark ? "Light Mode" : "Dark Mode";
    }

    function updateEquationToggleLabel() {
        els.toggleEquation.textContent = state.showEquation ? "Hide Equation" : "Show Equation";
    }

    function populateSelect(selectEl, values, selected) {
        selectEl.innerHTML = "";
        values.forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            if (value === selected) {
                option.selected = true;
            }
            selectEl.append(option);
        });
        selectEl.value = selected;
    }

    function formatSlotPresetValue(value) {
        return value.toFixed(3);
    }

    function syncSlotControls() {
        els.slotSlider.value = round4(state.slotSizeIn).toString();
        els.slotInput.value = round4(state.slotSizeIn).toFixed(4);
        const presetValue = formatSlotPresetValue(state.slotSizeIn);
        populateSelect(els.slotPreset, getSlotPresetOptions(), presetValue);
    }

    function syncWireControls() {
        els.wireHSlider.value = round4(state.wireHeightIn).toString();
        els.wireHInput.value = round4(state.wireHeightIn).toFixed(4);
        els.wireWSlider.value = round4(state.wireWidthIn).toString();
        els.wireWInput.value = round4(state.wireWidthIn).toFixed(4);
        const presetLabel = matchWirePreset(state.wireHeightIn, state.wireWidthIn);
        const options = getWirePresetOptions();
        if (presetLabel === "custom") {
            populateSelect(els.wirePreset, ["Custom", ...options], "Custom");
        } else {
            populateSelect(els.wirePreset, options, presetLabel);
        }
    }

    function getSlotPresetOptions() {
        const requiresLargeSlot = state.wireHeightIn > SLOT_RANGE.min + 1e-6;
        if (requiresLargeSlot) {
            return ["0.022"];
        }
        return [...slotPresets];
    }

    function getWirePresetOptions() {
        const currentSlot = round4(state.slotSizeIn);
        if (Math.abs(currentSlot - 0.018) < 1e-6) {
            return wirePresets.filter((item) => {
                const [h] = item.split("x");
                const height = parseFloatSafe(h, 0);
                return height < 0.018 - 1e-6;
            });
        }
        return [...wirePresets];
    }

    function matchWirePreset(h, w) {
        const key = `${round4(h).toFixed(4)} x ${round4(w).toFixed(4)}`;
        const candidates = getWirePresetOptions();
        for (const option of candidates) {
            const parts = option.replace(/\s+/g, "").split("x");
            const hh = parseFloatSafe(parts[0], 0);
            const ww = parseFloatSafe(parts[1], 0);
            if (Math.abs(hh - h) < 1e-4 && Math.abs(ww - w) < 1e-4) {
                return option;
            }
        }
        return "custom";
    }

    function setMessage(text) {
        if (els.messageLine.textContent !== text) {
            els.messageLine.textContent = text;
        }
    }

    function cancelAnimation() {
        if (state.animationFrame !== null) {
            window.cancelAnimationFrame(state.animationFrame);
            state.animationFrame = null;
        }
        if (state.spinFrame !== null) {
            window.cancelAnimationFrame(state.spinFrame);
            state.spinFrame = null;
        }
    }

    function animateTo(targetTheta, durationMs = 600) {
        cancelAnimation();
        state.targetTheta = targetTheta;
        const startTheta = state.displayTheta;
        const startTime = performance.now() + (Math.abs(startTheta) < 1e-9 && Math.abs(targetTheta - startTheta) > 1e-9 ? 500 : 0);

        function step(now) {
            const elapsed = now - startTime;
            if (elapsed < 0) {
                state.animationFrame = window.requestAnimationFrame(step);
                return;
            }
            const t = Math.min(1, elapsed / durationMs);
            state.displayTheta = startTheta + (targetTheta - startTheta) * t;
            draw();
            if (t < 1) {
                state.animationFrame = window.requestAnimationFrame(step);
            } else {
                state.animationFrame = null;
            }
        }

        state.animationFrame = window.requestAnimationFrame(step);
    }

    function startSpin() {
        cancelAnimation();
        state.latestThetaTrue = null;
        let lastTimestamp = null;

        function tick(now) {
            if (lastTimestamp == null) {
                lastTimestamp = now;
            }
            const delta = now - lastTimestamp;
            lastTimestamp = now;
            state.displayTheta = (state.displayTheta + delta * SPIN_SPEED_RAD_PER_MS) % (Math.PI * 2);
            draw();
            state.spinFrame = window.requestAnimationFrame(tick);
        }

        state.spinFrame = window.requestAnimationFrame(tick);
    }

    function computeContactAngle(widthPx, heightPx, slotHeightPx) {
        const W = widthPx;
        const H = heightPx;
        const S = slotHeightPx;
        if (W <= 0 || H <= 0 || S <= 0) {
            return null;
        }
        const denominator = H * H + W * W;
        const sqrtArg = H * H + W * W - S * S;
        if (sqrtArg < -1e-12) {
            return null;
        }
        const t = Math.sqrt(Math.max(0, sqrtArg));
        let x = (W * S - H * t) / denominator;
        if (x < -1.0000000001 || x > 1.0000000001) {
            return null;
        }
        x = clamp(x, -1, 1);
        const theta = Math.asin(x);
        if (theta < -1e-12) {
            return null;
        }
        return clamp(theta, 0, Math.PI / 2);
    }

    function updatePhysics() {
        if (state.wireHeightIn > state.slotSizeIn + 1e-9) {
            setMessage("Wire height cannot exceed slot size.");
            cancelAnimation();
            state.displayTheta = 0;
            state.latestThetaTrue = null;
            draw();
            return;
        }
        setMessage("");
        const target = computeContactAngle(
            state.wireWidthIn * INCH_TO_PX,
            state.wireHeightIn * INCH_TO_PX,
            state.slotSizeIn * INCH_TO_PX
        );
        if (target == null) {
            startSpin();
        } else {
            state.latestThetaTrue = target;
            animateTo(target);
        }
        queueSave();
    }

    function setSlotSize(value) {
        const parsed = clamp(round4(value), SLOT_RANGE.min, SLOT_RANGE.max);
        if (parsed < state.wireHeightIn - 1e-9) {
            setMessage("Slot size reverted: wire is taller than slot.");
            syncSlotControls();
            draw();
            return;
        }
        state.slotSizeIn = parsed;
        state.lastValidSlotIn = parsed;
        syncSlotControls();
        syncWireControls();
        updatePhysics();
    }

    function setWireSize(newHeight, newWidth) {
    const h = clamp(round4(newHeight), WIRE_HEIGHT_RANGE.min, WIRE_HEIGHT_RANGE.max);
    const w = clamp(round4(newWidth), WIRE_WIDTH_RANGE.min, WIRE_WIDTH_RANGE.max);
        if (h > state.slotSizeIn + 1e-9) {
            setMessage("Wire height reverted: exceeds slot size.");
            syncWireControls();
            draw();
            return;
        }
        state.wireHeightIn = h;
        state.wireWidthIn = w;
        state.lastValidWireHIn = h;
        state.lastValidWireWIn = w;
        syncWireControls();
        syncSlotControls();
        updatePhysics();
    }

    function handleSlotSlider(event) {
        setSlotSize(parseFloatSafe(event.target.value, state.slotSizeIn));
    }

    function handleSlotInput(event) {
        setSlotSize(parseFloatSafe(event.target.value, state.slotSizeIn));
    }

    function handleSlotPreset(event) {
        setSlotSize(parseFloatSafe(event.target.value, state.slotSizeIn));
    }

    function handleWireHeightSlider(event) {
        setWireSize(parseFloatSafe(event.target.value, state.wireHeightIn), state.wireWidthIn);
    }

    function handleWireHeightInput(event) {
        setWireSize(parseFloatSafe(event.target.value, state.wireHeightIn), state.wireWidthIn);
    }

    function handleWireWidthSlider(event) {
        setWireSize(state.wireHeightIn, parseFloatSafe(event.target.value, state.wireWidthIn));
    }

    function handleWireWidthInput(event) {
        setWireSize(state.wireHeightIn, parseFloatSafe(event.target.value, state.wireWidthIn));
    }

    function handleWirePreset(event) {
        const parts = event.target.value.replace(/\s+/g, "").split("x");
        if (parts.length !== 2) {
            return;
        }
        const h = parseFloatSafe(parts[0], state.wireHeightIn);
        const w = parseFloatSafe(parts[1], state.wireWidthIn);
        setWireSize(h, w);
    }

    function toggleTheme() {
        state.theme = state.theme === "dark" ? "light" : "dark";
        applyTheme();
        draw();
        queueSave();
    }

    function toggleEquation() {
        state.showEquation = !state.showEquation;
        updateEquationToggleLabel();
        draw();
        queueSave();
    }

    function exportCsv() {
        const timestamp = new Date().toISOString().replace("T", " ").replace(/\..+/, "");
        const angleDeg = state.latestThetaTrue == null ? "" : (state.latestThetaTrue * 180 / Math.PI).toFixed(6);
        const rows = [
            ["timestamp", "version", "slot_size_in", "wire_h_in", "wire_w_in", "play_angle_deg"],
            [timestamp, verNumber, round4(state.slotSizeIn).toFixed(6), round4(state.wireHeightIn).toFixed(6), round4(state.wireWidthIn).toFixed(6), angleDeg]
        ];
        const csv = rows.map((row) => row.join(",")).join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `play_calculator_${Date.now()}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    function draw() {
        const canvas = els.canvas;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }
        const dpr = window.devicePixelRatio || 1;
        const cssWidth = canvas.clientWidth;
        const cssHeight = canvas.clientHeight;
        if (cssWidth === 0 || cssHeight === 0) {
            return;
        }
        const needResize = canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr);
        if (needResize) {
            canvas.width = Math.floor(cssWidth * dpr);
            canvas.height = Math.floor(cssHeight * dpr);
        }
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const theme = THEMES[state.theme];
        ctx.fillStyle = theme.canvasBg;
        ctx.fillRect(0, 0, cssWidth, cssHeight);

        const maxCanvasHeight = cssHeight * 0.85;
        const boundedHeight = Math.min(cssHeight, maxCanvasHeight);
        const fitsWidth = cssWidth / CANVAS_ASPECT <= boundedHeight;
        const drawWidth = fitsWidth ? cssWidth : boundedHeight * CANVAS_ASPECT;
        const drawHeight = fitsWidth ? cssWidth / CANVAS_ASPECT : boundedHeight;
        const offsetX = (cssWidth - drawWidth) / 2;
        const offsetY = (cssHeight - drawHeight) / 2;

        const baseScaleH = Math.max(50, drawHeight / 440 * 150);
        const baseScaleW = Math.max(50, drawWidth / 650 * 150);
        const slotHeightPx = state.slotSizeIn * INCH_TO_PX * baseScaleH;
        const slotWidthPx = 0.028 * INCH_TO_PX * baseScaleW;
        const wireHeightPx = state.wireHeightIn * INCH_TO_PX * baseScaleH;
        const wireWidthPx = state.wireWidthIn * INCH_TO_PX * baseScaleW;

    ctx.fillStyle = theme.text;
    ctx.font = "14px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    // Canvas title removed per user request.

        const x0 = offsetX + (drawWidth - slotWidthPx) / 2;
        const y0 = offsetY + (drawHeight - slotHeightPx) / 2;
        const x1 = x0 + slotWidthPx;
        const y1 = y0 + slotHeightPx;

        const wireFits = wireHeightPx <= slotHeightPx + 1e-6;
        if (!wireFits) {
            ctx.strokeStyle = theme.slotLine;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y0);
            ctx.lineTo(x1, y1);
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0, y1);
            ctx.moveTo(x0, y1);
            ctx.lineTo(x1, y1);
            ctx.stroke();
            ctx.textBaseline = "middle";
            ctx.fillText("The wire does not fit!", cssWidth / 2, cssHeight / 2);
            updateAngleFooter(null, true);
            ctx.restore();
            return;
        }

        const theta = state.displayTheta;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const centerX = x0 + slotWidthPx / 2;
        const centerY = y0 + slotHeightPx / 2;
        const halfW = wireWidthPx / 2;
        const halfH = wireHeightPx / 2;
        const corners = [
            [ halfW,  halfH],
            [ halfW, -halfH],
            [-halfW, -halfH],
            [-halfW,  halfH]
        ];
        const points = [];
        corners.forEach(([mx, my]) => {
            const rx = mx * cosT - my * sinT;
            const ry = mx * sinT + my * cosT;
            const sx = centerX + rx;
            const sy = centerY - ry;
            points.push([sx, sy]);
        });
        const minX = Math.min(...points.map(([px]) => px));
        const shift = x0 - minX;
        if (Math.abs(shift) > 1e-6) {
            for (const point of points) {
                point[0] += shift;
            }
        }

        ctx.fillStyle = theme.wireFill;
        ctx.beginPath();
        points.forEach(([px, py], index) => {
            if (index === 0) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
        });
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = theme.slotLine;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y0);
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, y1);
        ctx.moveTo(x0, y1);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y0);
        ctx.moveTo(x0, y1);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        const angleLabel = state.latestThetaTrue == null ? "No torque produced!" : `${(state.displayTheta * 180 / Math.PI).toFixed(2)}°`;
        const avgX = points.reduce((sum, [px]) => sum + px, 0) / points.length;
        const avgY = points.reduce((sum, [, py]) => sum + py, 0) / points.length;
        ctx.font = "14px Helvetica, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const metrics = ctx.measureText(angleLabel);
        const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent || 14;
        const paddingX = 8;
        const paddingY = 6;
        const rectX = avgX - metrics.width / 2 - paddingX;
        const rectY = avgY - textHeight / 2 - paddingY;
        const rectW = metrics.width + paddingX * 2;
        const rectH = textHeight + paddingY * 2;
        ctx.strokeStyle = theme.slotLine;
        ctx.lineWidth = 1;
        ctx.strokeRect(rectX, rectY, rectW, rectH);
        ctx.fillStyle = theme.text;
        ctx.fillText(angleLabel, avgX, avgY);

        updateAngleFooter(state.latestThetaTrue, false);
        ctx.restore();
    }

    function updateAngleFooter(thetaTrue, wireTooTall) {
        if (wireTooTall) {
            if (els.angleReadout) els.angleReadout.textContent = "Angle: --°";
            els.equationText.textContent = "";
            els.equationValues.textContent = "";
            return;
        }
        if (thetaTrue == null) {
            if (els.angleReadout) els.angleReadout.textContent = "Angle: No torque produced!";
        } else {
            const displayDeg = state.displayTheta * 180 / Math.PI;
            if (els.angleReadout) els.angleReadout.textContent = `Angle: ${displayDeg.toFixed(2)}°`;
        }
        if (state.showEquation) {
            if (thetaTrue == null) {
                els.equationText.textContent = "theta = asin((W*S - H*sqrt(H^2 + W^2 - S^2)) / (H^2 + W^2))";
            } else {
                els.equationText.textContent = `${state.displayTheta.toFixed(4)} rad = asin((W*S - H*sqrt(H^2 + W^2 - S^2)) / (H^2 + W^2))`;
            }
            els.equationValues.textContent = `S: ${round4(state.slotSizeIn).toFixed(4)} in   H: ${round4(state.wireHeightIn).toFixed(4)} in   W: ${round4(state.wireWidthIn).toFixed(4)} in`;
        } else {
            els.equationText.textContent = "";
            els.equationValues.textContent = "";
        }
    }

    function handleResize() {
        draw();
    }

    function startInitialAnimation() {
        const target = computeContactAngle(
            state.wireWidthIn * INCH_TO_PX,
            state.wireHeightIn * INCH_TO_PX,
            state.slotSizeIn * INCH_TO_PX
        );
        if (target == null) {
            startSpin();
        } else {
            state.latestThetaTrue = target;
            draw();
            animateTo(target);
        }
    }

    function attachListeners() {
        els.slotSlider.addEventListener("input", handleSlotSlider);
        els.slotInput.addEventListener("change", handleSlotInput);
        els.slotPreset.addEventListener("change", handleSlotPreset);

        els.wireHSlider.addEventListener("input", handleWireHeightSlider);
        els.wireHInput.addEventListener("change", handleWireHeightInput);
        els.wireWSlider.addEventListener("input", handleWireWidthSlider);
        els.wireWInput.addEventListener("change", handleWireWidthInput);
        els.wirePreset.addEventListener("change", handleWirePreset);

        els.toggleTheme.addEventListener("click", toggleTheme);
        els.toggleEquation.addEventListener("click", toggleEquation);
        els.exportCsv.addEventListener("click", exportCsv);

        window.addEventListener("resize", handleResize);
        window.addEventListener("beforeunload", () => {
            if (state.saveTimer) {
                window.clearTimeout(state.saveTimer);
                state.saveTimer = null;
            }
            persistSettings();
        });
    }

    function init() {
        loadSettings();
        applyTheme();
        updateEquationToggleLabel();
        syncSlotControls();
        syncWireControls();
        attachListeners();
        draw();
        startInitialAnimation();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
