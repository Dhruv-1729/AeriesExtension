
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbw6J8_Wgqu-iRs2FFLk7vwbvZsZLEYm0m8P7X_pYn4N8fLeQgKaLW34CgXAse1jY7eF/exec';
let aiHistory = [];
const RATE_LIMIT_ENABLED = true;
const MAX_QUERIES_PER_PERIOD = 3;
const RATE_LIMIT_RESET_HOURS = 24;
async function getOrCreateUserId() {
    return new Promise(async (resolve) => {
        chrome.storage.local.get({ userId: null, queryCount: 0, lastResetDate: null }, async (data) => {
            let userId = data.userId;

            if (!userId) {
                // fetch from sever
                let idhist = [];
                try {
                    const response = await fetch(`${ENDPOINT}?action=getIdHist`, {
                        credentials: 'omit'
                    });
                    if (response.ok) {
                        const result = await response.json();
                        idhist = result.idHist || [];
                    }
                } catch (error) {
                    console.error("Error fetching idhist:", error);

                }

                // make unique userid
                do {
                    userId = Math.floor(Math.random() * 10000) + 1;
                } while (idhist.includes(userId));

                // push to server
                try {
                    await fetch(ENDPOINT, {
                        method: "POST",
                        headers: { "Content-Type": "text/plain" },
                        body: JSON.stringify({ action: 'addToIdHist', userId })
                    });
                } catch (error) {
                    console.error("Error adding to idhist:", error);
                }

                chrome.storage.local.set({ userId }, () => {
                    resolve(userId);
                });
            } else {
                resolve(userId);
            }
        });
    });
}

async function isUserWhitelisted() {
    try {
        const userId = String(await getOrCreateUserId());

        const response = await fetch(`${ENDPOINT}?action=getWhitelist`, {
            credentials: 'omit'
        });
        if (!response.ok) return false;

        const data = await response.json();
        const allowedIds = data.allowedIds || [];

        return allowedIds.includes(userId);
    } catch (error) {
        console.error("Error checking whitelist:", error);
        return false; // failsafe
    }
}

// ratelimit
async function checkRateLimit() {
    if (!RATE_LIMIT_ENABLED) return { allowed: true, remaining: Infinity };

    return new Promise((resolve) => {
        chrome.storage.local.get({ queryCount: 0, lastResetDate: null }, (data) => {
            const now = new Date();
            const lastReset = data.lastResetDate ? new Date(data.lastResetDate) : null;


            let queryCount = data.queryCount || 0;
            if (!lastReset || (now - lastReset) >= (RATE_LIMIT_RESET_HOURS * 60 * 60 * 1000)) {
                queryCount = 0;
                chrome.storage.local.set({
                    queryCount: 0,
                    lastResetDate: now.toISOString()
                });
            }

            const allowed = queryCount < MAX_QUERIES_PER_PERIOD;
            const remaining = Math.max(0, MAX_QUERIES_PER_PERIOD - queryCount);

            resolve({ allowed, remaining, count: queryCount });
        });
    });
}


async function incrementRateLimit() {
    return new Promise((resolve) => {
        chrome.storage.local.get({ queryCount: 0, lastResetDate: null }, (data) => {
            const now = new Date();
            const lastReset = data.lastResetDate ? new Date(data.lastResetDate) : null;


            let queryCount = data.queryCount || 0;
            if (!lastReset || (now - lastReset) >= (RATE_LIMIT_RESET_HOURS * 60 * 60 * 1000)) {
                queryCount = 0;
            }

            const newCount = queryCount + 1;
            chrome.storage.local.set({
                queryCount: newCount,
                lastResetDate: now.toISOString()
            }, () => {
                resolve(newCount);
            });
        });
    });
}

function renderAssignmentsList() {
    const assignmentsList = document.getElementById("assignmentsList");

    if (!assignmentsList) return;

    assignmentsList.innerHTML = "";

    if (whatIfAssignments.length === 0) {
        assignmentsList.innerHTML = '<p class="no-assignments">No assignments added yet.</p>';
        return;
    }

    whatIfAssignments.forEach((assignment, index) => {
        const assignmentItem = document.createElement("div");
        assignmentItem.className = "assignment-item";

        if (assignment.type === 'removed') {
            assignmentItem.innerHTML = `
                <div class="assignment-info">
                    <span class="assignment-category">${assignment.categoryName}</span>
                    <span class="assignment-score" style="color: #c9302c;">${assignment.name} <strong>[REMOVED]</strong></span>
                </div>
                <div class="assignment-actions">
                    <button class="undo-btn" data-index="${index}">Undo</button>
                </div>
            `;
        } else {
            assignmentItem.innerHTML = `
                <div class="assignment-info">
                    <span class="assignment-category">${assignment.categoryName}</span>
                    <span class="assignment-score">${assignment.earned}/${assignment.max} points</span>
                </div>
                <div class="assignment-actions">
                    <button class="edit-btn" data-index="${index}">Edit</button>
                    <button class="delete-btn" data-index="${index}">×</button>
                </div>
            `;
        }
        assignmentsList.appendChild(assignmentItem);
    });

    document.querySelectorAll(".edit-btn").forEach(button => {
        button.addEventListener("click", function () {
            const index = parseInt(this.getAttribute("data-index"));
            editAssignment(index);
        });
    });

    document.querySelectorAll(".delete-btn").forEach(button => {
        button.addEventListener("click", function () {
            const index = parseInt(this.getAttribute("data-index"));
            deleteAssignment(index);
        });
    });

    document.querySelectorAll(".undo-btn").forEach(button => {
        button.addEventListener("click", function () {
            const index = parseInt(this.getAttribute("data-index"));
            undoRemoveAssignment(index);
        });
    });
}


