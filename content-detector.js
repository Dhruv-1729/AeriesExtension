// aeries page detection (universal to all school districts)
function isAeriesPage() {
    const urlContains = window.location.href.includes(".aspx") || window.location.href.includes("aeries");
    const pageText = document.body.textContent || '';
    const hasAeriesVersion = pageText.includes("Aeries Version") || pageText.includes("Aeries Software");

    return urlContains && hasAeriesVersion;
}

setTimeout(() => {
    if (isAeriesPage()) {
        chrome.runtime.sendMessage({ action: "aeriesDetected" });
        console.log("Aeries Gradebook website detected");
    }
}, 500);
