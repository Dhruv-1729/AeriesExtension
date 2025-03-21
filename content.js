
function getTeacherName() {
    const teacherElement = document.querySelector("#ctl00_MainContent_subGBS_lblTeacherName");
    return teacherElement ? teacherElement.innerText.trim() : "Unknown";
}
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("📩 Message received in content script:", request);

    if (request.action === "calculateGrade") {
        console.log("Calculating grade...");
        const result = calculateGrade();
        console.log("Calculated grade:", result);
        sendResponse(result);
    } else if (request.action === "getGradeData") {
        console.log("Fetching grade data...");
        const gradeData = getGradeTableData();
        console.log("Fetched grade data:", gradeData);
        sendResponse({ gradeData });
    } else {
        console.warn("⚠️ Unknown action received:", request.action);
    }
    return true;
});

const teacherName = getTeacherName();
console.log("Teacher's Name:", teacherName);

function calculateGrade() {
    const rows = document.querySelectorAll("tr[id^='ctl00_MainContent_subGBS_DataSummary_']");
    if (rows.length === 0) {
        console.error("Error: No valid data rows found in the table.");
        return { success: false, message: "Error: could not fetch data" };
    }

    // Check if the "Perc of Grade" column exists
    const firstRow = rows[0];
    const cells = firstRow.querySelectorAll("td");
    const hasPercOfGrade = cells.length >= 6; // If there are 6 or more columns, "Perc of Grade" exists

    let totalPoints = 0;
    let totalMax = 0;
    let weightedSum = 0;
    let totalWeight = 0;
    let validRowCount = 0;

    // Debug table structure
    console.log("Table structure debug:");
    
    rows.forEach((row, index) => {
        const cells = row.querySelectorAll("td");
        console.log(`Row ${index} has ${cells.length} cells`);
        
        if (cells.length >= (hasPercOfGrade ? 6 : 5)) {
            // Extract data from the correct columns
            const categoryName = cells[0]?.innerText.trim();
            const weightText = hasPercOfGrade ? cells[1]?.innerText.trim() : "100"; // Default to 100% if "Perc of Grade" doesn't exist
            const pointsText = hasPercOfGrade ? cells[2]?.innerText.trim() : cells[1]?.innerText.trim(); // Adjust column index
            const maxText = hasPercOfGrade ? cells[3]?.innerText.trim() : cells[2]?.innerText.trim(); // Adjust column index
            const percentageText = hasPercOfGrade ? cells[4]?.innerText.trim() : cells[3]?.innerText.trim(); // Adjust column index
            
            console.log(`Processing ${categoryName}: Weight = ${weightText}, Points = ${pointsText}, Max = ${maxText}, Percentage = ${percentageText}`);
            
            // Skip the "Total" row
            if (categoryName.toLowerCase() === "total") {
                console.log("Skipping Total row");
                return;
            }
            
            // Parse the numbers, handling percentage signs
            const weight = parseFloat(weightText.replace(/[^0-9.]/g, ""));
            const points = parseFloat(pointsText.replace(/[^0-9.]/g, ""));
            const max = parseFloat(maxText.replace(/[^0-9.]/g, ""));
            const percentage = parseFloat(percentageText.replace(/[^0-9.]/g, ""));
            
            console.log(`Parsed values: Weight = ${weight}, Points = ${points}, Max = ${max}, Percentage = ${percentage}`);
            
            // Skip if both points and max are 0
            if (points === 0 && max === 0) {
                console.log(`Skipping ${categoryName} because points and max are both 0`);
                return;
            }
            
            // Validate the numbers
            if (isNaN(points) || isNaN(max)) {
                console.log(`Row ${index} skipped: invalid numbers after parsing: Points: ${points}, Max: ${max}`);
                return;
            }
            
            if (hasPercOfGrade) {
                // Use weighted calculation if "Perc of Grade" exists
                if (isNaN(weight) || isNaN(percentage)) {
                    console.log(`Row ${index} skipped: invalid numbers after parsing: Weight: ${weight}, Percentage: ${percentage}`);
                    return;
                }
                
                const weightedContribution = (weight / 100) * percentage;
                weightedSum += weightedContribution;
                totalWeight += (weight / 100);
                
                console.log(`Category ${categoryName} contributes ${weightedContribution.toFixed(2)} weighted points out of ${max}`);
            } else {
                // Use totalPoints / totalMax if "Perc of Grade" doesn't exist
                totalPoints += points;
                totalMax += max;
                
                console.log(`Category ${categoryName} contributes ${points} points out of ${max}`);
            }
            
            validRowCount++;
            
            console.log(`Running totals: ${hasPercOfGrade ? `weightedSum = ${weightedSum.toFixed(2)}, totalWeight = ${totalWeight.toFixed(2)}` : `totalPoints = ${totalPoints.toFixed(2)}, totalMax = ${totalMax.toFixed(2)}`}`);
        }
    });

    if ((hasPercOfGrade && totalWeight === 0) || (!hasPercOfGrade && totalMax === 0) || validRowCount === 0) {
        console.error("Error: No valid data to calculate grade.");
        return { success: false, message: "Error: No valid grade data found" };
    }

    // Calculate the final grade
    const finalGrade = hasPercOfGrade ? (weightedSum / totalWeight) : (totalPoints / totalMax) * 100;
    
    console.log(`Final calculation: ${hasPercOfGrade ? `${weightedSum.toFixed(2)} / ${totalWeight.toFixed(2)}` : `${totalPoints.toFixed(2)} / ${totalMax.toFixed(2)}`} = ${finalGrade.toFixed(2)}%`);

    // Make sure the final result is a number
    if (isNaN(finalGrade)) {
        return { success: false, message: "Error: calculation resulted in NaN" };
    }

    const teacherElement = document.querySelector("#ctl00_MainContent_subGBS_lblTeacherName");
    const teacherName = teacherElement ? teacherElement.innerText.trim() : "Unknown";

    console.log("Calculated grade:", finalGrade.toFixed(2), "Teacher:", teacherName);

    return { success: true, grade: finalGrade.toFixed(2), teacher: teacherName };
}

