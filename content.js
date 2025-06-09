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

    function normalize(str) {
        return str.replace(/\s+/g, " ").trim().toLowerCase();
    }

    const scoreLabels = document.querySelectorAll("div.TextSubSection");

    scoreLabels.forEach(label => {
        if (label.innerText.trim() !== "Score") return;

        const td = label.closest("td");
        const textBlock = td?.innerText || "";
        const lines = textBlock.split("\n").map(l => l.trim()).filter(Boolean);

        let points = null;
        let max = null;
        let name = "Unnamed Assignment";
        let foundCategory = false;

        // extract score
        for (let line of lines) {
            const match = line.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
            if (match) {
                points = parseFloat(match[1]);
                max = parseFloat(match[2]);
                break;
            }
        }

        // extract assingment name
        const titleLine = lines.find(line => /^\d+\s*-\s+.+/.test(line));
        if (titleLine) {
            name = titleLine.replace(/^\d+\s*-\s*/, "").trim();
        }

        foundCategory = lines.some(line => normalize(line) === normalize(categoryName));

        if (foundCategory && points !== null && max !== null) {
            assignments.push({
                name,
                points,
                max
            });
        }
    });

    //console.log(`Found ${assignments.length} assignments in category '${categoryName}'`);
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
            
            
            // Skip the "Total" row
            if (categoryName.toLowerCase() === "total") {
                return;
            }
            
            // Parse the numbers, handling percentage signs
            const weight = parseFloat(weightText.replace(/[^0-9.]/g, ""));
            const points = parseFloat(pointsText.replace(/[^0-9.]/g, ""));
            const max = parseFloat(maxText.replace(/[^0-9.]/g, ""));
            const percentage = parseFloat(percentageText.replace(/[^0-9.]/g, ""));
            
            //console.log(`Parsed values: Weight = ${weight}, Points = ${points}, Max = ${max}, Percentage = ${percentage}`);
            
            // Skip if both points and max are 0
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

    //console.log("Number of rows found for dropdown:", rows.length);

    rows.forEach((row, index) => {
        try {
            const cells = row.querySelectorAll("td");
            //console.log(`Dropdown Row ${index} has ${cells.length} cells`);
            
            if (cells.length >= 4) { // Make sure we have enough cells to get all data
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getGradeData") {
        const gradeData = getGradeTableData();
        sendResponse({ gradeData });
    }
    return true;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "calculateGrade") {
        const result = calculateGrade();
        sendResponse(result);
    } else if (request.action === "getGradeData") {
        const gradeData = getGradeTableData();
        sendResponse({ gradeData });
    }
    return true;
});