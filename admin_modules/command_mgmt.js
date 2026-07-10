// admin_modules/command_mgmt.js — إدارة الأوامر المخصصة (ضبط الاوامر): إضافة / تعديل / حذف / ترتيب

const { sendMessage } = require('../utils');
const { setAdminSession, deleteAdminSession } = require('../database');

// ═════════════════════════════════════════════════════════════════════
//   بدء جلسة ضبط الأوامر (نقطة الدخول من الأمر: "ضبط الاوامر")
// ═════════════════════════════════════════════════════════════════════

async function handleCommandMgmtStart(api, event) {
  const { senderID, threadID } = event;
  await setAdminSession(senderID, { state: 'CMD_MGMT_MAIN' });
  const menuMsg =
    `╮───∙⋆⋅「 ⚙️ إدارة الأوامر 」\n` +
    `│ 1 》 إضافة أمر جديد\n` +
    `│ 2 》 تعديل أمر موجود\n` +
    `│ 3 》 حذف أمر\n` +
    `│ 4 》 تغيير ترتيب الأوامر\n` +
    `│ 5 》 عرض الأوامر كاملة\n` +
    `│ 6 》 إعادة ضبط للوضع الافتراضي\n` +
    `╯───────∙⋆⋅ ※ ⋅⋆∙───────◈\n\n` +
    `› أرسل رقم الخيار المطلوب أو اكتب 《 خروج 》 للإلغاء.`;
  await sendMessage(api, menuMsg, event.threadID);
}

