# 🤖 Buddy AI – Dein smarter KI-Sprachlehrer

Buddy AI ist eine interaktive, hochgradig optimierte Lernplattform, die Next.js, Firebase und die Google Gemini API kombiniert, um ein dynamisches und personalisiertes Sprachlernerlebnis zu schaffen. Das System funktioniert wie eine native mobile App und bietet bidirektionalen Echtzeit-Sprachchat, intelligente Dokumentenanalyse und automatische Kontext-Erkennung.

🔗 **[Live-Demo ausprobieren](https://ai-teacher-umber-delta.vercel.app)**

---

## 📸 Screenshots

| Setup Screen | Classroom |
|:---:|:---:|
| ![Setup Screen](https://raw.githubusercontent.com/mohamad-alaaeddine/ai-teacher/main/public/screenshots/Setup.png) | ![Classroom](https://raw.githubusercontent.com/mohamad-alaaeddine/ai-teacher/main/public/screenshots/Class%20Room.png) |
| API Key, Sprache, Modus & Datei-Upload | Live Voice Chat, Token-Zähler & Bild-Panel |

---

## 💡 Die Lücke, die Buddy AI schließt

Zwei der mächtigsten KI-Tools für Lernende haben bisher eine entscheidende Einschränkung:

| Tool | Stärke | Einschränkung |
|------|--------|---------------|
| **Gemini Live** | Echtzeit-Gespräch & Sprachinteraktion | Keine Datei-Analyse möglich |
| **NotebookLM** | Tiefe Dokument-Analyse & Zusammenfassungen | Kein Live-Gespräch möglich |

**Buddy AI vereint beide Welten:** Lade dein Schulbuch, deine Notizen oder ein Bild hoch — und unterhalte dich dann in Echtzeit per Sprache mit einem KI-Lehrer, der den Inhalt vollständig versteht. ✅

---

## 🌟 Hauptmerkmale & Einzigartige Funktionen

### 📱 1. Natives App-Erlebnis & Vollständige Immersion
* **Responsive Design:** Das Layout ist so optimiert, dass es sich auf mobilen Geräten wie eine echte native App anfühlt (inklusive Landscape-Mode Anpassungen).
* **Vollständige Immersion:** Der Nutzer wählt seine Muttersprache und seine Zielsprache. Um das Eintauchen in die neue Sprache zu maximieren, passt sich die **gesamte Benutzeroberfläche** (UI) — inklusive aller Buttons, Menüs, Meldungen und Beschriftungen — automatisch der Zielsprache an. So lernt der Schüler nicht nur durch Gespräche, sondern ist von der ersten Sekunde an vollständig von der neuen Sprache umgeben.

**Unterstützte Sprachen (20):**

Englisch, Deutsch, Arabisch, Spanisch, Französisch, Italienisch, Chinesisch, Hindi, Bengalisch, Portugiesisch, Russisch, Urdu, Indonesisch, Japanisch, Türkisch, Koreanisch, Vietnamesisch, Niederländisch, Persisch, Polnisch

### 🧠 2. Kontextbezogene Intelligenz & Auto-Karteikarten
* Der KI-Lehrer analysiert den Kontext des Gesprächs in Echtzeit.
* Wenn die KI bemerkt, dass der Schüler ein Wort nicht kennt, falsch verwendet oder aktiv nach der Bedeutung fragt, wird dieses Wort **automatisch** als Vokabelkarte (Flashcard) mit der Übersetzung in die Muttersprache in der Firebase-Datenbank (Firestore) gespeichert.
* Schüler können über den "Flashcards"-Button jederzeit auf ihre gesammelten Vokabeln zugreifen, bearbeiten und löschen.

### 🏫 3. Der interaktive Klassenraum (Classroom)
Der Classroom bietet maximale Flexibilität für jeden Lernstil:
* **Live Voice Mode:** Ein flüssiger, latenzfreier Echtzeit-Sprachchat (Bidi-WebSockets) direkt mit der KI — inklusive automatischem Reconnect bei Verbindungsabbruch.
* **Voice-to-Text (Mic):** Wer keine Lust zum Tippen hat, kann seine Stimme nutzen, die sofort in Text umgewandelt und in den Chat eingefügt wird.
* **Spontaner Bild-Upload:** Unabhängig von den Lernmaterialien im Setup, können Schüler direkt im Chat eine neue Umgebung abfotografieren oder ein Bild hochladen, um sofort mit der KI darüber zu diskutieren.
* **Live-Token-Zähler:** Transparente Anzeige des API-Token-Verbrauchs am oberen Bildschirmrand.
* **Session-Report:** Mit einem Klick auf "Report" generiert die KI einen detaillierten, ehrlichen Bericht über die aktuelle Lektion, die Fehler und den Fortschritt.

### 📚 4. 10 Spezialisierte Lernmodi

Die Plattform bietet **10 verschiedene Modi**, aufgeteilt in 4 Kategorien:

| Kategorie | Modi |
|-----------|------|
| ⚙️ General | Open Tutor |
| 📚 Foundation | Vocabulary Driller, Grammar Tutor, Reading & Translation |
| 🎭 Simulation | Role-Play, Debate Room, Story Co-creation |
| 🎓 Specialized | Image Discussion, Exam Prep, Free Practice |

Ein besonderes Highlight:
* **Vocabulary Driller (Der Eltern-Ersatz):** Nie wieder müssen Eltern Vokabeln abfragen! Schüler fotografieren einfach die Vokabelseite aus ihrem Schulbuch, laden das Bild hoch (via OCR verarbeitet), und die KI fragt die Vokabeln systematisch ab. Das eingebaute **3×-Meisterschaftssystem** markiert ein Wort erst dann als "gemeistert" ✅, wenn es dreimal hintereinander richtig beantwortet wurde — für nachhaltiges Lernen statt oberflächlichem Auswendiglernen.
* **Free Practice:** Schüler sprechen oder schreiben frei ohne Unterbrechung — am Ende gibt die KI einen strukturierten, ehrlichen Feedback-Report.
* **Exam Prep:** Vorbereitung auf IELTS, TOEFL, Goethe-Zertifikat, DELF und andere Prüfungen mit realistischen Übungsaufgaben.

Jeder Modus ist auch mit 3 Immersionsstufen kombinierbar:
* **Beginner** (80% Muttersprache)
* **Balanced** (50% / 50%)
* **Immersion** (80% Zielsprache)

### 🔒 5. Sicherheit & Datenschutz (Zero-Knowledge Architecture)
Dieses Projekt wurde nach dem **"Bring Your Own Key" (BYOK)** Prinzip entwickelt.
* **Keine Speicherung auf Servern:** Der eingegebene Gemini API-Schlüssel wird ausschließlich lokal im `sessionStorage` des Computers gespeichert. Beim Schließen des Browsers **oder des Tabs** wird er spurlos gelöscht — im Gegensatz zu `localStorage`, der dauerhaft gespeichert bleibt.
* **Direkte Kommunikation:** Alle Daten (Sprache, OCR, Chat) fließen direkt vom Browser zu den Google-Servern. Der Entwickler hat absolut keinen Zugriff auf die API-Schlüssel oder Chat-Inhalte der Nutzer. Der API-Schlüssel verlässt niemals Ihren Browser — er wird direkt an Google gesendet, ohne den Entwickler-Server zu berühren. Auch Datei-Uploads (OCR) werden direkt vom Browser zu Google hochgeladen — kein Umweg über den Server des Entwicklers.
* **Sichere Firebase-Anmeldung:** Authentifizierung via Google Login (OAuth), wobei Firebase lediglich zur Speicherung der Vokabeln genutzt wird.

---

## 🛠️ Technologie-Stack

| Bereich | Technologie |
|---------|-------------|
| **Frontend** | Next.js (App Router), Tailwind CSS |
| **Live Voice** | Gemini Live API (`gemini-3.1-flash-live-preview`) via BidiGenerateContent WebSockets |
| **OCR & Analyse** | Gemini REST API (`gemini-2.5-flash-lite`), Google AI File Manager (Resumable Uploads) |
| **Auth & Datenbank** | Firebase Auth (Google OAuth), Cloud Firestore |
| **Hosting** | Vercel |

---

## 💻 Lokale Installation & Einrichtung

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
Erstellen Sie eine `.env.local` Datei im Hauptverzeichnis und fügen Sie Ihre Firebase-Anmeldedaten hinzu (eine `.env.example` Datei liegt im Repository als Vorlage bereit):

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
3. Klicken Sie auf **"Create API key"**.
4. Kopieren Sie den Schlüssel. (Sie tragen ihn direkt auf der Startseite der App ein — er muss **nicht** in die `.env` Datei!).

### 5. Lokalen Server starten
```bash
npm run dev
```

Öffnen Sie [http://localhost:3000](http://localhost:3000), melden Sie sich an, fügen Sie Ihren API-Schlüssel ein und starten Sie Ihre erste Lektion!

---

## ⚠️ Bekannte Einschränkungen

* Die Gemini Live API (`gemini-3.1-flash-live-preview`) ist ein Preview-Modell — gelegentliche Verbindungsabbrüche sind möglich. Die App reconnectet automatisch.
* Der Free Tier von Google AI hat Rate Limits — bei intensiver Nutzung kann es zu kurzen Verzögerungen kommen.
* Datei-Uploads werden nach der OCR-Analyse von Google's File Manager automatisch nach 48 Stunden gelöscht.