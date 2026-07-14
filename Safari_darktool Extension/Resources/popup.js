const DEFAULT_SETTINGS = {
    mode: "dark",
    skipDarkSites: true,
    brightness: 100,
    contrast: 105,
    sepia: 0,
    disabledHosts: [],
    floatingControlEnabled: false,
    floatingControlHiddenHosts: [],
    floatingControlPosition: { x: 16, y: 16 }
};

const state = {
    settings: { ...DEFAULT_SETTINGS },
    tab: null,
    host: "",
    saveTimer: null
};

const elements = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
    bindElements();
    bindEvents();

    state.settings = normalizeSettings(await browser.storage.local.get(DEFAULT_SETTINGS));
    state.tab = await getActiveTab();
    state.host = getHostname(state.tab?.url);

    render();
}

function bindElements() {
    elements.siteLabel = document.getElementById("site-label");
    elements.statusPill = document.getElementById("status-pill");
    elements.modeButtons = Array.from(document.querySelectorAll("[data-mode]"));
    elements.siteEnabled = document.getElementById("site-enabled");
    elements.siteNote = document.getElementById("site-note");
    elements.skipDarkSites = document.getElementById("skip-dark-sites");
    elements.brightness = document.getElementById("brightness");
    elements.brightnessValue = document.getElementById("brightness-value");
    elements.contrast = document.getElementById("contrast");
    elements.contrastValue = document.getElementById("contrast-value");
    elements.sepia = document.getElementById("sepia");
    elements.sepiaValue = document.getElementById("sepia-value");
    elements.floatingEnabled = document.getElementById("floating-enabled");
    elements.restoreFloating = document.getElementById("restore-floating");
    elements.statusMessage = document.getElementById("status-message");
}

function bindEvents() {
    elements.modeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            state.settings.mode = button.dataset.mode;
            render();
            saveAndApply();
        });
    });

    elements.siteEnabled.addEventListener("change", () => {
        if (!state.host) {
            return;
        }

        state.settings.disabledHosts = setHostEnabled(
            state.settings.disabledHosts,
            state.host,
            elements.siteEnabled.checked
        );
        render();
        saveAndApply();
    });

    elements.skipDarkSites.addEventListener("change", () => {
        state.settings.skipDarkSites = elements.skipDarkSites.checked;
        saveAndApply();
    });

    bindSlider(elements.brightness, "brightness", elements.brightnessValue);
    bindSlider(elements.contrast, "contrast", elements.contrastValue);
    bindSlider(elements.sepia, "sepia", elements.sepiaValue);

    elements.floatingEnabled.addEventListener("change", () => {
        state.settings.floatingControlEnabled = elements.floatingEnabled.checked;
        render();
        saveAndApply();
    });

    elements.restoreFloating.addEventListener("click", () => {
        if (!state.host) {
            return;
        }

        state.settings.floatingControlHiddenHosts = removeHost(
            state.settings.floatingControlHiddenHosts,
            state.host
        );
        render();
        saveAndApply();
    });
}

function bindSlider(input, key, output) {
    input.addEventListener("input", () => {
        state.settings[key] = Number(input.value);
        output.value = `${input.value}%`;
        saveAndApplySoon();
    });
}

function render() {
    const hasHost = Boolean(state.host);
    const siteEnabled = hasHost && !state.settings.disabledHosts.includes(state.host);
    const autoIsDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const isActive = state.settings.mode === "dark" || (state.settings.mode === "auto" && autoIsDark);
    const hiddenHere = hasHost && state.settings.floatingControlHiddenHosts.includes(state.host);

    elements.siteLabel.textContent = hasHost ? state.host : "No active site";
    elements.statusPill.textContent = isActive ? "Active" : "Original";
    elements.statusPill.classList.toggle("active", isActive);

    elements.modeButtons.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.mode === state.settings.mode));
    });

    elements.siteEnabled.checked = siteEnabled;
    elements.siteEnabled.disabled = !hasHost;
    elements.siteNote.hidden = hasHost;

    elements.skipDarkSites.checked = state.settings.skipDarkSites;
    elements.brightness.value = state.settings.brightness;
    elements.brightnessValue.value = `${state.settings.brightness}%`;
    elements.contrast.value = state.settings.contrast;
    elements.contrastValue.value = `${state.settings.contrast}%`;
    elements.sepia.value = state.settings.sepia;
    elements.sepiaValue.value = `${state.settings.sepia}%`;

    elements.floatingEnabled.checked = state.settings.floatingControlEnabled;
    elements.restoreFloating.disabled = !hasHost || !hiddenHere;
}

