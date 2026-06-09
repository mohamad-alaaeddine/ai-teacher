"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Book, Rocket, Upload, Mic, CheckCircle2, Loader2,
  Radio, ImagePlus, Send, X, ChevronUp, MoreVertical,
  FileText, LogOut,
} from "lucide-react";
import { createGeminiLiveSession } from "@/lib/geminiLive";
import { uploadFile }              from "@/lib/uploader";
import { analyzeFiles }            from "@/lib/analyst";
import { TRANSLATIONS, getTrans, getAvailableLanguages } from "@/lib/translations";
import { getModePrompt }           from "@/lib/prompts";
import { MODE_ICONS, MODE_FILE_REQUIREMENTS, MODE_CATEGORIES } from "@/lib/modes-config";
import { toast, Toaster }          from "sonner";
import { auth, db, signInWithGoogle, signOutUser } from "@/lib/firebase";
import { saveFlashcard, getFlashcards, deleteFlashcard, updateFlashcard } from "@/lib/flashcards";
import { onAuthStateChanged }      from "firebase/auth";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";

const AVAILABLE_LANGS = getAvailableLanguages();
const LANGUAGES       = AVAILABLE_LANGS;
const STT_LANGUAGES   = AVAILABLE_LANGS.map(l => ({ code: l.sttCode, label: l.label }));

/**
 * Builds the full Gemini system prompt combining language rules,
 * accuracy rules, vocab tracking instructions, and the selected mode prompt.
 * @param {string} targetLang  - Language code the student is learning (e.g. "de")
 * @param {string} motherLang  - Language code of the student's native language (e.g. "ar")
 * @param {string} langMode    - Mix ratio: "beginner" | "balanced" | "immersion"
 * @param {string} selectedMode - Teaching mode key (e.g. "openTutor", "vocabDrill")
 * @returns {string} Complete system prompt string
 */
function buildSystemBrain(targetLang, motherLang, langMode, selectedMode) {
  const targetLabel = AVAILABLE_LANGS.find(l => l.code === targetLang)?.label || "English";
  const motherLabel = AVAILABLE_LANGS.find(l => l.code === motherLang)?.label || "Arabic";
  const ratios = {
    beginner:  { target: 20, mother: 80 },
    balanced:  { target: 50, mother: 50 },
    immersion: { target: 80, mother: 20 },
  };
  const r = ratios[langMode] || ratios.balanced;
  const BASE = `
### LANGUAGE RULES (STRICT - NON-NEGOTIABLE):
- You are ONLY allowed to use TWO languages in this entire session:
  1. ${targetLabel} — use exactly ${r.target}% of the time
  2. ${motherLabel} — use exactly ${r.mother}% of the time
- ANY other language is STRICTLY FORBIDDEN — including English (unless English IS one of the two selected languages above).
- If the student writes or speaks in a third language, respond ONLY in ${motherLabel} and ask them to use either ${targetLabel} or ${motherLabel}.
- NEVER mix in a third language, even for single words or phrases.
- NEVER use English to explain things unless English is one of the two selected languages.
- This rule has NO exceptions.

### ACCURACY RULES (NON-NEGOTIABLE):
- NEVER accept a wrong answer as correct — always verify before praising.
- If the answer is WRONG, say clearly in ${motherLabel}: "Not quite. The correct answer is..." then ask them to repeat.
- If the answer is CORRECT, confirm it clearly in ${targetLabel} or ${motherLabel}.
- NEVER say "good", "super", "great" unless the answer is 100% accurate.
- Small mistakes (minor pronunciation): note gently, continue.
- Clear mistakes (wrong word, wrong grammar): correct immediately, make them repeat.
- Be encouraging but HONEST — do not make the student feel they're great when they're not.
- Your goal is real learning, not false confidence.

### VOCABULARY TRACKING (SILENT SYSTEM — INVISIBLE TO STUDENT):
The [VOCAB:...] tag is a SILENT system command — it is NEVER spoken, repeated, or explained to the student.

## STRICT RULES — When to add [VOCAB:...]
The core principle is simple:
→ If the student is trying to learn or understand a specific word, TAG IT.

ADD [VOCAB:...] when you notice ANY of these:
1️⃣ Student is asking about a word (any form)
2️⃣ Student used the WRONG word and you corrected them
3️⃣ Student couldn't say the word in ${targetLabel}
4️⃣ YOU actively taught them a new word

## DO NOT TAG:
❌ Words they clearly already know and used correctly
❌ Basic greetings/common phrases (unless they ask)
❌ Every word you say — only words you TEACH
❌ Grammar concepts (tag vocabulary only)

## FORMAT & PLACEMENT:
[VOCAB: word=translation]
- word = ${targetLabel}
- translation = ${motherLabel}
- Place at the VERY END of your message
- Multiple: [VOCAB: Apfel=تفاحة | Banane=موزة]

## ⚠️ AFTER the tag — SAY NOTHING.
  `.trim();
  const MODE = getModePrompt(selectedMode);
  return `${BASE}\n\n${MODE}`;
}

/**
 * @component RobotSVG
 * @description Animated robot SVG used as the app mascot on the setup screen.
 * @param {number} size       - Width and height in px (default: 64)
 * @param {string} className  - Optional Tailwind/CSS class
 * @returns {JSX.Element}
 */
function RobotSVG({ size = 64, className = "" }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="40" y1="4" x2="40" y2="16" stroke="#6366F1" strokeWidth="3" strokeLinecap="round" />
      <circle cx="40" cy="4" r="4" fill="#A5B4FC">
        <animate attributeName="r"    values="3;5;3"                   dur="1s" repeatCount="indefinite" />
        <animate attributeName="fill" values="#A5B4FC;#ffffff;#A5B4FC" dur="1s" repeatCount="indefinite" />
      </circle>
      <rect x="12" y="16" width="56" height="48" rx="10" fill="#6366F1" />
      <circle cx="30" cy="36" r="10" fill="white" />
      <circle cx="50" cy="36" r="10" fill="white" />
      <circle cx="30" cy="36" r="5" fill="#4338CA">
        <animate attributeName="cx" values="30;32;30;28;30" dur="3s" repeatCount="indefinite" />
        <animate attributeName="cy" values="36;34;36;36;36" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="50" cy="36" r="5" fill="#4338CA">
        <animate attributeName="cx" values="50;52;50;48;50" dur="3s" repeatCount="indefinite" />
        <animate attributeName="cy" values="36;34;36;36;36" dur="3s" repeatCount="indefinite" />
      </circle>
      <rect x="26" y="52" width="28" height="6" rx="3" fill="#A5B4FC" />
      <rect x="4"  y="28" width="8"  height="16" rx="4" fill="#4F46E5" />
      <rect x="68" y="28" width="8"  height="16" rx="4" fill="#4F46E5" />
    </svg>
  );
}

/**
 * @component Home
 * @description Root page component. Manages the full app state and renders
 * either the Setup screen or the Classroom screen based on `step`.
 * No props — reads Firebase auth and localStorage on mount.
 * @returns {JSX.Element}
 */
