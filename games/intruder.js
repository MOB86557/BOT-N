/*
 * ═══════════════════════════════════════════════════════════════════════
 *  games/intruder.js — لعبة الدخيل (الفردي + التحدي)
 * ═══════════════════════════════════════════════════════════════════════
 */

'use strict';

const { getDB, addXP } = require('../database');
const { sendReply } = require('../utils');
const { generateIntruderGrid } = require('./_shared');

const KEY = 'intruder';

function init() {
  const data = generateIntruderGrid();
  return {
    grid: data.grid,
    intruder: data.intruder
  };
}

async function startSingle(api, event, sessionData) {
  const { threadID, messageID } = event;
  const db = getDB();
  await db.collection('active_game_sessions').insertOne(sessionData);
  await sendReply(api, `🧐 ابحث عن الإيموجي الدخيل (الذي لا يملك زوجاً مطابقاً) من بين الـ 31 إيموجي التالية:\n\n${sessionData.gameState.grid}\n\nلديك 30 ثانية لإرسال الإيموجي الدخيل الصحيح للفوز!`, messageID, threadID);
}

async function processSingle(api, event, session, text) {
  const { threadID, senderID, messageID } = event;
  const db = getDB();
  const state = session.gameState;

  if (text === state.intruder) {
    await sendReply(api, `🎉 صحيح ومذهل! لقد رصدت الدخيل بنجاح وهو: 『 ${state.intruder} 』. حصلت على 2 كوينز!`, messageID, threadID);
    await db.collection('players').updateOne({ fbId: String(senderID) }, { $inc: { coins: 2 } });
    await addXP(String(senderID), 5, api, threadID).catch(() => {});
  } else {
    await sendReply(api, `❌ خطأ! الإيموجي الدخيل الفريد كان: 『 ${state.intruder} 』.`, messageID, threadID);
  }
  await db.collection('active_game_sessions').deleteOne({ _id: session._id });
}

function buildChallengeStartMessage(state) {
  return `🧐 أسرع بإيجاد الإيموجي الدخيل الفريد (الذي لا يملك زوجاً مطابقاً):\n\n${state.grid}\n\nأرسل الإيموجي الدخيل فوراً للفوز بالرهان!`;
}

function checkChallengeAnswer(state, text) {
  return text === state.intruder;
}

function getAnswerDisplay(state) {
  return state.intruder;
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
