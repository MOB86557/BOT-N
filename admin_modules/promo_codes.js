// admin_modules/promo_codes.js
// نظام إنشاء وتفعيل الأكواد الترويجية ومنح الكوينز للاعبين (باعتماد بادئة موحدة)

const { getDB, getPlayer, updatePlayer } = require('../database');
const { sendMessage, sendReply } = require('../utils');

// البادئة الموحدة للأكواد (حرفين) لتمييزها فوراً بمجرد إرسالها
const CODE_PREFIX = 'NX';

// بدء عملية إنشاء الكود من طرف الأدمن
async function handleCreateCodeStart(api, event) {
  const { senderID, threadID } = event;
  const { setAdminSession } = require('../database');

  await setAdminSession(senderID, {
    state: 'AWAITING_CODE_COINS',
    data: {}
  });

  await sendMessage(api, `╮───∙⋆⋅「 إنشاء كود ترويجي 」\n│\n│ › يرجى إدخال عدد الكوينز التي سيمنحها الكود:\n│ › أرسل "خروج" للإلغاء.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
}

// معالجة جلسة الإدخال خطوة بخطوة للآدمن
async function handleCreateCodeSession(api, event, adminSession) {
  const { senderID, threadID, body } = event;
  const text = (body || '').trim();
  const { setAdminSession, deleteAdminSession } = require('../database');

  if (text === 'خروج') {
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم إلغاء إنشاء الكود 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return true;
  }

  const s = adminSession.state;
  const data = adminSession.data || {};

  // الخطوة 1: استقبال عدد الكوينز
  if (s === 'AWAITING_CODE_COINS') {
    const coins = parseInt(text);
    if (isNaN(coins) || coins <= 0) {
      await sendMessage(api, `❌ يرجى إدخال عدد كوينز صحيح (رقم موجب أكبر من الصفر):`, threadID);
      return true;
    }
    data.coins = coins;
    await setAdminSession(senderID, { state: 'AWAITING_CODE_USERS', data });
    await sendMessage(api, `╮───∙⋆⋅「 إنشاء كود ترويجي 」\n│\n│ › تم حفظ عدد الكوينز: ${coins}\n│ › يرجى إدخال الحد الأقصى للمستخدمين الذين يمكنهم تفعيله:\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return true;
  }

  // الخطوة 2: استقبال عدد المستخدمين الأقصى
  if (s === 'AWAITING_CODE_USERS') {
    const maxUsers = parseInt(text);
    if (isNaN(maxUsers) || maxUsers <= 0) {
      await sendMessage(api, `❌ يرجى إدخال عدد مستخدمين صحيح (رقم موجب أكبر من الصفر):`, threadID);
      return true;
    }
    data.maxUsers = maxUsers;
    await setAdminSession(senderID, { state: 'AWAITING_CODE_DAYS', data });
    await sendMessage(api, `╮───∙⋆⋅「 إنشاء كود ترويجي 」\n│\n│ › تم حفظ عدد المستخدمين: ${maxUsers}\n│ › يرجى تحديد صلاحية الكود بالأيام (مثال: 3 أو 0.5 لنصف يوم):\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return true;
  }

  // الخطوة 3: استقبال عدد أيام الصلاحية
  if (s === 'AWAITING_CODE_DAYS') {
    const days = parseFloat(text);
    if (isNaN(days) || days <= 0) {
      await sendMessage(api, `❌ يرجى إدخال عدد أيام صحيح (رقم موجب أكبر من الصفر):`, threadID);
      return true;
    }
    data.days = days;
    await setAdminSession(senderID, { state: 'AWAITING_CODE_TEXT', data });
    await sendMessage(api, `╮───∙⋆⋅「 إنشاء كود ترويجي 」\n│\n│ › تم حفظ مدة الصلاحية: ${days} يوم\n│ › يرجى إدخال الرمز الخاص بالكود (تلقائياً سيبدأ بـ ${CODE_PREFIX}):\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return true;
  }

  // الخطوة 4: استقبال الرمز، التحقق من البادئة، والتخزين
  if (s === 'AWAITING_CODE_TEXT') {
    let codeText = text.toUpperCase();
    
    // إذا لم يكتب الأدمن البادئة الموحدة يدوياً، يتم إضافتها تلقائياً لضمان سلامة الفحص السريع
    if (!codeText.startsWith(CODE_PREFIX)) {
      codeText = CODE_PREFIX + codeText;
    }

    const db = getDB();

    // التحقق من تكرار الكود
    const existing = await db.collection('promo_codes').findOne({ code: codeText });
    if (existing) {
      await sendMessage(api, `❌ الرمز [ ${codeText} ] مستخدم بالفعل لكود آخر. يرجى كتابة رمز آخر:`, threadID);
      return true;
    }

    const expiresAt = new Date(Date.now() + data.days * 24 * 60 * 60 * 1000);

    await db.collection('promo_codes').insertOne({
      code: codeText,
      coins: data.coins,
      maxUsers: data.maxUsers,
      expiresAt: expiresAt,
      redeemedBy: [],
      creator: senderID,
      createdAt: new Date()
    });

    await deleteAdminSession(senderID);

    const successMsg = 
      `╮───∙⋆⋅「 تم إنشاء الكود بنجاح 」\n` +
      `│ › الرمز للتفعيل: ${codeText}\n` +
      `│ › الكوينز: ${data.coins}\n` +
      `│ › الحد الأقصى للمستخدمين: ${data.maxUsers}\n` +
      `│ › انتهاء الصلاحية: ${expiresAt.toLocaleString('ar-EG')}\n` +
      `╯───────∙⋆⋅ ※ ⋅⋆∙`;
    await sendMessage(api, successMsg, threadID);
    return true;
  }

  return false;
}

// تفعيل الكود من قبل اللاعبين
async function handleRedeemCode(api, event, codeText) {
  const { senderID, threadID, messageID } = event;
  const db = getDB();

  const normalizedCode = codeText.trim().toUpperCase();
  const codeDoc = await db.collection('promo_codes').findOne({ code: normalizedCode });

  if (!codeDoc) {
    await sendReply(api, `❌ هذا الكود الترويجي غير صحيح أو غير موجود بالخادم.`, messageID, threadID);
    return true;
  }

  // 1. التحقق من تاريخ انتهاء الصلاحية
  if (new Date() > new Date(codeDoc.expiresAt)) {
    await sendReply(api, `❌ عذراً، انتهت صلاحية هذا الكود بالفعل.`, messageID, threadID);
    return true;
  }

  // 2. التحقق من الحد الأقصى للاستخدامات الكلية
  if (codeDoc.redeemedBy.length >= codeDoc.maxUsers) {
    await sendReply(api, `❌ تم الوصول إلى الحد الأقصى لاستخدام هذا الكود.`, messageID, threadID);
    return true;
  }

  // 3. التحقق مما إذا كان اللاعب قد استخدم الكود مسبقاً
  if (codeDoc.redeemedBy.includes(senderID)) {
    await sendReply(api, `❌ لقد قمت بتفعيل هذا الكود مسبقاً! لا يمكنك استخدامه مجدداً.`, messageID, threadID);
    return true;
  }

  // 4. التحقق من تسجيل اللاعب بالنظام
  const player = await getPlayer(senderID);
  if (!player) {
    await sendReply(api, `❌ أنت غير مسجل في نظام نيكسوس. يرجى التسجيل أولاً للاستفادة من الكود.`, messageID, threadID);
    return true;
  }

  // تحديث مستخدمي الكود وتعديل رصيد كوينز اللاعب
  await db.collection('promo_codes').updateOne(
    { code: normalizedCode },
    { $addToSet: { redeemedBy: senderID } }
  );

  const newCoins = (player.coins || 0) + codeDoc.coins;
  await updatePlayer(senderID, { coins: newCoins });

  const successMsg = `✅ تم تفعيل الكود [${normalizedCode}] بنجاح!\n💰 حصلت على: ${codeDoc.coins} كوينز.\n🪙 رصيدك الحالي: ${newCoins} كوينز.`;
  await sendReply(api, successMsg, messageID, threadID);
  return true;
}

// الفحص السريع والذكي لرسائل اللاعبين بالكامل لمنع الاستعلامات غير الضرورية بقاعدة البيانات
async function handlePlayerCommand(api, event) {
  const text = (event.body || '').trim().toUpperCase();
  
  // فحص ما إذا كانت الرسالة تبدأ بالحرفين المتطابقين (على سبيل المثال: NX)
  // ونقيد الطول (مثلاً بين 4 إلى 20 حرفاً) لضمان عدم حدوث تداخل مع رسائل الدردشة العادية باللغة الإنجليزية
  const regex = new RegExp(`^${CODE_PREFIX}[A-Z0-9_]{2,18}$`);

  if (regex.test(text)) {
    await handleRedeemCode(api, event, text);
    return true; // تم رصد الكود وتفعيله بنجاح
  }
  return false; // الرسالة ليست كوداً ترويجياً، دع البوت يكمل معالجة الأوامر الأخرى بشكل عادي
}

module.exports = {
  handleCreateCodeStart,
  handleCreateCodeSession,
  handleRedeemCode,
  handlePlayerCommand
};