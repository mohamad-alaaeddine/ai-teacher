/**
 * ============================================================
 * TASK 2: SERVER ROUTE - Gemini REST OCR
 * ============================================================
 */

import { NextResponse } from "next/server";
import { writeFile, appendFile } from "fs/promises";
import { join } from "path";

export const runtime = 'nodejs';
//const modelName = "gemini-3.1-flash-lite-preview";
const modelName = "gemini-2.5-flash-lite";

const GEMINI_REST_URL = "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent";

//const GEMINI_REST_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent";

/*
models/gemini-3.1-flash-lite-preview
gemini-2.5-flash-lite

models/gemini-2.5-flash

models/gemini-2.5-pro
models/gemini-2.0-flash
models/gemini-2.0-flash-001
models/gemini-2.0-flash-lite-001
models/gemini-2.0-flash-lite
models/gemini-2.5-flash-preview-tts
models/gemini-2.5-pro-preview-tts
models/gemma-3-1b-it
models/gemma-3-4b-it
models/gemma-3-12b-it
models/gemma-3-27b-it
models/gemma-3n-e4b-it
models/gemini-flash-latest
models/gemini-flash-lite-latest
models/gemini-2.5-flash-lite
models/gemini-3-pro-preview
models/gemini-3-flash-preview
models/gemini-3.1-pro-preview
models/deep-research-pro-preview-12-2025
models/gemini-2.5-flash-native-audio-preview-09-2025
models/gemini-3.1-flash-live-preview
*/
// ── SERVER LOGGER ────────────────────────────────────────────
async function serverLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = {
    INFO:    "🔵",
    SUCCESS: "✅",
    WARN:    "⚠️ ",
    ERROR:   "❌",
    TIMER:   "⏱️ ",
  }[level] || "📝";

  const line = `${prefix} [${timestamp}] [ANALYZE-ROUTE] ${message}`;
  data ? console.log(line, data) : console.log(line);

  try {
    const logLine = JSON.stringify({
      timestamp,
      level,
      task:    "TASK_2_ANALYZE_ROUTE",
      message,
      data:    data || null,
    }) + "\n";

    await appendFile(
      join(process.cwd(), "teacher_app_debug.log"),
      logLine,
      "utf8"
    );
  } catch (e) {
    console.error("❌ [SERVER LOG] Fehler:", e.message);
  }
}

// ── TIMER HELPER ─────────────────────────────────────────────
function elapsed(startMs) {
  return `${((Date.now() - startMs) / 1000).toFixed(2)}s`;
}

