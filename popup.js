
function saveGrade(grade, teacher) {
    const currentDate = new Date().toLocaleString();

    chrome.storage.local.get({ gradesByTeacher: {} }, (data) => {
        const gradesByTeacher = data.gradesByTeacher || {};

        if (!gradesByTeacher[teacher]) {
            gradesByTeacher[teacher] = [];
        }

        // Check for consecutive duplicates
        const lastGrade = gradesByTeacher[teacher][0]?.grade;
        if (lastGrade && parseFloat(lastGrade) === parseFloat(grade)) {
            console.log(`Grade ${grade}% not added due to consecutive duplicate.`);
            return;
        }

        // Add the new grade to the top of the teacher's grades array
        gradesByTeacher[teacher].unshift({ grade, date: currentDate });

        // Keep only the last three grades for this teacher
        gradesByTeacher[teacher] = gradesByTeacher[teacher].slice(0, 3);

        chrome.storage.local.set({ gradesByTeacher }, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving grades to storage:", chrome.runtime.lastError.message);
            } else {
                console.log(`Grades saved for ${teacher}:`, gradesByTeacher[teacher]);
            }
        });
    });
}

function displayLastGrades(currentGrade, currentTeacher) {
    const historyElement = document.getElementById("history");

    chrome.storage.local.get({ gradesByTeacher: {} }, (data) => {
        const gradesByTeacher = data.gradesByTeacher || {};
        const grades = gradesByTeacher[currentTeacher] || [];

        console.log(`Grades for teacher ${currentTeacher}:`, grades);

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
    const resultElement = document.getElementById("result");
    const loaderElement = document.getElementById("loader");

    // Clear the result display and show the loader
    resultElement.style.display = "none";
    loaderElement.style.display = "block";
}

function hideLoader() {
    const resultElement = document.getElementById("result");
    const loaderElement = document.getElementById("loader");

    // Hide the loader and show the result
    loaderElement.style.display = "none";
    resultElement.style.display = "block";
}

function displayResult(result) {
    hideLoader(); // Ensure the loader is hidden

    const resultElement = document.getElementById("result");
    const resetHistoryContainer = document.getElementById("resetHistoryContainer");

    if (result.success) {
        resultElement.innerHTML = `
            <div class="grade-label">Overall Grade is</div>
            <div class="grade-value">${result.grade}%</div>
        `;
        resultElement.setAttribute("data-teacher", result.teacher); // Store the teacher name for resetting history
        saveGrade(result.grade, result.teacher);
        displayLastGrades(result.grade, result.teacher);

        // Show the Reset History button
        resetHistoryContainer.style.display = "block";
    } else {
        resultElement.innerHTML = `<span style="color: red;">${result.message}</span>`;
        resetHistoryContainer.style.display = "none"; // Hide the button if there's an error
    }
}
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
// Add event listener for the "Reset History" button
document.addEventListener('DOMContentLoaded', () => {
    const resetButton = document.getElementById("resetHistory");

    resetButton.addEventListener("click", () => {
        const teacher = document.getElementById("result").getAttribute("data-teacher");
        if (teacher) {
            resetGradeHistory(teacher);
        } else {
            console.log("No teacher found to reset history for.");
        }
    });
});
document.getElementById("calculate").addEventListener("click", () => {
    showLoader(); // Show the loader when the button is clicked

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        setTimeout(() => {
            // Simulate a 2-second delay for the loading effect
            chrome.tabs.sendMessage(tabs[0].id, { action: "calculateGrade" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Runtime error:", chrome.runtime.lastError.message);
                    displayResult({ success: false, message: "Error: Could not fetch data." });
                } else {
                    displayResult(response || { success: false, message: "No response from content script." });
                }
            });
        }, 1000); // 2-second delay
    });
});


