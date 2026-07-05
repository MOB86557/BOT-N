/*
 * ═══════════════════════════════════════════════════════════════════════
 *  games/xo.js — لعبة اكس أو (الفردي + التحدي)
 * ═══════════════════════════════════════════════════════════════════════
 *  لتعديل هذه اللعبة فقط، ارفع هذا الملف مع games/_shared.js و dar_alal3ab_core.js
 */

'use strict';

const { getDB, addXP } = require('../database');
const { sendReply, sendMessage, H } = require('../utils');
const { renderXOBoard, checkXOWinner, findBestXOMove } = require('./_shared');

const KEY = 'xo';

// ===== تهيئة الحالة الأولية للعبة =====
function init(p1, p2) {
  return {
    board: Array(9).fill(null),
    symbols: { [p1]: '❌', [p2]: '🟢' }
  };
}

// ===== بدء اللعبة في الوضع الفردي (ضد البوت) =====
async function startSingle(api, event, sessionData) {
  const { threadID, senderID, messageID } = event;
  const db = getDB();

  const pStarts = Math.random() > 0.5;
  sessionData.turn = pStarts ? senderID : 'bot';
  sessionData.gameState.symbols = { [senderID]: '❌', 'bot': '🟢' };

  await db.collection('active_game_sessions').insertOne(sessionData);

  if (!pStarts) {
    sessionData.gameState.board[4] = '🟢';
    sessionData.turn = senderID;
    await db.collection('active_game_sessions').updateOne({ _id: sessionData._id }, { $set: { gameState: sessionData.gameState, turn: senderID } });
    await sendReply(api, `🤖 قرر البوت البدء أولاً ووضع 🟢 في الوسط!\n` + renderXOBoard(sessionData.gameState.board) + `\nإنه دورك الآن ارسل رقم المربع لوضع ❌.`, messageID, threadID);
  } else {
    await sendReply(api, `🎮 قررت القرعة أن تبدأ أولاً ورمزك ❌!\n` + renderXOBoard(sessionData.gameState.board) + `\nإنه دورك الآن ارسل رقم المربع لوضع ❌.`, messageID, threadID);
  }
}

// ===== معالجة مدخلات الوضع الفردي =====
async function processSingle(api, event, session, text) {
  const { threadID, senderID, messageID } = event;
  const db = getDB();
  const state = session.gameState;

  if (session.turn !== senderID) {
    await sendReply(api, `${H}⚠️ انتظر دورك حالياً! البوت يفكر في خطوته.`, messageID, threadID);
    return;
  }
  const cell = parseInt(text, 10) - 1;
  if (isNaN(cell) || cell < 0 || cell > 8 || state.board[cell] !== null) {
    await sendReply(api, `${H}⚠️ يرجى إدخال رقم مربع صحيح فارغ (من 1 إلى 9):`, messageID, threadID);
    return;
  }

  state.board[cell] = '❌';

  if (checkXOWinner(state.board, '❌')) {
    await sendReply(api, `🎉 مبروك! لقد فزت في اللعبة وهزمت البوت!\n` + renderXOBoard(state.board) + `\n🏆 حصلت على مكافأة: ⛁ 2 كوينز!`, messageID, threadID);
    await db.collection('players').updateOne({ fbId: String(senderID) }, { $inc: { coins: 2 } });
    await addXP(String(senderID), 5, api, threadID).catch(() => {});
    await db.collection('active_game_sessions').deleteOne({ _id: session._id });
    return;
  }

  if (!state.board.includes(null)) {
    await sendReply(api, `🤝 تعادل! لقد انتهت جميع المربعات دون فائز.\n` + renderXOBoard(state.board), messageID, threadID);
    await db.collection('active_game_sessions').deleteOne({ _id: session._id });
    return;
  }

  const botCell = findBestXOMove(state.board, '🟢', '❌');
  if (botCell === undefined || botCell === null) {
    await sendReply(api, `🤝 تعادل! لقد انتهت جميع المربعات دون فائز.\n` + renderXOBoard(state.board), messageID, threadID);
    await db.collection('active_game_sessions').deleteOne({ _id: session._id });
    return;
  }
  state.board[botCell] = '🟢';

  if (checkXOWinner(state.board, '🟢')) {
    await sendReply(api, `😢 خسارة! لقد تمكن البوت من الفوز عليك.\n` + renderXOBoard(state.board) + `\nحاول مجدداً للتفوق عليه!`, messageID, threadID);
    await db.collection('active_game_sessions').deleteOne({ _id: session._id });
    return;
  }

  if (!state.board.includes(null)) {
    await sendReply(api, `🤝 تعادل! لقد انتهت جميع المربعات دون فائز.\n` + renderXOBoard(state.board), messageID, threadID);
    await db.collection('active_game_sessions').deleteOne({ _id: session._id });
    return;
  }

  await db.collection('active_game_sessions').updateOne({ _id: session._id }, { $set: { gameState: state } });
  await sendReply(api, `🤖 لعب البوت حركته ووضع 🟢!\n` + renderXOBoard(state.board) + `\nارسل رقم المربع لدورك التالي:`, messageID, threadID);
}

