/**
 * ============================================================
 * TASK 2: THE ANALYST - REST OCR
 * ============================================================
 * Zuständigkeit:
 *   - Nimmt fileParts von Task 1 (uri)
 *   - Ruft Gemini REST API direkt auf (kein Server-Proxy)
 *   - Gibt strukturiertes JSON zurück
 * ============================================================
 */

const MODEL_NAME = "gemini-2.5-flash-lite";
const GEMINI_REST_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

// ── LOGGER ──────────────────────────────────────────────────
async function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = {
    INFO:    "🔵 [INFO]",
    SUCCESS: "✅ [SUCCESS]",
    WARN:    "⚠️  [WARN]",
    ERROR:   "❌ [ERROR]",
  }[level] || "📝 [LOG]";

  const consoleMsg = `${prefix} [ANALYST] [${timestamp}] ${message}`;
  data ? console.log(consoleMsg, data) : console.log(consoleMsg);

  try {
    await fetch("/api/debug-log", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp,
        level,
        task:    "TASK_2_ANALYST",
        message,
        data:    data || null,
      }),
    });
  } catch (e) {
    console.error("❌ [ANALYST LOGGER] Fehler:", e.message);
  }
}

// ── ANALYST CORE ─────────────────────────────────────────────
/**
 * Analysiert Dateien via Gemini REST API direkt vom Browser.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {Array}  params.fileParts - von Task 1
 *
 * @returns {Promise<{
 *   success: boolean,
 *   content: object,
 *   rawText: string,
 * }>}
 */
export async function analyzeFiles({ apiKey, fileParts }) {
  const startTime = Date.now();

  await log("INFO", "Analyse gestartet", {
    fileCount: fileParts.length,
    fileTypes: fileParts.map(f => ({ type: f.type, mimeType: f.mimeType })),
  });

  const parts = buildParts(fileParts);

  await log("INFO", "Parts für Gemini REST erstellt", {
    partCount: parts.length,
  });

  // ── Gemini REST direkt aufrufen (mit Retry) ──
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 2000;

  let geminiData;
  let lastStatus;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await log("INFO", `Versuch ${attempt}/${MAX_RETRIES}...`);

    const res = await fetch(`${GEMINI_REST_URL}?key=${apiKey}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature:     0.1,
          maxOutputTokens: 8192,
        },
      }),
    });

    lastStatus = res.status;

    if (res.ok) {
      geminiData = await res.json();
      await log("SUCCESS", `Gemini REST geantwortet`, {
        attempt,
        elapsedMs: Date.now() - startTime,
        tokens:    geminiData.usageMetadata,
      });
      break;
    }

    const errText = await res.text();
    await log("WARN", `Versuch ${attempt} fehlgeschlagen`, {
      status:  res.status,
      body:    errText,
    });

    if (res.status !== 503 || attempt === MAX_RETRIES) {
      throw new Error(`Gemini REST error ${res.status}: ${errText}`);
    }

    await new Promise(r => setTimeout(r, RETRY_DELAY));
  }

  if (!geminiData) {
    throw new Error("Alle Versuche fehlgeschlagen (503)");
  }

  // ── Antwort verarbeiten ──
  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  await log("INFO", "Rohtext extrahiert", { length: rawText.length });

  // ── JSON parsen ──
  let content = {};
  try {
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    content = JSON.parse(cleaned);
    await log("SUCCESS", "JSON geparst", {
      filesFound: content.files?.length,
    });
  } catch (parseErr) {
    await log("WARN", "JSON Parse fehlgeschlagen — Fallback", {
      error: parseErr.message,
    });
    content = {
      files: [{
        fileName:      "unknown",
        contentType:   "other",
        extractedText: rawText,
        keyTopics:     [],
        summary:       rawText.substring(0, 500),
      }],
      combinedSummary:  rawText.substring(0, 500),
      totalKeyTopics:   [],
    };
  }

  await log("SUCCESS", "Analyse abgeschlossen", {
    elapsedMs: Date.now() - startTime,
  });

  return {
    success: true,
    content,
    rawText,
  };
}

// ── HELPERS ──────────────────────────────────────────────────
function buildParts(fileParts) {
  const parts = [];

  parts.push({
    text: `You are a precise AI assistant specialized in educational content extraction and OCR.

### YOUR TASK:
Analyze ALL provided files and extract their content for use by a language teacher.

### EXTRACTION RULES:
1. **OCR:** Extract ALL visible text exactly as written, including small text, captions, footnotes, and text on objects.
2. **Page Numbers:** Note page numbers ONLY if clearly visible in headers or footers. Do NOT guess.
3. **Visual Analysis:** If the file contains important visual content (diagrams, charts, illustrations, people) → add visualAnalysis. If text-only → omit this field.
4. **Structure:** Identify headings, paragraphs, lists, tables, and exercises.
5. **Key Concepts:** Extract vocabulary, grammar rules, definitions, and important terms.
6. **Context:** Understand if the content is a lesson, exercise, textbook page, or exam.

### OUTPUT FORMAT:
Return ONLY valid JSON, no markdown, no explanation:
{
  "files": [
    {
      "fileName": "exact filename as provided",
      "contentType": "lesson|exercise|vocabulary|exam|textbook|other",
      "extractedText": "All extracted text exactly as written",
      "pageNumbers": [1, 2, 3],
      "visualAnalysis": "Description of visual content if any (omit if text-only)",
      "keyTopics": ["topic1", "topic2"],
      "vocabulary": ["word1", "word2"],
      "exercises": ["exercise description if any"],
      "summary": "Brief summary of this file's content in English"
    }
  ],
  "combinedSummary": "Overall summary of all materials in English",
  "totalKeyTopics": ["topic1", "topic2"],
  "suggestedTeachingPoints": ["Point 1", "Point 2"]
}`
  });

  for (let i = 0; i < fileParts.length; i++) {
    const f = fileParts[i];
    parts.push({ text: `File ${i + 1}: ${f.name}` });
    parts.push({
      fileData: {
        mimeType: f.mimeType,
        fileUri:  f.fileUri,
      }
    });
  }

  return parts;
}