async function queryHuggingFace(prompt) {
    try {
        console.log("Attempting request to AI server...");
        const response = await fetch('http://localhost:1700/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        console.log("Response status:", response.status);
        
        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Response data:", data);

        // If the response still contains your instructions, try to extract just the answer
        let cleanedResponse = data.response;
        
        // Simple parsing to extract just the answer if the response includes the original instructions
        if (cleanedResponse.includes("Your overall grade is") || cleanedResponse.includes("grade is")) {
            // Try to extract just the answer part
            const answerMatch = cleanedResponse.match(/Your overall grade is \d+\.?\d*%|grade is \d+\.?\d*%/i);
            if (answerMatch) {
                cleanedResponse = answerMatch[0] + cleanedResponse.split(answerMatch[0])[1].split("Answer format:")[0];
            }
        }

        return cleanedResponse;
    } catch (error) {
        console.error("Error in AI request:", error);
        return "Sorry, I encountered an error when trying to analyze your grades. Please try again.";
    }
}
async function formatGradeQuestion(question, gradeData, overallGrade) {
    return `Grade Data:
${gradeData.map(category => 
    `${category.category}: Weight ${category.weight}%, Current Points ${category.points}/${category.max}`
).join('\n')}
Overall calculated grade: ${overallGrade}%

Question: ${question}

Important: Provide ONLY a short answer (maximum 3 sentences or 120 characters). Be direct and concise.`;
}

async function askOllama() {
    const questionInput = document.getElementById("aiQuestion");
    const aiResponse = document.getElementById("aiResponse");
    const question = questionInput.value.trim();
    
    if (!question) {
        aiResponse.textContent = "Please enter a question.";
        return;
    }

    try {
        aiResponse.textContent = "Analyzing your grades";
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        const response = await chrome.tabs.sendMessage(tab.id, { action: "getGradeData" });
        console.log("Grade data received by AI", response);
        
        if (!response?.gradeData || response.gradeData.length === 0) {
            throw new Error("No grade data found. Please make sure you're on the gradebook page.");
        }

        const formattedPrompt = await formatGradeQuestion(question, response.gradeData);
        console.log("Sending prompt to Ollama:", formattedPrompt);
        
        const aiAnswer = await queryHuggingFace(formattedPrompt);
        console.log("Ollama response:", aiAnswer);
        
        aiResponse.innerHTML = `<strong>Answer:</strong><br>${aiAnswer}`;

    } catch (error) {
        console.error('Error in askAI:', error);
        aiResponse.textContent = `Error: ${error.message}. Please try again.`;
    }
}
async function askAI() {
    const questionInput = document.getElementById("aiQuestion");
    const aiResponse = document.getElementById("aiResponse");
    const question = questionInput.value.trim();
    
    if (!question) {
        aiResponse.textContent = "Please enter a question.";
        return;
    }

    try {
        aiResponse.textContent = "Analyzing...";
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // First get the grade calculation
        const gradeResult = await chrome.tabs.sendMessage(tab.id, { action: "calculateGrade" });
        if (!gradeResult?.success) {
            throw new Error("Could not calculate overall grade.");
        }
        
        // Then get the grade data
        const dataResponse = await chrome.tabs.sendMessage(tab.id, { action: "getGradeData" });
        if (!dataResponse?.gradeData || dataResponse.gradeData.length === 0) {
            throw new Error("No grade data found. Please make sure you're on the gradebook page.");
        }

        const formattedPrompt = await formatGradeQuestion(
            question, 
            dataResponse.gradeData, 
            gradeResult.grade // Pass the calculated overall grade
        );
        
        const aiAnswer = await queryHuggingFace(formattedPrompt);
        
        // Ensure response is within limits (120 chars)
        const limitedAnswer = aiAnswer.length > 120 
            ? aiAnswer.substring(0, 117) + "..." 
            : aiAnswer;
            
        aiResponse.innerHTML = `<strong>Answer:</strong><br>${limitedAnswer}`;

    } catch (error) {
        console.error('Error in askAI:', error);
        aiResponse.textContent = `Error: ${error.message}`;
    }
}


document.addEventListener('DOMContentLoaded', () => {
    console.log("✅ Popup DOM loaded!");

    const askButton = document.getElementById("askAI");
    
    if (!askButton) {
        console.error("❌ 'Ask AI' button NOT FOUND!");
        return;
    }

    console.log("✅ 'Ask AI' button found!");

    askButton.addEventListener("click", () => {
        console.log("✅ 'Ask AI' button CLICKED!");
        askAI();
    });
});
