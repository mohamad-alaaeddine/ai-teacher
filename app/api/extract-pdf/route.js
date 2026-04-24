import { NextResponse } from "next/server";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export const runtime = 'nodejs';

export async function POST(req) {
  let tempFilePath = "";
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const apiKey = formData.get("apiKey");

    if (!file || !apiKey) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Dateinamen bereinigen und temporären Pfad erstellen
    const safeName = file.name.replace(/\s+/g, '_');
    tempFilePath = join(tmpdir(), `ai_teacher_${Date.now()}_${safeName}`);
    await writeFile(tempFilePath, buffer);

    const fileManager = new GoogleAIFileManager(apiKey);

    const fileName = file.name.toLowerCase();
    let mimeType = "application/pdf";
    if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) mimeType = "image/jpeg";
    else if (fileName.endsWith('.png')) mimeType = "image/png";
    else if (fileName.endsWith('.webp')) mimeType = "image/webp";
    else if (fileName.endsWith('.txt')) mimeType = "text/plain";
    // Datei zu Google AI hochladen
    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType: mimeType,
      displayName: file.name,
    });

    await unlink(tempFilePath);

    // ✅ نستنى للملف يصير ACTIVE
    let fileStatus = uploadResponse.file.state;
    let attempts = 0;
    const maxAttempts = 30; // 30 ثانية max

    while (fileStatus !== "ACTIVE" && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // نستنى ثانية
      const fileInfo = await fileManager.getFile(uploadResponse.file.name);
      fileStatus = fileInfo.state;
      attempts++;
      //console.log(`[PDF STATUS] Attempt ${attempts}: ${fileStatus}`);
    }

    if (fileStatus !== "ACTIVE") {
      throw new Error("File processing timeout - file did not become ACTIVE");
    }

    //console.log(`✅ [PDF READY] File is ACTIVE after ${attempts} seconds`);

    return NextResponse.json({ 
      fileBase64: buffer.toString('base64'),
      //fileUri: uploadResponse.file.uri,
      mimeType: mimeType,
      fileName: file.name,
     // processingTime: attempts
    });
  } catch (error) {
    if (tempFilePath) { try { await unlink(tempFilePath); } catch (e) {} }
    return NextResponse.json({ error: "Upload failed", details: error.message }, { status: 500 });
  }
}