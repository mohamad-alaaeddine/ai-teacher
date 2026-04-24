import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

/**
 * Speichert JSON-Logs. 
 * Wenn 'clear: true' gesendet wird, wird die Datei neu erstellt (überschrieben).
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const logPath = path.join(process.cwd(), "gemini_logs.txt");

    // Datei leeren/neu erstellen bei Sitzungsstart
    if (body.clear) {
      fs.writeFileSync(logPath, `--- SITZUNG GESTARTET AM ${new Date().toLocaleString()} ---\n`);
      return NextResponse.json({ success: true });
    }

    // Neue Nachricht anhängen
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `\n[${timestamp}] MESSAGE:\n${JSON.stringify(body, null, 2)}\n`;
    fs.appendFileSync(logPath, logEntry);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message });
  }
}