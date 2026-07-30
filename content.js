function getTeacherName() {
    const teacherElement = document.querySelector("#ctl00_MainContent_subGBS_lblTeacherName");
    return teacherElement ? teacherElement.innerText.trim() : "Unknown";
}

//message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "calculateGrade") {
        const result = calculateGrade();
        sendResponse(result);
    } else if (request.action === "getGradeData") {
        const gradeData = getGradeTableData();
        sendResponse({ gradeData });
    } else if (request.action === "aeriesDetected") {
        sendResponse({ success: true });
    }
    else if (request.action === "getAssignmentsInCategory") {
        const categoryData = getGradeTableData();
        const categoryName = categoryData[request.categoryIndex]?.category;
        //console.log("Fetching assignments for category:", categoryName);
        if (categoryName) {
            const assignments = getAssignmentsFromPage(categoryName);
            //console.log("Found assignments:", assignments);
            sendResponse({ assignments });
        } else {
            //console.log("Category not found for index:", request.categoryIndex);
            sendResponse({ assignments: [] });
        }
    }
    return true;
});


const teacherName = getTeacherName();

function getAssignmentsFromPage(categoryName) {
    const assignments = [];
    const potentialHiddenAssignments = []; // Assignments with max but no visible points

    function normalize(str) {
        return str.replace(/\s+/g, " ").trim().toLowerCase();
    }

    // First, get the category totals from the summary table
    let categoryTotalPoints = 0;
    let categoryTotalMax = 0;
    const summaryRows = document.querySelectorAll("tr[id^='ctl00_MainContent_subGBS_DataSummary_']");
    summaryRows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells.length >= 4) {
            const rowCategoryName = cells[0]?.innerText.trim();
            if (normalize(rowCategoryName) === normalize(categoryName)) {
                const hasPercOfGrade = cells.length >= 6;
                const pointsText = hasPercOfGrade ? cells[2]?.innerText.trim() : cells[1]?.innerText.trim();
                const maxText = hasPercOfGrade ? cells[3]?.innerText.trim() : cells[2]?.innerText.trim();
                categoryTotalPoints = parseFloat(pointsText.replace(/[^0-9.]/g, "")) || 0;
                categoryTotalMax = parseFloat(maxText.replace(/[^0-9.]/g, "")) || 0;
            }
        }
    });

    // Find all assignment cards
    const cards = document.querySelectorAll("div.Card");

    cards.forEach(card => {
        let points = null;
        let max = null;
        let maxFromHidden = null; // Max value even if hidden (for detecting hidden graded assignments)
        let name = "Unnamed Assignment";
        let foundCategory = false;
        let dueDate = null;

        // Try to get score from the ScoreCard structure (handles hidden scores)
        const scoreCard = card.querySelector(".ScoreCard");
        if (scoreCard) {
            const spans = scoreCard.querySelectorAll("span");
            if (spans.length >= 3) {
                // Structure: [points, "/", max]
                const pointsText = spans[0].textContent.trim();
                const maxText = spans[2].textContent.trim();

                // Always capture the max value (even if hidden with display:none)
                if (maxText !== "") {
                    maxFromHidden = parseFloat(maxText);
                }

                if (pointsText !== "" && maxText !== "") {
                    const parsedPoints = parseFloat(pointsText);
                    const parsedMax = parseFloat(maxText);
                    if (!isNaN(parsedPoints) && !isNaN(parsedMax)) {
                        points = parsedPoints;
                        max = parsedMax;
                    }
                }
            }
        }

        // Fallback: try parsing from innerText if ScoreCard method didn't work
        if (points === null || max === null) {
            const textBlock = card.innerText || "";
            const lines = textBlock.split("\n").map(l => l.trim()).filter(Boolean);

            const scoreLabelIndex = lines.findIndex(line => line === "Score");
            if (scoreLabelIndex !== -1 && scoreLabelIndex + 1 < lines.length) {
                const scoreLine = lines[scoreLabelIndex + 1];
                if (scoreLine && scoreLine.trim() !== "" && !/^\s*\/\s*/.test(scoreLine)) {
                    const match = scoreLine.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
                    if (match) {
                        points = parseFloat(match[1]);
                        max = parseFloat(match[2]);
                    }
                }
            }
        }

        // Extract assignment name from TextHeading
        const headingEl = card.querySelector(".TextHeading");
        if (headingEl) {
            const headingText = headingEl.textContent.trim();
            const titleMatch = headingText.match(/^\d+\s*-\s*(.+)/);
            if (titleMatch) {
                name = titleMatch[1].trim();
            } else {
                name = headingText;
            }
        }

        // Extract category from TextSubSectionCategory
        const categoryEl = card.querySelector(".TextSubSectionCategory");
        if (categoryEl) {
            const cardCategory = categoryEl.textContent.trim();
            foundCategory = normalize(cardCategory) === normalize(categoryName);
        }

        // Extract due date
        const inlineDataEls = card.querySelectorAll(".InlineData");
        inlineDataEls.forEach(el => {
            const text = el.textContent;
            if (text.includes("Due Date:")) {
                const dateMatch = text.match(/Due Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
                if (dateMatch) {
                    dueDate = dateMatch[1];
                }
            }
        });

        if (foundCategory) {
            if (points !== null && max !== null && !isNaN(points) && !isNaN(max)) {
                // Visible graded assignment
                const assignmentData = {
                    name,
                    points,
                    max,
                    dueDate: dueDate || null
                };
                assignments.push(assignmentData);
            } else if (maxFromHidden !== null && !isNaN(maxFromHidden) && maxFromHidden > 0) {
                // Potential hidden graded assignment - has max but no visible points
                potentialHiddenAssignments.push({
                    name,
                    max: maxFromHidden,
                    dueDate: dueDate || null
                });
            }
        }
    });

    // Calculate visible totals
    let visiblePoints = 0;
    let visibleMax = 0;
    assignments.forEach(a => {
        visiblePoints += a.points;
        visibleMax += a.max;
    });

    // Calculate hidden contribution (what's counted in totals but not visible)
    const hiddenPoints = categoryTotalPoints - visiblePoints;
    const hiddenMax = categoryTotalMax - visibleMax;

    console.log(`[Aeries Grade Calc] Category "${categoryName}": Total=${categoryTotalPoints}/${categoryTotalMax}, Visible=${visiblePoints}/${visibleMax}, Hidden=${hiddenPoints}/${hiddenMax}`);
    console.log(`[Aeries Grade Calc] Potential hidden assignments:`, potentialHiddenAssignments);

    // Try to identify which potential hidden assignments are actually graded
    // by matching their max values to the hidden contribution
    if (hiddenMax > 0 && hiddenPoints >= 0 && potentialHiddenAssignments.length > 0) {
        // Sort potential hidden assignments by max value (descending) for better matching
        potentialHiddenAssignments.sort((a, b) => b.max - a.max);

        let remainingHiddenPoints = hiddenPoints;
        let remainingHiddenMax = hiddenMax;

        for (const potentialAssignment of potentialHiddenAssignments) {
            // Check if this assignment's max fits within the remaining hidden max
            if (potentialAssignment.max <= remainingHiddenMax + 0.01) { // Small tolerance for floating point
                // This assignment is likely a hidden graded one
                // Calculate its points proportionally or exactly if it matches
                let assignedPoints;

                if (Math.abs(potentialAssignment.max - remainingHiddenMax) < 0.01) {
                    // Exact match - assign all remaining hidden points
                    assignedPoints = remainingHiddenPoints;
                } else {
                    // Multiple hidden assignments - estimate proportionally
                    assignedPoints = (potentialAssignment.max / remainingHiddenMax) * remainingHiddenPoints;
                }

                // Round to 2 decimal places
                assignedPoints = Math.round(assignedPoints * 100) / 100;

                assignments.push({
                    name: potentialAssignment.name,
                    points: assignedPoints,
                    max: potentialAssignment.max,
                    dueDate: potentialAssignment.dueDate,
                    isHidden: true // Flag to indicate this was a hidden grade
                });

                remainingHiddenMax -= potentialAssignment.max;
                remainingHiddenPoints -= assignedPoints;

                console.log(`[Aeries Grade Calc] Detected hidden graded assignment: "${potentialAssignment.name}" - ${assignedPoints}/${potentialAssignment.max}`);

                // If we've accounted for all hidden contribution, stop
                if (remainingHiddenMax <= 0.01) {
                    break;
                }
            }
        }
    }

    console.log(`[Aeries Grade Calc] Category "${categoryName}": Found ${assignments.length} total assignments, hidden count:`, assignments.filter(a => a.isHidden).length);

    return assignments;
}