function saveGrade(grade, teacher) {
    return new Promise((resolve) => {
        const currentDate = new Date().toLocaleString();
        chrome.storage.local.get({ gradesByTeacher: {} }, (data) => {
            const gradesByTeacher = data.gradesByTeacher || {};
            if (!gradesByTeacher[teacher]) {
                gradesByTeacher[teacher] = [];
            }
            const lastGradeEntry = gradesByTeacher[teacher][0];
            if (lastGradeEntry && parseFloat(lastGradeEntry.grade) === parseFloat(grade)) {
                resolve(false);
                return;
            }
            gradesByTeacher[teacher].unshift({ grade, date: currentDate });
            gradesByTeacher[teacher] = gradesByTeacher[teacher].slice(0, 3);
            chrome.storage.local.set({ gradesByTeacher }, () => {
                resolve(!chrome.runtime.lastError);
            });
        });
    });
}

function displayLastGrades(currentTeacher) {
    const historyElement = document.getElementById("history");
    chrome.storage.local.get({ gradesByTeacher: {} }, (data) => {
        const gradesByTeacher = data.gradesByTeacher || {};
        const grades = gradesByTeacher[currentTeacher] || [];

        if (grades.length === 0) {
            historyElement.innerHTML = "<p>No past grades available for this teacher.</p>";
            return;
        }

        let historyHTML = '<h4 style="font-size: 1.2em; color: purple;">Last 3 Grades:</h4>';
        grades.forEach((entry, index, arr) => {
            const prevGrade = arr[index + 1]?.grade;
            let gradeChange = 0;
            let changeSymbol = "";
            let changeColor = "gray";

            if (prevGrade !== undefined) {
                gradeChange = parseFloat(entry.grade) - parseFloat(prevGrade);
                changeColor = gradeChange > 0 ? "green" : gradeChange < 0 ? "red" : "gray";
                changeSymbol = gradeChange > 0 ? "+" : "";
            }

            historyHTML += `
                <div style="margin-bottom: 10px; line-height: 1.5;">
                    <span><strong>${entry.grade}%</strong> (${entry.date})</span>
                    ${prevGrade !== undefined ? `<span style="color: ${changeColor}; margin-left: 5px;">${changeSymbol}${gradeChange.toFixed(2)}%</span>` : ''}
                </div>`;
        });
        historyElement.innerHTML = historyHTML;
    });
}

function showLoader() {
    document.getElementById("result").style.display = "none";
    document.getElementById("loader").style.display = "block";
}

function hideLoader() {
    document.getElementById("loader").style.display = "none";
    document.getElementById("result").style.display = "block";
}

function resetAssignmentForm() {
    const categorySelect = document.getElementById("categorySelect");
    const assignmentSelect = document.getElementById("assignmentSelect");
    const scoreEarned = document.getElementById("scoreEarned");
    const scoreMax = document.getElementById("scoreMax");
    const confirmAssignment = document.getElementById("confirmAssignment");
    const removeAssignmentBtn = document.getElementById("removeAssignmentBtn");

    categorySelect.value = "";
    scoreEarned.value = "";
    scoreMax.value = "";
    confirmAssignment.disabled = true;
    assignmentSelect.innerHTML = '<option value="" disabled selected>Select Assignment</option>';
    assignmentSelect.style.display = "none";
    removeAssignmentBtn.style.display = "none";

    if (confirmAssignment.hasAttribute("data-edit-index")) {
        confirmAssignment.removeAttribute("data-edit-index");
    }
}

function animateGradeChange(element, startValue, endValue) {
    const duration = 1000;
    const startTime = performance.now();
    function updateValue(currentTime) {
        const elapsedTime = currentTime - startTime;
        if (elapsedTime < duration) {
            const progress = elapsedTime / duration;
            const currentValue = startValue + (endValue - startValue) * progress;
            element.textContent = `${currentValue.toFixed(2)}%`;
            requestAnimationFrame(updateValue);
        } else {
            element.textContent = `${endValue.toFixed(2)}%`;
        }
    }
    requestAnimationFrame(updateValue);
}



let currentGradeData = null;
let currentTeacher = null;
let tempAeriesOriginalEarned = null;
let tempAeriesOriginalMax = null;
let tempAeriesAssignmentName = null;
let originalGrade = null;
let whatIfAssignments = [];
let isEditingExistingAssignment = false;
async function displayResult(result) {
    hideLoader();
    aiHistory = []
    const resultElement = document.getElementById("result");
    const resetHistoryContainer = document.getElementById("resetHistoryContainer");

    if (result.success) {
        originalGrade = parseFloat(result.grade);
        currentTeacher = result.teacher;

        resultElement.innerHTML = `
            <div class="grade-label" style="text-align: center;">Overall Grade is</div>
            <div class="grade-container" style="display: flex; flex-direction: column; justify-content: center; align-items: center; position: relative;">
                <div class="grade-value">${result.grade}%</div>
            </div>
        `;

        let calculateIcon = document.querySelector(".calculate-icon");
        if (!calculateIcon) {
            calculateIcon = document.createElement("img");
            calculateIcon.className = "calculate-icon";
            calculateIcon.addEventListener("click", toggleWhatIfMode);
        }
        calculateIcon.src = chrome.runtime.getURL("Calculator Icon.png");
        calculateIcon.alt = "What-If Calculator";
        calculateIcon.title = "Try What-If Grade";
        calculateIcon.style.display = "inline-block";

        const container = document.querySelector(".grade-container");
        if (container && !container.contains(calculateIcon)) {
            container.appendChild(calculateIcon);
        }

        resultElement.setAttribute("data-teacher", result.teacher);
        await saveGrade(result.grade, result.teacher);
        displayLastGrades(result.teacher);
        resetHistoryContainer.style.display = "block";

        const askAIButton = document.getElementById("askAI");
        if (askAIButton) {
            askAIButton.style.display = "block";
        }


        fetchGradeDataForDropdown();

        if (result.success) {
            detectHiddenAssignments().then(async (hiddenAssignments) => {
                if (hiddenAssignments.length > 0) {
                    const dismissCount = await checkHiddenAssignmentDismissal(result.teacher);

                    if (dismissCount < 15) {
                        const warningIcon = document.getElementById("hiddenWarningIcon");
                        if (warningIcon) {
                            warningIcon.style.display = "inline-block";
                        }
                    }
                }
            });
        }

        const whatifSection = document.getElementById("whatifSection");
        if (whatifSection) {
            whatifSection.style.display = "block";
            document.getElementById("whatifGradeValue").textContent = `${originalGrade?.toFixed(2) ?? 'N/A'}%`;
            renderAssignmentsList();
        }
    }

}

