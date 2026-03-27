const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
loadEnvFile();

const HOST = "127.0.0.1";
const PORT = 3051;
const AI_PROVIDER = "openrouter";
const DEFAULT_OPENROUTER_MODELS = [
  "qwen/qwen3-coder:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "arcee-ai/trinity-large-preview:free",
  "openai/gpt-oss-20b:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "nvidia/llama-nemotron-embed-vl-1b-v2:free",
  "openrouter/free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
];
const AI_MODEL = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODELS[0];
const AI_FALLBACK_MODELS = parseModelList(process.env.OPENROUTER_FALLBACK_MODELS);
const AI_MODEL_POOL = [AI_MODEL, ...AI_FALLBACK_MODELS].filter(
  (model, index, models) => model && models.indexOf(model) === index
);
const AI_MAX_TOKENS = Number(process.env.OPENROUTER_MAX_TOKENS || 350);
const AI_REASONING_EFFORT = process.env.OPENROUTER_REASONING_EFFORT || "medium";
const AI_REASONING_ENABLED = process.env.OPENROUTER_REASONING_ENABLED
  ? /^true$/i.test(process.env.OPENROUTER_REASONING_ENABLED)
  : !/^openrouter\/free$|^stepfun\/step-3\.5-flash:free$/i.test(AI_MODEL);
const SCENARIOS_PATH = path.join(ROOT, "scenarios.json");
const DATA_DIR = path.join(ROOT, "data");
const RESPONSES_PATH = path.join(DATA_DIR, "responses.json");
const GENERATED_ANSWERS_PATH = path.join(DATA_DIR, "generated-answers.json");
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
ensureGeneratedAnswerStore();

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

function parseModelList(value) {
  if (!value) {
    return DEFAULT_OPENROUTER_MODELS.slice(1);
  }

  return value
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
}

function getCorsHeaders(request) {
  const origin = request.headers.origin;
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "http://localhost:3050",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  };
}

function logInfo(message, details = "") {
  const suffix = details ? ` ${details}` : "";
  console.log(`[${new Date().toISOString()}] ${message}${suffix}`);
}

function logWarn(message, details = "") {
  const suffix = details ? ` ${details}` : "";
  console.warn(`[${new Date().toISOString()}] ${message}${suffix}`);
}

function logError(message, details = "") {
  const suffix = details ? ` ${details}` : "";
  console.error(`[${new Date().toISOString()}] ${message}${suffix}`);
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

function ensureGeneratedAnswerStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(GENERATED_ANSWERS_PATH)) {
    fs.writeFileSync(GENERATED_ANSWERS_PATH, "{}\n", "utf8");
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

function readGeneratedAnswers() {
  ensureGeneratedAnswerStore();
  const raw = fs.readFileSync(GENERATED_ANSWERS_PATH, "utf8");
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function writeGeneratedAnswers(answers) {
  ensureGeneratedAnswerStore();
  fs.writeFileSync(GENERATED_ANSWERS_PATH, `${JSON.stringify(answers, null, 2)}\n`, "utf8");
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

function getCacheKey(scenarioId, model) {
  return `${AI_PROVIDER}:${model}:${scenarioId}`;
}

function flattenContentValue(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item && typeof item === "object") {
          return [
            item.text,
            item.content,
            item.output_text,
            item.value,
          ]
            .filter((part) => typeof part === "string" && part.trim())
            .join(" ");
        }

        return "";
      })
      .join(" ")
      .trim();
  }

  if (typeof value === "object") {
    return [
      value.text,
      value.content,
      value.output_text,
      value.value,
    ]
      .filter((part) => typeof part === "string" && part.trim())
      .join(" ")
      .trim();
  }

  return "";
}

function extractOpenRouterText(payload) {
  const candidateValues = [
    payload?.choices?.[0]?.message?.content,
    payload?.choices?.[0]?.message,
    payload?.choices?.[0]?.content,
    payload?.choices?.[0]?.text,
    payload?.message?.content,
    payload?.output_text,
    payload?.text,
  ];

  for (const candidate of candidateValues) {
    const text = flattenContentValue(candidate);
    if (text) {
      return text;
    }
  }

  const choice = payload?.choices?.[0];
  const finishReason = choice?.finish_reason || payload?.finish_reason || "unknown";

  if (finishReason === "length") {
    const guidance = AI_REASONING_ENABLED
      ? "Increase OPENROUTER_MAX_TOKENS or disable reasoning for this model."
      : "Increase OPENROUTER_MAX_TOKENS or try a different model.";
    throw new Error(`OpenRouter stopped before a final answer was returned. ${guidance}`);
  }

  logWarn(
    "OpenRouter returned an unexpected payload shape",
    `finishReason=${finishReason} hasChoices=${Boolean(payload?.choices?.length)} keys=${Object.keys(payload || {}).join(",")}`
  );

  throw new Error("OpenRouter returned no text.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isReasoningAllowedForModel(model) {
  return AI_REASONING_ENABLED && model !== "openrouter/free" && model !== "stepfun/step-3.5-flash:free";
}

async function generateScenarioResponse(scenario, model) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY. Add it to your environment or .env file.");
  }

  const requestBody = {
    model,
    messages: [
      {
        role: "user",
        content: buildGeminiPrompt(scenario),
      },
    ],
    temperature: 0.4,
    max_tokens: AI_MAX_TOKENS,
  };

  if (isReasoningAllowedForModel(model)) {
    requestBody.reasoning = {
      enabled: true,
      effort: AI_REASONING_EFFORT,
      exclude: true,
    };
  }

  const apiResponse = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3050",
        "X-Title": "CareTrust Study",
      },
      body: JSON.stringify(requestBody),
    }
  );

  const payload = await apiResponse.json();
  if (!apiResponse.ok) {
    const message = payload?.error?.message || "OpenRouter API request failed.";
    logWarn("OpenRouter returned an error", `model=${model} scenario=${scenario.id} status=${apiResponse.status} message="${message}"`);
    throw new Error(message);
  }

  return extractOpenRouterText(payload);
}

