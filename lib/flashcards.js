import { db } from "./firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";

// ── Save new flashcard ──
export async function saveFlashcard(userId, word, translation, targetLang, motherLang) {
  try {
    // ← FIX #5: Format Validation قبل الحفظ
    if (!word?.trim() || !translation?.trim()) {
      console.warn("⚠️ [SAVE FLASHCARD] Invalid format — word or translation empty");
      return { success: false, error: "invalid_format" };
    }
    if (!targetLang || !motherLang) {
      console.warn("⚠️ [SAVE FLASHCARD] Missing language codes");
      return { success: false, error: "missing_langs" };
    }
    // تأكد إنه الكلمة مش أرقام أو رموز بس
    if (!/\p{L}/u.test(word)) {
      console.warn("⚠️ [SAVE FLASHCARD] Word contains no letters:", word);
      return { success: false, error: "invalid_word" };
    }

    await addDoc(collection(db, "users", userId, "flashcards"), {
      word:        word.trim(),
      translation: translation.trim(),
      targetLang,
      motherLang,
      createdAt: new Date(),
    });

    return { success: true };

  } catch (e) {
    // ← FIX #4: Error handling مع return value
    console.error("❌ [SAVE FLASHCARD]", e);
    return { success: false, error: e.message };
  }
}

// ── Get all flashcards ──
export async function getFlashcards(userId) {
  try {
    const q = query(
      collection(db, "users", userId, "flashcards"),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.error("❌ [GET FLASHCARDS]", e);
    return [];
  }
}

// ── Delete flashcard ──
export async function deleteFlashcard(userId, flashcardId) {
  try {
    await deleteDoc(doc(db, "users", userId, "flashcards", flashcardId));
    return { success: true };
  } catch (e) {
    console.error("❌ [DELETE FLASHCARD]", e);
    return { success: false, error: e.message };
  }
}

// ── Update flashcard ──
export async function updateFlashcard(userId, flashcardId, newWord, newTranslation) {
  try {
    // ← FIX #5: Validation هون كمان
    if (!newWord?.trim() || !newTranslation?.trim()) {
      return { success: false, error: "invalid_format" };
    }

    await updateDoc(doc(db, "users", userId, "flashcards", flashcardId), {
      word:        newWord.trim(),
      translation: newTranslation.trim(),
    });

    return { success: true };
  } catch (e) {
    console.error("❌ [UPDATE FLASHCARD]", e);
    return { success: false, error: e.message };
  }
}