function calculateGrade() {
    const rows = document.querySelectorAll("tr[id^='ctl00_MainContent_subGBS_DataSummary_']");
    if (rows.length === 0) {
        return { success: false, message: "Error: Could not fetch grade data" };
    }

    const firstRow = rows[0];
    const cells = firstRow.querySelectorAll("td");
    const hasPercOfGrade = cells.length >= 6;
    let totalPoints = 0;
    let totalMax = 0;
    let weightedSum = 0;
    let totalWeight = 0;
    let validRowCount = 0;


    rows.forEach((row, index) => {
        const cells = row.querySelectorAll("td");
        //console.log(`Row ${index} has ${cells.length} cells`);

        if (cells.length >= (hasPercOfGrade ? 6 : 5)) {
            const categoryName = cells[0]?.innerText.trim();
            const weightText = hasPercOfGrade ? cells[1]?.innerText.trim() : "100";
            const pointsText = hasPercOfGrade ? cells[2]?.innerText.trim() : cells[1]?.innerText.trim();
            const maxText = hasPercOfGrade ? cells[3]?.innerText.trim() : cells[2]?.innerText.trim();
            const percentageText = hasPercOfGrade ? cells[4]?.innerText.trim() : cells[3]?.innerText.trim();


            if (categoryName.toLowerCase() === "total") {
                return;
            }

            const weight = parseFloat(weightText.replace(/[^0-9.]/g, ""));
            const points = parseFloat(pointsText.replace(/[^0-9.]/g, ""));
            const max = parseFloat(maxText.replace(/[^0-9.]/g, ""));
            const percentage = parseFloat(percentageText.replace(/[^0-9.]/g, ""));

            //console.log(`Parsed values: Weight = ${weight}, Points = ${points}, Max = ${max}, Percentage = ${percentage}`);

            if (points === 0 && max === 0) {
                //console.log(`Skipping ${categoryName} because points and max are both 0`);
                return;
            }

            if (isNaN(points) || isNaN(max)) {
                //console.log(`Row ${index} skipped: invalid numbers after parsing: Points: ${points}, Max: ${max}`);
                return;
            }

            if (hasPercOfGrade) {
                if (isNaN(weight) || isNaN(percentage)) {
                    //console.log(`Row ${index} skipped: invalid numbers after parsing: Weight: ${weight}, Percentage: ${percentage}`);
                    return;
                }

                const weightedContribution = (weight / 100) * percentage;
                weightedSum += weightedContribution;
                totalWeight += (weight / 100);

                //console.log(`Category ${categoryName} contributes ${weightedContribution.toFixed(2)} weighted points out of ${max}`);
            } else {
                totalPoints += points;
                totalMax += max;

                //console.log(`Category ${categoryName} contributes ${points} points out of ${max}`);
            }

            validRowCount++;

            //console.log(`Running totals: ${hasPercOfGrade ? `weightedSum = ${weightedSum.toFixed(2)}, totalWeight = ${totalWeight.toFixed(2)}` : `totalPoints = ${totalPoints.toFixed(2)}, totalMax = ${totalMax.toFixed(2)}`}`);
        }
    });

    if ((hasPercOfGrade && totalWeight === 0) || (!hasPercOfGrade && totalMax === 0) || validRowCount === 0) {
        console.error("Error: No valid data to calculate grade.");
        return { success: false, message: "Error: No valid grade data found" };
    }

    //calculate the final grade
    const finalGrade = hasPercOfGrade ? (weightedSum / totalWeight) : (totalPoints / totalMax) * 100;

    //console.log(`Final calculation: ${hasPercOfGrade ? `${weightedSum.toFixed(2)} / ${totalWeight.toFixed(2)}` : `${totalPoints.toFixed(2)} / ${totalMax.toFixed(2)}`} = ${finalGrade.toFixed(2)}%`);

    if (isNaN(finalGrade)) {
        return { success: false, message: "Error: calculation resulted in NaN" };
    }

    const teacherElement = document.querySelector("#ctl00_MainContent_subGBS_lblTeacherName");
    const teacherName = teacherElement ? teacherElement.innerText.trim() : "Unknown";

    //console.log("Calculated grade:", finalGrade.toFixed(2), "Teacher:", teacherName);

    return { success: true, grade: finalGrade.toFixed(2), teacher: teacherName };
}



