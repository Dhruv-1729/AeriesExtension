// popup.js


function renderAssignmentsList() {
    const assignmentsList = document.getElementById("assignmentsList");
<<<<<<< HEAD
    const undoRemoveContainer = document.getElementById("undoRemoveContainer"); // Get the container

=======
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5

    if (!assignmentsList) return;

    assignmentsList.innerHTML = "";

    if (whatIfAssignments.length === 0) {
        assignmentsList.innerHTML = '<p class="no-assignments">No assignments added yet.</p>';
        return;
    }
<<<<<<< HEAD
    if (lastRemovedOperation) {
        undoRemoveContainer.style.display = "block";
    } else {
        undoRemoveContainer.style.display = "none";
    }
=======

>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
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
        button.addEventListener("click", function() {
            const index = parseInt(this.getAttribute("data-index"));
            editAssignment(index);
        });
    });

    document.querySelectorAll(".delete-btn").forEach(button => {
        button.addEventListener("click", function() {
            const index = parseInt(this.getAttribute("data-index"));
            deleteAssignment(index);
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
<<<<<<< HEAD
    const removeAssignmentBtn = document.getElementById("removeAssignmentBtn"); 
    const undoRemoveContainer = document.getElementById("undoRemoveContainer"); 

=======
    const removeAssignmentBtn = document.getElementById("removeAssignmentBtn"); // ADD THIS
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5

    categorySelect.value = "";
    scoreEarned.value = "";
    scoreMax.value = "";
    confirmAssignment.disabled = true;
    assignmentSelect.innerHTML = '<option value="" disabled selected>Select Assignment</option>';
    assignmentSelect.style.display = "none";
<<<<<<< HEAD
    removeAssignmentBtn.style.display = "none";
    undoRemoveContainer.style.display = "none"; 
    if(undoRemoveContainer) undoRemoveContainer.style.display = "none"; 
=======
    removeAssignmentBtn.style.display = "none"; // ADD THIS LINE to hide the button

>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
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

// global vars
let currentGradeData = null;
let currentTeacher = null;
<<<<<<< HEAD
let lastRemovedOperation = null;
=======
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
let tempAeriesOriginalEarned = null;
let tempAeriesOriginalMax = null;
let tempAeriesAssignmentName = null;
let originalGrade = null;
let whatIfAssignments = [];
let isEditingExistingAssignment = false;
async function displayResult(result) {
    hideLoader();
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
    } else {
        resultElement.innerHTML = `<span style="color: red;">${result.message}</span>`;
        resetHistoryContainer.style.display = "none";
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
<<<<<<< HEAD
    const undoRemoveContainer = document.getElementById("undoRemoveContainer"); 
=======
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
    if (whatifSection.style.display === "block") {
        whatifSection.style.display = "none";
        whatIfAssignments = []; 
        document.getElementById("assignmentForm").style.display = "none"; 
        resetAssignmentForm();
<<<<<<< HEAD
        lastRemovedOperation = null; 
=======
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
    } else {
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
<<<<<<< HEAD
=======
    //console.log("Category dropdown populated with", categorySelect.options.length -1 , "categories");
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
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
<<<<<<< HEAD
            lastRemovedOperation = null;
            document.getElementById("undoRemoveContainer").style.display = "none";
        } else { 
            removeAssignmentBtn.style.display = "none";
=======
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
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
    const maxValid = scoreMax.value !== "" && maxNumeric && parseFloat(scoreMax.value) > 0; 

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
        const startGrade = parseFloat(whatifGradeDisplay.textContent.replace('%','')) || originalGrade || 0;
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

function moveFormBelow(buttonElement) {
    const form = document.getElementById("assignmentForm");
    if (buttonElement && form) {
        buttonElement.insertAdjacentElement("afterend", form);
        form.style.display = "block"; 
    } else {
        console.warn("Could not move form, buttonElement or form not found", buttonElement, form);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    //console.log("Popup DOM loaded!");

    document.getElementById("calculate").addEventListener("click", () => {
        showLoader();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0] || !tabs[0].id) {
                console.error("No active tab to calculate grade.");
                displayResult({ success: false, message: "Error: No active tab found." });
                return;
            }

                chrome.tabs.sendMessage(tabs[0].id, { action: "calculateGrade" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Runtime error from calculateGrade:", chrome.runtime.lastError.message);
                        displayResult({ success: false, message: "Error: Could not fetch data from page." });
                    } else if (response) {
                        displayResult(response);
                    } else {
                        displayResult({ success: false, message: "No response from content script for grade calculation." });
                    }
                });
        });
    });

    const resetButton = document.getElementById("resetHistory");
    resetButton.addEventListener("click", () => {
        const teacher = document.getElementById("result")?.getAttribute("data-teacher");
        if (teacher) {
            resetGradeHistory(teacher);
        } else {
            //console.log("No teacher found to reset history for.");
        }
    });

    const addAssignmentBtn = document.getElementById("addAssignmentBtn");
    const assignmentForm = document.getElementById("assignmentForm");
    const categorySelect = document.getElementById("categorySelect");
    const assignmentSelect = document.getElementById("assignmentSelect"); 
    const scoreEarned = document.getElementById("scoreEarned");
    const scoreMax = document.getElementById("scoreMax");
    const confirmAssignment = document.getElementById("confirmAssignment");
    const editAssignmentBtn = document.getElementById("editAssignmentBtn");
    const removeAssignmentBtn = document.getElementById("removeAssignmentBtn");
<<<<<<< HEAD
    const undoRemoveBtn = document.getElementById("undoRemoveBtn"); 
    const undoRemoveContainer = document.getElementById("undoRemoveContainer"); 

    const undoIconImg = document.createElement('img');
    undoIconImg.src = chrome.runtime.getURL("undoicon.png"); 
    undoIconImg.alt = "Undo";
    undoRemoveBtn.prepend(undoIconImg);

=======
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5

    addAssignmentBtn.addEventListener("click", () => {
        resetAssignmentForm(); 
        isEditingExistingAssignment = false;
        tempAeriesOriginalEarned = null;
        tempAeriesOriginalMax = null;
<<<<<<< HEAD
        tempAeriesAssignmentName = null;
        lastRemovedOperation = null;    
        document.getElementById("undoRemoveContainer").style.display = "none"; 
=======
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
        confirmAssignment.textContent = "Add Assignment";
        assignmentSelect.style.display = "none"; 
        moveFormBelow(addAssignmentBtn);
        checkFormValidity();
    });

    editAssignmentBtn.addEventListener("click", () => {
        resetAssignmentForm();
        isEditingExistingAssignment = true;
<<<<<<< HEAD
        lastRemovedOperation = null;
        document.getElementById("undoRemoveContainer").style.display = "none"; 
=======
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
        confirmAssignment.textContent = "Update (Aeries) Assignment"; 
        categorySelect.value = "";
        assignmentSelect.innerHTML = '<option value="" disabled selected>Select category first</option>';
        assignmentSelect.style.display = "block"; 
        moveFormBelow(editAssignmentBtn);
        checkFormValidity();
    });
<<<<<<< HEAD
// In DOMContentLoaded, after getting removeAssignmentBtn
    removeAssignmentBtn.addEventListener("click", () => {
        if (!isEditingExistingAssignment || tempAeriesOriginalEarned === null || tempAeriesAssignmentName === null) {
            console.warn("[removeAssignmentBtn] Conditions not met for removal:",
                "isEditingExistingAssignment:", isEditingExistingAssignment,
                "tempAeriesOriginalEarned:", tempAeriesOriginalEarned,
                "tempAeriesAssignmentName:", tempAeriesAssignmentName);
            return;
        }

        const categoryIndex = parseInt(categorySelect.value);
        const categoryName = currentGradeData[categoryIndex]?.category || "Unknown";

          lastRemovedOperation = {
            id: crypto.randomUUID(),
            name: tempAeriesAssignmentName,
            categoryIndex,
            categoryName,
            originalEarned: tempAeriesOriginalEarned,
            originalMax: tempAeriesOriginalMax,
        };
        // console.log("Stored for undo:", lastRemovedOperation);

        const removalWhatIf = {
            id: lastRemovedOperation.id,
            categoryIndex,
            categoryName,
            name: tempAeriesAssignmentName,
            earned: 0,
            max: 0,
            originalEarned: tempAeriesOriginalEarned,
            originalMax: tempAeriesOriginalMax,
            type: 'removed'
        };

        whatIfAssignments.push(removalWhatIf);

        // Update UI
        renderAssignmentsList(); // This will also manage undo button visibility
        recalculateWhatIfGrade();
        // document.getElementById("undoRemoveContainer").style.display = "block"; // Handled by renderAssignmentsList
        assignmentForm.style.display = "none";
        resetAssignmentForm(); // This also hides removeAssignmentBtn and undoRemoveContainer
    });


    undoRemoveBtn.addEventListener("click", () => {
    if (!lastRemovedOperation) {
        return;
    }

    const indexToRemove = whatIfAssignments.findIndex(
        (op) => op.id === lastRemovedOperation.id && op.type === 'removed'
    );

    if (indexToRemove > -1) {
        whatIfAssignments.splice(indexToRemove, 1);
    } else {
        console.warn("Could not find the 'removed' operation to undo in whatIfAssignments.");
    }

    lastRemovedOperation = null;
    undoRemoveContainer.style.display = "none";

    renderAssignmentsList();
    recalculateWhatIfGrade();
=======
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
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
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
});

<<<<<<< HEAD
//console.log("🟡 popup.js script loaded. whatIfAssignments initial:", JSON.stringify(whatIfAssignments, null, 2));
=======
//console.log("🟡 popup.js script loaded. whatIfAssignments initial:", JSON.stringify(whatIfAssignments, null, 2));
>>>>>>> fa2787a77fff5f22002b5b908e9d133e9f81c5d5
