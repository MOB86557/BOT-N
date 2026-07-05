/*
 * ═══════════════════════════════════════════════════════════════════════
 *  games/guess_flag.js — لعبة احزر البلد من العلم (الفردي + التحدي)
 * ═══════════════════════════════════════════════════════════════════════
 */

'use strict';

const { getDB, addXP } = require('../database');
const { sendReply } = require('../utils');
const { FLAG_DB } = require('./_shared');

const KEY = 'guess_flag';

function init() {
  const item = FLAG_DB[Math.floor(Math.random() * FLAG_DB.length)];
  return {
    flag: item.flag,
    answer: item.ans
  };
}

async function startSingle(api, event, sessionData) {
  const { threadID, messageID } = event;
  const db = getDB();
  await db.collection('active_game_sessions').insertOne(sessionData);
  await sendReply(api, `🌍 احزر البلد المطابق لهذا العلم:\n『 ${sessionData.gameState.flag} 』\n\nأرسل اسم البلد المقابل:`, messageID, threadID);
}

async function processSingle(api, event, session, text) {
  const { threadID, senderID, messageID } = event;
  const db = getDB();
  const state = session.gameState;

  if (text.includes(state.answer)) {
    await sendReply(api, `🎉 احراز صحيح وممتاز! البلد المقابل للعلم هو بالفعل ⟦ ${state.answer} ⟧. حصلت على 2 كوينز!`, messageID, threadID);
    await db.collection('players').updateOne({ fbId: String(senderID) }, { $inc: { coins: 2 } });
    await addXP(String(senderID), 5, api, threadID).catch(() => {});
  } else {
    await sendReply(api, `❌ احراز خاطئ! البلد المقابل للعلم المعروض هو: ⟦ ${state.answer} ⟧.`, messageID, threadID);
  }
  await db.collection('active_game_sessions').deleteOne({ _id: session._id });
}

function buildChallengeStartMessage(state) {
  return `🌍 أسرع باكتشاف البلد المطابق لهذا العلم:\n『 ${state.flag} 』\n\nأرسل اسم البلد فوراً للفوز بالرهان!`;
}

function checkChallengeAnswer(state, text) {
  return text.includes(state.answer);
}

function getAnswerDisplay(state) {
  return state.answer;
}

module.exports = {
  KEY,
  init,
  startSingle,
  processSingle,
  buildChallengeStartMessage,
  checkChallengeAnswer,
  getAnswerDisplay
};
