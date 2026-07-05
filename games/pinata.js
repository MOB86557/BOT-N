/*
 * ═══════════════════════════════════════════════════════════════════════
 *  games/pinata.js — لعبة ضرب البنياتا (الفردي + التحدي)
 * ═══════════════════════════════════════════════════════════════════════
 */

'use strict';

const { getDB, addXP } = require('../database');
const { sendReply, sendMessage, H } = require('../utils');

const KEY = 'pinata';

function init() {
  return { hp: 100 };
}

async function startSingle(api, event, sessionData) {
  const { threadID, messageID } = event;
  const db = getDB();
  await db.collection('active_game_sessions').insertOne(sessionData);
  await sendReply(api, `🪅 البنياتا أمامك وصحتها 100%!\nأرسل كلمة 《 اضرب 》 لتوجيه ضربة قوية ومحاولة كسرها:`, messageID, threadID);
}

async function processSingle(api, event, session, text) {
  const { threadID, senderID, messageID } = event;
  const db = getDB();
  const state = session.gameState;

  if (text !== 'اضرب' && text !== 'ضرب') {
    await sendReply(api, `${H}⚠️ أرسل كلمة 《 اضرب 》 لضرب البنياتا:`, messageID, threadID);
    return;
  }

  const pDmg = Math.floor(Math.random() * 10) + 3;
  state.hp -= pDmg;

  if (state.hp <= 0) {
    await sendReply(api, `🎉 بوم! انكسرت البنياتا وتطايرت الحلوى والكوينز بضربتك القوية التي سببت ضرر: ${pDmg}%!\nلقد ربحت كوينز من داخلها حصلت على 2 كوينز!`, messageID, threadID);
    await db.collection('players').updateOne({ fbId: String(senderID) }, { $inc: { coins: 2 } });
    await addXP(String(senderID), 5, api, threadID).catch(() => {});
    await db.collection('active_game_sessions').deleteOne({ _id: session._id });
  } else {
    const bDmg = Math.floor(Math.random() * 10) + 3;
    state.hp -= bDmg;

    if (state.hp <= 0) {
      await sendReply(api, `😢 انكسرت البنياتا بضربة البوت المقابلة التي سببت ضرر: ${bDmg}%! لقد ربح البوت الحلوى والكوينز بدلاً منك.`, messageID, threadID);
      await db.collection('active_game_sessions').deleteOne({ _id: session._id });
    } else {
      await db.collection('active_game_sessions').updateOne({ _id: session._id }, { $set: { gameState: state } });
      await sendReply(api, `💥 ضربتك أحدثت ضرر ${pDmg}%!\n🤖 ضربة البوت المقابلة أحدثت ضرر ${bDmg}%!\n\nصحة البنياتا الحالية: 🪅 ${Math.max(0, state.hp)}%\nأرسل 《 اضرب 》 للضربة التالية:`, messageID, threadID);
    }
  }
}

async function processChallenge(api, event, session, text) {
  const { threadID, senderID, messageID } = event;
  const db = getDB();
  const state = session.gameState;

  const opponentId = session.players.find(p => p !== String(senderID));
  const t1 = session.playerThreads[senderID];
  const t2 = session.playerThreads[opponentId];

  if (session.turn !== String(senderID)) {
    await sendReply(api, `${H}⚠️ انتظر دور خصمك للعب حركته أولاً!`, messageID, threadID);
    return;
  }

  if (text !== 'اضرب' && text !== 'ضرب') {
    await sendReply(api, `${H}⚠️ أرسل كلمة 《 اضرب 》 لضرب البنياتا بالتناوب:`, messageID, threadID);
    return;
  }

  const dmg = Math.floor(Math.random() * 10) + 3;
  state.hp -= dmg;

  if (state.hp <= 0) {
    const prize = session.bet * 2;
    if (session.bet > 0) {
      await db.collection('players').updateOne({ fbId: String(senderID) }, { $inc: { coins: prize } });
    }
    await addXP(String(senderID), 10, api, threadID).catch(() => {});

    const pinataWinMsg = `🏆 كسر ⟦ ${session.playerNames[senderID]} ⟧ البنياتا بضربة ${dmg}% وحصد الرهان: ${prize} كوينز!`;
    await sendMessage(api, pinataWinMsg, t1);
    if (t1 !== t2) await sendMessage(api, pinataWinMsg, t2);

    await db.collection('active_game_sessions').deleteOne({ _id: session._id });
  } else {
    session.turn = opponentId;
    await db.collection('active_game_sessions').updateOne({ _id: session._id }, { $set: { gameState: state, turn: opponentId } });

    if (t1 === t2) {
      await sendMessage(api, `💥 ضرب ⟦ ${session.playerNames[senderID]} ⟧ البنياتا وسبب ${dmg}% ضرر!\n🎮 دور ⟦ ${session.playerNames[opponentId]} ⟧ الآن — صحة البنياتا: 🪅 ${state.hp}%\nأرسل 《 اضرب 》:`, t1);
    } else {
      await sendMessage(api, `💥 سببت ضرراً للبنياتا بقدر: ${dmg}%!\nبانتظار ضربة خصمك المقابلة...\nصحة البنياتا الحالية: 🪅 ${state.hp}%`, t1);
      await sendMessage(api, `🎮 جاء دورك الآن لتوجيه ضربتك للبنياتا!\nصحة البنياتا الحالية: 🪅 ${state.hp}%\nأرسل 《 اضرب 》 لضربها:`, t2);
    }
  }
}

async function promptTurn(api, session, targetPlayerId) {
  const t = session.playerThreads[targetPlayerId];
  const state = session.gameState;
  await sendMessage(api, `🎮 جاء دورك الآن لتوجيه ضربتك للبنياتا وصحتها 🪅 ${state.hp}%!\nأرسل كلمة 《 اضرب 》 لضرب البنياتا:`, t);
}

module.exports = { KEY, init, startSingle, processSingle, processChallenge, promptTurn };
