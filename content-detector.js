// aeries page detection
function isAeriesPage() {
    const urlContains = window.location.href.includes(".aspx") || window.location.href.includes("aeries");
    const pageText = document.body.textContent || '';
    const hasAeriesVersion = pageText.includes("Aeries Version") || pageText.includes("Aeries Software");

    return urlContains && hasAeriesVersion;
}

setTimeout(() => {
    if (isAeriesPage()) {
        chrome.runtime.sendMessage({ action: "aeriesDetected" });
    }
}, 500);