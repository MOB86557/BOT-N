// admin_modules/rank_change.js — أمر "تغيير الرتبة" وجلسة اختيار الرتبة اليدوية (AWAITING_RANK_CHANGE_NUMBER)

const config = require('../config.json');
const { sendReply } = require('../utils');
const { isAdmin } = require('./auth');
const { getPlayer, updatePlayer, setAdminSession, deleteAdminSession } = require('../database');
const { RANKS_ORDER, checkManualRankLimits } = require('../ranks');

// يعالج أمر "تغيير الرتبة" (متاح للامبراطور/نائبه/أدمن النظام)
async function handleChangeRankCommand(api, event) {
  const { senderID, threadID } = event;
  const text = (event.body || '').trim();

  const isChangeRankCmd = text.startsWith('تغيير الرتبة') || (event.type === 'message_reply' && text === 'تغيير الرتبة');
  if (!isChangeRankCmd) return false;

  const { getPlayerByNickname } = require('../database');

  const operator = await getPlayer(senderID);
  const isEmp = operator && (operator.rank === 'الامبراطور' || operator.rank === 'نائب الامبراطور');
  const isSysAdmin = isAdmin(senderID);

  if (!isEmp && !isSysAdmin) {
    await sendReply(api, `❌ عذراً، هذا الأمر مخصص فقط للإمبراطور ومساعديه أو مشرفي النظام الأعلى.`, event.messageID, threadID);
    return true;
  }

  let targetId = null;
  let targetNickOrId = text.replace(/^تغيير الرتبة\s*/, '').trim();

  if (event.type === 'message_reply' && event.messageReply.senderID) {
    targetId = String(event.messageReply.senderID);
  } else if (targetNickOrId) {
    let found = await getPlayer(targetNickOrId);
    if (!found) found = await getPlayerByNickname(targetNickOrId);
    if (found) targetId = found.fbId;
  }

  if (!targetId) {
    await sendReply(api, `❌ يرجى تحديد اللاعب المستهدف عبر الرد على رسالته و كتابة "تغيير الرتبة" أو كتابة الأمر متبوعاً باللقب أو الآيدي الخاص به.`, event.messageID, threadID);
    return true;
  }

  const targetPlayer = await getPlayer(targetId);
  if (!targetPlayer) {
    await sendReply(api, `❌ هذا المستخدم غير مسجل بنظام اللعبة حالياً.`, event.messageID, threadID);
    return true;
  }

  await setAdminSession(senderID, {
    state: 'AWAITING_RANK_CHANGE_NUMBER',
    targetPlayerId: targetId
  });

  let menuMsg = `╮───∙⋆⋅「 ⚙️ نظام تعديل الرتب 」\n`;
  menuMsg += `│ اللاعب المستهدف : ${targetPlayer.nickname}\n`;
  menuMsg += `│ رتبته الحالية   : ${targetPlayer.rank || 'متدرب'}\n`;
  menuMsg += `╯───────∙⋆⋅ ※ ⋅⋆∙───────◈\n\n`;
  menuMsg += `الرجاء كتابة رقم الرتبة المطلوبة لنقل اللاعب إليها:\n\n`;

  RANKS_ORDER.forEach((rk, idx) => {
    menuMsg += `${idx + 1} 》 ${rk}\n`;
  });
  menuMsg += `\n› أرسل رقم الرتبة المطلوب أو اكتب 《 خروج 》 للإلغاء.`;

  await sendReply(api, menuMsg, event.messageID, threadID);
  return true;
}

// يعالج جلسة اختيار الرتبة اليدوية (AWAITING_RANK_CHANGE_NUMBER)
async function handleRankChangeSession(api, event, adminSession) {
  const { senderID, threadID } = event;
  const text = (event.body || '').trim();

  if (text === 'خروج') {
    await deleteAdminSession(senderID);
    await sendReply(api, `╮───∙⋆⋅「 تم إلغاء العملية 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, event.messageID, threadID);
    return true;
  }

  const selectionIdx = parseInt(text, 10) - 1;
  if (isNaN(selectionIdx) || selectionIdx < 0 || selectionIdx >= RANKS_ORDER.length) {
    await sendReply(api, `⚠️ خيار غير صحيح، يرجى كتابة الرقم المقابل للرتبة أو اكتب 《 خروج 》.`, event.messageID, threadID);
    return true;
  }

  const selectedRank = RANKS_ORDER[selectionIdx];
  const targetPlayer = await getPlayer(adminSession.targetPlayerId);

  if (!targetPlayer) {
    await deleteAdminSession(senderID);
    await sendReply(api, `❌ فشل العثور على اللاعب المستهدف.`, event.messageID, threadID);
    return true;
  }

  const limitsCheck = await checkManualRankLimits(
    selectedRank,
    targetPlayer.kingdom,
    targetPlayer.registeredCityName || 'العاصمة'
  );

  if (!limitsCheck.allowed) {
    await sendReply(api, `❌ تعذر الترقية:\n⚠️ ${limitsCheck.reason}`, event.messageID, threadID);
    return true;
  }

  const oldRank = targetPlayer.rank || 'متدرب';
  await updatePlayer(targetPlayer.fbId, {
    rank: selectedRank,
    pendingPromotionNotify: {
      oldRank: oldRank,
      newRank: selectedRank
    }
  });

  const { changePlayerNickname } = require('../dukhul');
  const groupId = config.groupes[targetPlayer.kingdom];
  if (groupId) {
    try {
      await changePlayerNickname(api, groupId, targetPlayer.fbId, targetPlayer.nickname, selectedRank, targetPlayer.class);
    } catch (e) {
      console.error('[Router] Error changing nickname on manual promotion:', e);
    }
  }

  await deleteAdminSession(senderID);
  await sendReply(api, `✅ تم تعيين رتبة اللاعب (${targetPlayer.nickname}) إلى (${selectedRank}) بنجاح!\nسيصل الإشعار والتهنئة للاعب عند إرساله لأي رسالة قادمة.`, event.messageID, threadID);
  return true;
}

module.exports = {
  handleChangeRankCommand,
  handleRankChangeSession
};
