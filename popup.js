
const EDGE_FUNCTION_URL = 'https://htxvtjdkalfnujztetmi.supabase.co/functions/v1/gemini-proxy';
let aiHistory = [];
const MAX_QUERIES_PER_PERIOD = 3;
const AI_STATUS_SEQUENCE = ["Thinking...", "Fetching...", "Analyzing..."];
let aiStatusIntervalId = null;
let installationContextCache = null;
let useCompressedContext = false;
let cachedIsWhitelisted = null;

const INSTALL_TOKEN_KEY = "installToken";
const INSTALL_USER_ID_KEY = "installUserId";
const AI_MODEL_KEY = "aiModelSelection";
const DEFAULT_AI_MODEL = "gemini-2.5-flash";
const PREMIUM_AI_MODEL = "gemini-3-flash-preview";
const AI_MAX_CHARS_DEFAULT = 500;
const AI_MAX_CHARS_WHITELISTED = 1500;
const HIDDEN_WARNING_DISMISS_LIMIT = 15;

function storageGetLocal(defaults) {
    return new Promise((resolve) => {
        chrome.storage.local.get(defaults, (data) => resolve(data));
    });
}

function storageGetSync(defaults) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(defaults, (data) => resolve(data));
    });
}

async function getPersistedInstallContext() {
    const syncData = await storageGetSync({ [INSTALL_TOKEN_KEY]: null, [INSTALL_USER_ID_KEY]: null });
    if (syncData[INSTALL_TOKEN_KEY]) {
        return { installToken: syncData[INSTALL_TOKEN_KEY], userId: syncData[INSTALL_USER_ID_KEY] || null };
    }
    const localData = await storageGetLocal({ [INSTALL_TOKEN_KEY]: null, [INSTALL_USER_ID_KEY]: null });
    return { installToken: localData[INSTALL_TOKEN_KEY] || null, userId: localData[INSTALL_USER_ID_KEY] || null };
}

async function persistInstallContext(installToken, userId) {
    const payload = { [INSTALL_TOKEN_KEY]: installToken, [INSTALL_USER_ID_KEY]: userId || null };
    await Promise.all([
        new Promise((resolve) => chrome.storage.sync.set(payload, resolve)),
        new Promise((resolve) => chrome.storage.local.set(payload, resolve))
    ]);
}

