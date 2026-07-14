# Safari Dark Tool Manual Tests

These pages provide local fixtures for the `SPEC.md` manual acceptance checklist.
They are intentionally outside the Xcode target directories so they are not
bundled into the app or extension.

## Run

From the repository root:

```bash
python3 -m http.server 8123 --directory ManualTests
```

For the cross-origin CSS fallback case, start a second server:

```bash
python3 -m http.server 8124 --directory ManualTests/cross-origin
```

Then open these pages in Safari after enabling the extension:

- `http://127.0.0.1:8123/index.html`
- `http://127.0.0.1:8123/already-dark.html`

## Checklist

- Bright sections become dark when mode is Dark.
- Original mode restores the page without a refresh.
- Auto follows the current macOS appearance.
- The already-dark page is skipped when "Skip websites that are already dark" is on.
- The iframe and `about:blank` frame are darkened.
- Delayed app-shell content remains readable after it appears.
- Hard-coded dark text becomes readable.
- CSS-variable or runtime-computed white surfaces become dark without hiding
  image-heavy sections.
- Images, canvas drawings, SVG artwork, and background images keep their
  original colors without inversion, gray wash, or Sepia/Contrast filtering.
- Current site disable and restore take effect immediately.
- Popup settings persist after closing and reopening the popup.
- Floating control is absent by default, appears when enabled, can be dragged,
  can be hidden on the current site, and can be restored from the popup.