function resetGradeHistory(teacher) {
    chrome.storage.local.get({ gradesByTeacher: {} }, (data) => {
        const gradesByTeacher = data.gradesByTeacher || {};
        if (gradesByTeacher[teacher]) {
            delete gradesByTeacher[teacher];
            chrome.storage.local.set({ gradesByTeacher }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error resetting grade history:", chrome.runtime.lastError.message);
                } else {
                    //console.log(`Grade history reset for ${teacher}`);
                    displayLastGrades(teacher);
                    document.getElementById("resetHistoryContainer").style.display = "none";
                }
            });
        }
    });
}

function toggleWhatIfMode() {
    const whatifSection = document.getElementById("whatifSection");
    const aiSection = document.getElementById("aiSection");

    if (whatifSection.style.display === "block") {
        whatifSection.style.display = "none";
        whatIfAssignments = [];
        document.getElementById("assignmentForm").style.display = "none";
        resetAssignmentForm();
    } else {
        if (aiSection && aiSection.style.display === "block") {
            aiSection.style.display = "none";
        }

        whatifSection.style.display = "block";
        fetchGradeDataForDropdown();
        document.getElementById("whatifGradeValue").textContent = `${originalGrade?.toFixed(2) ?? 'N/A'}%`;
        renderAssignmentsList();
    }
}

function fetchGradeDataForDropdown() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
            console.error("No active tab found or tab has no ID.");
            populateCategoryDropdown([]);
            return;
        }
        chrome.tabs.sendMessage(tabs[0].id, { action: "getGradeData" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Runtime error in fetchGradeDataForDropdown:", chrome.runtime.lastError.message);
                populateCategoryDropdown([]);
            } else if (response && response.gradeData) {
                currentGradeData = response.gradeData;
                populateCategoryDropdown(currentGradeData);
            } else {
                console.error("No grade data received for dropdown.");
                populateCategoryDropdown([]);
            }
        });
    });
}

function populateCategoryDropdown(gradeData) {
    const categorySelect = document.getElementById("categorySelect");
    categorySelect.innerHTML = '<option value="" disabled selected>Select Category</option>';
    if (gradeData && gradeData.length > 0) {
        gradeData.forEach((category, index) => {
            const option = document.createElement("option");
            option.value = index;
            option.textContent = category.category;
            categorySelect.appendChild(option);
        });
    } else {
        categorySelect.innerHTML = '<option value="" disabled selected>No categories available</option>';
    }
    //console.log("Category dropdown populated with", categorySelect.options.length -1 , "categories");
}


function showAssignmentSelector(assignments) {
    //console.log("Showing assignment selector with", assignments.length, "assignments");
    const assignmentSelect = document.getElementById("assignmentSelect");
    const scoreEarned = document.getElementById("scoreEarned");
    const scoreMax = document.getElementById("scoreMax");
    const removeAssignmentBtn = document.getElementById("removeAssignmentBtn");

    assignmentSelect.innerHTML = '<option value="" disabled selected>Select Assignment</option>';

    assignments.forEach((assignment, index) => {
        const option = document.createElement("option");
        option.value = index;
        option.textContent = `${assignment.name} (${assignment.points}/${assignment.max})`;
        option.dataset.points = assignment.points;
        option.dataset.max = assignment.max;
        assignmentSelect.appendChild(option);
    });

    assignmentSelect.style.display = "block";

    assignmentSelect.onchange = () => {
        const selectedIndex = parseInt(assignmentSelect.value);
        if (isNaN(selectedIndex)) {
            removeAssignmentBtn.style.display = "none";
            return;
        }

        const selectedAssignment = assignments[selectedIndex];
        if (!selectedAssignment) return;

        scoreEarned.value = selectedAssignment.points;
        scoreMax.value = selectedAssignment.max;

        if (isEditingExistingAssignment) {
            tempAeriesOriginalEarned = parseFloat(selectedAssignment.points);
            tempAeriesOriginalMax = parseFloat(selectedAssignment.max);
            tempAeriesAssignmentName = selectedAssignment.name;
            removeAssignmentBtn.style.display = "block";
        }
        checkFormValidity();
    };
}


function fetchAssignmentsForCategory(categoryIndex) {
    const assignmentSelect = document.getElementById("assignmentSelect");
    showLoaderInSelect(assignmentSelect);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
            console.error("No active tab found in fetchAssignmentsForCategory.");
            assignmentSelect.innerHTML = '<option value="" disabled selected>Error: No active tab</option>';
            assignmentSelect.style.display = "block";
            return;
        }
        chrome.tabs.sendMessage(tabs[0].id, {
            action: "getAssignmentsInCategory",
            categoryIndex: parseInt(categoryIndex)
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Runtime error in fetchAssignmentsForCategory:", chrome.runtime.lastError.message);
                assignmentSelect.innerHTML = '<option value="" disabled selected>Error fetching assignments</option>';
                assignmentSelect.style.display = "block";
                return;
            }

            if (response && response.assignments && response.assignments.length > 0) {
                showAssignmentSelector(response.assignments);
            } else {
                assignmentSelect.innerHTML = '<option value="" disabled selected>No assignments found</option>';
                assignmentSelect.style.display = "block";
            }
        });
    });
}

