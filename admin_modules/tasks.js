// admin_modules/tasks.js — إضافة مهام إدارية موجّهة لرتبة معينة (نائب الامبراطور)

const { sendMessage } = require('../utils');
const { setAdminSession, deleteAdminSession, getDB } = require('../database');

// ═════════════════════════════════════════════════════════════════════
//   بدء جلسة إضافة مهمة جديدة (نقطة الدخول من الأمر: "اضافة مهام")
// ═════════════════════════════════════════════════════════════════════

async function handleTasksStart(api, event) {
  const { senderID, threadID } = event;
  await setAdminSession(senderID, { state: 'ADMIN_ADD_TASK_CHOOSE_RANK' });
  const msg =
    `╮───∙⋆⋅「 📋 إضافة مهمة جديدة 」\n` +
    `│ الرجاء اختيار رقم الرتبة الإدارية المستهدفة:\n` +
    `│ 1 》 نائب الامبراطور\n` +
    `╯───────∙⋆⋅ ※ ⋅⋆∙───────◈\n\n` +
    `› أرسل رقم الخيار المطلوب أو اكتب 《 خروج 》 للإلغاء.`;
  await sendMessage(api, msg, event.threadID);
}

// ═════════════════════════════════════════════════════════════════════
//   جلسة إضافة مهمة (اختيار الرتبة → العنوان → التفاصيل)
// ═════════════════════════════════════════════════════════════════════
async function handleTasksSession(api, event, session) {
  const { senderID, threadID, body } = event;
  const text = (body || '').trim();
  const s = session.state;
  const db = getDB();

  if (text === 'خروج') {
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (s === 'ADMIN_ADD_TASK_CHOOSE_RANK') {
    if (text === '1') {
      await setAdminSession(senderID, { state: 'ADMIN_ADD_TASK_TITLE', targetRank: 'نائب الامبراطور' });
      await sendMessage(api, `✉️ يرجى إدخال عنوان المهمة:`, threadID);
    } else {
      await sendMessage(api, `⚠️ خيار غير صحيح. يرجى إرسال رقم الرتبة المطلوبة (1) أو "خروج" للإلغاء.`, threadID);
    }
    return;
  }

  if (s === 'ADMIN_ADD_TASK_TITLE') {
    await setAdminSession(senderID, {
      state: 'ADMIN_ADD_TASK_DETAILS',
      targetRank: session.targetRank,
      taskTitle: text
    });
    await sendMessage(api, `📝 يرجى إدخال تفاصيل المهمة:`, threadID);
    return;
  }

  if (s === 'ADMIN_ADD_TASK_DETAILS') {
    const title = session.taskTitle;
    const details = text;
    const targetRank = session.targetRank;

    await db.collection('tasks').insertOne({
      title,
      details,
      targetRank,
      createdBy: senderID,
      createdAt: new Date()
    });

    await deleteAdminSession(senderID);
    await sendMessage(api, `✅ تم ارسال المهمة للرتبة المحددة`, threadID);

    // إشعار كافة نوائب الإمبراطور المسجلين
    const deputies = await db.collection('players').find({ rank: 'نائب الامبراطور' }).toArray();
    for (const dep of deputies) {
      await db.collection('notifications').insertOne({
        fbId: String(dep.fbId),
        message: `🔔 مهمة جديدة اكتب " مهام "`,
        createdAt: new Date(),
        sent: false
      });
    }
    return;
  }
}

module.exports = {
  handleTasksStart,
  handleTasksSession
};
