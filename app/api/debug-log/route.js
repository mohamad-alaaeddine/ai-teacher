/**
 * ============================================================
 * DEBUG LOGGER ROUTE
 * ============================================================
 * Empfängt Log-Einträge vom Client und hängt sie an
 * teacher_app_debug.log auf dem Server an.
 * ============================================================
 */

import { NextResponse } from "next/server";
import { appendFile, writeFile, access } from "fs/promises";
import { join } from "path";

export const runtime = 'nodejs';

const LOG_PATH = join(process.cwd(), "teacher_app_debug.log");

// ── ROUTE HANDLER ────────────────────────────────────────────
export async function POST(req) {
  try {
    const body = await req.json();

    // ── Clear Log File ──
    if (body?.clear === true) {
      await writeFile(LOG_PATH, "", "utf8");
      console.log("🧹 [DEBUG LOG] Log-Datei geleert");
      return NextResponse.json({ ok: true, action: "cleared" });
    }

    // ── Append Log Entry ──
    const logLine = JSON.stringify({
      ...body,
      _written: new Date().toISOString(),
    }) + "\n";

    await appendFile(LOG_PATH, logLine, "utf8");

    return NextResponse.json({ ok: true });

  } catch (e) {
    console.error("❌ [DEBUG LOG ROUTE] Fehler:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── GET: Log lesen (optional für Debugging) ──────────────────
export async function GET() {
  try {
    const { readFile } = await import("fs/promises");

    // Prüfen ob Datei existiert
    try {
      await access(LOG_PATH);
    } catch {
      return NextResponse.json({ log: "", message: "Log-Datei existiert noch nicht" });
    }

    const content = await readFile(LOG_PATH, "utf8");
    const lines   = content
      .split("\n")
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); }
        catch { return { raw: line }; }
      });

    return NextResponse.json({
      totalLines: lines.length,
      lines,
    });

  } catch (e) {
    console.error("❌ [DEBUG LOG GET] Fehler:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}