// ===== معالجة مدخلات وضع التحدي =====
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

  const cell = parseInt(text, 10) - 1;
  if (isNaN(cell) || cell < 0 || cell > 8 || state.board[cell] !== null) {
    await sendReply(api, `${H}⚠️ يرجى إدخال رقم مربع صحيح فارغ (من 1 إلى 9):`, messageID, threadID);
    return;
  }

  const symbol = state.symbols[senderID];
  state.board[cell] = symbol;

  if (checkXOWinner(state.board, symbol)) {
    const prize = session.bet * 2;
    if (session.bet > 0) {
      await db.collection('players').updateOne({ fbId: String(senderID) }, { $inc: { coins: prize } });
    }
    await addXP(String(senderID), 10, api, threadID).catch(() => {});

    const boardStr = renderXOBoard(state.board);
    const xoWinMsg = `🏆 فاز ⟦ ${session.playerNames[senderID]} ⟧ في تحدي اكس أو وحصد الرهان: ${prize} كوينز!\n` + boardStr;
    await sendMessage(api, xoWinMsg, t1);
    if (t1 !== t2) await sendMessage(api, xoWinMsg, t2);

    await db.collection('active_game_sessions').deleteOne({ _id: session._id });
    return;
  }

  if (!state.board.includes(null)) {
    const boardStr = renderXOBoard(state.board);
    const xoDrawMsg = `🤝 تعادل! انتهى التحدي بالتعادل بين اللاعبين واسترداد الرهان.\n` + boardStr;
    await sendMessage(api, xoDrawMsg, t1);
    if (t1 !== t2) await sendMessage(api, xoDrawMsg, t2);

    if (session.bet > 0) {
      await db.collection('players').updateOne({ fbId: String(session.players[0]) }, { $inc: { coins: session.bet } });
      await db.collection('players').updateOne({ fbId: String(session.players[1]) }, { $inc: { coins: session.bet } });
    }

    await db.collection('active_game_sessions').deleteOne({ _id: session._id });
    return;
  }

  session.turn = opponentId;
  await db.collection('active_game_sessions').updateOne({ _id: session._id }, { $set: { gameState: state, turn: opponentId } });

  const boardStr = renderXOBoard(state.board);
  if (t1 === t2) {
    await sendMessage(api, `🎮 دور ⟦ ${session.playerNames[opponentId]} ⟧ الآن! خصمه لعب بوضع ${symbol}.\n` + boardStr + `\nأرسل رقم المربع الصالح للدور:`, t1);
  } else {
    await sendMessage(api, `✅ لعبت دورك بنجاح بوضع ${symbol}.\nبانتظار دور الخصم للعب...\n` + boardStr, t1);
    await sendMessage(api, `🎮 جاء دورك الآن للعب حركتك! خصمك لعب بوضع ${symbol}.\n` + boardStr + `\nأرسل رقم المربع الصالح للدور:`, t2);
  }
}

// ===== رسالة توجيه الدور (تحدي) =====
async function promptTurn(api, session, targetPlayerId) {
  const state = session.gameState;
  const symbol = state.symbols[targetPlayerId];
  const boardStr = renderXOBoard(state.board);
  const starterName = session.playerNames[targetPlayerId];

  const otherPlayerId = session.players.find(p => p !== String(targetPlayerId));
  const t1 = session.playerThreads[targetPlayerId];
  const t2 = session.playerThreads[otherPlayerId];

  if (t1 === t2) {
    await sendMessage(api, `🎮 قررت القرعة أن يبدأ ⟦ ${starterName} ⟧ أولاً ورمزه ${symbol}!\n` + boardStr + `\nإنه دورك الآن يا ⟦ ${starterName} ⟧، أرسل رقم المربع للعب حركتك:`, t1);
  } else {
    await sendMessage(api, `🎮 قررت القرعة أن تبدأ أولاً ورمزك ${symbol}!\n` + boardStr + `\nإنه دورك الآن، أرسل رقم المربع للعب حركتك:`, t1);
    await sendMessage(api, `🎮 قررت القرعة أن يبدأ خصمك ⟦ ${starterName} ⟧ أولاً ورمزه ${symbol}.\n` + boardStr + `\nبانتظار دوره للعب...`, t2);
  }
}

module.exports = { KEY, init, startSingle, processSingle, processChallenge, promptTurn };
