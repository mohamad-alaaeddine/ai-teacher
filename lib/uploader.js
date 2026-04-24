/**
 * ============================================================
 * TASK 1: THE UPLOADER - File API Manager
 * ============================================================
 * Zuständigkeit:
 *   - Alle Dateien (PDF, Image, Text) → Google AI File Manager
 *   - Bilder werden vor dem Upload komprimiert (max 1024px)
 *   - Gibt fileUri zurück für OCR REST
 *   - Direct to Google — kein Server-Proxy
 * ============================================================
 */

// ── LOGGER ──────────────────────────────────────────────────
async function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = {
    INFO:    "🔵 [INFO]",
    SUCCESS: "✅ [SUCCESS]",
    WARN:    "⚠️  [WARN]",
    ERROR:   "❌ [ERROR]",
  }[level] || "📝 [LOG]";

  const consoleMsg = `${prefix} [UPLOADER] [${timestamp}] ${message}`;
  data ? console.log(consoleMsg, data) : console.log(consoleMsg);

  try {
    await fetch("/api/debug-log", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp,
        level,
        task:    "TASK_1_UPLOADER",
        message,
        data:    data || null,
      }),
    });
  } catch (e) {
    console.error("❌ [UPLOADER LOGGER] Fehler:", e.message);
  }
}

// ── MIME TYPE DETECTOR ───────────────────────────────────────
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
    if (name.endsWith(ext)) {
      log("INFO", `MIME erkannt: ${mime} für Datei: ${fileName}`);
      return mime;
    }
  }

  log("WARN", `Unbekannte Endung für: ${fileName} – Standard: application/pdf`);
  return "application/pdf";
}

// ── IMAGE COMPRESSOR ─────────────────────────────────────────
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const MAX_SIZE = 1024;
        let width  = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round(height * MAX_SIZE / width);
            width  = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width  = Math.round(width * MAX_SIZE / height);
            height = MAX_SIZE;
          }
        }

        const canvas  = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        const ctx     = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        URL.revokeObjectURL(url);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas toBlob fehlgeschlagen"));
              return;
            }
            resolve(blob);
          },
          "image/jpeg",
          0.8
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht geladen werden"));
    };

    img.src = url;
  });
}

// ── UPLOADER CORE ────────────────────────────────────────────
/**
 * Lädt eine Datei direkt zu Google AI File Manager hoch (kein Server-Proxy).
 * Bilder werden vorher komprimiert.
 *
 * @param {object} params
 * @param {File}   params.file   - Browser File Objekt
 * @param {string} params.apiKey - Gemini API Key
 *
 * @returns {Promise<{
 *   fileUri:  string,
 *   mimeType: string,
 *   fileName: string,
 *   type:     "uri",
 * }>}
 */
export async function uploadFile({ file, apiKey }) {
  const startTime = Date.now();

  await log("INFO", `Upload gestartet`, {
    fileName: file.name,
    fileSize: `${(file.size / 1024).toFixed(1)} KB`,
    fileType: file.type,
  });

  // ── MIME Typ erkennen ──
  const mimeType = detectMimeType(file.name);
  const isImage  = mimeType.startsWith("image/");

  // ── Bilder komprimieren ──
  if (isImage) {
    await log("INFO", `Bild wird komprimiert...`, {
      originalSize: `${(file.size / 1024).toFixed(1)} KB`,
    });

    try {
      const compressedBlob = await compressImage(file);

      await log("SUCCESS", `Bild komprimiert`, {
        originalSize:   `${(file.size / 1024).toFixed(1)} KB`,
        compressedSize: `${(compressedBlob.size / 1024).toFixed(1)} KB`,
        reduction:      `${Math.round((1 - compressedBlob.size / file.size) * 100)}%`,
      });

      const jpegName = file.name.replace(/\.(png|webp|jpg|jpeg)$/i, ".jpg");
      file = new File([compressedBlob], jpegName, { type: "image/jpeg" });

    } catch (compressErr) {
      await log("WARN", `Komprimierung fehlgeschlagen, Original wird verwendet`, {
        error: compressErr.message,
      });
    }
  }

  // ── Step 1: Resumable Upload initiieren ──
  await log("INFO", `Starte Resumable Upload direkt zu Google...`);

  try {
    const initRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command":  "start",
          "X-Goog-Upload-Header-Content-Length": file.size.toString(),
          "X-Goog-Upload-Header-Content-Type":   file.type || mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file: { display_name: file.name },
        }),
      }
    );

    if (!initRes.ok) {
      const errText = await initRes.text();
      await log("ERROR", `Resumable Upload Init fehlgeschlagen`, {
        status: initRes.status,
        body:   errText,
      });
      throw new Error(`Upload init failed: ${initRes.status} — ${errText}`);
    }

    const uploadUrl = initRes.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      throw new Error("Kein Upload-URL erhalten");
    }

    await log("INFO", `Upload-URL erhalten, sende Datei...`);

    // ── Step 2: Datei hochladen ──
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": file.size.toString(),
        "X-Goog-Upload-Offset":  "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      body: file,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      await log("ERROR", `Datei-Upload fehlgeschlagen`, {
        status: uploadRes.status,
        body:   errText,
      });
      throw new Error(`File upload failed: ${uploadRes.status} — ${errText}`);
    }

    const uploadData = await uploadRes.json();
    const fileInfo   = uploadData.file;

    await log("SUCCESS", `Datei hochgeladen`, {
      name:  fileInfo.name,
      uri:   fileInfo.uri,
      state: fileInfo.state,
    });

    // ── Step 3: Polling bis ACTIVE ──
    let fileState = fileInfo.state;
    let attempts  = 0;
    const maxAttempts = 30;
    const fileName    = fileInfo.name;

    while (fileState !== "ACTIVE" && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000));

      const pollRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`
      );

      if (!pollRes.ok) {
        await log("WARN", `Poll fehlgeschlagen bei Versuch ${attempts + 1}`);
        attempts++;
        continue;
      }

      const pollData = await pollRes.json();
      fileState = pollData.state;
      attempts++;

      await log("INFO", `Poll ${attempts}/${maxAttempts}: ${fileState}`);
    }

    if (fileState !== "ACTIVE") {
      throw new Error("File processing timeout — file never became ACTIVE");
    }

    await log("SUCCESS", `Upload komplett & ACTIVE`, {
      fileUri:        fileInfo.uri,
      elapsedMs:      Date.now() - startTime,
      pollingAttempts: attempts,
    });

    return {
      fileUri:  fileInfo.uri,
      mimeType: isImage ? "image/jpeg" : mimeType,
      fileName: file.name,
      type:     "uri",
    };

  } catch (err) {
    await log("ERROR", `Upload fehlgeschlagen`, {
      fileName: file.name,
      error:    err.message,
    });
    throw err;
  }
}