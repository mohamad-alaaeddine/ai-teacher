# 🤖 Buddy AI – Dein smarter KI-Sprachlehrer

Buddy AI ist eine interaktive, hochgradig optimierte Lernplattform, die Next.js, Firebase und die Google Gemini API kombiniert, um ein dynamisches und personalisiertes Sprachlernerlebnis zu schaffen. Das System funktioniert wie eine native mobile App und bietet bidirektionalen Echtzeit-Sprachchat, intelligente Dokumentenanalyse und automatische Kontext-Erkennung.

🔗 **[Live-Demo ausprobieren](https://ai-teacher-umber-delta.vercel.app)**

---

## 🌟 Hauptmerkmale & Einzigartige Funktionen

### 📱 1. Natives App-Erlebnis & Vollständige Immersion
* **Responsive Design:** Das Layout ist so optimiert, dass es sich auf mobilen Geräten wie eine echte native App anfühlt (inklusive Landscape-Mode Anpassungen).
* **Vollständige Immersion:** Der Nutzer wählt seine Muttersprache und seine Zielsprache. Um das Eintauchen in die neue Sprache zu maximieren, passt sich die **gesamte Benutzeroberfläche** (UI) automatisch der Zielsprache an.

### 🧠 2. Kontextbezogene Intelligenz & Auto-Karteikarten
* Der KI-Lehrer analysiert den Kontext des Gesprächs in Echtzeit.
* Wenn die KI bemerkt, dass der Schüler ein Wort nicht kennt, falsch verwendet oder aktiv nach der Bedeutung fragt, wird dieses Wort **automatisch** als Vokabelkarte (Flashcard) mit der Übersetzung in die Muttersprache in der Firebase-Datenbank (Firestore) gespeichert.
* Schüler können über den "Flashcards"-Button jederzeit auf ihre gesammelten Vokabeln zugreifen und diese verwalten.

### 🏫 3. Der interaktive Klassenraum (Classroom)
Der Classroom bietet maximale Flexibilität für jeden Lernstil:
* **Live Voice Mode:** Ein flüssiger, latenzfreier Echtzeit-Sprachchat (Bidi-WebSockets) direkt mit der KI.
* **Voice-to-Text (Mic):** Wer keine Lust zum Tippen hat, kann seine Stimme nutzen, die sofort in Text umgewandelt und in den Chat eingefügt wird.
* **Spontaner Bild-Upload:** Unabhängig von den Lernmaterialien im Setup, können Schüler direkt im Chat eine neue Umgebung abfotografieren oder ein Bild hochladen, um sofort mit der KI darüber zu diskutieren.
* **Live-Token-Zähler:** Transparente Anzeige des API-Token-Verbrauchs am oberen Bildschirmrand.
* **Session-Report:** Mit einem Klick auf "Report" generiert die KI einen detaillierten, ehrlichen Bericht über die aktuelle Lektion, die Fehler und den Fortschritt.

### 📚 4. 10 Spezialisierte Lernmodi (inkl. Vokabel-Tester)
Die Plattform bietet 10 verschiedene Modi, die das Lernen revolutionieren. Ein besonderes Highlight:
* **Vocabulary Driller (Der Eltern-Ersatz):** Nie wieder müssen Eltern Vokabeln abfragen! Schüler fotografieren einfach die Vokabelseite aus ihrem Schulbuch, laden das Bild hoch (via OCR verarbeitet), und die KI fragt die Vokabeln systematisch ab, korrigiert die Aussprache und testet das Wissen.
* **Weitere Modi:** *Grammar Tutor* (Fehlerkorrektur), *Role-Play* (Alltagssituationen simulieren), *Debate Room* (Diskussionen auf hohem Niveau), *Exam Prep* (IELTS/TOEFL Vorbereitung), *Story Co-creation*, *Free Practice* und mehr.

### 🔒 5. Sicherheit & Datenschutz (Zero-Knowledge Architecture)
Dieses Projekt wurde nach dem **"Bring Your Own Key" (BYOK)** Prinzip entwickelt.
* **Keine Speicherung auf Servern:** Der eingegebene Gemini API-Schlüssel wird ausschließlich lokal im `sessionStorage` des Computers gespeichert. Beim Schließen des Browsers wird er spurlos gelöscht.
* **Direkte Kommunikation:** Alle Daten (Sprache, OCR, Chat) fließen direkt vom Browser zu den Google-Servern. Der Entwickler hat absolut keinen Zugriff auf die API-Schlüssel oder Chat-Inhalte der Nutzer.
* **Sichere Firebase-Anmeldung:** Authentifizierung via Google Login (OAuth), wobei Firebase lediglich zur Speicherung der Vokabeln genutzt wird.

---

## 🛠️ Technologie-Stack

* **Frontend:** Next.js (App Router), Tailwind CSS, Framer Motion
* **Audio & Streaming:** Web Audio API, Gemini Live Client (WebSockets via `gemini-3.1-flash-live-preview`)
* **OCR & Dateiverarbeitung:** Gemini REST API (`gemini-2.5-flash-lite`), Google AI File Manager (Resumable Uploads)
* **Backend & Auth:** Firebase Auth, Cloud Firestore
* **Hosting:** Vercel

---

## 💻 Lokale Installation & Einrichtung

Befolgen Sie diese Schritte, um das Projekt auf Ihrem lokalen Rechner auszuführen:

### 1. Repository klonen
```bash
git clone https://github.com/mohamad-alaaeddine/ai-teacher.git
cd ai-teacher
```

### 2. Abhängigkeiten installieren
```bash
npm install
```

### 3. Umgebungsvariablen einrichten (Firebase)
Erstellen Sie eine `.env.local` Datei im Hauptverzeichnis des Projekts und fügen Sie Ihre öffentlichen Firebase-Anmeldedaten hinzu:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=ihr_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ihr_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ihre_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=ihr_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=ihre_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=ihre_app_id
```

### 🔑 4. Woher bekomme ich den Gemini API-Schlüssel? (Kostenlos)
Um die App zu nutzen, benötigen Sie einen Gemini API-Schlüssel von Google. 
Das Beste daran: **Die Nutzung ist aktuell im "Free Tier" (kostenlose Stufe) von Google völlig kostenlos!**

So erhalten Sie den Schlüssel in unter 1 Minute:
1. Besuchen Sie [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Melden Sie sich mit Ihrem normalen Google-Konto an.
3. Klicken Sie auf **"Create API key"** (API-Schlüssel erstellen).
4. Kopieren Sie den Schlüssel. (Sie tragen ihn später direkt auf der Startseite der App ein – er muss **nicht** in die `.env` Datei!).

### 5. Lokalen Server starten
```bash
npm run dev
```

Öffnen Sie nun [http://localhost:3000](http://localhost:3000) in Ihrem Browser, melden Sie sich an, fügen Sie Ihren kostenlosen API-Schlüssel ein und starten Sie Ihre erste Lektion!
```

---