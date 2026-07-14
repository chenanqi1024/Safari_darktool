import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const extensionResources = path.join(root, "Safari_darktool Extension", "Resources");
const hostApp = path.join(root, "Safari_darktool");

const checks = [];

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function json(relativePath) {
    return JSON.parse(read(relativePath));
}

function assertCheck(name, condition, detail = "") {
    checks.push({ name, ok: Boolean(condition), detail });
}

function includesAll(value, expected) {
    return expected.every((item) => value.includes(item));
}

const manifest = json("Safari_darktool Extension/Resources/manifest.json");
const contentScript = manifest.content_scripts?.[0] || {};
const contentJs = read("Safari_darktool Extension/Resources/content.js");
const popupJs = read("Safari_darktool Extension/Resources/popup.js");
const popupHtml = read("Safari_darktool Extension/Resources/popup.html");
const backgroundJs = read("Safari_darktool Extension/Resources/background.js");
const messages = read("Safari_darktool Extension/Resources/_locales/en/messages.json");
const hostViewController = read("Safari_darktool/ViewController.swift");
const hostHtml = read("Safari_darktool/Resources/Base.lproj/Main.html");
const hostScript = read("Safari_darktool/Resources/Script.js");
const spec = read("Safari_darktool/SPEC.md");
const project = read("Safari_darktool.xcodeproj/project.pbxproj");
const extensionInfo = read("Safari_darktool Extension/Info.plist");

assertCheck("manifest version 3", manifest.manifest_version === 3);
assertCheck("content script matches all urls", contentScript.matches?.includes("<all_urls>"));
assertCheck("content script document_start", contentScript.run_at === "document_start");
assertCheck("content script all frames", contentScript.all_frames === true);
assertCheck("content script match about blank", contentScript.match_about_blank === true);
assertCheck("required permissions", includesAll(manifest.permissions || [], ["activeTab", "scripting", "storage"]));
assertCheck("all urls host permission", manifest.host_permissions?.includes("<all_urls>"));
assertCheck("localized description is product-specific", !messages.includes("tell us what your extension does"));

assertCheck("content default settings fields", includesAll(contentJs, [
    "mode: \"dark\"",
    "skipDarkSites: true",
    "brightness: 100",
    "contrast: 105",
    "sepia: 0",
    "disabledHosts: []",
    "floatingControlEnabled: false",
    "floatingControlHiddenHosts: []",
    "floatingControlPosition: { x: 16, y: 16 }"
]));
assertCheck("content handles original and auto modes", includesAll(contentJs, [
    "settings.mode === \"original\"",
    "settings.mode === \"auto\"",
    "prefers-color-scheme: dark"
]));
assertCheck("content handles host disable and skip dark sites", includesAll(contentJs, [
    "settings.disabledHosts.includes(runtime.host)",
    "settings.skipDarkSites",
    "siteAlreadyLooksDark"
]));
assertCheck("content inserts early style", includesAll(contentJs, [
    "safari-darktool-early-style",
    "insertEarlyStyle"
]));
assertCheck("content handles dynamic pages and css fallback", includesAll(contentJs, [
    "MutationObserver",
    "document.styleSheets",
    "sdt:fetch-css",
    "collectRemoteRules"
]));
assertCheck("content repairs low contrast text", includesAll(contentJs, [
    "luminance(color) < 0.46",
    "palette.text"
]));
assertCheck("content does not use root filter for dark mode", !/html\.\$\{DARK_CLASS\}\s*\{[^}]*filter:/s.test(contentJs));
assertCheck("content protects media colors", includesAll(contentJs, [
    "html.${DARK_CLASS} img",
    "html.${DARK_CLASS} picture",
    "html.${DARK_CLASS} video",
    "html.${DARK_CLASS} canvas",
    "html.${DARK_CLASS} object",
    "html.${DARK_CLASS} embed",
    "html.${DARK_CLASS} svg image",
    "background-color: transparent !important",
    "filter: none !important",
    "opacity: 1 !important",
    "mix-blend-mode: normal !important"
]));
assertCheck("content avoids blanket layout container backgrounds", !includesAll(contentJs, [
    "html.${DARK_CLASS} div,",
    "background-color: ${palette.surfaceBackground} !important;"
]));
assertCheck("content remaps borders without background blanking", includesAll(contentJs, [
    "html.${DARK_CLASS} *:not(img):not(picture):not(video):not(canvas):not(object):not(embed):not(svg)",
    "html.${DARK_CLASS} *::before",
    "outline-color: ${palette.border} !important"
]));
assertCheck("content detects computed light surfaces", includesAll(contentJs, [
    "SURFACE_ATTRIBUTE",
    "scheduleSurfaceScan",
    "markLightSurfaces",
    "getComputedStyle(element)",
    "luminance(background) > 0.72",
    "clearSurfaceMarks"
]));
assertCheck("content surface scan skips media and image backgrounds", includesAll(contentJs, [
    "isMediaElement(element)",
    "hasComputedImageBackground(style)",
    "IMG|PICTURE|VIDEO|CANVAS|SVG|PATH|SOURCE|OBJECT|EMBED|IFRAME"
]));
assertCheck("content skips css background images when rewriting colors", includesAll(contentJs, [
    "hasImageBackground(style)",
    "/(?:url|gradient)\\(/i"
]));
assertCheck("content preserves svg artwork colors", !includesAll(contentJs, [
    "fill: currentColor",
    "stroke: currentColor"
]));
assertCheck("content floating control constraints", includesAll(contentJs, [
    "floatingControlEnabled",
    "isTopFrame()",
    "attachShadow",
    "hideFloatingControlHere",
    "floatingControlPosition"
]));