function saveAndApplySoon() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveAndApply, 120);
}

async function saveAndApply() {
    clearTimeout(state.saveTimer);
    setStatus("Saving...");

    try {
        await browser.storage.local.set(state.settings);
        await notifyActiveTab();
        setStatus("Applied to this page.");
    } catch (error) {
        setStatus(error instanceof Error ? error.message : "Saved, but this page may need a refresh.");
    }
}

async function notifyActiveTab() {
    if (!state.tab?.id || !canInjectIntoUrl(state.tab.url)) {
        return;
    }

    try {
        await browser.tabs.sendMessage(state.tab.id, { type: "sdt:settings-changed" });
        return;
    } catch {
        await injectContentScript(state.tab.id);
    }

    await browser.tabs.sendMessage(state.tab.id, { type: "sdt:settings-changed" });
}

async function injectContentScript(tabId) {
    if (browser.scripting?.executeScript) {
        await browser.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: [ "content.js" ]
        });
        return;
    }

    if (browser.tabs?.executeScript) {
        await browser.tabs.executeScript(tabId, {
            file: "content.js",
            allFrames: true
        });
    }
}

async function getActiveTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
}

function getHostname(url) {
    if (!url) {
        return "";
    }

    try {
        const parsed = new URL(url);
        return parsed.hostname || "";
    } catch {
        return "";
    }
}

function canInjectIntoUrl(url) {
    if (!url) {
        return false;
    }

    try {
        const protocol = new URL(url).protocol;
        return protocol === "http:" || protocol === "https:" || protocol === "file:";
    } catch {
        return false;
    }
}

function setHostEnabled(hosts, host, enabled) {
    if (enabled) {
        return removeHost(hosts, host);
    }

    return Array.from(new Set([ ...hosts, host ])).sort();
}

function removeHost(hosts, host) {
    return hosts.filter((item) => item !== host);
}

function normalizeSettings(raw) {
    const settings = {
        ...DEFAULT_SETTINGS,
        ...raw,
        floatingControlPosition: {
            ...DEFAULT_SETTINGS.floatingControlPosition,
            ...(raw.floatingControlPosition || {})
        }
    };

    if (!["dark", "original", "auto"].includes(settings.mode)) {
        settings.mode = DEFAULT_SETTINGS.mode;
    }

    settings.brightness = clampNumber(settings.brightness, 60, 140, DEFAULT_SETTINGS.brightness);
    settings.contrast = clampNumber(settings.contrast, 60, 160, DEFAULT_SETTINGS.contrast);
    settings.sepia = clampNumber(settings.sepia, 0, 100, DEFAULT_SETTINGS.sepia);
    settings.disabledHosts = Array.isArray(settings.disabledHosts) ? settings.disabledHosts : [];
    settings.floatingControlHiddenHosts = Array.isArray(settings.floatingControlHiddenHosts)
        ? settings.floatingControlHiddenHosts
        : [];
    settings.floatingControlEnabled = Boolean(settings.floatingControlEnabled);
    settings.skipDarkSites = settings.skipDarkSites !== false;

    return settings;
}

function clampNumber(value, min, max, fallback) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, Math.round(number)));
}

function setStatus(message) {
    elements.statusMessage.textContent = message;
}
