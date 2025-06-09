<<<<<<< HEAD
// aeries page detection
=======
// aeries page detection (universal to all school districts)
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
function isAeriesPage() {
    const urlContains = window.location.href.includes(".aspx") || window.location.href.includes("aeries");
    const pageText = document.body.textContent || '';
    const hasAeriesVersion = pageText.includes("Aeries Version") || pageText.includes("Aeries Software");

    return urlContains && hasAeriesVersion;
}

setTimeout(() => {
    if (isAeriesPage()) {
        chrome.runtime.sendMessage({ action: "aeriesDetected" });
<<<<<<< HEAD
    }
}, 500);
=======
        console.log("Aeries Gradebook website detected");
    }
}, 500);
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