async function bootstrapInstallation(existingToken) {
    const headers = { "Content-Type": "application/json" };
    if (existingToken) {
        headers.Authorization = `Bearer ${existingToken}`;
    }
    const response = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "registerInstallation" })
    });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Bootstrap failed (${response.status})`);
    }
    return response.json();
}

async function getInstallationContext(forceRefresh = false) {
    if (!forceRefresh && installationContextCache?.installToken) {
        return installationContextCache;
    }

    const stored = await getPersistedInstallContext();

    if (!forceRefresh && stored.installToken && stored.userId) {
        installationContextCache = { installToken: stored.installToken, userId: stored.userId };
        return installationContextCache;
    }

    const result = await bootstrapInstallation(forceRefresh ? null : stored.installToken);
    if (!result.installToken || !result.userId) {
        throw new Error("Invalid installation bootstrap response.");
    }

    await persistInstallContext(result.installToken, result.userId);
    installationContextCache = { installToken: result.installToken, userId: result.userId };
    return installationContextCache;
}

async function serverCheckRateLimit() {
    try {
        let installCtx = await getInstallationContext();
        let response = await fetch(EDGE_FUNCTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${installCtx.installToken}`
            },
            body: JSON.stringify({ action: "checkRateLimit" })
        });

        if ((response.status === 401 || response.status === 403)) {
            installCtx = await getInstallationContext(true);
            response = await fetch(EDGE_FUNCTION_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${installCtx.installToken}`
                },
                body: JSON.stringify({ action: "checkRateLimit" })
            });
        }

        if (!response.ok) return { allowed: false, remaining: 0, isWhitelisted: false, max: MAX_QUERIES_PER_PERIOD };
        return await response.json();
    } catch (error) {
        console.error("Error checking rate limit:", error);
        return { allowed: false, remaining: 0, isWhitelisted: false, max: MAX_QUERIES_PER_PERIOD };
    }
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

        const assignmentInfo = document.createElement("div");
        assignmentInfo.className = "assignment-info";

        const categorySpan = document.createElement("span");
        categorySpan.className = "assignment-category";
        categorySpan.textContent = assignment.categoryName || "Unknown";
        assignmentInfo.appendChild(categorySpan);

        const scoreSpan = document.createElement("span");
        scoreSpan.className = "assignment-score";

        const assignmentActions = document.createElement("div");
        assignmentActions.className = "assignment-actions";

        if (assignment.type === "removed") {
            scoreSpan.style.color = "#c9302c";
            scoreSpan.textContent = `${assignment.name || "Unnamed Assignment"} [REMOVED]`;

            const undoButton = document.createElement("button");
            undoButton.className = "undo-btn";
            undoButton.setAttribute("data-index", String(index));
            undoButton.textContent = "Undo";
            assignmentActions.appendChild(undoButton);
        } else {
            scoreSpan.textContent = `${assignment.earned}/${assignment.max} points`;

            const editButton = document.createElement("button");
            editButton.className = "edit-btn";
            editButton.setAttribute("data-index", String(index));
            editButton.textContent = "Edit";

            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-btn";
            deleteButton.setAttribute("data-index", String(index));
            deleteButton.textContent = "×";

            assignmentActions.appendChild(editButton);
            assignmentActions.appendChild(deleteButton);
        }

        assignmentInfo.appendChild(scoreSpan);
        assignmentItem.appendChild(assignmentInfo);
        assignmentItem.appendChild(assignmentActions);
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
    const livePercentageDisplay = document.getElementById("livePercentageDisplay");
    const editPercentageWrapper = document.getElementById("editPercentageWrapper");
    const editPercentageDisplay = document.getElementById("editPercentageDisplay");

    categorySelect.value = "";
    scoreEarned.value = "";
    scoreMax.value = "";
    confirmAssignment.disabled = true;
    removeAssignmentBtn.disabled = true;
    assignmentSelect.innerHTML = '<option value="" disabled selected>Select Assignment</option>';
    assignmentSelect.style.display = "none";
    removeAssignmentBtn.style.display = "none";

    // Reset live percentage display (Add mode)
    if (livePercentageDisplay) {
        livePercentageDisplay.textContent = "";
        livePercentageDisplay.classList.remove("visible");
    }

    // Reset edit percentage display (Edit mode)
    if (editPercentageWrapper) {
        editPercentageWrapper.classList.remove("visible");
    }
    if (editPercentageDisplay) {
        editPercentageDisplay.textContent = "";
    }

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
    aiHistory = [];
    const resultElement = document.getElementById("result");
    const resetHistoryContainer = document.getElementById("resetHistoryContainer");

    if (result.success) {
        originalGrade = parseFloat(result.grade);
        currentTeacher = result.teacher;

        resultElement.innerHTML = `
            <img id="hiddenWarningIcon" class="hidden-warning-icon" src="${chrome.runtime.getURL('warningicon.png')}" alt="Hidden Assignments" title="Hidden graded assignments detected" style="display: none;">
            <div class="grade-label" style="text-align: center;">Overall Grade is</div>
            <div class="grade-container" style="display: flex; flex-direction: column; justify-content: center; align-items: center; position: relative;">
                <div class="grade-value">${result.grade}%</div>
            </div>
        `;

        resultElement.setAttribute("data-teacher", result.teacher);
        await saveGrade(result.grade, result.teacher);
        displayLastGrades(result.teacher);
        resetHistoryContainer.style.display = "block";

        const askAIButton = document.getElementById("askAI");
        if (askAIButton) {
            askAIButton.style.display = "block";
        }


        if (result.success) {
            console.log("[Popup] Starting hidden assignment check...");

            fetchGradeDataForDropdown().then(() => {
                console.log("[Popup] Grade data fetched, now detecting hidden assignments...");
                return detectHiddenAssignments();
            }).then(async (hiddenAssignments) => {
                console.log("[Popup] Detection complete, found:", hiddenAssignments.length, "hidden assignments");

                if (hiddenAssignments.length > 0) {
                    const dismissCount = await checkHiddenAssignmentDismissal(result.teacher);
                    console.log("[Popup] Dismiss count for", result.teacher, ":", dismissCount);

                    if (dismissCount < HIDDEN_WARNING_DISMISS_LIMIT) {
                        const warningIcon = document.getElementById("hiddenWarningIcon");
                        if (warningIcon) {
                            warningIcon.style.display = "inline-block";
                            warningIcon.onclick = () => {
                                showHiddenAssignmentDialog(hiddenAssignments);
                            };
                        }
                    } else {
                        console.log("[Popup] Warning icon suppressed due to dismiss count >=", HIDDEN_WARNING_DISMISS_LIMIT);
                    }
                }
            }).catch((err) => {
                console.error("[Popup] Error in hidden assignment detection:", err);
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

function fetchGradeDataForDropdown() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0] || !tabs[0].id) {
                console.error("No active tab found or tab has no ID.");
                populateCategoryDropdown([]);
                resolve([]);
                return;
            }
            chrome.tabs.sendMessage(tabs[0].id, { action: "getGradeData" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Runtime error in fetchGradeDataForDropdown:", chrome.runtime.lastError.message);
                    populateCategoryDropdown([]);
                    resolve([]);
                } else if (response && response.gradeData) {
                    currentGradeData = response.gradeData;
                    populateCategoryDropdown(currentGradeData);
                    resolve(currentGradeData);
                } else {
                    console.error("No grade data received for dropdown.");
                    populateCategoryDropdown([]);
                    resolve([]);
                }
            });
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
    const removeAssignmentBtn = document.getElementById("removeAssignmentBtn");

    const categoryValid = categorySelect.value !== "";
    const earnedNumeric = !isNaN(parseFloat(scoreEarned.value));
    const maxNumeric = !isNaN(parseFloat(scoreMax.value));

    const earnedValid = scoreEarned.value !== "" && earnedNumeric && parseFloat(scoreEarned.value) >= 0;
    const maxValid = scoreMax.value !== "" && maxNumeric && parseFloat(scoreMax.value) >= 0;

    const assignmentSelectionValid = !isEditingExistingAssignment || (assignmentSelect.value !== "" && assignmentSelect.selectedIndex > 0);

    confirmAssignment.disabled = !(categoryValid && earnedValid && maxValid && assignmentSelectionValid);
    removeAssignmentBtn.disabled = !(categoryValid && earnedValid && maxValid && assignmentSelectionValid);


    // Update live percentage display
    updateLivePercentage();
}

function updateLivePercentage() {
    const scoreEarned = document.getElementById("scoreEarned");
    const scoreMax = document.getElementById("scoreMax");
    const livePercentageDisplay = document.getElementById("livePercentageDisplay");
    const editPercentageWrapper = document.getElementById("editPercentageWrapper");
    const editPercentageDisplay = document.getElementById("editPercentageDisplay");

    const earned = parseFloat(scoreEarned.value);
    const max = parseFloat(scoreMax.value);

    // Check if both values are valid numbers and max is greater than 0
    const isValidPercentage = !isNaN(earned) && !isNaN(max) && max > 0 && scoreEarned.value !== "" && scoreMax.value !== "";
    const percentageText = isValidPercentage ? (earned / max * 100).toFixed(2) + "%" : "";

    if (isEditingExistingAssignment) {
        // Edit mode: show percentage between 'points' and REMOVE ASSIGNMENT button
        if (livePercentageDisplay) {
            livePercentageDisplay.textContent = "";
            livePercentageDisplay.classList.remove("visible");
        }
        if (editPercentageWrapper && editPercentageDisplay) {
            editPercentageDisplay.textContent = percentageText;
            if (isValidPercentage) {
                editPercentageWrapper.classList.add("visible");
            } else {
                editPercentageWrapper.classList.remove("visible");
            }
        }
    } else {
        // Add mode: show percentage on the right side
        if (editPercentageWrapper) {
            editPercentageWrapper.classList.remove("visible");
        }
        if (editPercentageDisplay) {
            editPercentageDisplay.textContent = "";
        }
        if (livePercentageDisplay) {
            livePercentageDisplay.textContent = percentageText;
            if (isValidPercentage) {
                livePercentageDisplay.classList.add("visible");
            } else {
                livePercentageDisplay.classList.remove("visible");
            }
        }
    }
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

    const usesCategoryWeights = newGradeData.some(
        (category) => category?.tableUsesCategoryWeights === true
    );

    let newGrade = originalGrade || 0;
    if (usesCategoryWeights) {
        let newWeightedSum = 0;
        let newTotalWeight = 0;

        newGradeData.forEach(category => {
            if (!category.max || parseFloat(category.max) <= 0) return;

            const percentage = (parseFloat(category.points) / parseFloat(category.max)) * 100;
            const weight = parseFloat(category.weight) / 100;

            newWeightedSum += percentage * weight;
            newTotalWeight += weight;
        });

        newGrade = newTotalWeight > 0 ? newWeightedSum / newTotalWeight : originalGrade || 0;
    } else {
        let totalPoints = 0;
        let totalMax = 0;

        newGradeData.forEach(category => {
            const points = parseFloat(category.points);
            const max = parseFloat(category.max);
            if (Number.isNaN(points) || Number.isNaN(max) || max <= 0) return;
            totalPoints += points;
            totalMax += max;
        });

        newGrade = totalMax > 0 ? (totalPoints / totalMax) * 100 : originalGrade || 0;
    }
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
    console.log("[Popup] detectHiddenAssignments called, currentGradeData:", currentGradeData);
    if (!currentGradeData || currentGradeData.length === 0) {
        console.log("[Popup] No grade data, returning empty");
        return [];
    }

    const hiddenAssignments = [];

    for (let i = 0; i < currentGradeData.length; i++) {
        const category = currentGradeData[i];
        console.log(`[Popup] Checking category ${i}: ${category.category}`);

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
                        console.log(`[Popup] Error or no response for category ${i}`);
                        resolve([]);
                    } else {
                        console.log(`[Popup] Got ${response.assignments?.length || 0} assignments for category ${category.category}:`, response.assignments);
                        resolve(response.assignments || []);
                    }
                });
            });
        });

        // Look for assignments with isHidden flag
        assignments.forEach(a => {
            console.log(`[Popup] Assignment "${a.name}" isHidden:`, a.isHidden);
            if (a.isHidden) {
                hiddenAssignments.push({
                    categoryName: category.category,
                    assignmentName: a.name,
                    hiddenMax: parseFloat(a.max).toFixed(2),
                    hiddenEarned: parseFloat(a.points).toFixed(2)
                });
            }
        });
    }

    console.log("[Popup] Total hidden assignments found:", hiddenAssignments.length, hiddenAssignments);
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
        const assignmentName = item.assignmentName || "Hidden Assignment";

        const categoryNameEl = document.createElement("div");
        categoryNameEl.className = "hidden-category-name";
        categoryNameEl.textContent = item.categoryName || "Unknown category";

        const assignmentInfoEl = document.createElement("div");
        assignmentInfoEl.className = "hidden-assignment-info";
        assignmentInfoEl.textContent = `${assignmentName} - scored ${item.hiddenEarned} out of ${item.hiddenMax} points`;

        categoryDiv.appendChild(categoryNameEl);
        categoryDiv.appendChild(assignmentInfoEl);
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

function formatGradeDataCompressed(gradeData, currentGrade) {
    let formatted = `Current Overall Grade: ${currentGrade}%\n\nGrade Categories (summary):\n`;

    gradeData.forEach((category, index) => {
        const pct = category.percentage != null ? `${category.percentage}%` : 'N/A';
        formatted += `${index + 1}. ${category.category}: ${category.points}/${category.max} pts (${pct}) — Weight: ${category.weight}%\n`;
    });

    return formatted;
}

async function callGeminiAPI(userQuery, gradeDataText) {
    // Only raw user text and grade data are sent — the system prompt is owned server-side.
    // aiHistory stores clean turns (user question / model answer) with no prompt injected.
    try {
        const installCtx = await getInstallationContext();
        const response = await fetch(EDGE_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${installCtx.installToken}`
            },
            body: JSON.stringify({
                action: 'callGemini',
                userQuery,
                gradeData: gradeDataText,
                history: aiHistory,
                model: getSelectedAIModel()
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 401 || response.status === 403) {
                await getInstallationContext(true);
            }
            if (errorData.error === "rate_limit_exceeded") {
                throw new Error(errorData.message || "Rate limit exceeded.");
            }
            if (errorData.error === "too_fast") {
                throw new Error(errorData.message || "Please wait a moment before sending another query.");
            }
            if (errorData.error === "query_too_long") {
                throw new Error(errorData.message || "Query is too long.");
            }
            if (errorData.error === "upstream_gemini_error") {
                const detailText = typeof errorData.detail === "string"
                    ? errorData.detail
                    : JSON.stringify(errorData.detail || {});

                // If the selected model is invalid/unavailable, don't mislabel it as a context issue.
                if (/model|not found|unsupported|invalid/i.test(detailText)) {
                    const modelErr = new Error("Selected model unavailable. Please switch models and try again.");
                    modelErr.isModelUnavailable = true;
                    throw modelErr;
                }

                const contextErr = new Error("Context limit exceeded. Please try again.");
                contextErr.isContextLimit = true;
                throw contextErr;
            }
            throw new Error(errorData.error || errorData.detail || `API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const responseText = data.candidates[0].content.parts[0].text;

            aiHistory.push({ role: "user", parts: [{ text: userQuery }] });
            aiHistory.push({ role: "model", parts: [{ text: responseText }] });

            return {
                text: responseText,
                rateLimit: data._rateLimit || null,
                model: typeof data._model === "string" ? data._model : DEFAULT_AI_MODEL
            };
        } else {
            console.error("Unexpected response structure:", JSON.stringify(data, null, 2));
            throw new Error("Unexpected API response format. Check console for details.");
        }
    } catch (error) {
        throw error;
    }
}

const AI_HISTORY_KEY = "aiQueryHistory";
const AI_HISTORY_WINDOW_MS = 60 * 60 * 1000;

async function saveAIHistoryEntry(promptText, answerText) {
    try {
        const now = Date.now();
        const cutoff = now - AI_HISTORY_WINDOW_MS;

        const existing = await new Promise((resolve) => {
            chrome.storage.local.get({ [AI_HISTORY_KEY]: [] }, (data) => {
                resolve(Array.isArray(data[AI_HISTORY_KEY]) ? data[AI_HISTORY_KEY] : []);
            });
        });

        const filtered = existing.filter(entry => typeof entry.timestamp === "number" && entry.timestamp >= cutoff);

        filtered.push({
            prompt: promptText,
            answer: answerText,
            timestamp: now
        });

        chrome.storage.local.set({ [AI_HISTORY_KEY]: filtered });
    } catch (err) {
        console.error("Failed to save AI history entry:", err);
    }
}

async function loadRecentAIHistory() {
    const now = Date.now();
    const cutoff = now - AI_HISTORY_WINDOW_MS;

    return new Promise((resolve) => {
        chrome.storage.local.get({ [AI_HISTORY_KEY]: [] }, (data) => {
            const all = Array.isArray(data[AI_HISTORY_KEY]) ? data[AI_HISTORY_KEY] : [];
            const recent = all
                .filter(entry => typeof entry.timestamp === "number" && entry.timestamp >= cutoff)
                .sort((a, b) => b.timestamp - a.timestamp);
            resolve(recent);
        });
    });
}

function renderAIHistoryList(entries) {
    const listEl = document.getElementById("aiHistoryList");
    if (!listEl) return;

    listEl.innerHTML = "";

    if (!entries.length) {
        listEl.innerHTML = `<div style="font-size: 12px; color: #777;">No AskAI history in the last hour.</div>`;
        return;
    }

    const truncate = (text, maxLen) => {
        const t = String(text ?? "");
        if (t.length <= maxLen) return { text: t, truncated: false };
        return { text: t.slice(0, maxLen).trimEnd() + "…", truncated: true };
    };

    entries.forEach(entry => {
        const container = document.createElement("div");
        container.style.borderBottom = "1px solid #eee";
        container.style.padding = "6px 0";

        const time = new Date(entry.timestamp);
        const timeLabel = time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

        const timeEl = document.createElement("div");
        timeEl.style.fontSize = "11px";
        timeEl.style.color = "#999";
        timeEl.style.marginBottom = "4px";
        timeEl.textContent = timeLabel;

        const qEl = document.createElement("div");
        qEl.style.fontWeight = "600";
        qEl.style.marginBottom = "3px";

        const aEl = document.createElement("div");
        aEl.style.whiteSpace = "pre-wrap";

        const fullPrompt = String(entry.prompt ?? "");
        const fullAnswer = String(entry.answer ?? "");
        const promptPreview = truncate(fullPrompt, 220);
        const answerPreview = truncate(fullAnswer, 700);

        const hasMore = promptPreview.truncated || answerPreview.truncated;
        let expanded = false;

        const render = () => {
            qEl.textContent = `Q: ${expanded ? fullPrompt : promptPreview.text}`;
            aEl.textContent = `A: ${expanded ? fullAnswer : answerPreview.text}`;
        };

        render();

        container.appendChild(timeEl);
        container.appendChild(qEl);
        container.appendChild(aEl);

        if (hasMore) {
            const toggleBtn = document.createElement("button");
            toggleBtn.type = "button";
            toggleBtn.textContent = "Show more";
            toggleBtn.style.border = "none";
            toggleBtn.style.background = "transparent";
            toggleBtn.style.color = "#2196F3";
            toggleBtn.style.cursor = "pointer";
            toggleBtn.style.padding = "0";
            toggleBtn.style.marginTop = "4px";
            toggleBtn.style.fontSize = "12px";

            toggleBtn.addEventListener("click", () => {
                expanded = !expanded;
                toggleBtn.textContent = expanded ? "Show less" : "Show more";
                render();
            });

            container.appendChild(toggleBtn);
        }

        listEl.appendChild(container);
    });
}

async function showAIHistoryView() {
    const dialog = document.getElementById("aiHistoryDialog");

    const entries = await loadRecentAIHistory();
    renderAIHistoryList(entries);

    if (dialog) dialog.style.display = "flex";
}

function hideAIHistoryView() {
    const dialog = document.getElementById("aiHistoryDialog");
    if (dialog) dialog.style.display = "none";
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


    const installCtx = await getInstallationContext();
    if (userIdText) {
        userIdText.textContent = installCtx.userId;
    }
    if (userIdDisplay) {
        userIdDisplay.style.display = "block";
    }

    aiSection.style.display = "block";
    await updateAIRateLimitDisplay();

    if (responseDiv) responseDiv.style.display = "none";
}

function startAILoaderSequence() {
    const loaderDiv = document.getElementById("aiLoader");
    const statusText = document.getElementById("aiLoaderStatus");
    if (!loaderDiv || !statusText) return;

    let currentStep = 0;
    statusText.textContent = AI_STATUS_SEQUENCE[currentStep];
    loaderDiv.style.display = "block";

    if (aiStatusIntervalId) clearInterval(aiStatusIntervalId);
    aiStatusIntervalId = setInterval(() => {
        if (currentStep < AI_STATUS_SEQUENCE.length - 1) {
            currentStep += 1;
            statusText.textContent = AI_STATUS_SEQUENCE[currentStep];
        }
    }, 2000);
}

function stopAILoaderSequence() {
    const loaderDiv = document.getElementById("aiLoader");
    if (aiStatusIntervalId) {
        clearInterval(aiStatusIntervalId);
        aiStatusIntervalId = null;
    }
    if (loaderDiv) {
        loaderDiv.style.display = "none";
    }
}

async function updateAIRateLimitDisplay(serverData) {
    const rateLimitDisplay = document.getElementById("aiRateLimitDisplay");
    const modelToggleRow = document.getElementById("aiModelToggleRow");
    if (!rateLimitDisplay) return;

    let info = serverData;
    if (!info) {
        info = await serverCheckRateLimit();
    }

    if (info.isWhitelisted != null) {
        cachedIsWhitelisted = info.isWhitelisted;
        syncAICharLimit();
    }

    if (info.isWhitelisted) {
        rateLimitDisplay.textContent = "Queries remaining: No limit";
        rateLimitDisplay.style.color = "#1e63e9";
        if (modelToggleRow) {
            modelToggleRow.style.display = "flex";
        }
        return;
    }

    if (modelToggleRow) {
        modelToggleRow.style.display = "none";
    }

    const remaining = info.remaining ?? 0;
    const max = info.max ?? MAX_QUERIES_PER_PERIOD;
    let statusColor = "#2e7d32";

    if (remaining <= 0) {
        statusColor = "#d93025";
    } else if (remaining === 1) {
        statusColor = "#f9a825";
    }

    rateLimitDisplay.textContent = `Queries remaining: ${remaining}/${max}`;
    rateLimitDisplay.style.color = statusColor;
}

function getCurrentAICharLimit() {
    return cachedIsWhitelisted === true ? AI_MAX_CHARS_WHITELISTED : AI_MAX_CHARS_DEFAULT;
}

function syncAICharLimit() {
    const aiQueryInput = document.getElementById("aiQueryInput");
    const charCount = document.getElementById("aiCharCount");
    if (!aiQueryInput) return;

    const maxChars = getCurrentAICharLimit();
    aiQueryInput.setAttribute("maxlength", String(maxChars));

    if (aiQueryInput.value.length > maxChars) {
        aiQueryInput.value = aiQueryInput.value.slice(0, maxChars);
    }

    if (charCount) {
        charCount.textContent = String(maxChars - aiQueryInput.value.length);
    }
}

function getSelectedAIModel() {
    const modelSelect = document.getElementById("aiModelSelect");
    const selected = modelSelect?.value;
    if (selected === DEFAULT_AI_MODEL || selected === PREMIUM_AI_MODEL) {
        return selected;
    }
    return DEFAULT_AI_MODEL;
}

function getModelDisplayName(model) {
    if (model === PREMIUM_AI_MODEL) return "Gemini 3.0 Flash";
    return "Gemini 2.5 Flash";
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatMarkdownInline(text) {
    let escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    escaped = escaped.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    escaped = escaped.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

    return escaped;
}

async function streamAIResponse(responseDiv, responseText, rateLimitLabel = "") {
    if (!responseDiv) return;

    responseDiv.innerHTML = "";
    responseDiv.style.display = "block";

    const lines = responseText.split("\n");

    for (let i = 0; i < lines.length; i++) {
        const line = document.createElement("div");
        line.className = "ai-response-line";
        line.innerHTML = lines[i].length ? formatMarkdownInline(lines[i]) : " ";
        responseDiv.appendChild(line);
        responseDiv.scrollTop = responseDiv.scrollHeight;
        await sleep(80);
    }

    if (rateLimitLabel) {
        const note = document.createElement("div");
        note.className = "ai-rate-limit-note";
        note.textContent = rateLimitLabel;
        responseDiv.appendChild(note);
    }
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
    const sendButton = document.getElementById("sendAIQuery");

    const userQuery = queryInput.value.trim();
    if (!userQuery) {
        reEnableSendButton(clickTimestamp);
        return;
    }

    sendButton.disabled = true;
    startAILoaderSequence();
    responseDiv.style.display = "none";

    try {
        const gradeData = await collectAllGradeData();
        if (!gradeData || gradeData.length === 0) {
            throw new Error("No grade data available. Please calculate your grade first.");
        }

        const currentGrade = originalGrade || (document.querySelector(".grade-value")?.textContent?.replace('%', '') || 0);
        const shouldCompress = useCompressedContext && cachedIsWhitelisted === false;
        const formattedData = shouldCompress
            ? formatGradeDataCompressed(gradeData, parseFloat(currentGrade) || 0)
            : formatGradeDataForAPI(gradeData, parseFloat(currentGrade) || 0);

        const result = await callGeminiAPI(userQuery, formattedData);

        useCompressedContext = false;
        stopAILoaderSequence();
        await sleep(50);

        const modelLabel = cachedIsWhitelisted === true
            ? `Using: ${getModelDisplayName(result.model)}`
            : "";
        responseDiv.style.color = "#333";
        await streamAIResponse(responseDiv, result.text, modelLabel);
        await updateAIRateLimitDisplay(result.rateLimit);
        await saveAIHistoryEntry(userQuery, result.text);
    } catch (error) {
        stopAILoaderSequence();
        if (error.isContextLimit && cachedIsWhitelisted === false) {
            useCompressedContext = true;
        }
        responseDiv.textContent = `Error: ${error.message}`;
        responseDiv.style.color = "red";
        responseDiv.style.display = "block";
        await updateAIRateLimitDisplay();
    } finally {
        reEnableSendButton(clickTimestamp);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    //console.log("Popup DOM loaded");

    function showCompactErrorView() {
        document.body.classList.add('show-compact');
    }

    function isAeriesHostUrl(url) {
        if (typeof url !== "string" || !url) return false;
        try {
            const parsed = new URL(url);
            const host = parsed.hostname.toLowerCase();
            return host.endsWith(".aeries.net")
                || host.endsWith(".aeries.com")
                || host.endsWith(".aeriescloud.net");
        } catch (_error) {
            return false;
        }
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
            const tab = await chrome.tabs.get(tabId);
            if (!isAeriesHostUrl(tab?.url)) {
                showCompactErrorView();
                return;
            }

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
                    if (count >= HIDDEN_WARNING_DISMISS_LIMIT) {
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
        confirmAssignment.textContent = "Update Assignment";
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
    const aiHistoryButton = document.getElementById("aiHistoryButton");
    const aiModelSelect = document.getElementById("aiModelSelect");

    if (aiModelSelect) {
        chrome.storage.local.get({ [AI_MODEL_KEY]: DEFAULT_AI_MODEL }, (data) => {
            const savedModel = data[AI_MODEL_KEY];
            aiModelSelect.value = (savedModel === PREMIUM_AI_MODEL || savedModel === DEFAULT_AI_MODEL)
                ? savedModel
                : DEFAULT_AI_MODEL;
        });

        aiModelSelect.addEventListener("change", () => {
            const nextModel = getSelectedAIModel();
            chrome.storage.local.set({ [AI_MODEL_KEY]: nextModel });
        });
    }

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
            sendAIQueryButton.dataset.sending = "1";
            const clickTimestamp = Date.now();

            handleAIQuery(clickTimestamp).finally(() => {
                delete sendAIQueryButton.dataset.sending;
                updateAIInputState();
            });
        });
    }

    if (aiHistoryButton) {
        aiHistoryButton.addEventListener("click", async (e) => {
            e.preventDefault();
            await showAIHistoryView();
        });
    }

    const AI_MIN_CHARS = 3;

    function updateAIInputState() {
        if (!aiQueryInput) return;
        const len = aiQueryInput.value.length;
        const AI_MAX_CHARS = getCurrentAICharLimit();
        const remaining = AI_MAX_CHARS - len;

        const charCount = document.getElementById("aiCharCount");
        if (charCount) {
            charCount.textContent = remaining;
            if (remaining <= 0) {
                charCount.style.color = "#d93025";
            } else if (remaining < 50) {
                charCount.style.color = "#f9a825";
            } else {
                charCount.style.color = "#999";
            }
        }

        if (sendAIQueryButton && !sendAIQueryButton.dataset.sending) {
            sendAIQueryButton.disabled = len < AI_MIN_CHARS;
        }
    }

    if (aiQueryInput) {
        syncAICharLimit();
        aiQueryInput.addEventListener("input", updateAIInputState);

        aiQueryInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && e.ctrlKey) {
                e.preventDefault();

                const trimmed = aiQueryInput.value.trim();
                if (trimmed.length < AI_MIN_CHARS) return;

                const sendButton = document.getElementById("sendAIQuery");
                if (sendButton) {
                    sendButton.disabled = true;
                    sendButton.dataset.sending = "1";
                    const clickTimestamp = Date.now();
                    handleAIQuery(clickTimestamp).finally(() => {
                        delete sendButton.dataset.sending;
                        updateAIInputState();
                    });
                } else {
                    handleAIQuery(Date.now());
                }
            }
        });
    }

    const aiHistoryBackButton = document.getElementById("aiHistoryBackButton");
    if (aiHistoryBackButton) {
        aiHistoryBackButton.addEventListener("click", (e) => {
            e.preventDefault();
            hideAIHistoryView();
        });
    }

    // Share button functionality
    const shareButton = document.getElementById("shareButton");
    const shareButtonText = document.getElementById("shareButtonText");
    let shareButtonResetTimer = null;

    if (shareButton) {
        shareButton.addEventListener("click", async () => {
            const extensionUrl = "https://chromewebstore.google.com/detail/aeries-grade-calculator/dmambbnjadglkainpnjfidolknpdoljm";

            try {
                await navigator.clipboard.writeText(extensionUrl);

                shareButton.classList.add("copied");
                if (shareButtonText) shareButtonText.textContent = "copied!";

                if (shareButtonResetTimer) clearTimeout(shareButtonResetTimer);
                shareButtonResetTimer = setTimeout(() => {
                    shareButton.classList.remove("copied");
                    if (shareButtonText) shareButtonText.textContent = "share!";
                    shareButtonResetTimer = null;
                }, 1500);
            } catch (err) {
                console.error("Failed to copy link:", err);
                alert("Copy this link: " + extensionUrl);
            }
        });
    }

});

