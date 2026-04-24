/**
 * ============================================================
 * TASK 1: SERVER ROUTE - Google AI File Manager
 * ============================================================
 */

import { NextResponse } from "next/server";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { writeFile, unlink, appendFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export const runtime = 'nodejs';

// ── SERVER LOGGER ────────────────────────────────────────────
async function serverLog(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = { INFO: "🔵", SUCCESS: "✅", WARN: "⚠️ ", ERROR: "❌", TIMER: "⏱️ " }[level] || "📝";

  const consoleLine = `${prefix} [${timestamp}] [UPLOAD-ROUTE] ${message}`;
  data ? console.log(consoleLine, data) : console.log(consoleLine);

  try {
    const logLine = JSON.stringify({
      timestamp,
      level,
      task: "TASK_1_UPLOAD_ROUTE",
      message,
      data: data || null,
    }) + "\n";
    await appendFile(join(process.cwd(), "teacher_app_debug.log"), logLine, "utf8");
  } catch (e) {
    console.error("❌ [SERVER LOG] Failed:", e.message);
  }
}

function elapsed(startMs) {
  return `${((Date.now() - startMs) / 1000).toFixed(2)}s`;
}

// ── ROUTE HANDLER ────────────────────────────────────────────
export async function POST(req) {
  const routeStart = Date.now();
  let tempFilePath = "";

  try {
    // ── Phase 1: Request empfangen ──
    const phase1Start = Date.now();
    const formData = await req.formData();
    const file     = formData.get("file");
    const apiKey   = formData.get("apiKey");

    await serverLog("TIMER", "PHASE 1 - Request empfangen", {
      dauer:    elapsed(phase1Start),
      fileName: file?.name,
      fileSize: `${(file?.size / 1024).toFixed(1)} KB`,
      fileType: file?.type,
    });

    if (!file || !apiKey) {
      await serverLog("ERROR", "Missing file or apiKey");
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    // ── Phase 2: Temp File schreiben ──
    const phase2Start = Date.now();
    const bytes    = await file.arrayBuffer();
    const buffer   = Buffer.from(bytes);
    const safeName = file.name.replace(/\s+/g, "_");
    tempFilePath   = join(tmpdir(), `ai_teacher_${Date.now()}_${safeName}`);
    await writeFile(tempFilePath, buffer);

    await serverLog("TIMER", "PHASE 2 - Temp File geschrieben", {
      dauer: elapsed(phase2Start),
      path:  tempFilePath,
    });

    // ── Phase 3: Upload zu File Manager ──
    const phase3Start = Date.now();
    const mimeType   = detectMimeType(file.name);
    const fileManager = new GoogleAIFileManager(apiKey);

    await serverLog("TIMER", "PHASE 3 - Upload zu Google AI File Manager gestartet", {
      mimeType,
      fileName: file.name,
    });

    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType,
      displayName: file.name,
    });

    await unlink(tempFilePath);
    tempFilePath = "";

    await serverLog("TIMER", "PHASE 3 - Upload abgeschlossen", {
      dauer: elapsed(phase3Start),
      name:  uploadResponse.file.name,
      uri:   uploadResponse.file.uri,
      state: uploadResponse.file.state,
    });

    // ── Phase 4: Polling bis ACTIVE ──
    const phase4Start = Date.now();
    let fileStatus = uploadResponse.file.state;
    let attempts   = 0;
    const maxAttempts = 30;

    await serverLog("TIMER", "PHASE 4 - Polling gestartet", {
      initialState: fileStatus,
    });

    while (fileStatus !== "ACTIVE" && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000));
      const fileInfo = await fileManager.getFile(uploadResponse.file.name);
      fileStatus     = fileInfo.state;
      attempts++;

      await serverLog("INFO", `Poll ${attempts}/${maxAttempts}: ${fileStatus}`, {
        bisJetzt: elapsed(phase4Start),
      });
    }

    if (fileStatus !== "ACTIVE") {
      throw new Error("File processing timeout");
    }

    await serverLog("TIMER", "PHASE 4 - File ist ACTIVE", {
      dauer:    elapsed(phase4Start),
      versuche: attempts,
      fileUri:  uploadResponse.file.uri,
    });

    // ── GESAMTZEIT ──
    await serverLog("TIMER", "✅ GESAMT UPLOAD ROUTE ABGESCHLOSSEN", {
      gesamtZeit: elapsed(routeStart),
      fileName:   file.name,
      fileUri:    uploadResponse.file.uri,
    });

    return NextResponse.json({
      fileUri:        uploadResponse.file.uri,
      mimeType,
      fileName:       file.name,
      type:           "uri",
      processingTime: attempts,
    });

  } catch (error) {
      if (tempFilePath) {
        try { await unlink(tempFilePath); } catch (_) {}
      }

      const errorMessage = error.message || "An unknown error occurred";

      await serverLog("ERROR", "Upload Route fehlgeschlagen", {
        gesamtZeit: elapsed(routeStart),
        error:      errorMessage,
        stack:      error.stack,
      });

      // ── User-friendly error mapping ──
      let userFriendlyError = "Upload failed. Please try again later.";

      if (errorMessage.includes("API key not valid")) {
        userFriendlyError = "The provided API Key is invalid. Please check it and try again.";
      } else if (errorMessage.includes("File processing timeout")) {
        userFriendlyError = "The file took too long to process. Please try again with a smaller file.";
      } else if (errorMessage.toLowerCase().includes("permission denied")) {
        userFriendlyError = "Permission denied. The API key might not have the required permissions for the File API.";
      } else if (errorMessage.includes("404") || errorMessage.toLowerCase().includes("not found")) {
          userFriendlyError = "The file could not be found after upload. This might be a temporary issue.";
      }
      // فيك تضيف المزيد من الحالات هون...

      return NextResponse.json(
        {
          error:   userFriendlyError, // <-- الرسالة المبسطة للمستخدم
          details: errorMessage,      // <-- الخطأ الأصلي للـ debugging
        },
        { status: 500 }
      );
  }
}

// ── MIME HELPER ──────────────────────────────────────────────
function detectMimeType(fileName) {
  const name    = fileName.toLowerCase();
  const mimeMap = {
    ".pdf":  "application/pdf",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
    ".txt":  "text/plain",
  };
  for (const [ext, mime] of Object.entries(mimeMap)) {
    if (name.endsWith(ext)) return mime;
  }
  return "application/pdf";
}