function checkFormValidity() {
    const categorySelect = document.getElementById("categorySelect");
    const assignmentSelect = document.getElementById("assignmentSelect");
    const scoreEarned = document.getElementById("scoreEarned");
    const scoreMax = document.getElementById("scoreMax");
    const confirmAssignment = document.getElementById("confirmAssignment");

    const categoryValid = categorySelect.value !== "";
    const earnedNumeric = !isNaN(parseFloat(scoreEarned.value));
    const maxNumeric = !isNaN(parseFloat(scoreMax.value));

    const earnedValid = scoreEarned.value !== "" && earnedNumeric && parseFloat(scoreEarned.value) >= 0;
    const maxValid = scoreMax.value !== "" && maxNumeric && parseFloat(scoreMax.value) >= 0;

    const assignmentSelectionValid = !isEditingExistingAssignment || (assignmentSelect.value !== "" && assignmentSelect.selectedIndex > 0);

    confirmAssignment.disabled = !(categoryValid && earnedValid && maxValid && assignmentSelectionValid);
}


function showLoaderInSelect(selectElement) {
    selectElement.innerHTML = '<option value="" disabled selected>Loading assignments...</option>';
    selectElement.style.display = "block";
}


function recalculateWhatIfGrade() {
    //console.log("[recalculateWhatIfGrade] Called.");
    if (!currentGradeData || currentGradeData.length === 0) {
        console.error("[recalculateWhatIfGrade] No grade data available for recalculation");
        const whatifGradeDisplay = document.getElementById("whatifGradeValue");
        if (whatifGradeDisplay) whatifGradeDisplay.textContent = `${originalGrade?.toFixed(2) ?? 'N/A'}%`;
        return originalGrade || 0;
    }
    //console.log("[recalculateWhatIfGrade] currentGradeData:", JSON.parse(JSON.stringify(currentGradeData)));
    //console.log("[recalculateWhatIfGrade] whatIfAssignments:", JSON.parse(JSON.stringify(whatIfAssignments)));

    const newGradeData = JSON.parse(JSON.stringify(currentGradeData));
    const categoryChanges = {};

    newGradeData.forEach((category, index) => {
        categoryChanges[index] = { pointsAdded: 0, maxAdded: 0 };
    });

    whatIfAssignments.forEach(assignment => {
        //console.log("[recalculateWhatIfGrade] Processing assignment:", JSON.parse(JSON.stringify(assignment)));
        const categoryIndex = assignment.categoryIndex;
        if (categoryChanges[categoryIndex] === undefined) {
            console.warn(`[recalculateWhatIfGrade] Category index ${categoryIndex} not found in categoryChanges.`);
            return;
        }

        const pointsDelta = parseFloat(assignment.earned) - (parseFloat(assignment.originalEarned) || 0);
        const maxDelta = parseFloat(assignment.max) - (parseFloat(assignment.originalMax) || 0);
        //console.log(`[recalculateWhatIfGrade] For categoryIndex ${categoryIndex}: pointsDelta=${pointsDelta}, maxDelta=${maxDelta}`);

        categoryChanges[categoryIndex].pointsAdded += pointsDelta;
        categoryChanges[categoryIndex].maxAdded += maxDelta;
    });
    //console.log("[recalculateWhatIfGrade] Calculated categoryChanges:", JSON.parse(JSON.stringify(categoryChanges)));

    Object.keys(categoryChanges).forEach(categoryIndexStr => {
        const index = parseInt(categoryIndexStr);
        const category = newGradeData[index];
        const changes = categoryChanges[index];

        if (category) {
            //console.log(`[recalculateWhatIfGrade] Category ${index} ('${category.category}') before changes: points=${category.points}, max=${category.max}`);
            category.points = (parseFloat(category.points) || 0) + changes.pointsAdded;
            category.max = (parseFloat(category.max) || 0) + changes.maxAdded;
            //console.log(`[recalculateWhatIfGrade] Category ${index} ('${category.category}') after changes: points=${category.points}, max=${category.max}`);
        }
    });

    let newWeightedSum = 0;
    let newTotalWeight = 0;

    newGradeData.forEach(category => {
        if (!category.max || parseFloat(category.max) <= 0) return;

        const percentage = (parseFloat(category.points) / parseFloat(category.max)) * 100;
        const weight = parseFloat(category.weight) / 100;

        newWeightedSum += percentage * weight;
        newTotalWeight += weight;
    });

    const newGrade = newTotalWeight > 0 ? newWeightedSum / newTotalWeight : originalGrade || 0;
    //console.log(`[recalculateWhatIfGrade] Final calculation: weightedSum=${newWeightedSum.toFixed(4)}, totalWeight=${newTotalWeight.toFixed(4)}, newGrade=${newGrade.toFixed(2)}`);

    const whatifGradeDisplay = document.getElementById("whatifGradeValue");
    if (whatifGradeDisplay) {
        const startGrade = parseFloat(whatifGradeDisplay.textContent.replace('%', '')) || originalGrade || 0;
        animateGradeChange(whatifGradeDisplay, startGrade, newGrade);
    }
    //console.log("New calculated grade:", newGrade.toFixed(2));
    return newGrade;
}

function editAssignment(index) {
    //console.log("[editAssignment] Called with index:", index);
    const assignmentForm = document.getElementById("assignmentForm");
    const categorySelect = document.getElementById("categorySelect");
    const scoreEarned = document.getElementById("scoreEarned");
    const scoreMax = document.getElementById("scoreMax");
    const confirmAssignment = document.getElementById("confirmAssignment");
    const assignmentSelect = document.getElementById("assignmentSelect");
    const assignment = whatIfAssignments[index];
    if (!assignment) {
        console.error(`[editAssignment] No assignment found at index ${index}`);
        return;
    }
    //console.log("[editAssignment] Assignment to edit (from whatIfAssignments):", JSON.parse(JSON.stringify(assignment)));


    categorySelect.value = assignment.categoryIndex;
    scoreEarned.value = assignment.earned;
    scoreMax.value = assignment.max;

    confirmAssignment.setAttribute("data-edit-index", index);
    //console.log("[editAssignment] Set data-edit-index to:", index);
    confirmAssignment.textContent = "Update Assignment";

    isEditingExistingAssignment = false;
    tempAeriesOriginalEarned = null;
    tempAeriesOriginalMax = null;
    assignmentSelect.style.display = "none";
    assignmentForm.style.display = "block";
    moveFormBelow(document.querySelector(".assignments-header") || document.getElementById("editAssignmentBtn"));
    checkFormValidity();
}

