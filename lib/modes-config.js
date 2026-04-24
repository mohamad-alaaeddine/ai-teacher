// lib/modes-config.js

// ══════════════════════════════════════════════════════════
// MODE ICONS — UI Only
// ══════════════════════════════════════════════════════════
export const MODE_ICONS = {
  openTutor: "⭐",
  vocabDriller: "📖",
  grammarTutor: "✍️",
  readingTrans: "📄",
  rolePlay: "🎬",
  debateRoom: "⚡",
  storyCoCreate: "📖",
  imageDiscuss: "🖼️",
  examPrep: "📝",
  freePractice: "🎙️",
};

// ══════════════════════════════════════════════════════════
// MODE FILE REQUIREMENTS — UI Only
// ══════════════════════════════════════════════════════════
export const MODE_FILE_REQUIREMENTS = {
  openTutor: "optional",
  vocabDriller: "recommended",
  grammarTutor: "optional",
  readingTrans: "required",
  rolePlay: "optional",
  debateRoom: "optional",
  storyCoCreate: "optional",
  imageDiscuss: "classroom",
  examPrep: "recommended",
  freePractice: "none",
};

// ══════════════════════════════════════════════════════════
// MODE CATEGORIES — For Modal Display (UI Only)
// ══════════════════════════════════════════════════════════
export const MODE_CATEGORIES = [
  { key: "general", icon: "⚙️", modes: ["openTutor"] },
  { key: "foundation", icon: "📚", modes: ["vocabDriller", "grammarTutor", "readingTrans"] },
  { key: "simulation", icon: "🎭", modes: ["rolePlay", "debateRoom", "storyCoCreate"] },
  { key: "specialized", icon: "🎓", modes: ["imageDiscuss", "examPrep", "freePractice"] },
];

// ══════════════════════════════════════════════════════════
// HELPER FUNCTIONS — UI Only
// ══════════════════════════════════════════════════════════
export function getModeIcon(modeKey) {
  return MODE_ICONS[modeKey] || "⭐";
}

export function getModeFileRequirement(modeKey) {
  return MODE_FILE_REQUIREMENTS[modeKey] || "optional";
}

export function getModeCategory(modeKey) {
  const category = MODE_CATEGORIES.find(c => c.modes.includes(modeKey));
  return category?.key || "general";
}