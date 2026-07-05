/*
 * ═══════════════════════════════════════════════════════════════════════
 *  games/bomb.js — لعبة خيوط القنبلة (الفردي + التحدي)
 * ═══════════════════════════════════════════════════════════════════════
 */

'use strict';

const { getDB, addXP } = require('../database');
const { sendReply, sendMessage, H } = require('../utils');
const { BOMB_WIRES, renderWires } = require('./_shared');

const KEY = 'bomb';

function init() {
  return {
    wires: [...BOMB_WIRES],
    bombIndex: Math.floor(Math.random() * BOMB_WIRES.length)
  };
}

async function startSingle(api, event, sessionData) {
  const { threadID, messageID } = event;
  const db = getDB();
  await db.collection('active_game_sessions').insertOne(sessionData);
  await sendReply(api, `💣 القنبلة جاهزة بـ 10 خيوط! خيط واحد عشوائي سيفجرها.\nالوضع الفردي: اقطع 5 خيوط سليمة للفوز وتفكيك القنبلة.\nالخيوط المتاحة:\n` + renderWires(sessionData.gameState.wires) + `\n\nأرسل رقم الخيط لقطعه وحظاً موفقاً:`, messageID, threadID);
}

async function processSingle(api, event, session, text) {
  const { threadID, senderID, messageID } = event;
  const db = getDB();
  const state = session.gameState;

  const choice = parseInt(text, 10);
  if (isNaN(choice) || choice < 1 || choice > 10 || !state.wires[choice - 1] || state.wires[choice - 1] === '✂️') {
    await sendReply(api, `${H}⚠️ يرجى إرسال رقم خيط صالح متوفر في القائمة لقطعه.`, messageID, threadID);
    return;
  }

  const index = choice - 1;
  if (index === state.bombIndex) {
    await sendReply(api, `💥 طووووم... بوم! لقد قمت بقطع الخيط المتفجر الخاطئ وانفجرت القنبلة! للاسف خسرت الجولة.`, messageID, threadID);
    await db.collection('active_game_sessions').deleteOne({ _id: session._id });
  } else {
    state.wires[index] = '✂️';
    const cutCount = state.wires.filter(w => w === '✂️').length;

    if (cutCount === 5) {
      await sendReply(api, `🎉 مبروك! تمكنت من قطع 5 خيوط ملونة آمنة بنجاح وتفكيك القنبلة دون تفجيرها! حصلت على 2 كوينز!`, messageID, threadID);
      await db.collection('players').updateOne({ fbId: String(senderID) }, { $inc: { coins: 2 } });
      await addXP(String(senderID), 5, api, threadID).catch(() => {});
      await db.collection('active_game_sessions').deleteOne({ _id: session._id });
    } else {
      await db.collection('active_game_sessions').updateOne({ _id: session._id }, { $set: { gameState: state } });
      await sendReply(api, `✅ الخيط آمن وسليم! تم قطعه بنجاح (${cutCount}/5).\nالقنبلة لا زالت نشطة، الخيوط المتبقية:\n` + renderWires(state.wires) + `\n\nأرسل الخيط التالي لقطعه:`, messageID, threadID);
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

  const choice = parseInt(text, 10);
  if (isNaN(choice) || choice < 1 || choice > 10 || !state.wires[choice - 1] || state.wires[choice - 1] === '✂️') {
    await sendReply(api, `${H}⚠️ يرجى إدخال رقم خيط صالح متوفر لقطعه.`, messageID, threadID);
    return;
  }

  const index = choice - 1;
  if (index === state.bombIndex) {
    const prize = session.bet * 2;
    if (session.bet > 0) {
      await db.collection('players').updateOne({ fbId: String(opponentId) }, { $inc: { coins: prize } });
    }
    await addXP(String(opponentId), 10, api, threadID).catch(() => {});

    const bombMsg = `💥 انفجرت القنبلة في وجه ⟦ ${session.playerNames[senderID]} ⟧! فاز ⟦ ${session.playerNames[opponentId]} ⟧ برصيد الرهان: ${prize} كوينز.`;
    await sendMessage(api, bombMsg, t1);
    if (t1 !== t2) await sendMessage(api, bombMsg, t2);

    await db.collection('active_game_sessions').deleteOne({ _id: session._id });
  } else {
    state.wires[index] = '✂️';
    const available = state.wires.filter(w => w !== '✂️').length;

    if (available === 1) {
      const prize = session.bet * 2;
      if (session.bet > 0) {
        await db.collection('players').updateOne({ fbId: String(senderID) }, { $inc: { coins: prize } });
      }
      await addXP(String(senderID), 10, api, threadID).catch(() => {});

      const bombWinMsg = `🎉 فاز ⟦ ${session.playerNames[senderID]} ⟧ بتفادي القنبلة وكشف جميع الخيوط الآمنة! وحصد الرهان: ${prize} كوينز.`;
      await sendMessage(api, bombWinMsg, t1);
      if (t1 !== t2) await sendMessage(api, bombWinMsg, t2);

      await db.collection('active_game_sessions').deleteOne({ _id: session._id });
    } else {
      session.turn = opponentId;
      await db.collection('active_game_sessions').updateOne({ _id: session._id }, { $set: { gameState: state, turn: opponentId } });

      const wiresStr = renderWires(state.wires);
      if (t1 === t2) {
        await sendMessage(api, `✅ قطع ⟦ ${session.playerNames[senderID]} ⟧ خيطاً آمناً!\n🎮 دور ⟦ ${session.playerNames[opponentId]} ⟧ الآن:\n` + wiresStr + `\nأرسل رقم الخيط المتاح لقطعه:`, t1);
      } else {
        await sendMessage(api, `✅ الخيط آمن وسليم! تم قطعه بنجاح.\nبانتظار الخصم لقطع خيطه...\n` + wiresStr, t1);
        await sendMessage(api, `🎮 جاء دورك لقطع أحد الخيوط! الخيوط المتاحة حالياً:\n` + wiresStr + `\n\nأرسل رقم الخيط المتاح لقطعه:`, t2);
      }
    }
  }
}

async function promptTurn(api, session, targetPlayerId) {
  const t = session.playerThreads[targetPlayerId];
  const state = session.gameState;
  await sendMessage(api, `🎮 جاء دورك الآن لقطع أحد الخيوط! الخيوط المتاحة:\n` + renderWires(state.wires) + `\n\nأرسل رقم الخيط المتاح لقطعه:`, t);
}

module.exports = { KEY, init, startSingle, processSingle, processChallenge, promptTurn };