// event listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "calculateGrade") {
        console.log("Message received in content script to calculate grade");

        // call calculateGrade and send the result 
        const result = calculateGrade();
        sendResponse(result);
    }
});

function getGradeTableData() {
    const table = [];
    const rows = document.querySelectorAll("tr[id^='ctl00_MainContent_subGBS_DataSummary_']");
    
    rows.forEach((row, index) => {
        try {
            const cells = row.querySelectorAll("td");
            
            // Skip if it's the Total row
            const categoryName = cells[0]?.innerText.trim();
            if (categoryName.toLowerCase() === "total") {
                console.log("Skipping Total row in getGradeTableData");
                return;
            }
            
            if (cells.length >= 6) {
                // Updated column indices based on new screenshot
                const category = cells[0].innerText.trim();
                const weightText = cells[1].innerText.trim();   // Perc of Grade
                const pointsText = cells[2].innerText.trim();   // Points
                const maxText = cells[3].innerText.trim();      // Max
                const percentText = cells[4].innerText.trim();  // Perc
                
                const weight = parseFloat(weightText.replace(/[^0-9.]/g, ""));
                const points = parseFloat(pointsText.replace(/[^0-9.]/g, ""));
                const max = parseFloat(maxText.replace(/[^0-9.]/g, ""));
                const percentage = parseFloat(percentText.replace(/[^0-9.]/g, ""));
                
                // Validate that we got actual numbers
                if (isNaN(weight) || isNaN(points) || isNaN(max) || isNaN(percentage)) {
                    console.log(`Row ${index} skipped in getGradeTableData due to invalid numbers`);
                    return;
                }
                
                table.push({
                    category: category,
                    weight: weight,
                    points: points,
                    max: max,
                    weightDecimal: weight / 100
                });
                
                console.log(`Added category to table: ${category}, Weight: ${weight}%, Points: ${points}, Max: ${max}, Percentage: ${percentage}%`);
            }
        } catch (error) {
            console.error(`Error processing row ${index} in getGradeTableData:`, error);
        }
    });
    
    return table;
}

// Modify your existing listener to handle the new message
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
