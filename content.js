
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
    return true;
});


const teacherName = getTeacherName();

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
            
            
            // Skip if both points and max are 0
            if (points === 0 && max === 0) {
                return;
            }
            
            if (isNaN(points) || isNaN(max)) {
                return;
            }
            
            if (hasPercOfGrade) {
                if (isNaN(weight) || isNaN(percentage)) {
                    return;
                }
                
                const weightedContribution = (weight / 100) * percentage;
                weightedSum += weightedContribution;
                totalWeight += (weight / 100);
                
            } else {
                // Use totalPoints / totalMax if "Perc of Grade" doesn't exist
                totalPoints += points;
                totalMax += max;
                
            }
            
            validRowCount++;
            
        }
    });

    if ((hasPercOfGrade && totalWeight === 0) || (!hasPercOfGrade && totalMax === 0) || validRowCount === 0) {
        console.error("Error: No valid data to calculate grade.");
        return { success: false, message: "Error: No valid grade data found" };
    }

    // Calculate the final grade
    const finalGrade = hasPercOfGrade ? (weightedSum / totalWeight) : (totalPoints / totalMax) * 100;
    

    // Make sure the final result is a number
    if (isNaN(finalGrade)) {
        return { success: false, message: "Error: calculation resulted in NaN" };
    }

    const teacherElement = document.querySelector("#ctl00_MainContent_subGBS_lblTeacherName");
    const teacherName = teacherElement ? teacherElement.innerText.trim() : "Unknown";


    return { success: true, grade: finalGrade.toFixed(2), teacher: teacherName };
}



function getGradeTableData() {
    const table = [];
    const rows = Array.from(document.querySelectorAll("tr[id^='ctl00_MainContent_subGBS_DataSummary_']"))
                     .filter(row => !row.querySelector("td:first-child")?.innerText.toLowerCase().includes("total"));


    rows.forEach((row, index) => {
        try {
            const cells = row.querySelectorAll("td");
            
            if (cells.length >= 4) { // Make sure we have enough cells to get all data
                const categoryName = cells[0].innerText.trim();
                
                // Check if we have weight column (6 cells means we have weight)
                const hasPercOfGrade = cells.length >= 6;
                
                // Extract data from the appropriate cells
                const weightText = hasPercOfGrade ? cells[1]?.innerText.trim() : "100";
                const pointsText = hasPercOfGrade ? cells[2]?.innerText.trim() : cells[1]?.innerText.trim();
                const maxText = hasPercOfGrade ? cells[3]?.innerText.trim() : cells[2]?.innerText.trim();
                
                // Parse the numbers, handling percentage signs
                const weight = parseFloat(weightText.replace(/[^0-9.]/g, ""));
                const points = parseFloat(pointsText.replace(/[^0-9.]/g, ""));
                const max = parseFloat(maxText.replace(/[^0-9.]/g, ""));
                
                
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
