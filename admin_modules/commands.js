const { sendMessage } = require('../utils');
const { getDB, deleteAdminSession } = require('../database');

async function handleTatleel(api, event, senderID) {
  const { threadID } = event;
  let msg = `╮───∙⋆⋅「 تعطيل كلمة أو عبارة 」\n│\n` +
            `│ › ارسل الكلمة أو العبارة التي تريد تعطيلها بالكامل.\n` +
            `│ › بمجرد التعطيل، سيتجاهلها البوت تماماً كأنها لم تُرسل.\n` +
            `│\n` +
            `│ › اكتب 《 خروج 》 للإلغاء\n` +
            `╯───────∙⋆⋅ ※ ⋅⋆∙`;
  const { setAdminSession } = require('../database');
  await setAdminSession(senderID, { state: 'TATLEEL_AWAIT_WORD' });
  await sendMessage(api, msg, threadID);
}

async function handleTatleelSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim().toLowerCase();
  
  if (text === 'خروج') { 
    await deleteAdminSession(senderID); 
    await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); 
    return; 
  }
  
  if (!text) {
    await sendMessage(api, `⚠️ الرجاء إدخال كلمة أو عبارة صحيحة لتعطيلها.`, threadID);
    return;
  }
  
  const db = getDB();
  const exists = await db.collection('disabled_commands').findOne({ key: text });
  
  if (exists) {
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تنبيه 」\n│\n│ › الكلمة/العبارة 《 ${text} 》 معطلة بالفعل سابقاً!\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }
  
  await db.collection('disabled_commands').insertOne({ key: text, createdAt: new Date() });
  await deleteAdminSession(senderID);
  await sendMessage(api, `╮───∙⋆⋅「 تم التعطيل 」\n│\n│ › تم تعطيل الكلمة/العبارة: 《 ${text} 》 ✅️\n│ › البوت سيتجاهلها بالكامل ولن يستجيب لأي سياق يحتويها.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
}

async function handleTashgeel(api, event, senderID) {
  const { threadID } = event;
  const db = getDB();
  const disabled = await db.collection('disabled_commands').find().toArray();
  
  if (!disabled || !disabled.length) {
    await sendMessage(api, `╮───∙⋆⋅「 تشغيل 」\n│\n│ › لا توجد أي كلمات أو عبارات معطلة حالياً.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }
  
  let msg = `╮───∙⋆⋅「 تشغيل الكلمات معطلة 」\n│\n`;
  disabled.forEach((c, i) => { msg += `│ ${i + 1}. ${c.key}\n`; });
  msg += `│\n│ › ارسل رقم الكلمة لإعادة تفعيلها وتشغيلها\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`;
  
  const { setAdminSession } = require('../database');
  await setAdminSession(senderID, { state: 'TASHGEEL_CHOOSE', disabledList: disabled });
  await sendMessage(api, msg, threadID);
}

async function handleTashgeelSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();
  
  if (text === 'خروج') { 
    await deleteAdminSession(senderID); 
    await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); 
    return; 
  }
  
  const list = session.disabledList || [], idx = parseInt(text, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= list.length) { 
    await sendMessage(api, `⚠️ رقم غير صحيح من القائمة.`, threadID); 
    return; 
  }
  
  const cmd = list[idx];
  const db = getDB();
  await db.collection('disabled_commands').deleteOne({ key: cmd.key });
  await deleteAdminSession(senderID);
  await sendMessage(api, `╮───∙⋆⋅「 تشغيل 」\n│\n│ › تم تشغيل وتفعيل: 《 ${cmd.key} 》 بنجاح ✅️\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
}

// دالة تفاعلية لفحص وحظر الرسائل وتجاهلها كلياً في موجه الأحداث الرئيسي
async function isMessageBlocked(text) {
  if (!text) return false;
  try {
    const db = getDB();
    const disabled = await db.collection('disabled_commands').find().toArray();
    const lowerText = text.trim().toLowerCase();
    
    for (const item of disabled) {
      if (lowerText === item.key || 
          lowerText.startsWith(item.key + ' ') || 
          lowerText.includes(' ' + item.key + ' ') || 
          lowerText.endsWith(' ' + item.key)) {
        return true;
      }
    }
  } catch (e) {
    console.error('Error checking custom blocked words:', e);
  }
  return false;
}

// دالة فارغة للحفاظ على التوافقية
async function handleDisabledCommand(api, event, cmdKey) {}

module.exports = {
  handleTatleel,
  handleTatleelSession,
  handleTashgeel,
  handleTashgeelSession,
  handleDisabledCommand,
  isMessageBlocked,
  matchCommandKey: () => null
};