export default function Home() {

  const [step,                   setStep]                   = useState("setup");
  const [isTrueDesktop,          setIsTrueDesktop]          = useState(false);
  const [apiKey,                 setApiKey]                 = useState("");
  const [referenceFiles,         setReferenceFiles]         = useState([]);
  const [isAnalyzing,            setIsAnalyzing]            = useState(false);
  const [showNoFilesModal,       setShowNoFilesModal]       = useState(false);
  const [showImageTooLargeModal, setShowImageTooLargeModal] = useState(false);
  const [isDarkMode,             setIsDarkMode]             = useState(false);
  const [showEndModal,           setShowEndModal]           = useState(false);
  const [showMobileMenu,         setShowMobileMenu]         = useState(false);
  const [showLangModal,          setShowLangModal]          = useState(false);
  const [targetLang,             setTargetLang]             = useState("en");
  const [motherLang,             setMotherLang]             = useState("ar");
  const [langMode,               setLangMode]               = useState("balanced");
  const [tmpTarget,              setTmpTarget]              = useState("en");
  const [tmpMother,              setTmpMother]              = useState("ar");
  const [tmpMode,                setTmpMode]                = useState("balanced");
  const [showModeModal,          setShowModeModal]          = useState(false);
  const [selectedMode,           setSelectedMode]           = useState("openTutor");
  const [messages,               setMessages]               = useState([]);
  const [inputValue,             setInputValue]             = useState("");
  const [isSttRecording,         setIsSttRecording]         = useState(false);
  const [sttLanguage,            setSttLanguage]            = useState("en-US");
  const [sttDropdownOpen,        setSttDropdownOpen]        = useState(false);
  const [isLive,                 setIsLive]                 = useState(false);
  const [isReconnecting,         setIsReconnecting]         = useState(false);
  const [selectedImage,          setSelectedImage]          = useState(null);
  const [imageReady,             setImageReady]             = useState(false);
  const [isTeacherSpeaking,      setIsTeacherSpeaking]      = useState(false);
  const [totalTokens,            setTotalTokens]            = useState(0);
  const [user,                   setUser]                   = useState(null);
  const [showFlashcardsModal,    setShowFlashcardsModal]    = useState(false);
  const [flashcards,             setFlashcards]             = useState([]);
  const [editingId,              setEditingId]              = useState(null);
  const [editingWord,            setEditingWord]            = useState("");
  const [editingTranslation,     setEditingTranslation]     = useState("");
  const [needsScrollState,       setNeedsScrollState]       = useState(false);

  const imageInputRef            = useRef(null);
  const cameraInputRef           = useRef(null);
  const sttRef                   = useRef(null);
  const liveClientRef            = useRef(null);
  const playbackContextRef       = useRef(null);
  const nextStartTimeRef         = useRef(0);
  const chatEndRef               = useRef(null);
  const teacherBufferRef         = useRef("");
  const studentBufferRef         = useRef("");
  const studentVoiceMsgActiveRef = useRef(false);
  const audioContextRef          = useRef(null);
  const mediaStreamRef           = useRef(null);
  const processorRef             = useRef(null);
  const messageCountRef          = useRef(0);
  const reconnectCalledRef       = useRef(false);
  const chatHistoryRef           = useRef([]);
  const sessionStartTimeRef      = useRef(null);
  const sentMessagesCountRef     = useRef(0);
  const lastPromptTokensRef      = useRef(0);
  const lastThoughtsTokensRef    = useRef(0);
  const lastTotalTokensRef       = useRef(0);
  const reconnectCountRef        = useRef(0);
  const thoughtCountRef          = useRef(0);
  const thoughtTotalCharsRef     = useRef(0);
  const currentTurnThoughtsRef   = useRef([]);
  const enrichedSystemRef        = useRef("");
  const selectedImageRef         = useRef(null);
  const flashcardsRef            = useRef([]);

  const tr = getTrans(targetLang);

  useEffect(() => {
    try {
      setIsTrueDesktop(!/mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent.toLowerCase()));
    } catch {
      setIsTrueDesktop(false);
    }
  }, []);

  useEffect(() => {
    try {
      const savedTarget  = localStorage.getItem("targetLang");
      const savedMother  = localStorage.getItem("motherLang");
      const savedMode    = localStorage.getItem("langMode");
      const savedDark    = localStorage.getItem("darkMode");
      const savedLMode   = localStorage.getItem("selectedMode");
      const savedApiKey  = sessionStorage.getItem("buddyApiKey");
      const availCodes   = AVAILABLE_LANGS.map(l => l.code);
      if (savedTarget && availCodes.includes(savedTarget)) setTargetLang(savedTarget);
      if (savedMother && availCodes.includes(savedMother)) setMotherLang(savedMother);
      if (savedMode)  setLangMode(savedMode);
      if (savedDark)  setIsDarkMode(savedDark === "true");
      if (savedLMode) setSelectedMode(savedLMode);
      if (savedApiKey) setApiKey(savedApiKey);
    } catch (e) { console.error("❌ [LOCALSTORAGE READ]", e); }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("darkMode", isDarkMode);
      document.documentElement.classList.toggle("dark", isDarkMode);
    } catch (e) {}
  }, [isDarkMode]);

  useEffect(() => {
    const lang = AVAILABLE_LANGS.find(l => l.code === targetLang);
    setSttLanguage(lang?.sttCode || "en-US");
  }, [targetLang]);

  useEffect(() => {
    try { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); } catch (_) {}
  }, [messages]);
  useEffect(() => {
    let debounceTimer = null;

    const applyLayout = () => {
      const h = window.innerHeight;
      const w = window.innerWidth;
      const isLandscape = w > h && h < 550;

      // Reset needs-scroll before measuring so card returns to natural height
      document.body.classList.remove("needs-scroll");
      const mainEl = document.querySelector("main");
      if (mainEl) {
        mainEl.style.overflowY = "";
        mainEl.style.height    = "";
        mainEl.style.maxHeight = "";
        mainEl.style.minHeight = "";
      }

      let needsScroll = false;
      if (isTrueDesktop) {
        const btnEl   = document.querySelector(".start-button");
        const mainEl2 = document.querySelector("main");
        // If btnEl is null (e.g. classroom screen), keep current state — don't reset to false
        if (!btnEl) return;
        if (btnEl && mainEl2) {
          needsScroll = btnEl.getBoundingClientRect().bottom > mainEl2.getBoundingClientRect().bottom + 4;
        }
      }

      document.body.classList.toggle("is-landscape", isLandscape);
      document.body.classList.toggle("needs-scroll",  needsScroll);
      setNeedsScrollState(needsScroll);

      if (mainEl && isTrueDesktop && isLandscape && needsScroll) {
        mainEl.style.overflowY = "auto";
        mainEl.style.height    = "auto";
        mainEl.style.maxHeight = "none";
        mainEl.style.minHeight = "100dvh";
      }
    };

    const update = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => requestAnimationFrame(applyLayout), 150);
    };

    requestAnimationFrame(applyLayout);
    window.addEventListener("resize",            update);
    window.addEventListener("orientationchange", update);
    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener("resize",            update);
      window.removeEventListener("orientationchange", update);
    };
  }, [isTrueDesktop]);

  useEffect(() => {
    return () => {
      try {
        stopLiveMicInternal();
        stopSttInternal();
        if (liveClientRef.current) liveClientRef.current.disconnect();
      } catch (_) {}
    };
  }, []);


  useEffect(() => {
    let flashcardsUnsubscribe = null;
    const authUnsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const ref = collection(db, "users", firebaseUser.uid, "flashcards");
        const q   = query(ref, orderBy("createdAt", "desc"));
        flashcardsUnsubscribe = onSnapshot(q, (snapshot) => {
          const cards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          flashcardsRef.current = cards;
          setFlashcards(cards);
        });
      } else {
        flashcardsRef.current = [];
        setFlashcards([]);
        if (flashcardsUnsubscribe) { flashcardsUnsubscribe(); flashcardsUnsubscribe = null; }
      }
    });
    return () => { authUnsubscribe(); if (flashcardsUnsubscribe) flashcardsUnsubscribe(); };
  }, []);

  /**
   * Sends debug data to the local /api/debug-log endpoint.
   * Pass clear=true to wipe the log file instead of appending.
   * @param {object|null} jsonData - Data to append, or null when clearing
   * @param {boolean} clear        - If true, clears the log file
   */
  const logToDisk = useCallback(async (jsonData, clear = false) => {
    try {
      await fetch("/api/debug-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clear ? { clear: true } : jsonData),
      });
    } catch (_) {}
  }, []);

  /**
   * Returns elapsed session time as a human-readable string (e.g. "3m 42s").
   * Returns "unknown" if the session has not started yet.
   * @returns {string}
   */
  function getSessionDuration() {
    if (!sessionStartTimeRef.current) return "unknown";
    const seconds = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  /**
   * Resets all mutable session refs and token counter to their initial values.
   * Called before starting a new session or reconnecting.
   */
  function resetRefs() {
    teacherBufferRef.current         = "";
    studentBufferRef.current         = "";
    studentVoiceMsgActiveRef.current = false;
    messageCountRef.current          = 0;
    chatHistoryRef.current           = [];
    sentMessagesCountRef.current     = 0;
    sessionStartTimeRef.current      = null;
    lastPromptTokensRef.current      = 0;
    lastThoughtsTokensRef.current    = 0;
    lastTotalTokensRef.current       = 0;
    reconnectCountRef.current        = 0;
    thoughtCountRef.current          = 0;
    thoughtTotalCharsRef.current     = 0;
    currentTurnThoughtsRef.current   = [];
    setTotalTokens(0);
  }

  /**
   * Builds the end-of-session summary prompt sent to Gemini.
   * The prompt instructs the model to evaluate accuracy and highlight mistakes.
   * @returns {string} Prompt string in the target language
   */
  function buildSummaryPrompt() {
    const targetLabel = AVAILABLE_LANGS.find(l => l.code === targetLang)?.label || "English";
    return `
## SESSION END — Generate Honest Summary
Write this ENTIRE summary in ${targetLabel}. Every word must be in ${targetLabel}.
Mode: ${selectedMode} | Duration: ${getSessionDuration()} | Messages: ${sentMessagesCountRef.current}

Review the ENTIRE conversation above and provide a detailed, honest summary:

📊 Session Summary — ${getSessionDuration()}
✅ What you did well: [Specific achievements]
⚠️ What needs work: [Specific mistakes with exact quotes]
📊 Accuracy: [X]% ([correct]/[total] correct answers)
🎯 Next session focus: [3 specific goals]

RULES: Be BRUTALLY HONEST — no false praise. Quote EXACT mistakes. Keep it under 150 words. Write EVERYTHING in ${targetLabel}.
    `.trim();
  }

  /**
   * Decodes raw 16-bit PCM audio data and queues it for gapless playback
   * using the Web Audio API at 24 kHz (Gemini Live output sample rate).
   * Silently drops chunks smaller than 200 bytes to avoid glitches.
   * @param {ArrayBuffer} pcmData - Raw PCM audio bytes from Gemini
   */
  async function playRawAudio(pcmData) {
    try {
      if (pcmData.byteLength < 200) return;
      if (!playbackContextRef.current) playbackContextRef.current = new AudioContext({ sampleRate: 24000 });
      const ctx = playbackContextRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      const safeData = pcmData.byteLength % 2 !== 0 ? pcmData.slice(0, -1) : pcmData;
      const int16    = new Int16Array(safeData);
      const float32  = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      const start = Math.max(ctx.currentTime, nextStartTimeRef.current);
      source.start(start);
      nextStartTimeRef.current = start + buffer.duration;
    } catch (e) { console.error("❌ [AUDIO PLAY]", e); }
  }

  /**
   * Processes a parsed JSON message from the Gemini Live WebSocket.
   * Handles: session setup confirmation, student/teacher transcription,
   * inline audio playback, thought tracking, usage metadata, and turn completion.
   * @param {object} json - Parsed WebSocket message from Gemini
   */
  function processJson(json) {
    try {
      messageCountRef.current++;
      if (json.setupComplete) {
        sessionStartTimeRef.current = Date.now();
        setIsReconnecting(false);
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "teacher" && last.text.includes("🔄")) {
            if (chatHistoryRef.current.length > 0) {
              return [...chatHistoryRef.current, { role: "teacher", text: tr("messages", "reconnected") }];
            }
            return [...prev.slice(0, -1), { ...last, text: tr("messages", "reconnected") }];
          }
          return prev;
        });
        if (selectedImageRef.current && liveClientRef.current) {
          setTimeout(() => {
            try { liveClientRef.current?.sendImage({ base64: selectedImageRef.current.base64, mimeType: selectedImageRef.current.mimeType }); }
            catch (_) {}
          }, 500);
        }
        return;
      }
      if (json.sessionResumptionUpdate) return;
      const serverContent = json.serverContent || json.server_content;
      if (!serverContent) return;
      const parts        = serverContent?.modelTurn?.parts || [];
      const thoughtParts = parts.filter(p => p.thought === true && p.text);
      thoughtParts.forEach(p => {
        thoughtCountRef.current++;
        thoughtTotalCharsRef.current += p.text.length;
        currentTurnThoughtsRef.current.push(p.text.substring(0, 100));
      });
      if (serverContent.inputTranscription?.text) {
        studentBufferRef.current += serverContent.inputTranscription.text;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (studentVoiceMsgActiveRef.current && last?.role === "student") {
            return [...prev.slice(0, -1), { ...last, text: studentBufferRef.current }];
          }
          studentVoiceMsgActiveRef.current = true;
          return [...prev, { role: "student", text: studentBufferRef.current }];
        });
      }
      if (serverContent.outputTranscription?.text) {
        setIsTeacherSpeaking(true);
        const rawText = serverContent.outputTranscription.text;
        parseAndSaveVocab(rawText);
        const cleanText = rawText.replace(/^Transkript:\s*/i, "").replace(/\[VOCAB:[^\]]*\]/gi, "");
        teacherBufferRef.current += cleanText;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "teacher") return [...prev.slice(0, -1), { ...last, text: teacherBufferRef.current }];
          return [...prev, { role: "teacher", text: teacherBufferRef.current }];
        });
      }
      if (serverContent.turnComplete) {
        setIsTeacherSpeaking(false);
        teacherBufferRef.current         = "";
        studentBufferRef.current         = "";
        studentVoiceMsgActiveRef.current = false;
        thoughtCountRef.current          = 0;
        thoughtTotalCharsRef.current     = 0;
        currentTurnThoughtsRef.current   = [];
      }
      if (json.usageMetadata) {
        lastPromptTokensRef.current   = json.usageMetadata.promptTokenCount   || 0;
        lastThoughtsTokensRef.current = json.usageMetadata.thoughtsTokenCount || 0;
        lastTotalTokensRef.current    = json.usageMetadata.totalTokenCount    || 0;
        setTotalTokens(prev => prev + (json.usageMetadata.totalTokenCount || 0));
      }
      const audioPart = parts.find(p => p.inlineData);
      if (audioPart?.inlineData?.data) {
        try {
          const binary = window.atob(audioPart.inlineData.data);
          const bytes  = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          playRawAudio(bytes.buffer);
        } catch (_) {}
      }
    } catch (e) { console.error("❌ [PROCESS JSON]", e); }
  }

  /**
   * Entry point for all raw WebSocket messages from Gemini Live.
   * Routes ArrayBuffer messages to either JSON parsing or audio playback.
   * @param {ArrayBuffer|object} data - Raw WebSocket message
   */
  async function handleIncomingData(data) {
    try {
      if (!data) return;
      if (!(data instanceof ArrayBuffer)) { processJson(data); return; }
      const decoder = new TextDecoder();
      const header  = decoder.decode(data.slice(0, 50)).trim();
      if (header.startsWith("{")) {
        try { processJson(JSON.parse(decoder.decode(data))); return; } catch (_) {}
      }
      playRawAudio(data);
    } catch (e) { console.error("❌ [INCOMING]", e); }
  }

  /**
   * Called by the Gemini Live client when the WebSocket drops.
   * Injects the last 15 chat messages into the system prompt so context
   * is preserved after reconnect, then sets the reconnecting UI state.
   * Debounced via reconnectCalledRef to prevent double-firing.
   */
  function handleReconnect() {
    try {
      if (reconnectCalledRef.current) return;
      reconnectCalledRef.current = true;
      reconnectCountRef.current++;
      logToDisk({ event: "PAGE_RECONNECT", sessionDuration: getSessionDuration(), reconnectNumber: reconnectCountRef.current });
      const textMessages = chatHistoryRef.current.filter(m => m.text && !m.text.includes("🔄")).slice(-15);
      const chatSummary  = textMessages.map(m => `${m.role === "teacher" ? "Teacher" : "Student"}: ${m.text}`).join("\n");
      const systemWithHist = enrichedSystemRef.current
        ? `${enrichedSystemRef.current}\n\n## Previous Conversation:\n${chatSummary}`
        : enrichedSystemRef.current;
      if (liveClientRef.current && systemWithHist) liveClientRef.current.updateSystem(systemWithHist);
      teacherBufferRef.current         = "";
      studentBufferRef.current         = "";
      studentVoiceMsgActiveRef.current = false;
      messageCountRef.current          = 0;
      sentMessagesCountRef.current     = 0;
      sessionStartTimeRef.current      = null;
      thoughtCountRef.current          = 0;
      thoughtTotalCharsRef.current     = 0;
      currentTurnThoughtsRef.current   = [];
      setIsReconnecting(true);
      setIsLive(false);
      setMessages(prev => { chatHistoryRef.current = prev; return [...prev, { role: "teacher", text: tr("messages", "reconnecting") }]; });
      setTimeout(() => { reconnectCalledRef.current = false; }, 2000);
      setTimeout(() => { setIsReconnecting(false); }, 10000);
    } catch (e) { console.error("❌ [RECONNECT]", e); }
  }

  /**
   * Stops the SpeechRecognition instance and clears the ref.
   * Safe to call even if no recognition is active.
   */
  function stopSttInternal() {
    try { if (sttRef.current) { sttRef.current.stop(); sttRef.current = null; } } catch (_) {}
  }
  /** Stops STT and updates recording state. */
  function stopStt() { stopSttInternal(); setIsSttRecording(false); }

  /**
   * Toggles browser Speech-to-Text on/off for text input.
   * Uses continuous + interim results so text updates as the user speaks.
   * Language follows `sttLanguage` state (auto-synced to targetLang).
   */
  function toggleStt() {
    try {
      if (isSttRecording) { stopStt(); return; }
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) { toast.error("Speech Recognition not supported."); return; }
      const recognition          = new SpeechRecognition();
      recognition.lang           = sttLanguage;
      recognition.continuous     = true;
      recognition.interimResults = true;
      recognition.onstart  = () => setIsSttRecording(true);
      recognition.onresult = (e) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setInputValue(t); };
      recognition.onerror  = () => setIsSttRecording(false);
      recognition.onend    = () => setIsSttRecording(false);
      recognition.start();
      sttRef.current = recognition;
    } catch (e) { console.error("❌ [STT]", e); }
  }

  /**
   * Tears down the live mic pipeline: disconnects the ScriptProcessor,
   * stops all media tracks, and closes the AudioContext.
   */
  async function stopLiveMicInternal() {
    try {
      if (processorRef.current) { processorRef.current.disconnect(); processorRef.current.onaudioprocess = null; processorRef.current = null; }
      if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
      if (audioContextRef.current) { await audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    } catch (_) {}
  }
  /** Stops the live mic pipeline and updates live state. */
  async function stopLiveMic() { await stopLiveMicInternal(); setIsLive(false); }

  /**
   * Opens the microphone, downsamples audio from the native sample rate
   * to 16 kHz using a ScriptProcessor, encodes it as base64 PCM,
   * and streams it to Gemini Live in real time via liveClientRef.
   */
  async function startLiveMic() {
    try {
      const stream  = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const nativeRate = audioCtx.sampleRate;
      const source     = audioCtx.createMediaStreamSource(stream);
      const processor  = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(audioCtx.destination);
      processor.onaudioprocess = (e) => {
        try {
          const input        = e.inputBuffer.getChannelData(0);
          const ratio        = nativeRate / 16000;
          const outputLength = Math.floor(input.length / ratio);
          const downsampled  = new Float32Array(outputLength);
          for (let i = 0; i < outputLength; i++) {
            const start = Math.floor(i * ratio);
            const end   = Math.floor((i + 1) * ratio);
            let sum = 0;
            for (let j = start; j < end; j++) sum += input[j];
            downsampled[i] = sum / (end - start);
          }
          const pcm16 = new Int16Array(outputLength);
          for (let i = 0; i < outputLength; i++) pcm16[i] = Math.max(-1, Math.min(1, downsampled[i])) * 0x7FFF;
          const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
          liveClientRef.current?.sendAudio(base64);
        } catch (_) {}
      };
      studentBufferRef.current         = "";
      studentVoiceMsgActiveRef.current = false;
      setIsLive(true);
    } catch (err) { console.error("❌ [LIVE MIC]", err); toast.error("Microphone Error: " + err.message); }
  }
  /** Toggles live microphone streaming on/off. */
  async function toggleLive() { if (isLive) { await stopLiveMic(); return; } await startLiveMic(); }

  /**
   * Uploads a single file to Google AI File Manager via the uploader lib.
   * Updates that file's status in referenceFiles: uploading → success | error.
   * @param {{ id: string, file: File }} fileObj - File entry from referenceFiles state
   */
  const handleUploadFile = async (fileObj) => {
    setReferenceFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, status: "uploading" } : f));
    try {
      const result = await uploadFile({ file: fileObj.file, apiKey });
      setReferenceFiles(prev => prev.map(f => f.id === fileObj.id
        ? { ...f, status: "success", uri: result.fileUri, mimeType: result.mimeType, fileType: result.type } : f
      ));
    } catch (err) {
      console.error("❌ [UPLOAD]", err.message);
      setReferenceFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, status: "error", errorMessage: err.message } : f));
    }
  };

  /**
   * Handles the file input change event. Creates file entries with "idle" status,
   * appends them to referenceFiles, and immediately triggers upload for each.
   * @param {React.ChangeEvent<HTMLInputElement>} e
   */
  const handleFileChange = (e) => {
    try {
      if (!apiKey) { toast.error(tr("setup", "apiKeyPlaceholder")); return; }
      const files = Array.from(e.target.files).map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file, name: file.name, status: "idle", errorMessage: null,
      }));
      setReferenceFiles(prev => [...prev, ...files]);
      files.forEach(f => handleUploadFile(f));
    } catch (e) { console.error("❌ [FILE CHANGE]", e); toast.error("Error selecting file: " + e.message); }
  };

  /**
   * Removes a file entry from the list by id and resets the file input.
   * @param {string} id - File entry id
   */
  const handleRemoveFile = (id) => {
    setReferenceFiles(prev => prev.filter(f => f.id !== id));
    const input = document.querySelector('input[type="file"]');
    if (input) input.value = "";
  };

  /**
   * Clears the error state for a failed file and retries the upload.
   * @param {string} fileId - File entry id to retry
   */
  const handleRetryUpload = (fileId) => {
    const fileToRetry = referenceFiles.find(f => f.id === fileId);
    if (fileToRetry) {
      setReferenceFiles(prev => prev.map(f => f.id === fileId ? { ...f, errorMessage: null } : f));
      handleUploadFile(fileToRetry);
    }
  };

  /**
   * Starts a Gemini Live session without any uploaded reference files.
   * Builds the system prompt from current language/mode settings,
   * connects the session, and transitions to the classroom screen.
   */
  const handleStartNoFiles = async () => {
    try {
      await logToDisk(null, true);
      resetRefs();
      const baseSystem = buildSystemBrain(targetLang, motherLang, langMode, selectedMode);
      enrichedSystemRef.current = baseSystem;
      const session = createGeminiLiveSession({ apiKey, systemText: baseSystem });
      session.setOnMessage(handleIncomingData);
      session.setOnReconnect(handleReconnect);
      session.connect();
      liveClientRef.current = session;
      setMessages([{ role: "teacher", text: tr("messages", "welcome") }]);
      setStep("classroom");
    } catch (e) { console.error("❌ [START NO FILES]", e); toast.error("Error starting session: " + e.message); }
  };

  /**
   * Main session start handler. Validates API key and file requirements,
   * runs OCR analysis on uploaded files if present, builds the enriched
   * system prompt, connects Gemini Live, and transitions to the classroom.
   */
  const handleStart = async () => {
    try {
      if (!apiKey) { toast.error(tr("setup", "apiKeyPlaceholder")); return; }
      const successFiles = referenceFiles.filter(f => f.status === "success");
      const requirement  = MODE_FILE_REQUIREMENTS[selectedMode];
      if (requirement === "required" && successFiles.length === 0) { toast.warning(tr("smartButton", "required")); return; }
      if (successFiles.length === 0 && requirement !== "none") { setShowNoFilesModal(true); return; }
      setIsAnalyzing(true);
      if (successFiles.length > 0) {
        const fileParts = successFiles.map(f => ({ fileUri: f.uri, mimeType: f.mimeType, type: "uri", name: f.name }));
        await logToDisk(null, true);
        resetRefs();
        const result = await analyzeFiles({ apiKey, fileParts });
        if (!result.content || !result.content.files || result.content.files.length === 0) {
          toast.error("File analysis failed. Server busy or couldn't read content. Please try again.");
          setIsAnalyzing(false);
          return;
        }
        const baseSystem     = buildSystemBrain(targetLang, motherLang, langMode, selectedMode);
        const enrichedSystem = `${baseSystem}\n\n## Teaching Materials (Full OCR):\n${JSON.stringify(result.content, null, 2)}`;
        enrichedSystemRef.current = enrichedSystem;
        const session = createGeminiLiveSession({ apiKey, systemText: enrichedSystem });
        session.setOnMessage(handleIncomingData);
        session.setOnReconnect(handleReconnect);
        session.connect();
        liveClientRef.current = session;
        setMessages([{ role: "teacher", text: tr("messages", "welcome") }]);
        setStep("classroom");
        setIsAnalyzing(false);
      } else {
        await handleStartNoFiles();
      }
    } catch (err) {
      console.error("❌ [START/OCR FAILED]", err);
      toast.error(`Error analyzing files: ${err.message}`);
      setIsAnalyzing(false);
    }
  };

  /**
   * Sends the current text input to Gemini Live and appends
   * a student message + placeholder teacher message to the chat.
   */
  const handleSend = () => {
    try {
      if (!inputValue.trim() || !liveClientRef.current) return;
      sentMessagesCountRef.current++;
      teacherBufferRef.current         = "";
      studentBufferRef.current         = "";
      studentVoiceMsgActiveRef.current = false;
      thoughtCountRef.current          = 0;
      thoughtTotalCharsRef.current     = 0;
      currentTurnThoughtsRef.current   = [];
      setMessages(prev => [...prev, { role: "student", text: inputValue }, { role: "teacher", text: "..." }]);
      liveClientRef.current.sendText(inputValue);
      setInputValue("");
    } catch (e) { console.error("❌ [SEND]", e); }
  };

  /**
   * Handles classroom image file selection. Validates size (max 5 MB),
   * reads the file as base64, and stores it in selectedImage state.
   * @param {React.ChangeEvent<HTMLInputElement>} e
   */
  const handleImageSelect = (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { setShowImageTooLargeModal(true); if (imageInputRef.current) imageInputRef.current.value = ""; return; }
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage({ base64: reader.result.split(",")[1], mimeType: file.type || "image/jpeg", previewUrl: reader.result, name: file.name });
        setImageReady(true);
      };
      reader.onerror = () => {
        toast.error("Could not read image. Please make sure it's saved locally on your device (not in iCloud or Google Photos).");
        if (imageInputRef.current) imageInputRef.current.value = "";
      };
      reader.readAsDataURL(file);
    } catch (e) { console.error("❌ [IMAGE SELECT]", e); }
  };

  /**
   * Sends the currently selected image to Gemini Live and adds
   * a student image message to the chat. Also stores the image in
   * selectedImageRef so it can be re-sent automatically after reconnect.
   */
  const handleImageSend = () => {
    try {
      if (!selectedImage || !liveClientRef.current) return;
      setMessages(prev => [...prev, { role: "student", text: "📎 " + selectedImage.name, imageUrl: selectedImage.previewUrl, isImage: true }]);
      liveClientRef.current.sendImage({ base64: selectedImage.base64, mimeType: selectedImage.mimeType });
      selectedImageRef.current = { base64: selectedImage.base64, mimeType: selectedImage.mimeType, name: selectedImage.name };
    } catch (e) { console.error("❌ [IMAGE SEND]", e); }
  };

  /**
   * Clears the selected image from state and resets the file input.
   * Stops event propagation when triggered from within the image preview.
   * @param {React.SyntheticEvent|undefined} e
   */
  const clearImage = (e) => {
    if (e) e.stopPropagation();
    setSelectedImage(null);
    setImageReady(false);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  /**
   * Ends the classroom session: stops mic and STT, disconnects Gemini Live,
   * closes the AudioContext, and resets all session UI state back to setup.
   */
  const handleBack = async () => {
    try {
      await stopLiveMic();
      stopStt();
      if (liveClientRef.current) { try { liveClientRef.current.disconnect(); } catch (_) {} liveClientRef.current = null; }
      if (playbackContextRef.current) { await playbackContextRef.current.close().catch(() => {}); playbackContextRef.current = null; nextStartTimeRef.current = 0; }
      setStep("setup");
      setIsReconnecting(false);
      setIsLive(false);
      setIsSttRecording(false);
      setSelectedImage(null);
      setImageReady(false);
    } catch (e) { console.error("❌ [BACK]", e); }
  };

  /**
   * Sends the session summary prompt to Gemini and adds a placeholder
   * summary message to the chat. Closes the mobile menu if open.
   */
  const handleViewReport = () => {
    try {
      if (!isTrueDesktop) setShowMobileMenu(false);
      liveClientRef.current?.sendText(buildSummaryPrompt());
      setMessages(prev => [...prev, { role: "student", text: "📊 Generate session summary" }, { role: "teacher", text: "...", isSummary: true }]);
    } catch (e) { console.error("❌ [VIEW REPORT]", e); }
  };

  /**
   * Confirms end-session: closes the modal and calls handleBack
   * to tear down the session and return to setup.
   */
  const handleEndSessionConfirm = async () => {
    try { setShowEndModal(false); await handleBack(); }
    catch (e) { console.error("❌ [END SESSION CONFIRM]", e); }
  };

  /**
   * Saves the language modal selections (target, mother, mode) to state
   * and persists them to localStorage, then closes the modal.
   */
  const handleSaveLang = () => {
    setTargetLang(tmpTarget); setMotherLang(tmpMother); setLangMode(tmpMode);
    try { localStorage.setItem("targetLang", tmpTarget); localStorage.setItem("motherLang", tmpMother); localStorage.setItem("langMode", tmpMode); }
    catch (e) { console.error("❌ [LOCALSTORAGE]", e); }
    setShowLangModal(false);
  };

  /**
   * Sets the selected teaching mode, persists it to localStorage,
   * and closes the mode selection modal.
   * @param {string} modeKey - Mode identifier (e.g. "vocabDrill")
   */
  const handleModeSelect = (modeKey) => {
    setSelectedMode(modeKey);
    try { localStorage.setItem("selectedMode", modeKey); } catch (e) {}
    setShowModeModal(false);
  };

  /**
   * Triggers Firebase Google sign-in popup and logs the result.
   */
  const handleGoogleLogin = async () => {
    const firebaseUser = await signInWithGoogle();
    if (firebaseUser) console.log("✅ [LOGIN] Signed in:", firebaseUser.displayName);
  };

  /**
   * Signs out the current Firebase user and clears flashcard state.
   */
  const handleSignOut = async () => {
    await signOutUser();
    flashcardsRef.current = [];
    setFlashcards([]);
  };

  /**
   * Deletes a flashcard from Firestore by id.
   * @param {string} id - Firestore document id of the flashcard
   */
  const handleDeleteFlashcard = async (id) => {
    if (!user) return;
    const result = await deleteFlashcard(user.uid, id);
    if (!result?.success) toast.error("Failed to delete flashcard");
  };

  /**
   * Saves edited word/translation for a flashcard in Firestore
   * and exits edit mode.
   * @param {string} id - Firestore document id of the flashcard
   */
  const handleUpdateFlashcard = async (id) => {
    if (!user || !editingWord.trim() || !editingTranslation.trim()) return;
    const result = await updateFlashcard(user.uid, id, editingWord.trim(), editingTranslation.trim());
    if (!result?.success) toast.error("Failed to update flashcard");
    else toast.success("Flashcard updated ✓");
    setEditingId(null); setEditingWord(""); setEditingTranslation("");
  };

  /**
   * Parses [VOCAB: word=translation | ...] tags from Gemini's response text
   * and saves any new word pairs to Firestore (skips duplicates).
   * Silently no-ops if the user is not signed in.
   * @param {string} text - Raw teacher message text from Gemini
   */
  const parseAndSaveVocab = async (text) => {
    if (!user) return;
    const match = text.match(/\[VOCAB:\s*([^\]]+)\]/i);
    if (!match) return;
    const pairs = match[1].split("|").map(p => p.trim()).filter(Boolean);
    for (const pair of pairs) {
      const parts = pair.split("=").map(s => s.trim());
      if (parts.length !== 2) continue;
      const [word, translation] = parts;
      if (!word || !translation) continue;
      const exists = flashcardsRef.current.some(f =>
        f.word.toLowerCase() === word.toLowerCase() && f.targetLang === targetLang && f.motherLang === motherLang
      );
      if (!exists) {
        const result = await saveFlashcard(user.uid, word, translation, targetLang, motherLang);
        if (!result?.success && result?.error !== "invalid_format" && result?.error !== "invalid_word") {
          toast.error(`Failed to save "${word}" to flashcards`);
        }
      }
    }
  };

  const filteredSttLangs = STT_LANGUAGES.filter(l => l.code.startsWith(targetLang) || l.code.startsWith(motherLang));

  /**
   * Returns the start button label and disabled state based on the selected
   * mode's file requirement ("none" | "recommended" | "required") and
   * whether any files have been successfully uploaded.
   * @returns {{ text: string, disabled: boolean }}
   */
  const getSmartButtonState = () => {
    const requirement = MODE_FILE_REQUIREMENTS[selectedMode];
    const hasFiles    = referenceFiles.filter(f => f.status === "success").length > 0;
    if (requirement === "none")                     return { text: tr("smartButton", "ready"),       disabled: false };
    if (requirement === "required" && !hasFiles)    return { text: tr("smartButton", "required"),    disabled: true  };
    if (requirement === "recommended" && !hasFiles) return { text: tr("smartButton", "recommended"), disabled: false };
    return { text: tr("smartButton", "ready"), disabled: false };
  };

  const smartButton      = getSmartButtonState();
  const isButtonDisabled = referenceFiles.some(f => f.status === "uploading") || isAnalyzing || smartButton.disabled;
  const dk               = isDarkMode;

  /**
   * @component ImagePanel
   * @description Click-to-select image area + send button for the classroom.
   * Shared between the desktop sidebar and the mobile bottom panel.
   * Reads selectedImage, imageReady, isReconnecting, dk from parent scope.
   * @param {boolean} compact - If true, uses fixed 120px height for mobile layout
   * @returns {JSX.Element}
   */
  const ImagePanel = ({ compact = false }) => (
    <>
      <div
        onClick={() => imageInputRef.current?.click()}
        className={`${compact ? "h-[120px]" : "landscape-img-area flex-1"} rounded-[1.5rem] border-2 border-dashed flex items-center justify-center overflow-hidden transition-all cursor-pointer ${
          dk ? "border-sky-700 bg-sky-900/20 hover:border-sky-500 hover:bg-sky-900/30"
             : "border-sky-300 bg-sky-50 hover:border-sky-400 hover:bg-sky-100"}`}>
        {selectedImage ? (
          <div className="relative w-full h-full">
            <img src={selectedImage.previewUrl} alt="preview" className="w-full h-full object-contain" />
            <button onClick={clearImage} className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-md text-red-400 hover:text-red-600 cursor-pointer">
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className={`text-center ${dk ? "text-sky-400" : "text-sky-500"}`}>
            <ImagePlus size={compact ? 24 : 32} className="mx-auto mb-2" />
            <p className={`font-medium ${compact ? "text-xs" : "text-xs lg:text-sm"}`}>Click to Select{compact ? "" : " Image"}</p>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        {!isTrueDesktop && (
          <button onClick={() => cameraInputRef.current?.click()} disabled={isReconnecting}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-2xl font-bold text-base transition-all cursor-pointer disabled:opacity-50 ${
              dk ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
            📷
          </button>
        )}
        <button onClick={handleImageSend} disabled={!imageReady || isReconnecting}
          className={`flex-1 flex items-center justify-center gap-2 p-3 ${compact ? "" : "md:p-4"} rounded-2xl font-bold text-sm ${compact ? "" : "lg:text-base"} transition-all cursor-pointer disabled:opacity-50 ${
            imageReady ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
                       : dk ? "bg-zinc-700 text-zinc-500 cursor-not-allowed" : "bg-zinc-100 text-zinc-300 cursor-not-allowed"}`}>
          <Send size={18} /> {tr("classroom", "sendImageBtn")}
        </button>
      </div>
    </>
  );

  return (
    <main
      className={`flex flex-col w-full
        ${needsScrollState
          ? "min-h-screen items-center justify-start overflow-y-auto overscroll-y-contain"
          : "fixed inset-0 items-center justify-center overflow-hidden overscroll-none"}
        transition-colors duration-300
        ${dk ? "bg-zinc-900" : "bg-[#f8fafc]"}
        p-[clamp(0.5rem,1.5dvh,1.5rem)]`}
    >

      {/* Dark mode toggle */}
      <button
        onClick={() => setIsDarkMode(prev => !prev)}
        className={`fixed top-4 right-4 z-50 w-10 h-10 flex items-center justify-center rounded-full shadow-lg transition-all duration-300 cursor-pointer hover:scale-110 border ${
          dk ? "bg-zinc-800 border-zinc-700 text-yellow-400" : "bg-white border-zinc-200 text-zinc-600"}`}>
        {dk ? "☀️" : "🌙"}
      </button>

      <AnimatePresence mode="wait">
        {step === "setup" ? (

          /* ════════════════════════════════════════════════════════════════════
             SETUP SCREEN
             ════════════════════════════════════════════════════════════════ */
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`flex flex-col items-stretch w-full max-w-md min-h-0 ${needsScrollState ? "h-auto" : "h-full"}`}
          >
            {/* Robot header */}
            <div className="flex flex-col items-center shrink-0 mb-[clamp(0.4rem,1.5dvh,1rem)] hide-on-short">
              <div className="w-[clamp(55px,9dvh,80px)] h-[clamp(55px,9dvh,80px)] transition-all duration-300">
                <RobotSVG size="100%" />
              </div>
              <h1 className={`setup-title text-[clamp(1.4rem,3.8dvh,2.1rem)] font-black leading-none tracking-tighter text-center transition-colors px-2 ${dk ? "text-white" : "text-zinc-900"}`}>
                {tr("setup", "title")}
              </h1>
            </div>

            {/* Setup card */}
            <div className={`setup-card w-full flex flex-col flex-1 min-h-0 ${needsScrollState ? "overflow-visible" : "overflow-hidden"} rounded-[2.5rem]
              p-[clamp(0.85rem,2.2dvh,1.5rem)] gap-[clamp(0.4rem,1.2dvh,0.75rem)]
              shadow-2xl border transition-all duration-300
              ${dk ? "bg-zinc-800 border-zinc-700" : "bg-white border-white"}`}>

              {/* Auth bar */}
              <div className={`w-full flex items-center justify-between rounded-2xl border transition-all px-4 h-[clamp(36px,5.5dvh,48px)] ${
                dk ? "border-zinc-700 bg-zinc-900/50" : "border-zinc-200 bg-zinc-50"}`}>
                {user ? (
                  <div className="flex items-center justify-between w-full min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <img src={user.photoURL} alt="avatar" className="w-6 h-6 rounded-full shrink-0 object-cover" />
                      <span className={`text-xs font-bold truncate ${dk ? "text-zinc-300" : "text-zinc-700"}`}>{user.displayName}</span>
                    </div>
                    <button onClick={handleSignOut} className="text-xs text-red-400 hover:text-red-600 cursor-pointer font-bold shrink-0 ml-2">Sign out</button>
                  </div>
                ) : (
                  <button onClick={handleGoogleLogin} className="w-full h-full flex items-center justify-center gap-2 cursor-pointer">
                    <span className="text-sm">🔑</span>
                    <span className={`text-sm font-bold ${dk ? "text-zinc-300" : "text-zinc-600"}`}>Sign in with Google</span>
                  </button>
                )}
              </div>

              {/* API key */}
              <div className="flex flex-col gap-1">
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); sessionStorage.setItem("buddyApiKey", e.target.value); }}
                  placeholder={tr("setup", "apiKeyPlaceholder")}
                  disabled={referenceFiles.length > 0}
                  className={`w-full rounded-2xl border px-4 outline-none text-sm transition-all h-[clamp(36px,5.5dvh,48px)] ${
                    referenceFiles.length > 0
                      ? dk ? "border-zinc-700 bg-zinc-800 text-zinc-500 cursor-not-allowed" : "border-zinc-100 bg-zinc-50 text-zinc-400 cursor-not-allowed"
                      : dk ? "border-zinc-600 bg-zinc-700 text-white focus:border-sky-400"  : "border-zinc-100 bg-white text-zinc-800 focus:border-sky-400"
                  }`}
                />
                <p className={`text-[10px] truncate leading-none px-2 ${dk ? "text-zinc-500" : "text-zinc-400"}`}>
                  Your API key is sent directly to Google — we never see it or store it.
                </p>
              </div>

              {/* Language + Mode buttons */}
              <div className="landscape-lang-mode-row flex flex-col gap-[clamp(0.4rem,1.2dvh,0.75rem)]">
                <div>
                  <button
                    onClick={() => { setTmpTarget(targetLang); setTmpMother(motherLang); setTmpMode(langMode); setShowLangModal(true); }}
                    className={`w-full flex items-center justify-between rounded-2xl border-2 px-4 hover:border-sky-300 transition-all cursor-pointer text-sm font-medium group h-[clamp(36px,5.5dvh,48px)] ${
                      dk ? "border-zinc-600 text-zinc-300 hover:bg-sky-900/30 hover:border-sky-500" : "border-zinc-100 text-zinc-600 hover:bg-sky-50 hover:border-sky-300"}`}>
                    <span className="flex items-center gap-2"><span className="text-base">🌐</span><span className="font-bold truncate max-w-[80px] sm:max-w-none">{tr("setup", "langSettingsBtn")}</span></span>
                    <span className={`text-[10px] font-normal truncate ml-2 text-right ${dk ? "text-zinc-400 group-hover:text-sky-300" : "text-zinc-400 group-hover:text-sky-600"}`}>
                      {AVAILABLE_LANGS.find(l => l.code === targetLang)?.label} · {AVAILABLE_LANGS.find(l => l.code === motherLang)?.label} · {tr("modes", langMode)}
                    </span>
                  </button>
                </div>
                <div>
                  <button
                    onClick={() => setShowModeModal(true)}
                    className={`w-full flex items-center justify-between rounded-2xl border-2 px-4 hover:border-sky-300 transition-all cursor-pointer text-sm font-medium group h-[clamp(36px,5.5dvh,48px)] ${
                      dk ? "border-zinc-600 text-zinc-300 hover:bg-sky-900/30 hover:border-sky-500" : "border-zinc-100 text-zinc-600 hover:bg-sky-50 hover:border-sky-300"}`}>
                    <span className="flex items-center gap-2"><span className="text-base">🎯</span><span className="font-bold truncate">{tr("modes", "modeBtn")}</span></span>
                    <span className={`text-[10px] font-normal truncate ml-2 text-right ${dk ? "text-zinc-400 group-hover:text-sky-300" : "text-zinc-400 group-hover:text-sky-600"}`}>
                      {MODE_ICONS[selectedMode]} {tr("modes", selectedMode)}
                    </span>
                  </button>
                  <div className={`text-[10px] pl-2 pt-1 leading-tight ${dk ? "text-zinc-500" : "text-zinc-400"}`}>
                    📎 {tr("modeHints", selectedMode)}
                  </div>
                </div>
              </div>

              {/* File upload */}
              <div className="space-y-1.5">
                <label className={`font-bold flex items-center gap-2 text-sm pl-1 mb-0.5 ${dk ? "text-zinc-300" : "text-zinc-700"}`}>
                  <Book size={14} className="text-emerald-500" /> {tr("setup", "filesLabel")}
                </label>
                <label className={`relative flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all h-[clamp(36px,5.5dvh,48px)] ${
                  dk ? "bg-sky-900/10 border-sky-700/50 hover:bg-sky-900/20" : "bg-sky-50/30 border-sky-200 hover:bg-sky-50"}`}>
                  <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.txt" className="hidden" onChange={handleFileChange} />
                  <Upload className="text-sky-400" size={16} />
                  <span className="text-sm font-bold text-sky-500">{tr("setup", "uploadBtn")}</span>
                </label>
              </div>

              {/* File list */}
              <div
                className={`overflow-y-auto file-list-scrollbar pr-1.5 -mr-1.5 flex-1 ${
                  isTrueDesktop
                    ? "min-h-[76px] max-h-[clamp(76px,24dvh,300px)]"
                    : needsScrollState ? "min-h-[76px]" : "min-h-0"
                }`}
              >
                {referenceFiles.length === 0 ? (
                  <div className={`h-full min-h-[30px] md:min-h-[64px] flex items-center justify-center border border-dashed rounded-xl transition-colors ${
                    dk ? "border-zinc-700 text-zinc-600" : "border-zinc-200 text-zinc-400"}`}>
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {targetLang === "ar" ? "قائمة الملفات فارغة" : "DATEIEN (PDF, BILD, TEXT) EMPTY"}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {referenceFiles.map(f => (
                      <div key={f.id} className={`file-item flex items-center justify-between h-8 px-3 rounded-xl border text-xs leading-none font-medium transition-colors ${
                        dk ? "bg-zinc-700/50 border-zinc-600 text-zinc-300" : "bg-zinc-50 border-zinc-100 text-zinc-700"}`}>
                        <span className="truncate max-w-[65%]">{f.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {f.status === "uploading" && <Loader2 size={12} className="animate-spin text-sky-500" />}
                          {f.status === "success"   && <CheckCircle2 size={12} className="text-emerald-500" />}
                          {f.status === "error" && (
                            <div className="flex items-center gap-1">
                              <span className="text-red-400 font-bold text-[9px]">Error</span>
                              <button onClick={() => handleRetryUpload(f.id)} className="text-sky-500 hover:text-sky-700">⟳</button>
                            </div>
                          )}
                          <button onClick={() => handleRemoveFile(f.id)} className="text-zinc-400 hover:text-red-500 cursor-pointer">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Start button */}
              <div className="mt-auto pt-1">
                <button
                  onClick={handleStart}
                  disabled={isButtonDisabled}
                  className={`start-button w-full font-black rounded-[1.8rem] shadow-xl transition-all flex items-center justify-center gap-3 text-lg active:scale-95 hover:scale-[1.02] h-[clamp(44px,7.5dvh,56px)] ${
                    isButtonDisabled ? "bg-zinc-400 text-zinc-100 cursor-not-allowed opacity-70" : "bg-sky-500 hover:bg-sky-600 text-white"}`}>
                  {isAnalyzing
                    ? <><Loader2 size={20} className="animate-spin" /> {tr("setup", "analyzingBtn")}</>
                    : <><Rocket size={20} /> {referenceFiles.some(f => f.status === "uploading") ? tr("smartButton", "uploading") : tr("smartButton", "ready")}</>
                  }
                </button>
              </div>
            </div>
          </motion.div>

        ) : (

          /* ════════════════════════════════════════════════════════════════════
             CLASSROOM SCREEN
             ════════════════════════════════════════════════════════════════ */
          <motion.div
            key="classroom"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`w-full max-w-4xl rounded-[2rem] sm:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border transition-colors duration-300 flex-1 min-h-0 ${
              dk ? "bg-zinc-800 border-zinc-700" : "bg-white border-white"}`}
            style={{ scrollbarGutter: "stable", WebkitOverflowScrolling: "touch" }}
          >
            {/* Header */}
            <div className={`landscape-header flex items-center justify-between px-4 lg:px-6 py-2 lg:py-3 border-b shrink-0 transition-colors ${
              dk ? "border-zinc-700 bg-zinc-800" : "border-zinc-100 bg-white"}`}>
              <span className={`text-xs lg:text-sm font-medium ${dk ? "text-zinc-500" : "text-zinc-300"}`}>{tr("classroom", "headerTitle")}</span>
              <span className={`text-xs lg:text-sm font-medium ${dk ? "text-zinc-500" : "text-zinc-300"}`}>TOKENS: {totalTokens.toLocaleString()}</span>
            </div>

            {/* Reconnecting banner */}
            <AnimatePresence>
              {isReconnecting && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                  className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2 text-amber-700 text-xs lg:text-sm font-medium">
                  <Loader2 size={14} className="animate-spin" />
                  {tr("classroom", "reconnecting")}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main layout: chat + sidebar */}
            <div className="landscape-row flex flex-col md:flex-row flex-1 overflow-hidden">

              {/* Left: Chat + Input */}
              <div className={`flex flex-col flex-1 overflow-hidden border-r transition-colors ${dk ? "border-zinc-700" : "border-zinc-100"}`}>

                {/* Chat */}
                <div className={`landscape-chat flex-1 overflow-y-auto overscroll-y-contain p-6 lg:p-8 space-y-4 lg:space-y-5 transition-colors ${
                  dk ? "bg-zinc-900/50 text-zinc-100" : "bg-zinc-50/50 text-zinc-800"}`}>
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "student" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-[1.5rem] shadow-sm overflow-hidden text-sm lg:text-base ${
                        m.role === "student"
                          ? "bg-sky-500 text-white shadow-sky-200"
                          : m.isSummary
                            ? dk ? "bg-gradient-to-br from-emerald-900/50 to-emerald-800/50 border-2 border-emerald-600 text-zinc-100"
                                 : "bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200 text-zinc-800"
                            : dk ? "bg-zinc-700 border border-zinc-600 text-zinc-100"
                                 : "bg-white border border-zinc-100 text-zinc-800"}`}>
                        {m.isImage && m.imageUrl && (
                          <div className="relative">
                            <img src={m.imageUrl} alt="sent" className="w-16 h-16 lg:w-20 lg:h-20 object-cover rounded-xl m-2" />
                            <div className="absolute bottom-3 right-3 bg-emerald-500 rounded-full p-0.5"><CheckCircle2 size={10} className="text-white" /></div>
                          </div>
                        )}
                        <p className={`leading-relaxed px-4 pb-3 pt-1 whitespace-pre-wrap ${m.isSummary ? "font-medium" : ""}`}>{m.text}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Input area */}
                <div className={`landscape-input relative px-2 pb-2 pt-4 sm:px-4 sm:pb-4 sm:pt-4 border-t flex flex-col gap-2 transition-colors ${
                  dk ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-100"}`}>

                  {/* Voice activity indicator */}
                  {(isLive || isTeacherSpeaking) && (
                    <div className="absolute -top-1 left-4 flex items-center gap-1.5 px-2 py-0.5 rounded-b-lg bg-zinc-700">
                      {[
                        isTeacherSpeaking ? "#34d399" : "#f87171",
                        isTeacherSpeaking ? "#60a5fa" : "#fb923c",
                        isTeacherSpeaking ? "#a78bfa" : "#facc15",
                      ].map((color, i) => (
                        <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: color,
                          animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                  )}

                  {/* Text input + send */}
                  <div className="flex gap-2">
                    <input
                      value={inputValue} onChange={e => setInputValue(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleSend()}
                      placeholder={tr("classroom", "inputPlaceholder")} disabled={isReconnecting}
                      className={`flex-1 p-3 lg:p-4 rounded-2xl outline-none focus:ring-2 focus:ring-sky-400 text-sm lg:text-base disabled:opacity-50 transition-colors ${
                        dk ? "bg-zinc-700 text-zinc-100 placeholder-zinc-400" : "bg-zinc-50 text-zinc-800"}`}
                    />
                    <button onClick={handleSend} disabled={isReconnecting}
                      className="p-3 lg:p-4 bg-sky-500 text-white rounded-2xl cursor-pointer hover:bg-sky-600 transition-colors shadow-sm disabled:opacity-50">
                      <Send size={18} />
                    </button>
                  </div>

                  {/* Voice tools */}
                  <div className="grid grid-cols-2 sm:flex sm:gap-2 gap-2">
                    {/* STT */}
                    <div className={`relative flex items-center gap-1 p-1 rounded-2xl border shadow-inner transition-colors col-span-1 ${
                      dk ? "bg-zinc-700 border-zinc-600" : "bg-zinc-100 border-zinc-200"}`}>
                      <button onClick={() => setSttDropdownOpen(p => !p)}
                        className={`flex-1 flex items-center justify-between py-2 pl-3 pr-1 text-xs lg:text-sm font-bold cursor-pointer ${dk ? "text-zinc-300" : "text-zinc-600"}`}>
                        {STT_LANGUAGES.find(l => l.code === sttLanguage)?.code.split("-")[1] || "EN"}
                        <ChevronUp size={10} className={`transition-transform ${sttDropdownOpen ? "" : "rotate-180"}`} />
                      </button>
                      {sttDropdownOpen && (
                        <div className={`absolute bottom-full left-0 mb-1 border rounded-xl shadow-lg overflow-hidden z-50 min-w-full ${
                          dk ? "bg-zinc-800 border-zinc-600" : "bg-white border-zinc-200"}`}>
                          {filteredSttLangs.map(l => (
                            <button key={l.code} onClick={() => { setSttLanguage(l.code); setSttDropdownOpen(false); }}
                              className={`w-full px-3 py-2 text-xs font-bold text-left whitespace-nowrap transition-colors ${
                                sttLanguage === l.code ? "text-sky-500 bg-sky-50" : dk ? "text-zinc-300 hover:bg-zinc-700" : "text-zinc-600 hover:bg-sky-50"}`}>
                              {l.code.split("-")[1]}
                            </button>
                          ))}
                        </div>
                      )}
                      <button onClick={toggleStt} disabled={isReconnecting || isLive}
                        className={`p-2 lg:p-3 text-white rounded-xl transition-all cursor-pointer disabled:opacity-50 ${
                          isSttRecording ? "bg-red-500 animate-pulse" : "bg-orange-500 shadow-sm"}`}>
                        <Mic size={16} />
                      </button>
                    </div>

                    {/* Live button */}
                    <button onClick={toggleLive} disabled={isReconnecting || isSttRecording}
                      className={`p-3 lg:p-4 text-white rounded-2xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 col-span-1 sm:flex-1 ${
                        isLive ? "bg-red-600 animate-pulse shadow-lg shadow-red-300" : "bg-rose-500 hover:bg-rose-600 shadow-sm"}`}>
                      <Radio size={18} />
                      <span className="hidden sm:inline text-sm font-bold">Live</span>
                    </button>

                    {/* Mobile menu button */}
                    <button onClick={() => setShowMobileMenu(true)} disabled={isReconnecting}
                      className={`landscape-hide-btn p-3 rounded-2xl transition-all cursor-pointer disabled:opacity-50 sm:hidden col-span-2 flex items-center justify-center ${
                        dk ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
                      <MoreVertical size={18} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Right: Desktop sidebar (+ landscape) */}
              <div className={`landscape-show md-show w-[35%] flex-col p-4 lg:p-5 gap-3 lg:gap-4 transition-colors ${
                dk ? "bg-zinc-800 border-zinc-700" : "bg-white border-white"}`}>
                <p className={`text-xs lg:text-sm font-bold uppercase tracking-wider ${dk ? "text-zinc-500" : "text-zinc-400"}`}>
                  {tr("classroom", "imagePanelTitle")}
                </p>
                <ImagePanel />
                <input ref={imageInputRef}  type="file" accept="image/*"                     onChange={handleImageSelect} style={{ display: "none" }} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} style={{ display: "none" }} />
                <div className={`flex flex-col gap-2 pt-2 border-t ${dk ? "border-zinc-700" : "border-zinc-100"}`}>
                  <div className="flex gap-2">
                    <button onClick={handleViewReport} disabled={isReconnecting}
                      className={`flex-1 flex items-center justify-center gap-1 p-3 rounded-2xl font-bold text-xs lg:text-sm transition-all cursor-pointer disabled:opacity-50 ${
                        dk ? "bg-emerald-900/30 border-2 border-emerald-700 text-emerald-400 hover:bg-emerald-900/50"
                           : "bg-emerald-50 border-2 border-emerald-200 text-emerald-700 hover:bg-emerald-100"}`}>
                      <FileText size={14} /> Report
                    </button>
                    <button onClick={() => setShowFlashcardsModal(true)} disabled={isReconnecting}
                      className={`flex-1 flex items-center justify-center gap-1 p-3 rounded-2xl font-bold text-xs lg:text-sm transition-all cursor-pointer disabled:opacity-50 ${
                        dk ? "bg-sky-900/30 border-2 border-sky-700 text-sky-400 hover:bg-sky-900/50"
                           : "bg-sky-50 border-2 border-sky-200 text-sky-700 hover:bg-sky-100"}`}>
                      📚 Flashcards
                    </button>
                  </div>
                  <button onClick={() => setShowEndModal(true)} disabled={isReconnecting}
                    className={`w-full flex items-center justify-center gap-2 p-3 md:p-4 rounded-2xl font-bold text-sm lg:text-base transition-all cursor-pointer disabled:opacity-50 ${
                      dk ? "bg-red-900/30 border-2 border-red-700 text-red-400 hover:bg-red-900/50"
                         : "bg-red-50 border-2 border-red-200 text-red-600 hover:bg-red-100"}`}>
                    <LogOut size={18} /> End Session
                  </button>
                </div>
              </div>

              {/* Mobile bottom panel (portrait only) */}
              <div className={`landscape-hide mobile-only w-full border-t flex flex-col p-3 gap-2 transition-colors ${
                dk ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-100"}`}>
                <ImagePanel compact />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile bottom sheet */}
      <AnimatePresence>
        {showMobileMenu && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowMobileMenu(false)}
            className="md:hidden fixed inset-0 z-50 bg-black/30 backdrop-blur-sm">
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25 }}
              onClick={e => e.stopPropagation()}
              className={`absolute bottom-0 left-0 right-0 rounded-t-[2rem] shadow-2xl p-6 ${dk ? "bg-zinc-800" : "bg-white"}`}>
              <div className="flex flex-col gap-3">
                <h3 className={`text-lg font-black mb-2 ${dk ? "text-zinc-100" : "text-zinc-800"}`}>Session Menu</h3>
                <button onClick={handleViewReport}
                  className={`w-full flex items-center justify-center gap-2 p-4 rounded-2xl font-bold text-sm cursor-pointer ${
                    dk ? "bg-emerald-900/30 border-2 border-emerald-700 text-emerald-400" : "bg-emerald-50 border-2 border-emerald-200 text-emerald-700"}`}>
                  <FileText size={20} /> View Session Report
                </button>
                <button onClick={() => { setShowMobileMenu(false); setShowFlashcardsModal(true); }}
                  className={`w-full flex items-center justify-center gap-2 p-4 rounded-2xl font-bold text-sm cursor-pointer ${
                    dk ? "bg-sky-900/30 border-2 border-sky-700 text-sky-400" : "bg-sky-50 border-2 border-sky-200 text-sky-700"}`}>
                  📚 Flashcards
                </button>
                <button onClick={() => { setShowMobileMenu(false); setShowEndModal(true); }}
                  className={`w-full flex items-center justify-center gap-2 p-4 rounded-2xl font-bold text-sm cursor-pointer ${
                    dk ? "bg-red-900/30 border-2 border-red-700 text-red-400" : "bg-red-50 border-2 border-red-200 text-red-700"}`}>
                  <LogOut size={20} /> End Session
                </button>
                <button onClick={() => setShowMobileMenu(false)}
                  className={`w-full p-4 rounded-2xl font-bold text-sm cursor-pointer ${dk ? "bg-zinc-700 text-zinc-300" : "bg-zinc-100 text-zinc-600"}`}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* End session modal */}
      {showEndModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`w-[90vw] sm:w-80 mx-4 rounded-[2rem] shadow-2xl border overflow-hidden ${dk ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-100"}`}>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="text-center">
                <div className="text-3xl mb-2">🚪</div>
                <h3 className={`font-black text-lg ${dk ? "text-zinc-100" : "text-zinc-800"}`}>End Session?</h3>
                <p className={`text-sm mt-1 ${dk ? "text-zinc-400" : "text-zinc-500"}`}>Are you sure you want to exit?</p>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={handleEndSessionConfirm} className="w-full bg-red-500 hover:bg-red-600 text-white font-black py-4 rounded-[1.5rem] transition-colors cursor-pointer">End Session</button>
                <button onClick={() => setShowEndModal(false)}
                  className={`w-full font-bold py-3 rounded-[1.5rem] transition-colors cursor-pointer ${dk ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"}`}>
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Analyzing modal */}
      {isAnalyzing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`rounded-[2rem] shadow-2xl px-6 sm:px-8 py-5 sm:py-6 flex flex-col items-center gap-3 w-[90vw] sm:w-72 pointer-events-auto transition-colors ${
              dk ? "bg-zinc-800" : "bg-white"}`}>
            <svg width="140" height="60" viewBox="0 0 140 60" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="14" width="10" height="6" rx="2" fill="#F59E0B" />
              <rect x="4" y="18" width="34" height="24" rx="3.5" fill="#FCD34D" />
              <rect x="4" y="18" width="34" height="8" rx="3" fill="#F59E0B">
                <animateTransform attributeName="transform" type="rotate" values="0 21 18; -22 21 18; 0 21 18" dur="2.4s" repeatCount="indefinite" />
              </rect>
              <rect x="12" y="24" width="18" height="14" rx="2" fill="white" opacity="0.6" />
              <g>
                <animateTransform attributeName="transform" type="translate" values="14,28; 65,12; 102,6" keyTimes="0;0.55;1" dur="2.4s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.2 1;0.4 0 0.2 1" />
                <rect x="0" y="0" width="14" height="18" rx="2.5" fill="white" stroke="#D1D5DB" strokeWidth="1.2">
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="2.4s" repeatCount="indefinite" />
                </rect>
                <line x1="3" y1="5" x2="11" y2="5" stroke="#9CA3AF" strokeWidth="1" />
                <line x1="3" y1="8" x2="11" y2="8" stroke="#9CA3AF" strokeWidth="1" />
                <line x1="3" y1="11" x2="8" y2="11" stroke="#9CA3AF" strokeWidth="1" />
              </g>
              <g transform="translate(102, 4)">
                <line x1="16" y1="0" x2="16" y2="7" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" />
                <circle cx="16" cy="0" r="3" fill="#A5B4FC">
                  <animate attributeName="r" values="2.5;4;2.5" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="fill" values="#A5B4FC;#fff;#A5B4FC" dur="1s" repeatCount="indefinite" />
                </circle>
                <rect x="2" y="7" width="26" height="22" rx="5" fill="#6366F1" />
                <circle cx="11" cy="17" r="4.5" fill="white" /><circle cx="21" cy="17" r="4.5" fill="white" />
                <circle cx="11" cy="17" r="2.2" fill="#4338CA">
                  <animate attributeName="cx" values="11;12;11;10;11" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="cy" values="17;16;17;17;17" dur="3s" repeatCount="indefinite" />
                </circle>
                <circle cx="21" cy="17" r="2.2" fill="#4338CA">
                  <animate attributeName="cx" values="21;22;21;20;21" dur="3s" repeatCount="indefinite" />
                  <animate attributeName="cy" values="17;16;17;17;17" dur="3s" repeatCount="indefinite" />
                </circle>
                <rect x="8" y="24" width="14" height="3" rx="1.5" fill="#A5B4FC" />
                <rect x="0" y="12" width="3" height="8" rx="1.5" fill="#4F46E5" />
                <rect x="27" y="12" width="3" height="8" rx="1.5" fill="#4F46E5" />
              </g>
            </svg>
            <div className="flex flex-col gap-2 items-center">
              <p className={`text-xs text-center ${dk ? "text-zinc-300" : "text-zinc-600"}`}>{tr("messages", "analyzing")}</p>
              <p className={`text-xs text-center ${dk ? "text-zinc-500" : "text-zinc-400"}`}>{tr("messages", "analyzing", motherLang)}</p>
            </div>
          </motion.div>
        </div>
      )}

      {/* No files modal */}
      {showNoFilesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`w-[90vw] sm:w-80 mx-4 rounded-[2rem] shadow-2xl border overflow-hidden transition-colors ${dk ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-100"}`}>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="text-center">
                <div className="text-3xl mb-2">📂</div>
                <h3 className={`font-black text-base ${dk ? "text-zinc-100" : "text-zinc-800"}`}>{tr("modals", "noFilesTitle")}</h3>
                <p className={`text-xs mt-1 leading-relaxed ${dk ? "text-zinc-400" : "text-zinc-400"}`}>{tr("modals", "noFilesSub")}</p>
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={() => { setShowNoFilesModal(false); handleStartNoFiles(); }}
                  className="w-full bg-sky-500 hover:bg-sky-600 text-white font-black py-3 rounded-[1.5rem] transition-colors cursor-pointer text-sm">
                  {tr("modals", "noFilesConfirm")}
                </button>
                <button onClick={() => setShowNoFilesModal(false)}
                  className={`w-full font-bold py-3 rounded-[1.5rem] transition-colors cursor-pointer text-sm ${dk ? "bg-zinc-700 hover:bg-zinc-600 text-zinc-300" : "bg-zinc-100 hover:bg-zinc-200 text-zinc-600"}`}>
                  {tr("modals", "noFilesCancel")}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Language settings modal */}
      {showLangModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`w-full max-w-sm mx-4 rounded-[2rem] shadow-2xl border overflow-hidden transition-colors ${dk ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-100"}`}>
            <div className={`border-b px-6 py-4 flex items-center justify-between transition-colors ${dk ? "bg-zinc-700 border-zinc-600" : "bg-sky-50 border-sky-100"}`}>
              <h2 className={`font-black text-lg ${dk ? "text-zinc-100" : "text-zinc-800"}`}>{tr("modals", "langModalTitle")}</h2>
              <button onClick={() => setShowLangModal(false)} className={`transition-colors cursor-pointer ${dk ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-400 hover:text-zinc-600"}`}><X size={18} /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {[{ label: tr("modals", "targetLang"), value: tmpTarget, onChange: setTmpTarget },
                  { label: tr("modals", "motherLang"),  value: tmpMother, onChange: setTmpMother }].map(({ label, value, onChange }) => (
                  <div key={label} className="space-y-2">
                    <label className={`text-xs font-bold uppercase tracking-wider ${dk ? "text-zinc-400" : "text-zinc-500"}`}>{label}</label>
                    <select value={value} onChange={e => onChange(e.target.value)}
                      className={`w-full rounded-xl border-2 p-3 text-sm font-bold outline-none focus:border-sky-400 cursor-pointer transition-colors ${dk ? "border-zinc-600 bg-zinc-700 text-zinc-100" : "border-zinc-100 bg-zinc-50 text-zinc-700"}`}>
                      {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                <label className={`text-xs font-bold uppercase tracking-wider ${dk ? "text-zinc-400" : "text-zinc-500"}`}>{tr("modals", "learningMode")}</label>
                <div className="grid grid-cols-3 gap-2">
                  {[{ key: "beginner", icon: "🌱", label: tr("modes", "beginner"), sub: tr("modeSubs", "beginner") },
                    { key: "balanced", icon: "⚖️", label: tr("modes", "balanced"), sub: tr("modeSubs", "balanced") },
                    { key: "immersion", icon: "🔥", label: tr("modes", "immersion"), sub: tr("modeSubs", "immersion") }].map(m => (
                    <button key={m.key} onClick={() => setTmpMode(m.key)}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer text-center ${
                        tmpMode === m.key ? "border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                                         : dk ? "border-zinc-600 bg-zinc-700 text-zinc-400 hover:border-zinc-500" : "border-zinc-100 bg-zinc-50 text-zinc-500 hover:border-zinc-300"}`}>
                      <span className="text-xl">{m.icon}</span>
                      <span className="text-xs font-black mt-1">{m.label}</span>
                      <span className="text-[10px] font-medium opacity-70">{m.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={handleSaveLang} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-black py-4 rounded-[1.5rem] transition-colors cursor-pointer shadow-lg shadow-sky-200/50">
                💾 {tr("modals", "saveBtn")}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Mode selection modal */}
      {showModeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`w-full max-w-md mx-4 rounded-[2rem] shadow-2xl border overflow-hidden transition-colors ${dk ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-100"}`}
            style={{ maxHeight: "85vh" }}>
            <div className={`border-b px-6 py-4 flex items-center justify-between transition-colors ${dk ? "bg-zinc-700 border-zinc-600" : "bg-sky-50 border-sky-100"}`}>
              <h2 className={`font-black text-lg ${dk ? "text-zinc-100" : "text-zinc-800"}`}>{tr("modals", "modeModalTitle")}</h2>
              <button onClick={() => setShowModeModal(false)} className={`transition-colors cursor-pointer ${dk ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-400 hover:text-zinc-600"}`}><X size={18} /></button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(85vh - 80px)" }}>
              {MODE_CATEGORIES.map(cat => (
                <div key={cat.key} className="space-y-2">
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${dk ? "text-zinc-400" : "text-zinc-500"}`}>
                    {cat.icon} {tr("modes", `cat${cat.key.charAt(0).toUpperCase() + cat.key.slice(1)}`)}
                  </h3>
                  <div className="space-y-2">
                    {cat.modes.map(modeKey => (
                      <button key={modeKey} onClick={() => handleModeSelect(modeKey)}
                        className={`w-full text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                          selectedMode === modeKey ? "border-sky-400 bg-sky-50 dark:bg-sky-900/30"
                                                   : dk ? "border-zinc-600 bg-zinc-700 hover:border-zinc-500" : "border-zinc-100 bg-zinc-50 hover:border-zinc-300"}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{MODE_ICONS[modeKey]}</span>
                            <div>
                              <div className={`text-sm font-black ${selectedMode === modeKey ? "text-sky-600 dark:text-sky-400" : dk ? "text-zinc-100" : "text-zinc-800"}`}>{tr("modes", modeKey)}</div>
                              <div className={`text-xs ${dk ? "text-zinc-400" : "text-zinc-500"}`}>{tr("modes", `${modeKey}Desc`)}</div>
                            </div>
                          </div>
                          {selectedMode === modeKey && <CheckCircle2 size={16} className="text-sky-500 shrink-0" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Image too large modal */}
      {showImageTooLargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`w-[90vw] sm:w-80 mx-4 rounded-[2rem] shadow-2xl border overflow-hidden transition-colors ${dk ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-100"}`}>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="text-center">
                <div className="text-3xl mb-2">🖼️</div>
                <p className={`text-xs mt-1 leading-relaxed ${dk ? "text-zinc-300" : "text-zinc-600"}`}>{tr("modals", "imageTooLarge")}</p>
              </div>
              <button onClick={() => setShowImageTooLargeModal(false)}
                className="w-full bg-sky-500 hover:bg-sky-600 text-white font-black py-3 rounded-[1.5rem] transition-colors cursor-pointer text-sm">OK</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Flashcards modal */}
      {showFlashcardsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`w-full max-w-md mx-4 rounded-[2rem] shadow-2xl border overflow-hidden transition-colors flex flex-col ${dk ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-100"}`}
            style={{ maxHeight: "80vh" }}>
            <div className={`border-b px-6 py-4 flex items-center justify-between shrink-0 ${dk ? "bg-zinc-700 border-zinc-600" : "bg-sky-50 border-sky-100"}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">📚</span>
                <h2 className={`font-black text-lg ${dk ? "text-zinc-100" : "text-zinc-800"}`}>Flashcards</h2>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${dk ? "bg-sky-900 text-sky-400" : "bg-sky-100 text-sky-600"}`}>{flashcards.length}</span>
              </div>
              <button onClick={() => setShowFlashcardsModal(false)} className={`transition-colors cursor-pointer ${dk ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-400 hover:text-zinc-600"}`}><X size={18} /></button>
            </div>
            <div className={`flex-1 overflow-y-auto p-4 space-y-2 ${dk ? "bg-zinc-800" : "bg-white"}`}>
              {!user ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <span className="text-3xl">🔑</span>
                  <p className={`text-sm font-bold ${dk ? "text-zinc-400" : "text-zinc-500"}`}>Sign in to save flashcards</p>
                  <button onClick={handleGoogleLogin} className="bg-sky-500 hover:bg-sky-600 text-white font-black px-6 py-3 rounded-2xl text-sm cursor-pointer">Sign in with Google</button>
                </div>
              ) : flashcards.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-2">
                  <span className="text-3xl">📭</span>
                  <p className={`text-sm font-bold ${dk ? "text-zinc-400" : "text-zinc-500"}`}>No flashcards yet</p>
                  <p className={`text-xs ${dk ? "text-zinc-500" : "text-zinc-400"}`}>Words will be saved automatically during the session</p>
                </div>
              ) : (
                flashcards.map((card) => (
                  <div key={card.id} className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${dk ? "bg-zinc-700 border-zinc-600" : "bg-zinc-50 border-zinc-100"}`}>
                    {editingId === card.id ? (
                      <>
                        <div className="flex-1 flex flex-col gap-1">
                          <input value={editingWord} onChange={e => setEditingWord(e.target.value)} placeholder="Word" autoFocus
                            className={`px-2 py-1 rounded-lg text-sm outline-none border-2 focus:border-sky-400 ${dk ? "bg-zinc-600 text-zinc-100 border-zinc-500" : "bg-white text-zinc-800 border-zinc-200"}`} />
                          <input value={editingTranslation} onChange={e => setEditingTranslation(e.target.value)} placeholder="Translation"
                            className={`px-2 py-1 rounded-lg text-sm outline-none border-2 focus:border-sky-400 ${dk ? "bg-zinc-600 text-zinc-100 border-zinc-500" : "bg-white text-zinc-800 border-zinc-200"}`} />
                        </div>
                        <button onClick={() => handleUpdateFlashcard(card.id)} className="text-emerald-500 hover:text-emerald-600 cursor-pointer font-black text-sm px-2">✓</button>
                        <button onClick={() => { setEditingId(null); setEditingWord(""); setEditingTranslation(""); }} className="text-zinc-400 hover:text-zinc-600 cursor-pointer text-sm px-1">✕</button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 flex items-center gap-2">
                          <span className={`text-xs font-bold px-1 rounded ${dk ? "bg-sky-900 text-sky-400" : "bg-sky-100 text-sky-600"}`}>{card.targetLang.toUpperCase()}:</span>
                          <span className={`text-sm font-bold ${dk ? "text-zinc-100" : "text-zinc-800"}`}>{card.word}</span>
                          <span className={`text-xs ${dk ? "text-zinc-500" : "text-zinc-400"}`}>→</span>
                          <span className={`text-xs font-bold px-1 rounded ${dk ? "bg-emerald-900 text-emerald-400" : "bg-emerald-100 text-emerald-600"}`}>{card.motherLang.toUpperCase()}:</span>
                          <span className={`text-sm ${dk ? "text-zinc-300" : "text-zinc-600"}`}>{card.translation}</span>
                        </div>
                        <button onClick={() => { setEditingId(card.id); setEditingWord(card.word); setEditingTranslation(card.translation); }}
                          className={`text-xs px-2 py-1 rounded-lg cursor-pointer transition-colors ${dk ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-400 hover:text-zinc-600"}`}>✏️</button>
                        <button onClick={() => handleDeleteFlashcard(card.id)} className="text-red-400 hover:text-red-600 cursor-pointer text-sm px-1">✕</button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}

      <Toaster position="top-center" richColors />
    </main>
  );
}