// ── ROUTE HANDLER ────────────────────────────────────────────
export async function POST(req) {
  const routeStart = Date.now();

  try {
    // ── Phase 1: Request parsen ──
    const phase1Start = Date.now();
    const { apiKey, parts } = await req.json();
    await serverLog("TIMER", "PHASE 1 - Request empfangen", {
      dauer:     elapsed(phase1Start),
      partCount: parts?.length,
      partTypes: parts?.map(p =>
        p.text       ? `text(${p.text.length}chars)` :
        p.fileData   ? `fileData(${p.fileData.mimeType})` :
        p.inlineData ? `inlineData(${p.inlineData.mimeType})` : "unknown"
      ),
    });

    if (!apiKey || !parts?.length) {
      await serverLog("ERROR", "Fehlende apiKey oder parts");
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // ── Phase 2: Gemini REST Request senden ──
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 2000;

    let response;
    let geminiData;
    let attemptCount = 0;

    const phase2Start = Date.now();
    await serverLog("TIMER", "PHASE 2 - Gemini REST Request wird gesendet...", {
      url:   GEMINI_REST_URL,
      model: GEMINI_REST_URL.split("/models/")[1]?.split(":")[0],
    });

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      attemptCount = attempt;
      const attemptStart = Date.now();

      await serverLog("INFO", `Versuch ${attempt}/${MAX_RETRIES} gestartet`);

      response = await fetch(`${GEMINI_REST_URL}?key=${apiKey}`, {
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

      // --- التعديل بيبدأ هون ---
      if (!response.ok) {
        const errorBody = await response.text(); // منسحب نص الغلط
        await serverLog("ERROR", `Gemini API Error Status: ${response.status}`, {
          body: errorBody
        });
        
        // إذا كان الغلط 503 كمل للـ retry، إذا غير شي (مثل 500) فيك تقرر شو تعمل
        if (response.status !== 503) {
           // إذا بدك يوقف فوراً عند الـ 500 وما يكمل ريتراي:
           // break; 
        }
      } else {
        // إذا الرد سليم، منحول لـ JSON
        geminiData = await response.json();
      }
      // --- التعديل بيخلص هون ---

      await serverLog("TIMER", `Versuch ${attempt} abgeschlossen`, {
        dauer:  elapsed(attemptStart),
        status: response.status,
      });

      if (response.status === 503) {
        await serverLog("WARN", `503 - Retry in ${RETRY_DELAY}ms`, {
          versuch: `${attempt}/${MAX_RETRIES}`,
        });
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, RETRY_DELAY));
          continue;
        }
      }

      break;
    }

    await serverLog("TIMER", "PHASE 2 - Gemini REST abgeschlossen", {
      gesamtDauer: elapsed(phase2Start),
      versuche:   attemptCount,
      status:     response.status,
      //tokens:     geminiData.usageMetadata,
      tokens:     geminiData?.usageMetadata,
    });

    // ── Fehlerbehandlung ──
    if (!response.ok) {
      if (response.status !== 503) {
        await serverLog("ERROR", "Gemini REST Fehler", {
          status: response.status,
          error:  geminiData,
        });
        throw new Error(geminiData.error?.message || `HTTP ${response.status}`);
      }

      await serverLog("WARN", "Alle Versuche fehlgeschlagen – Fallback");
      const fallbackContent = { files: [], combinedSummary: "", totalKeyTopics: [] };
      await writeFile(
        join(process.cwd(), "ocr_output.json"),
        JSON.stringify({ timestamp: new Date().toISOString(), note: "Fallback 503", content: fallbackContent, rawText: "" }, null, 2),
        "utf8"
      );
      return NextResponse.json({ success: true, content: fallbackContent, rawText: "", savedTo: "ocr_output.json", note: "Fallback 503" });
    }

    // ── Phase 3: Antwort verarbeiten ──
    const phase3Start = Date.now();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    await serverLog("TIMER", "PHASE 3 - Rohtext extrahiert", {
      dauer:        elapsed(phase3Start),
      textLength:   rawText.length,
      textPreview:  rawText.substring(0, 100),
    });

    // ── Phase 4: JSON parsen ──
    const phase4Start = Date.now();
    let content = {};
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      content = JSON.parse(cleaned);
      await serverLog("TIMER", "PHASE 4 - JSON geparst", {
        dauer:          elapsed(phase4Start),
        filesFound:     content.files?.length,
        totalKeyTopics: content.totalKeyTopics?.length,
      });
    } catch (parseErr) {
      await serverLog("WARN", "PHASE 4 - JSON Parse fehlgeschlagen", {
        dauer: elapsed(phase4Start),
        error: parseErr.message,
      });
      content = {
        files: [{ fileName: "unknown", fileType: "unknown", extractedText: rawText, keyTopics: [], tables: [], summary: rawText.substring(0, 500) }],
        combinedSummary: rawText.substring(0, 500),
        totalKeyTopics:  [],
      };
    }

    // ── Phase 5: Speichern ──
    const phase5Start = Date.now();
    const outputPath = join(process.cwd(), "ocr_output.json");
    await writeFile(outputPath, JSON.stringify({
      timestamp:     new Date().toISOString(),
      partCount:     parts.length,
      usageMetadata: geminiData.usageMetadata,
      content,
      rawText,
    }, null, 2), "utf8");

    await serverLog("TIMER", "PHASE 5 - Datei gespeichert", {
      dauer: elapsed(phase5Start),
      path:  outputPath,
    });

    // ── GESAMTZEIT ──
    await serverLog("TIMER", "✅ GESAMT OCR ROUTE ABGESCHLOSSEN", {
      gesamtZeit:    elapsed(routeStart),
      phase1_parse:  "siehe oben",
      phase2_gemini: "siehe oben",
      phase3_text:   "siehe oben",
      phase4_json:   "siehe oben",
      phase5_save:   "siehe oben",
    });

    return NextResponse.json({
      success:       true,
      content,
      rawText,
      savedTo:       "ocr_output.json",
      usageMetadata: geminiData.usageMetadata,
    });

  } catch (error) {
    await serverLog("ERROR", "Analyze Route fehlgeschlagen", {
      gesamtZeit: elapsed(routeStart),
      error:      error.message,
      stack:      error.stack,
    });
    return NextResponse.json(
      { error: "Analysis failed", details: error.message },
      { status: 500 }
    );
  }
}