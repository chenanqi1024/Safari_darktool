(() => {
    const RUNTIME_KEY = "__safariDarkToolRuntime";
    const DARK_CLASS = "safari-darktool-active";
    const MAIN_STYLE_ID = "safari-darktool-style";
    const TEMP_STYLE_ID = "safari-darktool-early-style";
    const REMOTE_STYLE_ID = "safari-darktool-css-overrides";
    const FLOATING_ROOT_ID = "safari-darktool-floating-root";
    const SURFACE_ATTRIBUTE = "data-safari-dark-tool-surface";
    const MAX_OVERRIDE_RULES = 900;
    const MAX_REMOTE_STYLESHEETS = 24;
    const MAX_SURFACE_SCAN_ELEMENTS = 1400;

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

    if (globalThis[RUNTIME_KEY]) {
        globalThis[RUNTIME_KEY].refresh("reinjected");
        return;
    }

    const runtime = {
        settings: { ...DEFAULT_SETTINGS },
        host: getEffectiveHost(),
        active: false,
        observer: null,
        refreshTimer: 0,
        cssTimer: 0,
        surfaceTimer: 0,
        cssGeneration: 0,
        fetchedCss: new Map(),
        mediaQuery: window.matchMedia("(prefers-color-scheme: dark)")
    };

    globalThis[RUNTIME_KEY] = {
        refresh: scheduleRefresh
    };

    insertEarlyStyle();
    attachListeners();
    scheduleRefresh("start");

    function attachListeners() {
        browser.runtime.onMessage.addListener((request) => {
            if (request?.type !== "sdt:settings-changed") {
                return undefined;
            }

            scheduleRefresh("message");
            return Promise.resolve({ ok: true });
        });

        browser.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") {
                return;
            }

            const keys = Object.keys(DEFAULT_SETTINGS);
            if (keys.some((key) => key in changes)) {
                scheduleRefresh("storage");
            }
        });

        const refreshForSystemAppearance = () => scheduleRefresh("appearance");
        if (runtime.mediaQuery.addEventListener) {
            runtime.mediaQuery.addEventListener("change", refreshForSystemAppearance);
        } else {
            runtime.mediaQuery.addListener(refreshForSystemAppearance);
        }

        document.addEventListener("DOMContentLoaded", () => scheduleRefresh("dom"), { once: true });
        window.addEventListener("load", () => {
            scheduleRefresh("load");
            scheduleCssCollection();
        }, { once: true });
    }

    function scheduleRefresh(reason) {
        clearTimeout(runtime.refreshTimer);
        runtime.refreshTimer = setTimeout(() => refresh(reason), 0);
    }

    async function refresh() {
        runtime.host = getEffectiveHost();
        runtime.settings = normalizeSettings(await browser.storage.local.get(DEFAULT_SETTINGS));

        if (shouldActivate(runtime.settings)) {
            applyDarkMode(runtime.settings);
        } else {
            removeDarkMode();
        }

        updateFloatingControl();
    }

    function shouldActivate(settings) {
        if (settings.mode === "original") {
            return false;
        }

        if (runtime.host && settings.disabledHosts.includes(runtime.host)) {
            return false;
        }

        if (settings.mode === "auto" && !runtime.mediaQuery.matches) {
            return false;
        }

        if (settings.skipDarkSites && siteAlreadyLooksDark()) {
            return false;
        }

        return true;
    }

    function applyDarkMode(settings) {
        runtime.active = true;
        document.documentElement.classList.add(DARK_CLASS);
        removeElement(TEMP_STYLE_ID);
        upsertMainStyle(settings);
        startObserver();
        scheduleCssCollection();
        scheduleSurfaceScan();
    }

    function removeDarkMode() {
        runtime.active = false;
        document.documentElement.classList.remove(DARK_CLASS);
        removeElement(TEMP_STYLE_ID);
        removeElement(MAIN_STYLE_ID);
        removeElement(REMOTE_STYLE_ID);
        clearSurfaceMarks();
        stopObserver();
    }

    function insertEarlyStyle() {
        if (document.getElementById(TEMP_STYLE_ID)) {
            return;
        }

        const style = document.createElement("style");
        style.id = TEMP_STYLE_ID;
        style.dataset.safariDarkTool = "true";
        style.textContent = `
html {
    background: #111 !important;
    color-scheme: dark !important;
}
`;
        appendToDocument(style);
    }

    function upsertMainStyle(settings) {
        const palette = createPalette(settings);

        upsertStyle(MAIN_STYLE_ID, `
html.${DARK_CLASS} {
    background: ${palette.pageBackground} !important;
    color: ${palette.text} !important;
    color-scheme: dark !important;
}

html.${DARK_CLASS} body {
    background: ${palette.pageBackground} !important;
    color: ${palette.text} !important;
}

html.${DARK_CLASS} body,
html.${DARK_CLASS} main,
html.${DARK_CLASS} article,
html.${DARK_CLASS} section,
html.${DARK_CLASS} aside,
html.${DARK_CLASS} header,
html.${DARK_CLASS} footer,
html.${DARK_CLASS} nav {
    background-color: ${palette.pageBackground} !important;
    color: ${palette.text} !important;
}

html.${DARK_CLASS} form,
html.${DARK_CLASS} table,
html.${DARK_CLASS} tbody,
html.${DARK_CLASS} thead,
html.${DARK_CLASS} tfoot,
html.${DARK_CLASS} tr,
html.${DARK_CLASS} td,
html.${DARK_CLASS} th,
html.${DARK_CLASS} blockquote,
html.${DARK_CLASS} pre,
html.${DARK_CLASS} code,
html.${DARK_CLASS} dialog {
    background-color: ${palette.surfaceBackground} !important;
    border-color: ${palette.border} !important;
}

html.${DARK_CLASS} p,
html.${DARK_CLASS} span,
html.${DARK_CLASS} strong,
html.${DARK_CLASS} em,
html.${DARK_CLASS} small,
html.${DARK_CLASS} label,
html.${DARK_CLASS} legend,
html.${DARK_CLASS} h1,
html.${DARK_CLASS} h2,
html.${DARK_CLASS} h3,
html.${DARK_CLASS} h4,
html.${DARK_CLASS} h5,
html.${DARK_CLASS} h6,
html.${DARK_CLASS} address,
html.${DARK_CLASS} time,
html.${DARK_CLASS} figcaption,
html.${DARK_CLASS} summary {
    color: ${palette.text} !important;
    text-shadow: none !important;
}

html.${DARK_CLASS} a,
html.${DARK_CLASS} a * {
    color: ${palette.link} !important;
}

html.${DARK_CLASS} *:not(img):not(picture):not(video):not(canvas):not(object):not(embed):not(svg),
html.${DARK_CLASS} *::before,
html.${DARK_CLASS} *::after {
    border-color: ${palette.border} !important;
    outline-color: ${palette.border} !important;
}

html.${DARK_CLASS} input,
html.${DARK_CLASS} textarea,
html.${DARK_CLASS} select,
html.${DARK_CLASS} button {
    background-color: ${palette.inputBackground} !important;
    border-color: ${palette.inputBorder} !important;
    color: ${palette.strongText} !important;
    text-shadow: none !important;
}

html.${DARK_CLASS} input::placeholder,
html.${DARK_CLASS} textarea::placeholder {
    color: ${palette.placeholder} !important;
}

html.${DARK_CLASS} hr,
html.${DARK_CLASS} fieldset,
html.${DARK_CLASS} iframe {
    border-color: ${palette.border} !important;
}

html.${DARK_CLASS} [style*="background-color"],
html.${DARK_CLASS} [style*="background:"]:not([style*="url("]):not([style*="gradient("]),
html.${DARK_CLASS} [bgcolor] {
    background-color: ${palette.surfaceBackground} !important;
}

html.${DARK_CLASS} [${SURFACE_ATTRIBUTE}="true"] {
    background-color: ${palette.surfaceBackground} !important;
    color: ${palette.text} !important;
    box-shadow: none !important;
}

html.${DARK_CLASS} [style*="color"] {
    color: ${palette.text} !important;
}

html.${DARK_CLASS} img,
html.${DARK_CLASS} picture,
html.${DARK_CLASS} video,
html.${DARK_CLASS} canvas,
html.${DARK_CLASS} object,
html.${DARK_CLASS} embed,
html.${DARK_CLASS} svg,
html.${DARK_CLASS} svg *,
html.${DARK_CLASS} svg image,
html.${DARK_CLASS} [style*="background-image"],
html.${DARK_CLASS} [style*="background:"][style*="url("] {
    background-color: transparent !important;
    filter: none !important;
    opacity: 1 !important;
    mix-blend-mode: normal !important;
}

html.${DARK_CLASS} #${FLOATING_ROOT_ID} {
    all: initial !important;
    background: transparent !important;
    color: initial !important;
    filter: none !important;
}
`);
    }

    function createPalette(settings) {
        return {
            pageBackground: applyVisualSettings("#111111", settings),
            surfaceBackground: applyVisualSettings("#16181d", settings),
            inputBackground: applyVisualSettings("#202124", settings),
            text: applyVisualSettings("#e8eaed", settings),
            strongText: applyVisualSettings("#f1f3f4", settings),
            placeholder: applyVisualSettings("#aab0bb", settings),
            link: applyVisualSettings("#8ab4f8", settings),
            border: applyVisualSettings("#3a4452", settings),
            inputBorder: applyVisualSettings("#4c5666", settings)
        };
    }

    function applyVisualSettings(hex, settings) {
        const color = parseColor(hex);

        if (!color) {
            return hex;
        }

        const brightness = settings.brightness / 100;
        const contrast = settings.contrast / 100;
        const sepia = settings.sepia / 100;
        let red = color.red * brightness;
        let green = color.green * brightness;
        let blue = color.blue * brightness;

        red = ((red - 128) * contrast) + 128;
        green = ((green - 128) * contrast) + 128;
        blue = ((blue - 128) * contrast) + 128;

        if (sepia > 0) {
            const sepiaRed = (red * 0.393) + (green * 0.769) + (blue * 0.189);
            const sepiaGreen = (red * 0.349) + (green * 0.686) + (blue * 0.168);
            const sepiaBlue = (red * 0.272) + (green * 0.534) + (blue * 0.131);
            red = mixChannel(red, sepiaRed, sepia);
            green = mixChannel(green, sepiaGreen, sepia);
            blue = mixChannel(blue, sepiaBlue, sepia);
        }

        return colorToHex({ red, green, blue });
    }

    function startObserver() {
        if (runtime.observer || !document.documentElement) {
            return;
        }

        runtime.observer = new MutationObserver((mutations) => {
            if (!runtime.active) {
                return;
            }

            const hasPageChange = mutations.some((mutation) => {
                if (isOwnNode(mutation.target)) {
                    return false;
                }

                const addedNodes = Array.from(mutation.addedNodes || []);
                return addedNodes.some((node) => !isOwnNode(node)) || mutation.type === "attributes";
            });

            if (hasPageChange) {
                scheduleCssCollection();
                scheduleSurfaceScan();
                updateFloatingControl();
            }
        });

        runtime.observer.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: [ "class", "style", "bgcolor" ]
        });
    }

    function stopObserver() {
        runtime.observer?.disconnect();
        runtime.observer = null;
    }

    function scheduleCssCollection() {
        clearTimeout(runtime.cssTimer);
        runtime.cssTimer = setTimeout(collectCssOverrides, 350);
    }

    function scheduleSurfaceScan() {
        clearTimeout(runtime.surfaceTimer);
        runtime.surfaceTimer = setTimeout(markLightSurfaces, 220);
    }

    function markLightSurfaces() {
        if (!runtime.active || !document.body) {
            return;
        }

        const disabledStyles = disableOwnStyles();

        try {
            const candidates = collectSurfaceCandidates();

            for (const element of candidates) {
                if (shouldMarkLightSurface(element)) {
                    element.setAttribute(SURFACE_ATTRIBUTE, "true");
                } else {
                    element.removeAttribute(SURFACE_ATTRIBUTE);
                }
            }
        } finally {
            restoreOwnStyles(disabledStyles);
        }
    }

    function collectSurfaceCandidates() {
        const selectors = [
            "div",
            "section",
            "article",
            "aside",
            "header",
            "footer",
            "nav",
            "main",
            "form",
            "table",
            "tbody",
            "thead",
            "tfoot",
            "tr",
            "td",
            "th",
            "ul",
            "ol",
            "li",
            "dl",
            "dt",
            "dd",
            "blockquote",
            "dialog",
            "[role='main']",
            "[role='dialog']",
            "[role='tabpanel']",
            "[class*='card']",
            "[class*='panel']",
            "[class*='box']",
            "[class*='content']",
            "[class*='container']",
            `[${SURFACE_ATTRIBUTE}]`
        ].join(",");

        return Array.from(document.body.querySelectorAll(selectors)).slice(0, MAX_SURFACE_SCAN_ELEMENTS);
    }

    function shouldMarkLightSurface(element) {
        if (!(element instanceof Element) || isOwnNode(element) || isMediaElement(element)) {
            return false;
        }

        const style = getComputedStyle(element);

        if (style.display === "none" || style.display === "contents" || style.visibility === "hidden") {
            return false;
        }

        if (hasComputedImageBackground(style)) {
            return false;
        }

        const rect = element.getBoundingClientRect();
        if (rect.width < 24 || rect.height < 16 || rect.width * rect.height < 480) {
            return false;
        }

        const background = parseColor(style.backgroundColor);
        return Boolean(background && background.alpha > 0.35 && luminance(background) > 0.72);
    }

    function clearSurfaceMarks() {
        clearTimeout(runtime.surfaceTimer);

        if (!document.documentElement) {
            return;
        }

        document.documentElement.querySelectorAll(`[${SURFACE_ATTRIBUTE}]`).forEach((element) => {
            element.removeAttribute(SURFACE_ATTRIBUTE);
        });
    }

    async function collectCssOverrides() {
        if (!runtime.active) {
            return;
        }

        const generation = ++runtime.cssGeneration;
        const overrides = [];
        const blockedHrefs = [];

        for (const sheet of Array.from(document.styleSheets)) {
            if (overrides.length >= MAX_OVERRIDE_RULES) {
                break;
            }

            if (isOwnStyleSheet(sheet)) {
                continue;
            }

            try {
                collectRules(sheet.cssRules, overrides);
            } catch {
                const href = normalizeUrl(sheet.href);
                if (href) {
                    blockedHrefs.push(href);
                }
            }
        }

        const uniqueBlockedHrefs = Array.from(new Set(blockedHrefs)).slice(0, MAX_REMOTE_STYLESHEETS);
        await Promise.allSettled(uniqueBlockedHrefs.map((href) => collectRemoteRules(href, overrides)));

        if (generation !== runtime.cssGeneration || !runtime.active) {
            return;
        }

        upsertStyle(REMOTE_STYLE_ID, overrides.slice(0, MAX_OVERRIDE_RULES).join("\n"));
    }

    async function collectRemoteRules(href, overrides) {
        if (runtime.fetchedCss.has(href)) {
            collectRulesFromCssText(runtime.fetchedCss.get(href), overrides);
            return;
        }

        const response = await browser.runtime.sendMessage({ type: "sdt:fetch-css", url: href });

        if (!response?.ok || typeof response.text !== "string") {
            return;
        }

        runtime.fetchedCss.set(href, response.text);
        collectRulesFromCssText(response.text, overrides);
    }

    function collectRulesFromCssText(cssText, overrides) {
        const doc = document.implementation.createHTMLDocument("safari-dark-tool-css");
        const style = doc.createElement("style");
        style.textContent = cssText;
        doc.head.append(style);

        if (style.sheet) {
            collectRules(style.sheet.cssRules, overrides);
        }
    }

    function collectRules(rules, overrides) {
        if (!rules) {
            return;
        }

        for (const rule of Array.from(rules)) {
            if (overrides.length >= MAX_OVERRIDE_RULES) {
                return;
            }

            if (rule.type === CSSRule.STYLE_RULE) {
                const override = buildOverride(rule);
                if (override) {
                    overrides.push(override);
                }
                continue;
            }

            if (rule.cssRules) {
                try {
                    collectRules(rule.cssRules, overrides);
                } catch {
                    // Nested cross-origin imports are optional compatibility data.
                }
            }
        }
    }

    function buildOverride(rule) {
        const declarations = [];
        const style = rule.style;
        const palette = createPalette(runtime.settings);
        const hasVisualBackground = hasImageBackground(style);
        const background = parseColor(style.backgroundColor || style.getPropertyValue("background-color"));
        const color = parseColor(style.color);
        const border = parseColor(style.borderColor || style.borderTopColor);

        if (!hasVisualBackground && background && background.alpha > 0.05 && luminance(background) > 0.42) {
            declarations.push(`background-color: ${palette.surfaceBackground} !important`);
        }

        if (color && color.alpha > 0.05 && luminance(color) < 0.46) {
            declarations.push(`color: ${palette.text} !important`);
        }

        if (border && border.alpha > 0.05 && luminance(border) > 0.45) {
            declarations.push(`border-color: ${palette.border} !important`);
        }

        const boxShadow = style.boxShadow || style.getPropertyValue("box-shadow");
        if (boxShadow && /rgba?\(\s*2(?:4\d|5[0-5])/.test(boxShadow)) {
            declarations.push("box-shadow: none !important");
        }

        if (!declarations.length) {
            return "";
        }

        const selectors = splitSelectorList(rule.selectorText)
            .map(scopeSelector)
            .filter(Boolean);

        if (!selectors.length) {
            return "";
        }

        return `${selectors.join(", ")} { ${declarations.join("; ")}; }`;
    }

    function hasImageBackground(style) {
        const backgroundImage = style.backgroundImage || style.getPropertyValue("background-image") || "";
        const background = style.background || style.getPropertyValue("background") || "";
        return /(?:url|gradient)\(/i.test(`${backgroundImage} ${background}`);
    }

    function hasComputedImageBackground(style) {
        const backgroundImage = style.backgroundImage || "";
        return Boolean(backgroundImage && backgroundImage !== "none");
    }

    function scopeSelector(selector) {
        const trimmed = selector.trim();

        if (!trimmed || trimmed.includes(FLOATING_ROOT_ID)) {
            return "";
        }

        if (trimmed.startsWith(":root")) {
            return trimmed.replace(":root", `html.${DARK_CLASS}`);
        }

        if (/^html(\b|[.#:[>+~ ])/i.test(trimmed)) {
            return trimmed.replace(/^html/i, `html.${DARK_CLASS}`);
        }

        return `html.${DARK_CLASS} ${trimmed}`;
    }

    function splitSelectorList(selectorText) {
        const selectors = [];
        let depth = 0;
        let start = 0;

        for (let index = 0; index < selectorText.length; index += 1) {
            const char = selectorText[index];

            if (char === "(" || char === "[") {
                depth += 1;
            } else if (char === ")" || char === "]") {
                depth = Math.max(0, depth - 1);
            } else if (char === "," && depth === 0) {
                selectors.push(selectorText.slice(start, index));
                start = index + 1;
            }
        }

        selectors.push(selectorText.slice(start));
        return selectors;
    }

    function updateFloatingControl() {
        const shouldShow = isTopFrame()
            && runtime.settings.floatingControlEnabled
            && runtime.host
            && !runtime.settings.floatingControlHiddenHosts.includes(runtime.host);

        if (!shouldShow) {
            removeElement(FLOATING_ROOT_ID);
            return;
        }

        const root = ensureFloatingRoot();
        const toggleButton = root.shadowRoot.querySelector("[data-action='toggle']");
        const enabledHere = !runtime.settings.disabledHosts.includes(runtime.host);

        toggleButton.textContent = enabledHere ? "On" : "Off";
        toggleButton.title = enabledHere ? "Disable on this site" : "Enable on this site";
    }

    function ensureFloatingRoot() {
        let root = document.getElementById(FLOATING_ROOT_ID);

        if (root) {
            positionFloatingRoot(root, runtime.settings.floatingControlPosition);
            return root;
        }

        root = document.createElement("div");
        root.id = FLOATING_ROOT_ID;
        root.dataset.safariDarkTool = "true";
        root.style.setProperty("position", "fixed", "important");
        root.style.setProperty("z-index", "2147483647", "important");
        root.style.setProperty("background", "transparent", "important");
        root.style.setProperty("filter", "none", "important");
        root.attachShadow({ mode: "open" });
        root.shadowRoot.innerHTML = `
<style>
:host {
    all: initial;
}

.panel {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 8px;
    background: rgba(22, 24, 29, 0.72);
    color: #f1f3f4;
    font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
}

button {
    min-width: 34px;
    height: 26px;
    border: 0;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.14);
    color: inherit;
    font: inherit;
}

button:focus-visible {
    outline: 2px solid #8ab4f8;
    outline-offset: 2px;
}

.handle {
    cursor: grab;
}
</style>
<div class="panel" part="panel">
    <button class="handle" type="button" title="Drag">Move</button>
    <button data-action="toggle" type="button">On</button>
    <button data-action="hide" type="button" title="Hide on this site">Hide</button>
</div>
`;

        root.shadowRoot.querySelector("[data-action='toggle']").addEventListener("click", toggleCurrentSite);
        root.shadowRoot.querySelector("[data-action='hide']").addEventListener("click", hideFloatingControlHere);
        root.shadowRoot.querySelector(".handle").addEventListener("pointerdown", (event) => beginFloatingDrag(event, root));

        positionFloatingRoot(root, runtime.settings.floatingControlPosition);
        appendToDocument(root);
        return root;
    }

    function beginFloatingDrag(event, root) {
        event.preventDefault();

        const startX = event.clientX;
        const startY = event.clientY;
        const rect = root.getBoundingClientRect();
        const origin = { x: rect.left, y: rect.top };

        const move = (moveEvent) => {
            const next = clampPosition({
                x: origin.x + moveEvent.clientX - startX,
                y: origin.y + moveEvent.clientY - startY
            });
            positionFloatingRoot(root, next);
            runtime.settings.floatingControlPosition = next;
        };

        const end = async () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", end);
            await browser.storage.local.set({ floatingControlPosition: runtime.settings.floatingControlPosition });
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end, { once: true });
    }

    async function toggleCurrentSite() {
        if (!runtime.host) {
            return;
        }

        const disabledHosts = runtime.settings.disabledHosts.includes(runtime.host)
            ? runtime.settings.disabledHosts.filter((host) => host !== runtime.host)
            : Array.from(new Set([ ...runtime.settings.disabledHosts, runtime.host ])).sort();

        await browser.storage.local.set({ disabledHosts });
        runtime.settings.disabledHosts = disabledHosts;
        scheduleRefresh("floating-toggle");
    }

    async function hideFloatingControlHere() {
        if (!runtime.host) {
            return;
        }

        const floatingControlHiddenHosts = Array.from(new Set([
            ...runtime.settings.floatingControlHiddenHosts,
            runtime.host
        ])).sort();

        await browser.storage.local.set({ floatingControlHiddenHosts });
        runtime.settings.floatingControlHiddenHosts = floatingControlHiddenHosts;
        removeElement(FLOATING_ROOT_ID);
    }

    function positionFloatingRoot(root, position) {
        const next = clampPosition(position);
        root.style.setProperty("left", `${next.x}px`, "important");
        root.style.setProperty("top", `${next.y}px`, "important");
    }

    function clampPosition(position) {
        const maxX = Math.max(8, window.innerWidth - 128);
        const maxY = Math.max(8, window.innerHeight - 48);

        return {
            x: Math.min(maxX, Math.max(8, Number(position?.x) || 16)),
            y: Math.min(maxY, Math.max(8, Number(position?.y) || 16))
        };
    }

    function siteAlreadyLooksDark() {
        const disabledStyles = disableOwnStyles();
        const hadClass = document.documentElement.classList.contains(DARK_CLASS);
        document.documentElement.classList.remove(DARK_CLASS);

        try {
            const colorSchemeMeta = Array.from(document.querySelectorAll("meta[name='color-scheme'], meta[name='supported-color-schemes']"))
                .map((meta) => meta.getAttribute("content") || "")
                .join(" ")
                .toLowerCase();

            const bodyColor = getUsableBackgroundColor(document.body);
            const htmlColor = getUsableBackgroundColor(document.documentElement);
            const background = bodyColor || htmlColor;

            if (background && luminance(background) < 0.28) {
                return true;
            }

            return colorSchemeMeta.includes("dark") && !colorSchemeMeta.includes("light");
        } finally {
            if (hadClass) {
                document.documentElement.classList.add(DARK_CLASS);
            }
            restoreOwnStyles(disabledStyles);
        }
    }

    function getUsableBackgroundColor(element) {
        if (!element) {
            return null;
        }

        const color = parseColor(getComputedStyle(element).backgroundColor);

        if (!color || color.alpha < 0.2) {
            return null;
        }

        return color;
    }

    function disableOwnStyles() {
        const disabled = [];

        for (const id of [ TEMP_STYLE_ID, MAIN_STYLE_ID, REMOTE_STYLE_ID ]) {
            const style = document.getElementById(id);

            if (style?.sheet) {
                disabled.push([ style, style.disabled ]);
                style.disabled = true;
            }
        }

        return disabled;
    }

    function restoreOwnStyles(disabled) {
        for (const [ style, wasDisabled ] of disabled) {
            style.disabled = wasDisabled;
        }
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

    function mixChannel(first, second, amount) {
        return first + ((second - first) * amount);
    }

    function colorToHex(color) {
        return `#${[ color.red, color.green, color.blue ].map((channel) => {
            return clampNumber(channel, 0, 255, 0).toString(16).padStart(2, "0");
        }).join("")}`;
    }

    function parseColor(value) {
        if (!value || value === "transparent") {
            return null;
        }

        const rgbMatch = value.match(/rgba?\(([^)]+)\)/i);
        if (rgbMatch) {
            const parts = rgbMatch[1]
                .trim()
                .split(/[,\s/]+/)
                .filter(Boolean);

            if (parts.length >= 3) {
                return {
                    red: parseCssColorChannel(parts[0]),
                    green: parseCssColorChannel(parts[1]),
                    blue: parseCssColorChannel(parts[2]),
                    alpha: parts[3] === undefined ? 1 : parseCssAlpha(parts[3])
                };
            }
        }

        const hexMatch = value.match(/#([0-9a-f]{3,8})\b/i);
        if (!hexMatch) {
            return null;
        }

        const hex = hexMatch[1];

        if (hex.length === 3 || hex.length === 4) {
            return {
                red: parseInt(hex[0] + hex[0], 16),
                green: parseInt(hex[1] + hex[1], 16),
                blue: parseInt(hex[2] + hex[2], 16),
                alpha: hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1
            };
        }

        return {
            red: parseInt(hex.slice(0, 2), 16),
            green: parseInt(hex.slice(2, 4), 16),
            blue: parseInt(hex.slice(4, 6), 16),
            alpha: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
        };
    }

    function parseCssColorChannel(value) {
        if (value.endsWith("%")) {
            return clampNumber((parseFloat(value) / 100) * 255, 0, 255, 0);
        }

        return clampNumber(parseFloat(value), 0, 255, 0);
    }

    function parseCssAlpha(value) {
        if (value.endsWith("%")) {
            return Math.min(1, Math.max(0, parseFloat(value) / 100));
        }

        return Math.min(1, Math.max(0, parseFloat(value)));
    }

    function luminance(color) {
        const channels = [ color.red, color.green, color.blue ].map((channel) => {
            const scaled = channel / 255;
            return scaled <= 0.03928
                ? scaled / 12.92
                : ((scaled + 0.055) / 1.055) ** 2.4;
        });

        return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
    }

    function isOwnStyleSheet(sheet) {
        const owner = sheet.ownerNode;
        return owner?.dataset?.safariDarkTool === "true"
            || owner?.id === MAIN_STYLE_ID
            || owner?.id === TEMP_STYLE_ID
            || owner?.id === REMOTE_STYLE_ID;
    }

    function isOwnNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        return node.dataset?.safariDarkTool === "true"
            || node.id === FLOATING_ROOT_ID
            || Boolean(node.closest?.(`#${FLOATING_ROOT_ID}, [data-safari-dark-tool="true"]`));
    }

    function isMediaElement(element) {
        return /^(IMG|PICTURE|VIDEO|CANVAS|SVG|PATH|SOURCE|OBJECT|EMBED|IFRAME)$/i.test(element.tagName)
            || Boolean(element.closest?.("svg, picture"));
    }

    function getEffectiveHost() {
        if (location.hostname) {
            return location.hostname;
        }

        const ancestorOrigin = document.location.ancestorOrigins?.[0];
        if (ancestorOrigin) {
            const host = getHostFromUrl(ancestorOrigin);
            if (host) {
                return host;
            }
        }

        return getHostFromUrl(document.referrer);
    }

    function getHostFromUrl(url) {
        if (!url) {
            return "";
        }

        try {
            return new URL(url).hostname;
        } catch {
            return "";
        }
    }

    function normalizeUrl(url) {
        if (!url) {
            return "";
        }

        try {
            const parsed = new URL(url, document.baseURI);
            return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
        } catch {
            return "";
        }
    }

    function isTopFrame() {
        try {
            return window.top === window;
        } catch {
            return false;
        }
    }

    function upsertStyle(id, text) {
        let style = document.getElementById(id);

        if (!text) {
            removeElement(id);
            return null;
        }

        if (!style) {
            style = document.createElement("style");
            style.id = id;
            style.dataset.safariDarkTool = "true";
            appendToDocument(style);
        }

        if (style.textContent !== text) {
            style.textContent = text;
        }

        return style;
    }

    function removeElement(id) {
        document.getElementById(id)?.remove();
    }

    function appendToDocument(node) {
        if (node.tagName === "STYLE") {
            (document.head || document.documentElement || document).append(node);
            return;
        }

        (document.body || document.documentElement || document).append(node);
    }
})();
