let scenarios = [];
let currentScenarioIndex = 0;
let responses = [];
let currentGeneratedAnswer = "";
const API_BASE_URL = "http://127.0.0.1:3051";

const scenarioTitle = document.querySelector("#scenario-title");
const scenarioCount = document.querySelector("#scenario-count");
const scenarioRisk = document.querySelector("#scenario-risk");
const scenarioPrompt = document.querySelector("#scenario-prompt");
const aiAnswer = document.querySelector("#ai-answer");
const answerStatus = document.querySelector("#answer-status");
const generateAnswerButton = document.querySelector("#generate-answer-button");
const referenceNote = document.querySelector("#reference-note");
const referenceBox = document.querySelector("#reference-box");
const referenceToggle = document.querySelector("#reference-toggle");
const studyForm = document.querySelector("#study-form");
const trustRange = document.querySelector("#trust-range");
const safetyRange = document.querySelector("#safety-range");
const confidenceRange = document.querySelector("#confidence-range");
const trustValue = document.querySelector("#trust-value");
const safetyValue = document.querySelector("#safety-value");
const confidenceValue = document.querySelector("#confidence-value");
const reflection = document.querySelector("#reflection");
const submitButton = document.querySelector("#submit-button");
const avgTrust = document.querySelector("#avg-trust");
const avgSafety = document.querySelector("#avg-safety");
const avgConfidence = document.querySelector("#avg-confidence");
const responsesList = document.querySelector("#responses-list");
const responseCount = document.querySelector("#response-count");
const exportCsvButton = document.querySelector("#export-csv-button");
const exportPdfButton = document.querySelector("#export-pdf-button");
const resetButton = document.querySelector("#reset-button");
const connectionBanner = document.querySelector("#connection-banner");
const connectionDot = document.querySelector("#connection-dot");
const connectionText = document.querySelector("#connection-text");

function getCurrentScenario() {
  return scenarios[currentScenarioIndex];
}

function getStudyTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function formatCsvCell(value) {
  const normalized = String(value ?? "").replace(/"/g, '""');
  return `"${normalized}"`;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function setExportState() {
  const hasResponses = responses.length > 0;
  exportCsvButton.disabled = !hasResponses;
  exportPdfButton.disabled = !hasResponses;
}

function setFormEnabled(enabled) {
  trustRange.disabled = !enabled;
  safetyRange.disabled = !enabled;
  confidenceRange.disabled = !enabled;
  reflection.disabled = !enabled;
  submitButton.disabled = !enabled;
}

function setGenerateState(isLoading) {
  generateAnswerButton.disabled = isLoading;
  generateAnswerButton.textContent = isLoading
    ? "Generating AI Model Response..."
    : "Generate AI Model Response";
}

function setConnectionStatus(state, message) {
  connectionBanner.dataset.state = state;
  connectionDot.dataset.state = state;
  connectionText.textContent = message;
}

function applyCompletedState() {
  setFormEnabled(false);
  submitButton.textContent = "Study Complete";
  generateAnswerButton.disabled = true;
  generateAnswerButton.textContent = "All Scenarios Completed";
  answerStatus.textContent = "Study complete. Export the captured responses below.";
}

function getAverages() {
  if (!responses.length) {
    return { trust: 0, safety: 0, confidence: 0 };
  }

  const totals = responses.reduce(
    (sum, response) => {
      sum.trust += response.trust;
      sum.safety += response.safety;
      sum.confidence += response.confidence;
      return sum;
    },
    { trust: 0, safety: 0, confidence: 0 }
  );

  return {
    trust: totals.trust / responses.length,
    safety: totals.safety / responses.length,
    confidence: totals.confidence / responses.length,
  };
}

function exportResponsesAsCsv() {
  if (!responses.length) {
    return;
  }

  const header = [
    "scenario",
    "risk_level",
    "participant_prompt",
    "ai_answer",
    "clinician_guidance",
    "trust",
    "safety",
    "confidence",
    "reflection",
    "generated_at",
  ];

  const rows = responses.map((response) =>
    [
      response.title,
      response.risk,
      response.prompt,
      response.aiAnswer,
      response.reference,
      response.trust,
      response.safety,
      response.confidence,
      response.reflection,
      response.generatedAt,
    ]
      .map(formatCsvCell)
      .join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");
  downloadFile(csv, `caretrust-responses-${getStudyTimestamp()}.csv`, "text/csv;charset=utf-8");
}

function buildPdfMarkup() {
  const averages = getAverages();
  const responseMarkup = responses
    .map(
      (response) => `
        <section class="print-card">
          <h2>${response.title}</h2>
          <p><strong>Risk:</strong> ${response.risk}</p>
          <p><strong>Prompt:</strong> ${response.prompt}</p>
          <p><strong>AI Model Response:</strong> ${response.aiAnswer}</p>
          <p><strong>Clinician Guidance:</strong> ${response.reference}</p>
          <p><strong>Trust:</strong> ${response.trust} / 7</p>
          <p><strong>Safety:</strong> ${response.safety} / 7</p>
          <p><strong>Confidence:</strong> ${response.confidence} / 7</p>
          <p><strong>Reflection:</strong> ${response.reflection || "No reflection entered."}</p>
          <p><strong>Generated:</strong> ${response.generatedAt}</p>
        </section>
      `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>CareTrust Study Report</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #1f1b18;
            margin: 40px;
            line-height: 1.5;
          }
          h1, h2 {
            margin-bottom: 12px;
          }
          .summary {
            margin-bottom: 24px;
            padding: 16px;
            border: 1px solid #d7ccc1;
            border-radius: 12px;
            background: #faf6f1;
          }
          .print-card {
            margin-bottom: 20px;
            padding: 16px;
            border: 1px solid #d7ccc1;
            border-radius: 12px;
            break-inside: avoid;
          }
          p {
            margin: 8px 0;
          }
        </style>
      </head>
      <body>
        <h1>CareTrust Study Report</h1>
        <div class="summary">
          <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Responses:</strong> ${responses.length}</p>
          <p><strong>Average Trust:</strong> ${averages.trust.toFixed(1)} / 7</p>
          <p><strong>Average Safety:</strong> ${averages.safety.toFixed(1)} / 7</p>
          <p><strong>Average Confidence:</strong> ${averages.confidence.toFixed(1)} / 7</p>
        </div>
        ${responseMarkup}
      </body>
    </html>
  `;
}

function exportResponsesAsPdf() {
  if (!responses.length) {
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    window.alert("Please allow pop-ups to export the PDF.");
    return;
  }

  printWindow.document.open();
  printWindow.document.write(buildPdfMarkup());
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function setRangeLabels() {
  trustValue.textContent = trustRange.value;
  safetyValue.textContent = safetyRange.value;
  confidenceValue.textContent = confidenceRange.value;
}

function renderScenario() {
  const scenario = getCurrentScenario();
  if (!scenario) {
    return;
  }

  currentGeneratedAnswer = "";
  scenarioTitle.textContent = scenario.title;
  scenarioCount.textContent = `${currentScenarioIndex + 1} / ${scenarios.length}`;
  scenarioRisk.textContent = scenario.risk;
  scenarioPrompt.textContent = scenario.prompt;
  aiAnswer.textContent =
    "Generate a live AI model response for this fixed healthcare prompt, then rate how much you trust it.";
  answerStatus.textContent = "Waiting for AI model response.";
  referenceNote.textContent = scenario.reference;
  referenceBox.classList.add("hidden");
  referenceToggle.textContent = "Show Clinician Guidance";
  studyForm.reset();
  setRangeLabels();
  setFormEnabled(false);
  setGenerateState(false);

  const isLastScenario = currentScenarioIndex === scenarios.length - 1;
  submitButton.textContent = isLastScenario ? "Finish Study" : "Save Response";
}

function renderSummary() {
  if (!responses.length) {
    avgTrust.textContent = "0.0";
    avgSafety.textContent = "0.0";
    avgConfidence.textContent = "0.0";
    responseCount.textContent = "0 completed";
    responsesList.innerHTML =
      '<p class="empty-state">No responses yet. Complete the study scenarios to populate this section.</p>';
    setExportState();
    return;
  }

  const averages = getAverages();
  avgTrust.textContent = averages.trust.toFixed(1);
  avgSafety.textContent = averages.safety.toFixed(1);
  avgConfidence.textContent = averages.confidence.toFixed(1);
  responseCount.textContent = `${responses.length} completed`;

  responsesList.innerHTML = responses
    .map(
      (response) => `
        <article class="response-item">
          <strong>${response.title}</strong>
          <p>Trust ${response.trust} / Safety ${response.safety} / Confidence ${response.confidence}</p>
          <p>${response.reflection || "No reflection entered."}</p>
        </article>
      `
    )
    .join("");

  setExportState();
}

async function loadScenarios() {
  const response = await fetch(`${API_BASE_URL}/api/scenarios`);
  if (!response.ok) {
    throw new Error("Unable to load study scenarios.");
  }

  scenarios = await response.json();
}

async function loadStoredResponses() {
  const response = await fetch(`${API_BASE_URL}/api/responses`);
  if (!response.ok) {
    throw new Error("Unable to load saved responses.");
  }

  const payload = await response.json();
  responses = Array.isArray(payload.responses) ? payload.responses : [];
}

async function saveResponse(responseRecord) {
  const response = await fetch(`${API_BASE_URL}/api/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(responseRecord),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Unable to save response.");
  }

  responses = Array.isArray(payload.responses) ? payload.responses : responses;
}

async function clearStoredResponses() {
  const response = await fetch(`${API_BASE_URL}/api/responses`, {
    method: "DELETE",
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Unable to clear saved responses.");
  }

  responses = [];
}

async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    if (!response.ok) {
      throw new Error("Backend health check failed.");
    }

    const payload = await response.json();
    setConnectionStatus("online", `Backend connected: ${payload.status} on port ${payload.port}`);
  } catch (error) {
    setConnectionStatus("offline", "Backend offline. Check localhost:3051.");
  }
}

async function generateLiveAnswer() {
  const scenario = getCurrentScenario();
  if (!scenario) {
    return;
  }

  setGenerateState(true);
  setFormEnabled(false);
  answerStatus.textContent = "Requesting AI model response...";
  aiAnswer.textContent = "Generating response...";

  try {
    const response = await fetch(`${API_BASE_URL}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scenarioId: scenario.id }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "AI model request failed.");
    }

    currentGeneratedAnswer = payload.answer;
    aiAnswer.textContent = payload.answer;
    answerStatus.textContent = payload.cached
      ? `Loaded cached ${payload.provider || "AI"} response from ${payload.model}.`
      : `Generated with ${payload.provider || "AI"} using ${payload.model}.`;
    generateAnswerButton.disabled = true;
    generateAnswerButton.textContent = payload.cached
      ? "Cached AI Response Ready"
      : "AI Response Ready";
    setFormEnabled(true);
  } catch (error) {
    currentGeneratedAnswer = "";
    aiAnswer.textContent = error.message;
    answerStatus.textContent = error.message;
    setGenerateState(false);
  }
}

referenceToggle.addEventListener("click", () => {
  const shouldShow = referenceBox.classList.contains("hidden");
  referenceBox.classList.toggle("hidden");
  referenceToggle.textContent = shouldShow ? "Hide Clinician Guidance" : "Show Clinician Guidance";
});

[trustRange, safetyRange, confidenceRange].forEach((input) =>
  input.addEventListener("input", setRangeLabels)
);

generateAnswerButton.addEventListener("click", generateLiveAnswer);
exportCsvButton.addEventListener("click", exportResponsesAsCsv);
exportPdfButton.addEventListener("click", exportResponsesAsPdf);

studyForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const scenario = getCurrentScenario();
  if (!scenario || !currentGeneratedAnswer) {
    return;
  }

  const responseRecord = {
    id: scenario.id,
    title: scenario.title,
    risk: scenario.risk,
    prompt: scenario.prompt,
    aiAnswer: currentGeneratedAnswer,
    reference: scenario.reference,
    trust: Number(trustRange.value),
    safety: Number(safetyRange.value),
    confidence: Number(confidenceRange.value),
    reflection: reflection.value.trim(),
    generatedAt: new Date().toLocaleString(),
  };

  try {
    await saveResponse(responseRecord);
  } catch (error) {
    answerStatus.textContent = error.message;
    return;
  }

  renderSummary();

  if (currentScenarioIndex < scenarios.length - 1) {
    currentScenarioIndex += 1;
    renderScenario();
    return;
  }

  applyCompletedState();
});

resetButton.addEventListener("click", async () => {
  const shouldClear = window.confirm(
    "Clear all saved responses, remove generated AI answers, and restart the study from Scenario 1?"
  );
  if (!shouldClear) {
    return;
  }

  try {
    await clearStoredResponses();
  } catch (error) {
    answerStatus.textContent = error.message;
    return;
  }

  currentScenarioIndex = 0;
  currentGeneratedAnswer = "";
  renderScenario();
  renderSummary();
  answerStatus.textContent = "All saved responses and generated AI answers were cleared. The study has restarted from Scenario 1.";
});

async function initializeStudy() {
  await checkBackendHealth();
  try {
    await loadScenarios();
    await loadStoredResponses();
    currentScenarioIndex = Math.min(responses.length, Math.max(scenarios.length - 1, 0));
    renderScenario();
    renderSummary();

    if (responses.length >= scenarios.length && scenarios.length > 0) {
      const lastResponse = responses[responses.length - 1];
      aiAnswer.textContent = lastResponse.aiAnswer;
      answerStatus.textContent = "Saved responses loaded from local storage file.";
      applyCompletedState();
      return;
    }

    if (responses.length > 0) {
      answerStatus.textContent = `${responses.length} saved response${responses.length === 1 ? "" : "s"} loaded from the local JSON file.`;
    }
  } catch (error) {
    aiAnswer.textContent = "Study setup failed. Start both local servers and reload the page.";
    answerStatus.textContent = error.message;
    setFormEnabled(false);
    setExportState();
  }
}

initializeStudy();
