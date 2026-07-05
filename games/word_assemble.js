/*
 * ═══════════════════════════════════════════════════════════════════════
 *  games/word_assemble.js — لعبة تجميع الكلمات (الفردي + التحدي)
 * ═══════════════════════════════════════════════════════════════════════
 */

'use strict';

const { getDB, addXP } = require('../database');
const { sendReply, sendMessage } = require('../utils');
const { NEXUS_WORDS, scrambleWord } = require('./_shared');

const KEY = 'word_assemble';

function init() {
  const word = NEXUS_WORDS[Math.floor(Math.random() * NEXUS_WORDS.length)];
  return {
    word,
    scrambled: scrambleWord(word)
  };
}

async function startSingle(api, event, sessionData) {
  const { threadID, messageID } = event;
  const db = getDB();
  await db.collection('active_game_sessions').insertOne(sessionData);
  await sendReply(api, `🔤 قم بتجميع الأحرف المبعثرة التالية:\n『 ${sessionData.gameState.scrambled} 』\n\nأرسل الكلمة المجمعة الصحيحة:`, messageID, threadID);
}

async function processSingle(api, event, session, text) {
  const { threadID, senderID, messageID } = event;
  const db = getDB();
  const state = session.gameState;

  if (text === state.word) {
    await sendReply(api, `🎉 تجميع صحيح! الكلمة هي ⟦ ${state.word} ⟧. حصلت على 2 كوينز!`, messageID, threadID);
    await db.collection('players').updateOne({ fbId: String(senderID) }, { $inc: { coins: 2 } });
    await addXP(String(senderID), 5, api, threadID).catch(() => {});
  } else {
    await sendReply(api, `❌ تجميع خاطئ! الكلمة الصحيحة كانت: ⟦ ${state.word} ⟧.`, messageID, threadID);
  }
  await db.collection('active_game_sessions').deleteOne({ _id: session._id });
}

// ===== توليد رسالة بدء التحدي (تُستخدم من الملف الرئيسي عند بدء جلسة تحدي) =====
function buildChallengeStartMessage(state) {
  return `🔤 أسرع بتجميع الأحرف المبعثرة التالية لتكوين كلمة صحيحة:\n『 ${state.scrambled} 』\n\nأرسل الكلمة الصحيحة فوراً للفوز بالرهان!`;
}

// ===== التحقق من صحة إجابة وضع التحدي (يستخدمه المُجمِّع المشترك لألعاب السرعة) =====
function checkChallengeAnswer(state, text) {
  return text === state.word;
}

function getAnswerDisplay(state) {
  return state.word;
}

module.exports = {
  KEY,
  init,
  startSingle,
  processSingle,
  // خاص بألعاب السرعة في وضع التحدي (يُستدعى من dar_alal3ab_core.js)
  buildChallengeStartMessage,
  checkChallengeAnswer,
  getAnswerDisplay
};
