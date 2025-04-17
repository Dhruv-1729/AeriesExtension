

function saveGrade(grade, teacher) {
    return new Promise((resolve) => {
        const currentDate = new Date().toLocaleString();

        chrome.storage.local.get({ gradesByTeacher: {} }, (data) => {
            const gradesByTeacher = data.gradesByTeacher || {};

            if (!gradesByTeacher[teacher]) {
                gradesByTeacher[teacher] = [];
            }

            const lastGrade = gradesByTeacher[teacher][0]?.grade;
            if (lastGrade && parseFloat(lastGrade) === parseFloat(grade)) {
                resolve(false);
                return;
            }

            gradesByTeacher[teacher].unshift({ grade, date: currentDate });
            gradesByTeacher[teacher] = gradesByTeacher[teacher].slice(0, 3);

            chrome.storage.local.set({ gradesByTeacher }, () => {
                if (chrome.runtime.lastError) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    });
}

function displayLastGrades(currentGrade, currentTeacher) {
    const historyElement = document.getElementById("history");

    chrome.storage.local.get({ gradesByTeacher: {} }, (data) => {
        const gradesByTeacher = data.gradesByTeacher || {};
        const grades = gradesByTeacher[currentTeacher] || [];

        if (grades.length === 0) {
            historyElement.innerHTML = "<p>No past grades available for this teacher.</p>";
            return;
        }

        const historyHTML = grades.map((entry, index, arr) => {
            const prevGrade = arr[index + 1]?.grade || entry.grade;
            const gradeChange = entry.grade - prevGrade;
            const changeColor = gradeChange > 0 ? "green" : gradeChange < 0 ? "red" : "gray";
            const changeSymbol = gradeChange > 0 ? "+" : "";

            return `
                <div style="margin-bottom: 10px; line-height: 1.5;">
                    <span><strong>${entry.grade}%</strong> (${entry.date})</span>
                    <span style="color: ${changeColor}; margin-left: 5px;">${changeSymbol}${gradeChange.toFixed(2)}%</span>
                </div>`;
        }).join("");

        historyElement.innerHTML = `
            <h4 style="font-size: 1.2em; color: purple;">Last 3 Grades:</h4>
            ${historyHTML}
        `;
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

let currentGradeData = null;
let currentTeacher = null;
let originalGrade = null;
let whatIfAssignments = [];
let weightedSum = 0;
let totalWeight = 0;

async function displayResult(result) {
    hideLoader();

    const resultElement = document.getElementById("result");
    const resetHistoryContainer = document.getElementById("resetHistoryContainer");
    const existingIcon = document.querySelector(".calculate-icon");
    const calculateIcon = existingIcon || document.createElement("img");

    if (result.success) {
        originalGrade = parseFloat(result.grade);
        currentTeacher = result.teacher;

        resultElement.innerHTML = `
            <div class="grade-label" style="text-align: center;">Overall Grade is</div>
            <div class="grade-container" style="display: flex; justify-content: center; align-items: center; gap: 10px;">
                <div class="grade-value">${result.grade}%</div>
            </div>
        `;

        calculateIcon.src = chrome.runtime.getURL("Calculator Icon.png");
        calculateIcon.alt = "What-If Calculator";
        calculateIcon.className = "calculate-icon";
        calculateIcon.title = "Try What-If Grade";
        calculateIcon.style.display = "inline-block";

        if (!existingIcon) {
            calculateIcon.addEventListener("click", toggleWhatIfMode);
            document.querySelector(".grade-container").appendChild(calculateIcon);
        }

        resultElement.setAttribute("data-teacher", result.teacher);
        await saveGrade(result.grade, result.teacher);
        displayLastGrades(result.grade, result.teacher);
        resetHistoryContainer.style.display = "block";
    } else {
        resultElement.innerHTML = `<span style="color: red;">${result.message}</span>`;
        resetHistoryContainer.style.display = "none";
    }
}

// Additional What-If logic omitted for brevity; you can paste it below this block if needed.


// Function to reset grade history for the current teacher
function resetGradeHistory(teacher) {
    chrome.storage.local.get({ gradesByTeacher: {} }, (data) => {
        const gradesByTeacher = data.gradesByTeacher || {};

        if (gradesByTeacher[teacher]) {
            delete gradesByTeacher[teacher]; // Remove the teacher's grade history
            chrome.storage.local.set({ gradesByTeacher }, () => {
                if (chrome.runtime.lastError) {
                    console.error("Error resetting grade history:", chrome.runtime.lastError.message);
                } else {
                    console.log(`Grade history reset for ${teacher}`);
                    displayLastGrades(null, teacher); // Refresh the displayed history
                    document.getElementById("resetHistoryContainer").style.display = "none"; // Hide the button after reset
                }
            });
        }
    });
}


function toggleWhatIfMode() {
    const whatifSection = document.getElementById("whatifSection");

    if (whatifSection.style.display === "block") {
        whatifSection.style.display = "none";
        // Reset assignments when closing what-if mode
        whatIfAssignments = [];
    } else {
        whatifSection.style.display = "block";
        fetchGradeDataForDropdown();
        document.getElementById("whatifGradeValue").textContent = `${originalGrade?.toFixed(2) ?? '0.00'}%`;
        renderAssignmentsList(); // Render empty list
    }
}

function fetchGradeDataForDropdown() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: "getGradeData" }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("Runtime error:", chrome.runtime.lastError.message);
            } else if (response && response.gradeData) {
                currentGradeData = response.gradeData;
                populateCategoryDropdown(currentGradeData);
            } else {
                console.error("No grade data received for dropdown.");
                populateCategoryDropdown([]); // Ensure dropdown is updated even with no data
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
            option.textContent = category.category; // Display only category for now
            categorySelect.appendChild(option);
        });
    } else {
        categorySelect.innerHTML = '<option value="" disabled selected>No categories available</option>';
    }
}
    
    console.log("Dropdown populated with", categorySelect.children.length - 1, "categories");

// In popup.js

function calculateWhatIfGrade(gradeData, earnedPoints, maxPoints, categoryIndex) {
    console.log("calculateWhatIfGrade called with:", { gradeData, earnedPoints, maxPoints, categoryIndex });

    // Make sure we have valid data
    if (!gradeData || !gradeData.length || !gradeData[categoryIndex]) {
        console.error("Invalid grade data or category index");
        return originalGrade || 0; // Return original grade instead of 0
    }

    // Create a deep copy of the grade data
    const newGradeData = JSON.parse(JSON.stringify(gradeData));
    const category = newGradeData[categoryIndex];
    console.log("Selected category:", category);

    // Add the new assignment to the selected category
    const addedPoints = parseFloat(earnedPoints);
    const addedMax = parseFloat(maxPoints);
    
    // Make sure we have numbers to work with
    category.points = parseFloat(category.points || 0);
    category.max = parseFloat(category.max || 0);
    category.weight = parseFloat(category.weight || 100);
    
    category.points += addedPoints;
    category.max += addedMax;
    
    console.log("Category after adding assignment:", category);

    // Calculate the new grade
    let weightedSum = 0;
    let totalWeight = 0;

    newGradeData.forEach(cat => {
        // Skip categories with no max points
        if (!cat.max || cat.max === 0) {
            console.log("Skipping category with no max points:", cat.category);
            return;
        }

        // Calculate percentage for this category
        const percentage = (cat.points / cat.max) * 100;
        console.log(`Category ${cat.category}: ${cat.points}/${cat.max} = ${percentage.toFixed(2)}%`);
        
        // Calculate weighted contribution
        const weight = parseFloat(cat.weight || 100);
        const weightedContribution = (weight / 100) * percentage;
        
        console.log(`Category ${cat.category} contributes ${weightedContribution.toFixed(2)} weighted points with weight ${weight}%`);
        
        weightedSum += weightedContribution;
        totalWeight += (weight / 100);
    });

    // Calculate final grade
    let newGrade;
    if (totalWeight > 0) {
        newGrade = weightedSum / totalWeight;
    } else {
        // If there's no valid weight data, fall back to the original grade
        console.warn("No valid weight data, returning original grade");
        newGrade = originalGrade || 0;
    }
    
    console.log(`New grade calculation: ${weightedSum.toFixed(2)} / ${totalWeight.toFixed(2)} = ${newGrade.toFixed(2)}%`);
    return newGrade;
}



document.addEventListener('DOMContentLoaded', () => {
    console.log("Popup DOM loaded!");

    // Set up event listener for calculate button
    document.getElementById("calculate").addEventListener("click", () => {
        showLoader(); // Show the loader when the button is clicked

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            setTimeout(() => {
                // Simulate a loading delay
                chrome.tabs.sendMessage(tabs[0].id, { action: "calculateGrade" }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("Runtime error:", chrome.runtime.lastError.message);
                        displayResult({ success: false, message: "Error: Could not fetch data." });
                    } else {
                        displayResult(response || { success: false, message: "No response from content script." });
                    }
                });
            }, 1000); // 1-second delay
        });

    });
    
    
    // Set up event listener for reset history button
    const resetButton = document.getElementById("resetHistory");
    resetButton.addEventListener("click", () => {
        const teacher = document.getElementById("result").getAttribute("data-teacher");
        if (teacher) {
            resetGradeHistory(teacher);
        } else {
            console.log("No teacher found to reset history for.");
        }
    });
    
    // Set up event listeners for what-if calculator
    const addAssignmentBtn = document.getElementById("addAssignmentBtn");
    const assignmentForm = document.getElementById("assignmentForm");
    const categorySelect = document.getElementById("categorySelect");
    const scoreEarned = document.getElementById("scoreEarned");
    const scoreMax = document.getElementById("scoreMax");
    const confirmAssignment = document.getElementById("confirmAssignment");
    
    // Toggle assignment form
    addAssignmentBtn.addEventListener("click", () => {
        if (assignmentForm.style.display === "block") {
            assignmentForm.style.display = "none";
        } else {
            assignmentForm.style.display = "block";
            resetAssignmentForm();
        }
    });
    
    // Enable/disable confirm button based on form validity
    function checkFormValidity() {
        const categoryValid = categorySelect.value !== "";
        const earnedValid = scoreEarned.value !== "" && !isNaN(parseFloat(scoreEarned.value)) && parseFloat(scoreEarned.value) >= 0;
        const maxValid = scoreMax.value !== "" && !isNaN(parseFloat(scoreMax.value)) && parseFloat(scoreMax.value) > 0;
        
        confirmAssignment.disabled = !(categoryValid && earnedValid && maxValid);
    }
    
    
    categorySelect.addEventListener("change", checkFormValidity);
    scoreEarned.addEventListener("input", checkFormValidity);
    scoreMax.addEventListener("input", checkFormValidity);
    
    // Handle adding an assignment
    
    confirmAssignment.addEventListener("click", () => {
        console.log("confirmAssignment button clicked!");
        const categorySelect = document.getElementById("categorySelect");
        const scoreEarned = document.getElementById("scoreEarned");
        const scoreMax = document.getElementById("scoreMax");
        
        const categoryIndex = parseInt(categorySelect.value);
        const earned = parseFloat(scoreEarned.value);
        const max = parseFloat(scoreMax.value);
        
        // Get the category name
        const categoryName = currentGradeData[categoryIndex]?.category || "Unknown Category";
        
        // Check if we're editing an existing assignment
        const editIndex = confirmAssignment.getAttribute("data-edit-index");
        
        if (editIndex !== null && editIndex !== undefined) {
            // Update the existing assignment
            whatIfAssignments[editIndex] = {
                categoryIndex,
                categoryName,
                earned,
                max
            };
            
            // Reset the edit mode
            confirmAssignment.removeAttribute("data-edit-index");
            confirmAssignment.textContent = "Input Assignment";
        } else {
            // Add a new assignment
            whatIfAssignments.push({
                categoryIndex,
                categoryName,
                earned,
                max
            });
        }
        // Render the updated list
        renderAssignmentsList();
        
        // Recalculate the what-if grade
        recalculateWhatIfGrade();
        
        // Reset and hide the form
        resetAssignmentForm();
        document.getElementById("assignmentForm").style.display = "none";
    });
    function renderAssignmentsList() {
        const assignmentsList = document.getElementById("assignmentsList");
        
        if (!assignmentsList) return;
        
        // Clear the list
        assignmentsList.innerHTML = "";
        
        if (whatIfAssignments.length === 0) {
            assignmentsList.innerHTML = '<p class="no-assignments">No assignments added yet.</p>';
            return;
        }
        
        // Add each assignment to the list
        whatIfAssignments.forEach((assignment, index) => {
            const assignmentItem = document.createElement("div");
            assignmentItem.className = "assignment-item";
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
            assignmentsList.appendChild(assignmentItem);
        });
        
        // Add event listeners for edit and delete buttons
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
    function recalculateWhatIfGrade() {
        if (!currentGradeData || currentGradeData.length === 0) {
            console.error("No grade data available for recalculation");
            return;
        }
        
        // Create a deep copy of the grade data
        const newGradeData = JSON.parse(JSON.stringify(currentGradeData));
        
        // Apply all what-if assignments to the copied grade data
        whatIfAssignments.forEach(assignment => {
            const category = newGradeData[assignment.categoryIndex];
            if (category) {
                // Make sure we're working with numbers
                const currentPoints = parseFloat(category.points) || 0;
                const currentMax = parseFloat(category.max) || 0;
                
                // Add the assignment points
                category.points = currentPoints + parseFloat(assignment.earned);
                category.max = currentMax + parseFloat(assignment.max);
                
                console.log(`Updated category ${category.category}: ${currentPoints}+${assignment.earned}/${currentMax}+${assignment.max}`);
            }
        });
        
        // Calculate the new grade with the updated data
        let weightedSum = 0;
        let totalWeight = 0;
        
        newGradeData.forEach(cat => {
            // Skip categories with no max points
            if (!cat.max || cat.max === 0) {
                return;
            }
            
            // Calculate percentage for this category
            const percentage = (cat.points / cat.max) * 100;
            
            // Calculate weighted contribution
            const weight = parseFloat(cat.weight || 100);
            const weightedContribution = (weight / 100) * percentage;
            
            console.log(`Category ${cat.category}: ${cat.points}/${cat.max} = ${percentage.toFixed(2)}% × ${weight}% = ${weightedContribution.toFixed(2)}`);
            
            weightedSum += weightedContribution;
            totalWeight += (weight / 100);
        });
        
        // Calculate final grade
        let newGrade;
        if (totalWeight > 0) {
            newGrade = weightedSum / totalWeight;
        } else {
            newGrade = originalGrade || 0;
        }

        
    console.log(`Final What-If Grade: ${newGrade.toFixed(2)}%`);
    const whatifGradeDisplay = document.getElementById("whatifGradeValue");
    if (whatifGradeDisplay) {
        const startGrade = parseFloat(whatifGradeDisplay.textContent) || originalGrade || 0;
        const endGrade = newGrade;
        
        animateGradeChange(whatifGradeDisplay, startGrade, endGrade);
    }
    
    return newGrade;
}


        
    // Add this function to edit an assignment
    function editAssignment(index) {
        console.log(`Editing assignment at index ${index}`);
        const assignment = whatIfAssignments[index];
        if (!assignment) {
            console.error(`No assignment found at index ${index}`);
            return;
        }
        
        // Fill the form with the assignment data
        const categorySelect = document.getElementById("categorySelect");
        const scoreEarned = document.getElementById("scoreEarned");
        const scoreMax = document.getElementById("scoreMax");
        const confirmAssignment = document.getElementById("confirmAssignment");
        const assignmentForm = document.getElementById("assignmentForm");
        
        categorySelect.value = assignment.categoryIndex;
        scoreEarned.value = assignment.earned;
        scoreMax.value = assignment.max;
        
        // Show the form
        assignmentForm.style.display = "block";
        
        // Update the confirm button to indicate editing mode
        confirmAssignment.setAttribute("data-edit-index", index);
        confirmAssignment.textContent = "Update Assignment";
        confirmAssignment.disabled = false;
    }
    function deleteAssignment(index) {
        console.log(`Deleting assignment at index ${index}`);
        // Remove the assignment from the array
        whatIfAssignments.splice(index, 1);
        
        // Re-render the list
        renderAssignmentsList();
        
        // Recalculate the what-if grade
        recalculateWhatIfGrade();
    }
        
        // Update the what-if grade display with animation
        function resetAssignmentForm() {
            const categorySelect = document.getElementById("categorySelect");
            const scoreEarned = document.getElementById("scoreEarned");
            const scoreMax = document.getElementById("scoreMax");
            const confirmAssignment = document.getElementById("confirmAssignment");
            
            categorySelect.value = "";
            scoreEarned.value = "";
            scoreMax.value = "";
            confirmAssignment.disabled = true;
            
            // Reset edit mode if active
            if (confirmAssignment.hasAttribute("data-edit-index")) {
                confirmAssignment.removeAttribute("data-edit-index");
                confirmAssignment.textContent = "Input Assignment";
            }
        }
    
    function animateGradeChange(element, startValue, endValue) {
        const duration = 1000; // 1 second
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
    
});