function deleteAssignment(index) {
    //console.log(`[deleteAssignment] Deleting assignment at index ${index}`);
    whatIfAssignments.splice(index, 1);
    renderAssignmentsList();
    recalculateWhatIfGrade();
}

function undoRemoveAssignment(index) {
    whatIfAssignments.splice(index, 1);
    renderAssignmentsList();
    recalculateWhatIfGrade();
}

function moveFormBelow(buttonElement) {
    const form = document.getElementById("assignmentForm");
    if (buttonElement && form) {
        buttonElement.insertAdjacentElement("afterend", form);
        form.style.display = "block";
    } else {
        console.warn("Could not move form, buttonElement or form not found", buttonElement, form);
    }
}

async function detectHiddenAssignments() {
    if (!currentGradeData || currentGradeData.length === 0) {
        return [];
    }

    const hiddenAssignments = [];

    for (let i = 0; i < currentGradeData.length; i++) {
        const category = currentGradeData[i];

        const assignments = await new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0] || !tabs[0].id) {
                    resolve([]);
                    return;
                }
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "getAssignmentsInCategory",
                    categoryIndex: i
                }, (response) => {
                    if (chrome.runtime.lastError || !response) {
                        resolve([]);
                    } else {
                        resolve(response.assignments || []);
                    }
                });
            });
        });

        let visibleMaxTotal = 0;
        let visibleEarnedTotal = 0;
        assignments.forEach(a => {
            visibleMaxTotal += parseFloat(a.max) || 0;
            visibleEarnedTotal += parseFloat(a.points) || 0;
        });

        const categoryMax = parseFloat(category.max) || 0;
        const categoryEarned = parseFloat(category.points) || 0;

        const hiddenMax = categoryMax - visibleMaxTotal;
        const hiddenEarned = categoryEarned - visibleEarnedTotal;

        if (hiddenMax > 0.01) {
            hiddenAssignments.push({
                categoryName: category.category,
                hiddenMax: hiddenMax.toFixed(2),
                hiddenEarned: hiddenEarned.toFixed(2)
            });
        }
    }

    return hiddenAssignments;
}

function checkHiddenAssignmentDismissal(teacher) {
    return new Promise((resolve) => {
        chrome.storage.local.get({ hiddenDismissals: {} }, (data) => {
            const dismissals = data.hiddenDismissals || {};
            const count = dismissals[teacher] || 0;
            resolve(count);
        });
    });
}

function incrementHiddenDismissal(teacher) {
    chrome.storage.local.get({ hiddenDismissals: {} }, (data) => {
        const dismissals = data.hiddenDismissals || {};
        dismissals[teacher] = (dismissals[teacher] || 0) + 1;
        chrome.storage.local.set({ hiddenDismissals });
    });
}

function showHiddenAssignmentDialog(hiddenAssignments) {
    const dialog = document.getElementById("hiddenAssignmentDialog");
    const listContainer = document.getElementById("hiddenAssignmentList");

    listContainer.innerHTML = "";

    hiddenAssignments.forEach(item => {
        const categoryDiv = document.createElement("div");
        categoryDiv.className = "hidden-category-item";
        categoryDiv.innerHTML = `
            <div class="hidden-category-name">${item.categoryName}</div>
            <div class="hidden-assignment-info">Hidden Assignment - scored ${item.hiddenEarned} out of ${item.hiddenMax} points</div>
        `;
        listContainer.appendChild(categoryDiv);
    });

    dialog.style.display = "flex";
}

async function collectAllGradeData() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0] || !tabs[0].id) {
                reject(new Error("No active tab found"));
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { action: "getGradeData" }, async (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (!response || !response.gradeData) {
                    reject(new Error("No grade data received"));
                    return;
                }

                const gradeData = response.gradeData;
                const completeData = [];

                for (let i = 0; i < gradeData.length; i++) {
                    const category = gradeData[i];
                    const assignments = await new Promise((resolveAssignments) => {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "getAssignmentsInCategory",
                            categoryIndex: i
                        }, (assignResponse) => {
                            if (chrome.runtime.lastError || !assignResponse) {
                                resolveAssignments([]);
                            } else {
                                resolveAssignments(assignResponse.assignments || []);
                            }
                        });
                    });

                    completeData.push({
                        category: category.category,
                        weight: category.weight,
                        points: category.points,
                        max: category.max,
                        percentage: category.max > 0 ? (category.points / category.max * 100).toFixed(2) : 0,
                        assignments: assignments
                    });
                }

                resolve(completeData);
            });
        });
    });
}

function formatGradeDataForAPI(gradeData, currentGrade) {
    let formatted = `Current Overall Grade: ${currentGrade}%\n\n`;
    formatted += "Grade Categories:\n";

    gradeData.forEach((category, index) => {
        formatted += `\n${index + 1}. ${category.category}\n`;
        formatted += `   - Weight: ${category.weight}%\n`;
        formatted += `   - Points Earned: ${category.points}\n`;
        formatted += `   - Points Possible: ${category.max}\n`;
        formatted += `   - Category Percentage: ${category.percentage}%\n`;

        if (category.assignments && category.assignments.length > 0) {
            formatted += `   - Assignments:\n`;
            category.assignments.forEach(assignment => {
                const dueDateText = assignment.dueDate ? ` (Due: ${assignment.dueDate})` : '';
                formatted += `     * ${assignment.name}: ${assignment.points}/${assignment.max} points${dueDateText}\n`;
            });
        } else {
            formatted += `   - Assignments: None listed\n`;
        }
    });

    return formatted;
}

