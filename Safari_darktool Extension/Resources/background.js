const MAX_CSS_BYTES = 1024 * 1024;

browser.runtime.onMessage.addListener((request) => {
    if (!request || request.type !== "sdt:fetch-css") {
        return undefined;
    }

    return fetchCss(request.url);
});

async function fetchCss(rawUrl) {
    const url = normalizeCssUrl(rawUrl);

    if (!url) {
        return { ok: false, error: "Unsupported CSS URL." };
    }

    try {
        const response = await fetch(url, {
            cache: "force-cache",
            credentials: "omit",
            redirect: "follow"
        });

        if (!response.ok) {
            return { ok: false, error: `CSS request failed with ${response.status}.` };
        }

        const text = await response.text();

        return {
            ok: true,
            url: response.url || url,
            text: text.slice(0, MAX_CSS_BYTES),
            truncated: text.length > MAX_CSS_BYTES
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : "CSS request failed."
        };
    }
}

function normalizeCssUrl(rawUrl) {
    if (typeof rawUrl !== "string" || rawUrl.length > 4096) {
        return null;
    }

    try {
        const url = new URL(rawUrl);

        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }

        return url.href;
    } catch {
        return null;
    }
}
