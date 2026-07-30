const UNINSTALL_FEEDBACK_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfvYI6df6WsqPEXMP9e_kfyHYp6ODtkVglU-cJCDh5QGbNcmQ/viewform?usp=sharing";
const EDGE_FUNCTION_URL = "https://htxvtjdkalfnujztetmi.supabase.co/functions/v1/gemini-proxy";
const INSTALL_TOKEN_KEY = "installToken";
const INSTALL_USER_ID_KEY = "installUserId";
const LEGACY_CLIENT_KEYS = ["userId", "queryCount", "lastResetDate"];

function configureUninstallFeedbackUrl() {
    chrome.runtime.setUninstallURL(UNINSTALL_FEEDBACK_URL, () => {
        if (chrome.runtime.lastError) {
            console.error("Failed to set uninstall URL:", chrome.runtime.lastError.message);
        }
    });
}

function storageGet(area, defaults) {
    return new Promise((resolve) => {
        area.get(defaults, (data) => resolve(data));
    });
}

function storageSet(area, values) {
    return new Promise((resolve) => {
        area.set(values, () => resolve(!chrome.runtime.lastError));
    });
}

async function getStoredInstallationContext() {
    const syncData = await storageGet(chrome.storage.sync, {
        [INSTALL_TOKEN_KEY]: null,
        [INSTALL_USER_ID_KEY]: null
    });
    if (syncData[INSTALL_TOKEN_KEY]) {
        return {
            installToken: syncData[INSTALL_TOKEN_KEY],
            userId: syncData[INSTALL_USER_ID_KEY] || null
        };
    }

    const localData = await storageGet(chrome.storage.local, {
        [INSTALL_TOKEN_KEY]: null,
        [INSTALL_USER_ID_KEY]: null
    });
    return {
        installToken: localData[INSTALL_TOKEN_KEY] || null,
        userId: localData[INSTALL_USER_ID_KEY] || null
    };
}

async function persistInstallationContext(installToken, userId) {
    const payload = {
        [INSTALL_TOKEN_KEY]: installToken,
        [INSTALL_USER_ID_KEY]: userId || null
    };

    await Promise.all([
        storageSet(chrome.storage.sync, payload),
        storageSet(chrome.storage.local, payload)
    ]);
}

async function registerOrValidateInstallation(existingToken) {
    const headers = {
        "Content-Type": "application/json"
    };
    if (existingToken) {
        headers.Authorization = `Bearer ${existingToken}`;
    }

    const response = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "registerInstallation" })
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || `Installation bootstrap failed (${response.status})`);
    }

    return response.json();
}

async function ensureInstallationContext(forceRefresh = false) {
    const existing = await getStoredInstallationContext();
    const tokenToUse = forceRefresh ? null : existing.installToken;

    const result = await registerOrValidateInstallation(tokenToUse);
    if (!result.installToken || !result.userId) {
        throw new Error("Invalid installation bootstrap response.");
    }

    await persistInstallationContext(result.installToken, result.userId);
    return {
        installToken: result.installToken,
        userId: result.userId
    };
}

function clearLegacyClientRateLimitState() {
    chrome.storage.local.remove(LEGACY_CLIENT_KEYS, () => {
        if (chrome.runtime.lastError) {
            console.warn("Failed to clear legacy keys:", chrome.runtime.lastError.message);
        }
    });
}

chrome.runtime.onInstalled.addListener(() => {
    configureUninstallFeedbackUrl();
    clearLegacyClientRateLimitState();
    ensureInstallationContext(false).catch((err) => {
        console.error("Failed to initialize installation context:", err);
    });
});

chrome.runtime.onStartup.addListener(() => {
    configureUninstallFeedbackUrl();
    ensureInstallationContext(false).catch((err) => {
        console.error("Failed to refresh installation context:", err);
    });
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request?.action === "getInstallationContext") {
        ensureInstallationContext(false)
            .then((context) => sendResponse({ success: true, ...context }))
            .catch(async (_err) => {
                try {
                    const refreshed = await ensureInstallationContext(true);
                    sendResponse({ success: true, ...refreshed });
                } catch (finalErr) {
                    sendResponse({ success: false, error: finalErr.message || "Unable to get installation context." });
                }
            });
        return true;
    }

    return false;
});

configureUninstallFeedbackUrl();
