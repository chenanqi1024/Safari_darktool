const blankFrame = document.getElementById("blank-frame");
const blankDocument = blankFrame.contentDocument;

blankDocument.open();
blankDocument.write(`
<!doctype html>
<html>
<head>
    <style>
        body {
            margin: 0;
            padding: 16px;
            background: #fff9d8;
            color: #252525;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
    </style>
</head>
<body>
    <strong>about:blank frame</strong>
    <p>This content is written after the iframe exists.</p>
</body>
</html>
`);
blankDocument.close();

const mediaCanvas = document.getElementById("media-canvas");
const mediaContext = mediaCanvas?.getContext("2d");

if (mediaContext) {
    const gradient = mediaContext.createLinearGradient(0, 0, mediaCanvas.width, mediaCanvas.height);
    gradient.addColorStop(0, "#ff4d4f");
    gradient.addColorStop(0.35, "#ffdd57");
    gradient.addColorStop(0.7, "#3ddc97");
    gradient.addColorStop(1, "#2684ff");
    mediaContext.fillStyle = gradient;
    mediaContext.fillRect(0, 0, mediaCanvas.width, mediaCanvas.height);

    mediaContext.fillStyle = "#ffffff";
    mediaContext.beginPath();
    mediaContext.arc(68, 52, 28, 0, Math.PI * 2);
    mediaContext.fill();

    mediaContext.fillStyle = "#141414";
    mediaContext.font = "700 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    mediaContext.fillText("RGB", 116, 78);
}

setTimeout(() => {
    const shell = document.getElementById("app-shell");
    const card = document.createElement("div");
    card.style.background = "#ffffff";
    card.style.color = "#202124";
    card.style.border = "1px solid #d9dee8";
    card.style.borderRadius = "8px";
    card.style.padding = "16px";
    card.textContent = "Delayed JavaScript-rendered content";
    shell.append(card);
}, 900);
