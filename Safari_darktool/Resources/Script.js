const openPreferencesButton = document.querySelector("button.open-preferences");
const stateErrorDetail = document.querySelector(".status-detail.state-error");

function show(enabled, useSettingsInsteadOfPreferences, errorMessage) {
    const destination = useSettingsInsteadOfPreferences ? "Safari Settings" : "Safari Extensions Preferences";

    openPreferencesButton.textContent = `Open ${destination}`;

    if (errorMessage) {
        setError(`Extension status could not be checked: ${errorMessage}`);
        return;
    }

    document.body.classList.toggle("state-on", enabled === true);
    document.body.classList.toggle("state-off", enabled === false);
    document.body.classList.remove("state-error");

    if (typeof enabled !== "boolean") {
        document.body.classList.remove("state-on");
        document.body.classList.remove("state-off");
    }
}

function showPreferenceError(errorMessage) {
    setError(`Could not open Safari Settings: ${errorMessage}`);
}

function setError(message) {
    stateErrorDetail.textContent = message;
    document.body.classList.remove("state-on");
    document.body.classList.remove("state-off");
    document.body.classList.add("state-error");
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

openPreferencesButton.addEventListener("click", openPreferences);