function isRetriableProviderError(message) {
  return /provider returned error|rate limit|quota|too many requests|temporarily unavailable|overloaded/i.test(
    message || ""
  );
}

async function generateScenarioResponseWithRetry(scenario, model, maxAttempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      logInfo("Generating AI response", `scenario=${scenario.id} model=${model} attempt=${attempt}/${maxAttempts}`);
      return await generateScenarioResponse(scenario, model);
    } catch (error) {
      lastError = error;

      if (!isRetriableProviderError(error.message) || attempt === maxAttempts) {
        break;
      }

      logWarn("Retrying AI response generation", `scenario=${scenario.id} model=${model} attempt=${attempt}/${maxAttempts} reason="${error.message}"`);
      await sleep(800 * attempt);
    }
  }

  throw lastError;
}

function findCachedAnswer(scenarioId, cachedAnswers) {
  for (const model of AI_MODEL_POOL) {
    const cacheKey = getCacheKey(scenarioId, model);
    if (cachedAnswers[cacheKey]?.answer) {
      return cachedAnswers[cacheKey];
    }
  }

  return null;
}

async function generateScenarioResponseAcrossModels(scenario) {
  let lastError = null;

  for (const model of AI_MODEL_POOL) {
    try {
      const answer = await generateScenarioResponseWithRetry(scenario, model);
      return {
        answer,
        model,
        provider: AI_PROVIDER,
      };
    } catch (error) {
      lastError = error;
      logWarn("Model failed, moving to next fallback", `scenario=${scenario.id} model=${model} reason="${error.message}"`);
    }
  }

  throw lastError || new Error("All configured OpenRouter models failed.");
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

    const cachedAnswers = readGeneratedAnswers();
    const cachedAnswer = findCachedAnswer(scenarioId, cachedAnswers);
    if (cachedAnswer?.answer) {
      logInfo("Serving cached AI response", `scenario=${scenarioId} model=${cachedAnswer.model || AI_MODEL}`);
      sendJson(request, response, 200, {
        answer: cachedAnswer.answer,
        model: cachedAnswer.model || AI_MODEL,
        provider: cachedAnswer.provider || AI_PROVIDER,
        cached: true,
        generatedAt: cachedAnswer.generatedAt || null,
      });
      return;
    }

    const generated = await generateScenarioResponseAcrossModels(scenario);
    const cacheKey = getCacheKey(scenarioId, generated.model);
    cachedAnswers[cacheKey] = {
      answer: generated.answer,
      model: generated.model,
      provider: generated.provider,
      generatedAt: new Date().toISOString(),
    };
    writeGeneratedAnswers(cachedAnswers);
    logInfo("Stored new AI response in cache", `scenario=${scenarioId} model=${generated.model}`);

    sendJson(request, response, 200, {
      answer: generated.answer,
      model: generated.model,
      provider: generated.provider,
      cached: false,
    });
  } catch (error) {
    if (error.message && /quota|rate limit|rate-limit|too many requests/i.test(error.message)) {
      logWarn("Quota or rate limit reached", `primaryModel=${AI_MODEL} message="${error.message}"`);
      sendJson(request, response, 429, {
        error: "OpenRouter quota or rate limit reached. Try again shortly.",
        quotaExceeded: true,
      });
      return;
    }

    if (error.message && /provider returned error/i.test(error.message)) {
      logWarn("Provider returned error", `primaryModel=${AI_MODEL} message="${error.message}"`);
      sendJson(request, response, 503, {
        error: `OpenRouter provider error across the configured free-model pool. Try again in a few seconds.`,
        providerError: true,
      });
      return;
    }

    logError("Unhandled AI generation error", `primaryModel=${AI_MODEL} message="${error.message || "unknown"}"`);
    sendJson(request, response, 500, {
      error: error.message || "Unable to generate an AI response.",
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
    logInfo("Saved participant response", `scenario=${responseRecord.id} total=${storedResponses.length}`);
    sendJson(request, response, 201, {
      saved: true,
      responses: storedResponses,
    });
  } catch (error) {
    logError("Failed to save participant response", `message="${error.message || "unknown"}"`);
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
    writeGeneratedAnswers({});
    logInfo("Cleared all stored participant responses and generated AI answers");
    sendJson(request, response, 200, {
      cleared: true,
      responses: [],
      generatedAnswersCleared: true,
    });
  } catch (error) {
    logError("Failed to clear stored responses", `message="${error.message || "unknown"}"`);
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
      provider: AI_PROVIDER,
      model: AI_MODEL,
      fallbackModels: AI_FALLBACK_MODELS,
      modelPool: AI_MODEL_POOL,
      hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY),
      maxTokens: AI_MAX_TOKENS,
      reasoningEnabled: AI_REASONING_ENABLED,
      reasoningEffort: AI_REASONING_EFFORT,
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
  logInfo(
    "CareTrust backend running",
    `url=http://${HOST}:${PORT} provider=${AI_PROVIDER} model=${AI_MODEL} fallbacks=${AI_FALLBACK_MODELS.length} reasoningEnabled=${AI_REASONING_ENABLED} reasoning=${AI_REASONING_EFFORT} maxTokens=${AI_MAX_TOKENS}`
  );
});