// ═════════════════════════════════════════════════════════════════════
//   منظم وجلسة التحكم بالأوامر للمطور
// ═════════════════════════════════════════════════════════════════════
async function handleCommandMgmtSession(api, event, session) {
  const { senderID, body } = event;
  const text = (body || '').trim();
  const s = session.state;

  const { getCustomCommands, saveCustomCommands } = require('../database');
  const { DEFAULT_COMMANDS, fetchCommandsList } = require('../awamer');

  if (text === 'خروج') {
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, event.threadID);
    return;
  }

  const currentCommands = await fetchCommandsList();

  if (s === 'CMD_MGMT_MAIN') {
    if (text === '1') {
      await setAdminSession(senderID, { state: 'CMD_MGMT_ADD_TYPE' });
      await sendMessage(api, `╮───∙⋆⋅「 إضافة أمر 」\n│ اختر نوع الأمر:\n│ 1 》 أمر عادي (مفتوح للجميع)\n│ 2 》 أمر مقفول بمفتاح متجر\n╯───────∙⋆⋅ ※ ⋅⋆∙`, event.threadID);
      return;
    }
    if (text === '2') {
      await setAdminSession(senderID, { state: 'CMD_MGMT_EDIT_SELECT' });
      let listMsg = `╮───∙⋆⋅「 تعديل أمر 」\nالرجاء إدخال رقم الأمر الذي ترغب في تعديله:\n`;
      currentCommands.forEach((cmd, idx) => {
        listMsg += `│ ${idx + 1}. ${cmd.text} ${cmd.key ? '(🔒 بمفتاح)' : ''}\n`;
      });
      listMsg += `╯───────∙⋆⋅ ※ ⋅⋆∙\n› أدخل الرقم المطلوب أو "خروج"`;
      await sendMessage(api, listMsg, event.threadID);
      return;
    }
    if (text === '3') {
      await setAdminSession(senderID, { state: 'CMD_MGMT_DELETE_SELECT' });
      let listMsg = `╮───∙⋆⋅「 حذف أمر 」\nالرجاء إدخال رقم الأمر الذي ترغب بحذفه:\n`;
      currentCommands.forEach((cmd, idx) => {
        listMsg += `│ ${idx + 1}. ${cmd.text}\n`;
      });
      listMsg += `╯───────∙⋆⋅ ※ ⋅⋆∙\n› أدخل الرقم المطلوب أو "خروج"`;
      await sendMessage(api, listMsg, event.threadID);
      return;
    }
    if (text === '4') {
      await setAdminSession(senderID, { state: 'CMD_MGMT_REORDER_SELECT' });
      let listMsg = `╮───∙⋆⋅「 ترتيب الأوامر 」\nالرجاء إدخال رقم الأمر الذي ترغب في تغيير مكانه:\n`;
      currentCommands.forEach((cmd, idx) => {
        listMsg += `│ ${idx + 1}. ${cmd.text}\n`;
      });
      listMsg += `╯───────∙⋆⋅ ※ ⋅⋆∙\n› أدخل الرقم المطلوب أو "خروج"`;
      await sendMessage(api, listMsg, event.threadID);
      return;
    }
    if (text === '5') {
      let listMsg = `╮───∙⋆⋅「 قائمة الأوامر الحالية 」\n`;
      currentCommands.forEach((cmd, idx) => {
        listMsg += `│ ${idx + 1}. ${cmd.text} ${cmd.key ? `[قفل: ${cmd.key}]` : ''}\n`;
      });
      listMsg += `╯───────∙⋆⋅ ※ ⋅⋆∙`;
      await sendMessage(api, listMsg, event.threadID);
      await setAdminSession(senderID, { state: 'CMD_MGMT_MAIN' });
      return;
    }
    if (text === '6') {
      await saveCustomCommands(DEFAULT_COMMANDS);
      await sendMessage(api, `✅ تم إعادة ضبط قائمة الأوامر للوضع الافتراضي بنجاح!`, event.threadID);
      await deleteAdminSession(senderID);
      return;
    }

    await sendMessage(api, `⚠️ خيار غير صحيح. الرجاء إدخال رقم من 1 إلى 6 أو 《 خروج 》.`, event.threadID);
    return;
  }

  // --- إضافة أمر جديد ---
  if (s === 'CMD_MGMT_ADD_TYPE') {
    if (text === '1') {
      await setAdminSession(senderID, { state: 'CMD_MGMT_ADD_TEXT', isLocked: false });
      await sendMessage(api, `الرجاء إدخال نص الأمر مع الوصف (مثال: ➤ اسم الأمر ┇ الوصف):`, event.threadID);
      return;
    }
    if (text === '2') {
      await setAdminSession(senderID, { state: 'CMD_MGMT_ADD_TEXT', isLocked: true });
      await sendMessage(api, `الرجاء إدخال نص الأمر في حالة فك القفل (مثال: ➤ ترجمة ┇ لترجمة النصوص):`, event.threadID);
      return;
    }
    await sendMessage(api, `⚠️ خيار غير صحيح. اختر 1 أو 2.`, event.threadID);
    return;
  }

  if (s === 'CMD_MGMT_ADD_TEXT') {
    const isLocked = session.isLocked;
    if (isLocked) {
      await setAdminSession(senderID, { state: 'CMD_MGMT_ADD_LOCKED_TEXT', isLocked, textValue: text });
      await sendMessage(api, `الرجاء إدخال نص الأمر في حالة القفل (مثال: ➤ 🔒 ترجمة ┇ لترجمة النصوص):`, event.threadID);
    } else {
      const newCmd = { text, kingdoms: [] };
      currentCommands.push(newCmd);
      await saveCustomCommands(currentCommands);
      await sendMessage(api, `✅ تم إضافة الأمر العادي الجديد بنجاح!`, event.threadID);
      await deleteAdminSession(senderID);
    }
    return;
  }

  if (s === 'CMD_MGMT_ADD_LOCKED_TEXT') {
    await setAdminSession(senderID, { state: 'CMD_MGMT_ADD_KEY', textValue: session.textValue, lockedTextValue: text });
    await sendMessage(api, `الرجاء إدخال اسم مفتاح المتجر الدقيق المرتبط بهذا الأمر (مثال: مفتاح أمر ترجمة):`, event.threadID);
    return;
  }

  if (s === 'CMD_MGMT_ADD_KEY') {
    const newCmd = {
      key: text,
      text: session.textValue,
      lockedText: session.lockedTextValue,
      kingdoms: []
    };
    currentCommands.push(newCmd);
    await saveCustomCommands(currentCommands);
    await sendMessage(api, `✅ تم إضافة الأمر المقفول الجديد بنجاح!`, event.threadID);
    await deleteAdminSession(senderID);
    return;
  }

  // --- تعديل أمر ---
  if (s === 'CMD_MGMT_EDIT_SELECT') {
    const idx = parseInt(text, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= currentCommands.length) {
      await sendMessage(api, `⚠️ رقم غير صحيح. اختر من القائمة المتاحة.`, event.threadID);
      return;
    }
    const targetCmd = currentCommands[idx];
    await setAdminSession(senderID, { state: 'CMD_MGMT_EDIT_VALUE', editIndex: idx });
    await sendMessage(api, `╮───∙⋆⋅「 تعديل أمر 」\n│ النص الحالي: ${targetCmd.text}\n│ أدخل النص والوصف الجديد بالكامل:\n╯───────∙⋆┌ ※ ┐`, event.threadID);
    return;
  }

  if (s === 'CMD_MGMT_EDIT_VALUE') {
    const idx = session.editIndex;
    currentCommands[idx].text = text;
    if (currentCommands[idx].key) {
      currentCommands[idx].lockedText = `➤ 🔒 ${text.replace(/^➤\s*/, '')}`;
    }
    await saveCustomCommands(currentCommands);
    await sendMessage(api, `✅ تم تعديل الأمر بنجاح!`, event.threadID);
    await deleteAdminSession(senderID);
    return;
  }

  // --- حذف أمر ---
  if (s === 'CMD_MGMT_DELETE_SELECT') {
    const idx = parseInt(text, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= currentCommands.length) {
      await sendMessage(api, `⚠️ رقم غير صحيح. اختر من القائمة المتاحة.`, event.threadID);
      return;
    }
    const deleted = currentCommands.splice(idx, 1);
    await saveCustomCommands(currentCommands);
    await sendMessage(api, `✅ تم حذف الأمر (${deleted[0].text}) بنجاح!`, event.threadID);
    await deleteAdminSession(senderID);
    return;
  }

  // --- ترتيب الأوامر ---
  if (s === 'CMD_MGMT_REORDER_SELECT') {
    const idx = parseInt(text, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= currentCommands.length) {
      await sendMessage(api, `⚠️ رقم غير صحيح. اختر من القائمة المتاحة.`, event.threadID);
      return;
    }
    await setAdminSession(senderID, { state: 'CMD_MGMT_REORDER_DEST', fromIndex: idx });
    await sendMessage(api, `الأمر المختار هو: (${currentCommands[idx].text})\nأدخل الرقم الموضع الجديد الذي ترغب بنقل الأمر إليه (1 إلى ${currentCommands.length}):`, event.threadID);
    return;
  }

  if (s === 'CMD_MGMT_REORDER_DEST') {
    const fromIdx = session.fromIndex;
    const toIdx = parseInt(text, 10) - 1;
    if (isNaN(toIdx) || toIdx < 0 || toIdx >= currentCommands.length) {
      await sendMessage(api, `⚠️ موضع غير صحيح. الرجاء الإدخال من 1 إلى ${currentCommands.length}.`, event.threadID);
      return;
    }
    const [item] = currentCommands.splice(fromIdx, 1);
    currentCommands.splice(toIdx, 0, item);
    await saveCustomCommands(currentCommands);
    await sendMessage(api, `✅ تم تغيير ترتيب الأمر بنجاح!`, event.threadID);
    await deleteAdminSession(senderID);
    return;
  }
}

module.exports = {
  handleCommandMgmtStart,
  handleCommandMgmtSession
};