assertCheck("background fetches css with limit and no credentials", includesAll(backgroundJs, [
    "MAX_CSS_BYTES",
    "sdt:fetch-css",
    "credentials: \"omit\"",
    "fetchCss"
]));

assertCheck("popup controls modes", includesAll(popupHtml, [
    "data-mode=\"dark\"",
    "data-mode=\"original\"",
    "data-mode=\"auto\""
]));
assertCheck("popup controls site, skip, visual, floating", includesAll(popupHtml, [
    "site-enabled",
    "skip-dark-sites",
    "brightness",
    "contrast",
    "sepia",
    "floating-enabled",
    "restore-floating"
]));
assertCheck("popup persists and applies settings", includesAll(popupJs, [
    "browser.storage.local.get",
    "browser.storage.local.set",
    "sdt:settings-changed",
    "executeScript"
]));
assertCheck("popup disables site controls without hostname", includesAll(popupJs, [
    "elements.siteEnabled.disabled = !hasHost",
    "elements.siteNote.hidden = hasHost"
]));

assertCheck("host app queries extension state", hostViewController.includes("getStateOfSafariExtension"));
assertCheck("host app opens Safari settings", hostViewController.includes("showPreferencesForExtension"));
assertCheck("host app handles query failure", includesAll(hostViewController + hostHtml + hostScript, [
    "state-error",
    "Extension status could not be checked"
]));
assertCheck("host app privacy note", hostHtml.includes("Webpage contents are not uploaded"));

assertCheck("extension plist uses Safari web-extension point", extensionInfo.includes("com.apple.Safari.web-extension"));
assertCheck("SPEC baseline matches current project", includesAll(spec, [
    "Safari_darktool.xcodeproj",
    "Safari_darktool Extension/Resources/manifest.json",
    "aicode.qqq.Safari-darktool.Extension"
]));
assertCheck("SPEC links manual fixtures", spec.includes("ManualTests/README.md"));

for (const file of [
    "ManualTests/README.md",
    "ManualTests/index.html",
    "ManualTests/already-dark.html",
    "ManualTests/iframe.html",
    "ManualTests/test-page.js",
    "ManualTests/cross-origin/cross-origin.css"
]) {
    assertCheck(`manual fixture exists: ${file}`, fs.existsSync(path.join(root, file)));
}

const manualIndex = read("ManualTests/index.html");
assertCheck("manual fixture covers frames and cross-origin css", includesAll(manualIndex, [
    "http://127.0.0.1:8124/cross-origin.css",
    "iframe.html",
    "blank-frame",
    "app-shell",
    "low-contrast",
    "computed-surface"
]));
assertCheck("manual fixture covers media color preservation", includesAll(manualIndex, [
    "media-fixture",
    "data:image/svg+xml",
    "background-image",
    "media-canvas",
    "inline-artwork"
]));

assertCheck("host docs excluded from app resources", includesAll(project, [
    "Exceptions for \"Safari_darktool\" folder",
    "AGENTS.md",
    "DESIGN.md",
    "SPEC.md"
]));

const failed = checks.filter((check) => !check.ok);

for (const check of checks) {
    console.log(`${check.ok ? "ok" : "not ok"} - ${check.name}${check.detail ? `: ${check.detail}` : ""}`);
}

if (failed.length > 0) {
    console.error(`\n${failed.length} SPEC verification check(s) failed.`);
    process.exit(1);
}

console.log(`\n${checks.length} SPEC verification checks passed.`);