function getGradeTableData() {
    const table = [];
    const rows = Array.from(document.querySelectorAll("tr[id^='ctl00_MainContent_subGBS_DataSummary_']"))
        .filter(row => !row.querySelector("td:first-child")?.innerText.toLowerCase().includes("total"));
    const firstRowCells = rows[0]?.querySelectorAll("td");
    const tableUsesCategoryWeights = Boolean(firstRowCells && firstRowCells.length >= 6);

    //console.log("Number of rows found for dropdown:", rows.length);

    rows.forEach((row, index) => {
        try {
            const cells = row.querySelectorAll("td");
            //console.log(`Dropdown Row ${index} has ${cells.length} cells`);

            if (cells.length >= 4) {
                const categoryName = cells[0].innerText.trim();

                const hasPercOfGrade = cells.length >= 6;

                const weightText = hasPercOfGrade ? cells[1]?.innerText.trim() : "100";
                const pointsText = hasPercOfGrade ? cells[2]?.innerText.trim() : cells[1]?.innerText.trim();
                const maxText = hasPercOfGrade ? cells[3]?.innerText.trim() : cells[2]?.innerText.trim();

                const weight = parseFloat(weightText.replace(/[^0-9.]/g, ""));
                const points = parseFloat(pointsText.replace(/[^0-9.]/g, ""));
                const max = parseFloat(maxText.replace(/[^0-9.]/g, ""));

                //console.log(`Dropdown Category found: "${categoryName}" with weight=${weight}, points=${points}, max=${max}`);

                table.push({
                    category: categoryName,
                    tableUsesCategoryWeights,
                    weight: isNaN(weight) ? 100 : weight,
                    points: isNaN(points) ? 0 : points,
                    max: isNaN(max) ? 0 : max
                });
            } else {
                console.warn(`Dropdown Row ${index} has too few cells.`);
            }
        } catch (error) {
            console.error(`Error processing dropdown row ${index}:`, error);
        }
    });

    //console.log("Returning dropdown data:", table);
    return table;
}