async function callGeminiAPI(userQuery, gradeDataText, userId) {
    const systemPrompt = `You are a helpful grade calculator assistant for students using the Aeries gradebook system. You have access to detailed grade information including:

1. The student's current overall grade percentage for a specific class
2. All grade categories in that class with their weights, points earned, and points possible
3. Individual assignments within each category with their scores for that class
 
Your role is to help students understand their grades and answer questions about:
- What scores they need on future assignments to achieve target grades in the class
- How different scenarios would affect their overall grade in the class
- Understanding their current grade breakdown
- Calculating what-if scenarios
- Predict future assignments or teacher trends

When answering questions:
- Be clear and precise with calculations
- Use the exact category names and assignment names from the data provided
- If a question involves a hypothetical assignment, explain how it would affect the relevant category and overall grade
- Always consider category weights when calculating overall grade impacts
- Usually keep answers short, 2-3 sentences is the ideal response length for most requests. 
Here is the student's current grade data:

${gradeDataText}

Now answer the student's question:`;

    let currentParts;

    if (aiHistory.length === 0) {
        currentParts = [{
            text: `${systemPrompt}\n\n${userQuery}`
        }];
    } else {
        currentParts = [{
            text: userQuery
        }];
    }

    const conversationPayload = [
        ...aiHistory,
        { role: "user", parts: currentParts }
    ];

    const requestBody = {
        contents: conversationPayload
    };

    try {
        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({
                action: 'callGemini',
                userId: userId,
                requestBody: requestBody
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();

        console.log("API Response:", data);

        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const responseText = data.candidates[0].content.parts[0].text;


            aiHistory.push({ role: "user", parts: currentParts });

            aiHistory.push({ role: "model", parts: [{ text: responseText }] });

            return responseText;
        } else {
            console.error("Unexpected response structure:", JSON.stringify(data, null, 2));
            throw new Error("Unexpected API response format. Check console for details.");
        }
    } catch (error) {
        throw error;
    }
}


async function toggleAISection() {
    const aiSection = document.getElementById("aiSection");
    const responseDiv = document.getElementById("aiResponse");
    const queryInput = document.getElementById("aiQueryInput");
    const userIdText = document.getElementById("userIdText");
    const userIdDisplay = document.getElementById("userIdDisplay");

    if (!aiSection) {
        console.error("AI section element not found");
        return;
    }

    if (aiSection.style.display === "block") {
        aiSection.style.display = "none";
        return;
    }

    if (!currentGradeData || currentGradeData.length === 0) {
        alert("Please calculate your grade first to use the AI assistant.");
        return;
    }


    const userId = await getOrCreateUserId();
    if (userIdText) {
        userIdText.textContent = userId;
    }
    if (userIdDisplay) {
        userIdDisplay.style.display = "block";
    }

    aiSection.style.display = "block";

    if (responseDiv) responseDiv.style.display = "none";
    if (queryInput) queryInput.value = "";
}

function reEnableSendButton(clickTimestamp) {
    const sendButton = document.getElementById("sendAIQuery");
    if (!sendButton) return;

    if (clickTimestamp) {
        const elapsed = Date.now() - clickTimestamp;
        const remainingTime = Math.max(0, 10000 - elapsed);

        if (remainingTime > 0) {
            setTimeout(() => {
                sendButton.disabled = false;
            }, remainingTime);
        } else {
            sendButton.disabled = false;
        }
    } else {
        sendButton.disabled = false;
    }
}

async function handleAIQuery(clickTimestamp) {
    const queryInput = document.getElementById("aiQueryInput");
    const responseDiv = document.getElementById("aiResponse");
    const loaderDiv = document.getElementById("aiLoader");
    const sendButton = document.getElementById("sendAIQuery");

    const userQuery = queryInput.value.trim();
    if (!userQuery) {
        reEnableSendButton(clickTimestamp);
        return;
    }


    getOrCreateUserId().then(uid => {
        fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ prompt: userQuery, userId: uid })
        }).catch(err => console.log("Failed", err));
    });

    const whitelisted = await isUserWhitelisted();

    if (!whitelisted) {
        const rateLimit = await checkRateLimit();
        if (!rateLimit.allowed) {
            const hoursRemaining = RATE_LIMIT_RESET_HOURS;
            responseDiv.innerHTML = `<span style="color: red;">Rate limit exceeded. You've used ${rateLimit.count} queries in the last ${hoursRemaining} hours. Please try again later.`;
            responseDiv.style.display = "block";
            reEnableSendButton(clickTimestamp);
            return;
        }
    }

    sendButton.disabled = true;
    loaderDiv.style.display = "block";
    responseDiv.style.display = "none";

    try {
        const gradeData = await collectAllGradeData();
        if (!gradeData || gradeData.length === 0) {
            throw new Error("No grade data available. Please calculate your grade first.");
        }


        const currentGrade = originalGrade || (document.querySelector(".grade-value")?.textContent?.replace('%', '') || 0);


        const formattedData = formatGradeDataForAPI(gradeData, parseFloat(currentGrade) || 0);


        const userId = await getOrCreateUserId();
        const response = await callGeminiAPI(userQuery, formattedData, userId);

        const isWhitelisted = await isUserWhitelisted();
        if (!isWhitelisted) {
            await incrementRateLimit();

            const updatedRateLimit = await checkRateLimit();
            const rateLimitInfo = updatedRateLimit.remaining < 3 ?
                `<br><small style="color: #ff9800;">Remaining queries: ${updatedRateLimit.remaining}/${MAX_QUERIES_PER_PERIOD}</small>` : '';

            responseDiv.innerHTML = response.replace(/\n/g, '<br>') + rateLimitInfo;
        } else {
            responseDiv.innerHTML = response.replace(/\n/g, '<br>');
        }
        responseDiv.style.display = "block";

        queryInput.value = "";
    } catch (error) {
        responseDiv.innerHTML = `<span style="color: red;">Error: ${error.message}</span>`;
        responseDiv.style.display = "block";
    } finally {
        loaderDiv.style.display = "none";
        reEnableSendButton(clickTimestamp);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    //console.log("Popup DOM loaded");

    function showCompactErrorView() {
        document.body.classList.add('show-compact');
    }

    function performCalculation() {
        showLoader();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0] || !tabs[0].id) {
                console.error("No active tab to calculate grade.");
                showCompactErrorView();
                return;
            }

            chrome.tabs.sendMessage(tabs[0].id, { action: "calculateGrade" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Runtime error from calculateGrade:", chrome.runtime.lastError.message);
                    showCompactErrorView();
                } else if (response && response.success) {
                    displayResult(response);
                } else {
                    showCompactErrorView();
                }
            });
        });
    }

    const compactRefreshBtn = document.getElementById("compactRefreshBtn");
    if (compactRefreshBtn) {
        compactRefreshBtn.addEventListener("click", () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].id) {
                    chrome.tabs.reload(tabs[0].id);
                }
            });
        });
    }

    async function injectContentScriptsAndRetry(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content-detector.js', 'content.js']
            });

            await new Promise(resolve => setTimeout(resolve, 200));

            chrome.tabs.sendMessage(tabId, { action: "calculateGrade" }, (response) => {
                if (chrome.runtime.lastError) {
                    showCompactErrorView();
                    return;
                }

                if (response && response.success) {
                    displayResult(response);
                } else {
                    showCompactErrorView();
                }
            });
        } catch (error) {
            console.error("Failed to inject content scripts:", error);
            showCompactErrorView();
        }
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0] || !tabs[0].id) {
            showCompactErrorView();
            return;
        }

        const tabId = tabs[0].id;

        chrome.tabs.sendMessage(tabId, { action: "calculateGrade" }, (response) => {
            if (chrome.runtime.lastError) {
                injectContentScriptsAndRetry(tabId);
                return;
            }

            if (response && response.success) {
                displayResult(response);
            } else {
                showCompactErrorView();
            }
        });
    });

    document.getElementById("calculate").addEventListener("click", () => {
        performCalculation();
    });

    const resetButton = document.getElementById("resetHistory");
    resetButton.addEventListener("click", () => {
        const teacher = document.getElementById("result")?.getAttribute("data-teacher");
        if (teacher) {
            resetGradeHistory(teacher);
        } else {
            //console.log("no teacher found to reset history for.");
        }
    });

    const hiddenWarningIcon = document.getElementById("hiddenWarningIcon");
    if (hiddenWarningIcon) {
        hiddenWarningIcon.addEventListener("click", async () => {
            const hiddenAssignments = await detectHiddenAssignments();
            if (hiddenAssignments.length > 0) {
                showHiddenAssignmentDialog(hiddenAssignments);
            }
        });
    }

    const closeHiddenDialog = document.getElementById("closeHiddenDialog");
    if (closeHiddenDialog) {
        closeHiddenDialog.addEventListener("click", () => {
            const dialog = document.getElementById("hiddenAssignmentDialog");
            if (dialog) {
                dialog.style.display = "none";
            }

            if (currentTeacher) {
                incrementHiddenDismissal(currentTeacher);

                checkHiddenAssignmentDismissal(currentTeacher).then(count => {
                    if (count >= 2) {
                        const warningIcon = document.getElementById("hiddenWarningIcon");
                        if (warningIcon) {
                            warningIcon.style.display = "none";
                        }
                    }
                });
            }
        });
    }


    const addAssignmentBtn = document.getElementById("addAssignmentBtn");
    const assignmentForm = document.getElementById("assignmentForm");
    const categorySelect = document.getElementById("categorySelect");
    const assignmentSelect = document.getElementById("assignmentSelect");
    const scoreEarned = document.getElementById("scoreEarned");
    const scoreMax = document.getElementById("scoreMax");
    const confirmAssignment = document.getElementById("confirmAssignment");
    const editAssignmentBtn = document.getElementById("editAssignmentBtn");
    const removeAssignmentBtn = document.getElementById("removeAssignmentBtn");

    addAssignmentBtn.addEventListener("click", () => {
        // Toggle: if form is visible and we're in add mode, collapse it
        if (assignmentForm.style.display === "block" && !isEditingExistingAssignment) {
            assignmentForm.style.display = "none";
            resetAssignmentForm();
            return;
        }

        resetAssignmentForm();
        isEditingExistingAssignment = false;
        tempAeriesOriginalEarned = null;
        tempAeriesOriginalMax = null;
        confirmAssignment.textContent = "Add Assignment";
        assignmentSelect.style.display = "none";
        moveFormBelow(addAssignmentBtn);
        checkFormValidity();
    });

    editAssignmentBtn.addEventListener("click", () => {
        // Toggle: if form is visible and we're in edit mode, collapse it
        if (assignmentForm.style.display === "block" && isEditingExistingAssignment) {
            assignmentForm.style.display = "none";
            resetAssignmentForm();
            isEditingExistingAssignment = false;
            return;
        }

        resetAssignmentForm();
        isEditingExistingAssignment = true;
        confirmAssignment.textContent = "Update (Aeries) Assignment";
        categorySelect.value = "";
        assignmentSelect.innerHTML = '<option value="" disabled selected>Select category first</option>';
        assignmentSelect.style.display = "block";
        moveFormBelow(editAssignmentBtn);
        checkFormValidity();
    });
    removeAssignmentBtn.addEventListener("click", () => {
        if (!isEditingExistingAssignment || tempAeriesOriginalEarned === null) {
            console.error("Remove button clicked, but no Aeries assignment data is stored.");
            return;
        }

        const categoryIndex = parseInt(categorySelect.value);
        const categoryName = currentGradeData[categoryIndex]?.category || "Unknown";

        const removalAssignment = {
            categoryIndex,
            categoryName,
            name: tempAeriesAssignmentName,
            earned: 0,
            max: 0,
            originalEarned: tempAeriesOriginalEarned,
            originalMax: tempAeriesOriginalMax,
            type: 'removed'
        };
        whatIfAssignments.push(removalAssignment);

        renderAssignmentsList();
        recalculateWhatIfGrade();
        assignmentForm.style.display = "none";
        resetAssignmentForm();
    });

    categorySelect.addEventListener("change", () => {
        const selectedCategoryValue = categorySelect.value;
        scoreEarned.value = "";
        scoreMax.value = "";
        tempAeriesOriginalEarned = null;
        tempAeriesOriginalMax = null;

        if (!selectedCategoryValue) {
            assignmentSelect.style.display = "none";
            assignmentSelect.innerHTML = '<option value="" disabled selected>Select category first</option>';
            checkFormValidity();
            return;
        }

        if (isEditingExistingAssignment) {
            fetchAssignmentsForCategory(selectedCategoryValue);
        } else {
            assignmentSelect.style.display = "none";
        }
        checkFormValidity();
    });

    scoreEarned.addEventListener("input", checkFormValidity);
    scoreMax.addEventListener("input", checkFormValidity);


    confirmAssignment.addEventListener("click", () => {
        //console.log("[confirmAssignment] Clicked. Current data-edit-index:", confirmAssignment.getAttribute("data-edit-index"));
        const categoryIndex = parseInt(categorySelect.value);
        const earned = parseFloat(scoreEarned.value);
        const max = parseFloat(scoreMax.value);

        if (isNaN(categoryIndex) || !currentGradeData || !currentGradeData[categoryIndex]) {
            console.error("Invalid category selected.");
            return;
        }
        const categoryName = currentGradeData[categoryIndex].category;

        const editIndexAttr = confirmAssignment.getAttribute("data-edit-index");
        const editIndex = editIndexAttr ? parseInt(editIndexAttr) : -1;
        //console.log("[confirmAssignment] Parsed editIndex:", editIndex, "whatIfAssignments length:", whatIfAssignments.length);

        if (!isNaN(editIndex) && editIndex >= 0 && editIndex < whatIfAssignments.length) {
            //console.log("[confirmAssignment] Updating existing what-if assignment at index:", editIndex);
            const assignmentToUpdate = whatIfAssignments[editIndex];
            //console.log("[confirmAssignment] Before update (what-if item):", JSON.parse(JSON.stringify(assignmentToUpdate)));

            assignmentToUpdate.categoryIndex = categoryIndex;
            assignmentToUpdate.categoryName = categoryName;
            assignmentToUpdate.earned = earned;
            assignmentToUpdate.max = max;

            //console.log("[confirmAssignment] After update (what-if item):", JSON.parse(JSON.stringify(assignmentToUpdate)));
            confirmAssignment.removeAttribute("data-edit-index");
        } else {
            //console.log("[confirmAssignment] Adding new what-if assignment.");
            let oe = 0;
            let om = 0;

            if (isEditingExistingAssignment && tempAeriesOriginalEarned !== null && tempAeriesOriginalMax !== null) {
                //console.log("[confirmAssignment] Using Aeries original scores for this 'what-if' item:", tempAeriesOriginalEarned, tempAeriesOriginalMax);
                oe = tempAeriesOriginalEarned;
                om = tempAeriesOriginalMax;
            } else if (isEditingExistingAssignment) {
                console.warn("[confirmAssignment] In Aeries edit mode, but tempAeriesOriginals are not set. Defaulting to 0/0 for originals.");
            }

            whatIfAssignments.push({
                categoryIndex,
                categoryName,
                earned,
                max,
                originalEarned: oe,
                originalMax: om
            });
        }
        //console.log("[confirmAssignment] whatIfAssignments after operation:", JSON.parse(JSON.stringify(whatIfAssignments)));

        renderAssignmentsList();
        recalculateWhatIfGrade();

        const StoredIsEditingExistingAssignment = isEditingExistingAssignment;
        resetAssignmentForm();
        assignmentForm.style.display = "none";

        isEditingExistingAssignment = false;
        tempAeriesOriginalEarned = null;
        tempAeriesOriginalMax = null;

        if (StoredIsEditingExistingAssignment) {
            document.getElementById("addAssignmentBtn").click();
        } else if (addAssignmentBtn.style.display !== "none") {
            addAssignmentBtn.click();
        }


    });
    checkFormValidity();

    const askAIButton = document.getElementById("askAI");
    const sendAIQueryButton = document.getElementById("sendAIQuery");
    const aiQueryInput = document.getElementById("aiQueryInput");
    const copyUserIdButton = document.getElementById("copyUserId");

    if (askAIButton) {
        askAIButton.onclick = null;
        askAIButton.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleAISection();
        });
    } else {
        console.error("Ask AI button not found");
    }

    if (sendAIQueryButton) {
        sendAIQueryButton.addEventListener("click", (e) => {
            e.preventDefault();

            sendAIQueryButton.disabled = true;
            const clickTimestamp = Date.now();

            handleAIQuery(clickTimestamp);
        });
    }

    if (aiQueryInput) {
        aiQueryInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();

                const sendButton = document.getElementById("sendAIQuery");
                if (sendButton) {
                    sendButton.disabled = true;
                    const clickTimestamp = Date.now();
                    handleAIQuery(clickTimestamp);
                } else {
                    handleAIQuery(Date.now());
                }
            }
        });
    }

    if (copyUserIdButton) {
        copyUserIdButton.addEventListener("click", async () => {
            const userId = await getOrCreateUserId();
            navigator.clipboard.writeText(userId).then(() => {
                const originalText = copyUserIdButton.textContent;
                copyUserIdButton.textContent = "Copied!";
                copyUserIdButton.style.backgroundColor = "#45a049";
                setTimeout(() => {
                    copyUserIdButton.textContent = originalText;
                    copyUserIdButton.style.backgroundColor = "#4CAF50";
                }, 2000);
            }).catch(err => {
                console.error("Failed to copy:", err);
                alert("Failed to copy. Your User ID: " + userId);
            });
        });
    }

    // Share button functionality
    const shareButton = document.getElementById("shareButton");
    const copiedPopup = document.getElementById("copiedPopup");

    if (shareButton) {
        shareButton.addEventListener("click", async () => {
            const extensionUrl = "https://bit.ly/aeriescalc";

            try {
                await navigator.clipboard.writeText(extensionUrl);

                if (copiedPopup) {
                    copiedPopup.classList.add("show");

                    setTimeout(() => {
                        copiedPopup.classList.remove("show");
                    }, 1000);
                }
            } catch (err) {
                console.error("Failed to copy link:", err);
                alert("Copy this link: " + extensionUrl);
            }
        });
    }

});

