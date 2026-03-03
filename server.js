const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
loadEnvFile();

const HOST = "127.0.0.1";
const PORT = 3051;
const GEMINI_MODEL = "gemini-2.5-flash";
const SCENARIOS_PATH = path.join(ROOT, "scenarios.json");
const DATA_DIR = path.join(ROOT, "data");
const RESPONSES_PATH = path.join(DATA_DIR, "responses.json");
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3050",
  "http://localhost:3050",
  "http://127.0.0.1:6000",
  "http://localhost:6000",
]);

const scenarios = JSON.parse(fs.readFileSync(SCENARIOS_PATH, "utf8"));
const scenarioMap = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
ensureResponseStore();

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^"|"$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getCorsHeaders(request) {
  const origin = request.headers.origin;
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "http://localhost:3050",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  };
}

function sendJson(request, response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    ...getCorsHeaders(request),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendText(request, response, statusCode, body) {
  response.writeHead(statusCode, {
    ...getCorsHeaders(request),
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function ensureResponseStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(RESPONSES_PATH)) {
    fs.writeFileSync(RESPONSES_PATH, "[]\n", "utf8");
  }
}

function readStoredResponses() {
  ensureResponseStore();
  const raw = fs.readFileSync(RESPONSES_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function writeStoredResponses(responses) {
  ensureResponseStore();
  fs.writeFileSync(RESPONSES_PATH, `${JSON.stringify(responses, null, 2)}\n`, "utf8");
}

function buildGeminiPrompt(scenario) {
  return [
    "You are assisting with an HCI class study about trust in AI healthcare answers.",
    "Respond directly to the user's healthcare question in plain text.",
    "Keep the answer concise and natural, roughly 90 to 140 words.",
    "Do not use bullets, markdown, or JSON.",
    "Avoid claiming certainty when the situation is uncertain.",
    "If the scenario suggests urgent warning signs, say the user should seek immediate medical care.",
    "",
    `Scenario title: ${scenario.title}`,
    `Risk level: ${scenario.risk}`,
    `User prompt: ${scenario.prompt}`,
  ].join("\n");
}

function extractGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((part) => part.text || "")
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini returned no text.");
  }

  return text;
}

async function generateScenarioResponse(scenario) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY. Add it to your environment or .env file.");
  }

  const apiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildGeminiPrompt(scenario),
              },
            ],
          },
        ],
      }),
    }
  );

  const payload = await apiResponse.json();
  if (!apiResponse.ok) {
    const message = payload?.error?.message || "Gemini API request failed.";
    throw new Error(message);
  }

  return extractGeminiText(payload);
}

async function handleGenerate(request, response) {
  try {
    const rawBody = await readRequestBody(request);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const scenarioId = body.scenarioId;

    if (!scenarioId || typeof scenarioId !== "string") {
      sendJson(request, response, 400, { error: "A valid scenarioId is required." });
      return;
    }

    const scenario = scenarioMap.get(scenarioId);
    if (!scenario) {
      sendJson(request, response, 404, { error: "Scenario not found." });
      return;
    }

    const answer = await generateScenarioResponse(scenario);
    sendJson(request, response, 200, {
      answer,
      model: GEMINI_MODEL,
    });
  } catch (error) {
    sendJson(request, response, 500, {
      error: error.message || "Unable to generate a Gemini response.",
    });
  }
}

async function handleCreateResponse(request, response) {
  try {
    const rawBody = await readRequestBody(request);
    const body = rawBody ? JSON.parse(rawBody) : {};
    const requiredFields = [
      "id",
      "title",
      "risk",
      "prompt",
      "aiAnswer",
      "reference",
      "trust",
      "safety",
      "confidence",
      "generatedAt",
    ];

    const missingField = requiredFields.find((field) => body[field] === undefined || body[field] === null || body[field] === "");
    if (missingField) {
      sendJson(request, response, 400, { error: `Missing required field: ${missingField}` });
      return;
    }

    const storedResponses = readStoredResponses();
    const responseRecord = {
      id: String(body.id),
      title: String(body.title),
      risk: String(body.risk),
      prompt: String(body.prompt),
      aiAnswer: String(body.aiAnswer),
      reference: String(body.reference),
      trust: Number(body.trust),
      safety: Number(body.safety),
      confidence: Number(body.confidence),
      reflection: body.reflection ? String(body.reflection) : "",
      generatedAt: String(body.generatedAt),
      savedAt: new Date().toISOString(),
    };

    const existingIndex = storedResponses.findIndex((item) => item.id === responseRecord.id);
    if (existingIndex >= 0) {
      storedResponses[existingIndex] = responseRecord;
    } else {
      storedResponses.push(responseRecord);
    }

    writeStoredResponses(storedResponses);
    sendJson(request, response, 201, {
      saved: true,
      responses: storedResponses,
    });
  } catch (error) {
    sendJson(request, response, 500, {
      error: error.message || "Unable to save response.",
    });
  }
}

function handleGetResponses(request, response) {
  try {
    sendJson(request, response, 200, {
      responses: readStoredResponses(),
    });
  } catch (error) {
    sendJson(request, response, 500, {
      error: error.message || "Unable to load stored responses.",
    });
  }
}

function handleDeleteResponses(request, response) {
  try {
    writeStoredResponses([]);
    sendJson(request, response, 200, {
      cleared: true,
      responses: [],
    });
  } catch (error) {
    sendJson(request, response, 500, {
      error: error.message || "Unable to clear stored responses.",
    });
  }
}

function sendNoContent(request, response) {
  response.writeHead(204, {
    ...getCorsHeaders(request),
  });
  response.end();
}

const server = http.createServer((request, response) => {
  if (!request.url) {
    sendText(request, response, 400, "Bad request");
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);

  if (request.method === "OPTIONS") {
    sendNoContent(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/scenarios") {
    sendJson(request, response, 200, scenarios);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/responses") {
    handleGetResponses(request, response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(request, response, 200, {
      status: "ok",
      service: "caretrust-backend",
      port: PORT,
      model: GEMINI_MODEL,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/generate") {
    handleGenerate(request, response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/responses") {
    handleCreateResponse(request, response);
    return;
  }

  if (request.method === "DELETE" && url.pathname === "/api/responses") {
    handleDeleteResponses(request, response);
    return;
  }

  sendText(request, response, 405, "Method not allowed");
});

server.listen(PORT, HOST, () => {
  console.log(`CareTrust backend running at http://${HOST}:${PORT}`);
});
