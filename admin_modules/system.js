const { sendMessage } = require('../utils');
const config = require('../config.json');
const { getBotConfig, setBotConfig, getBots, addBot, updateBotCookies, updateBotName, deleteBot, setAdminSession, deleteAdminSession } = require('../database');
const { markBotActive, startAutoRotation, stopAutoRotation, getEnvCUser, getEnvCookies, getEnvBotName, setEnvBotName, switchToBot } = require('../bot_rotation');

let _botEnabled = true;

async function initBotEnabled() {
  try {
    const stored = await getBotConfig('botEnabled');
    _botEnabled = (stored === null || stored === undefined) ? true : Boolean(stored);
  } catch (e) { _botEnabled = true; }
}

function isBotEnabled() { return _botEnabled; }

async function handleBotStop(api, event) {
  _botEnabled = false;
  try { await setBotConfig('botEnabled', false); } catch (e) {}
  await sendMessage(api,
    `╮───∙⋆⋅「 ايقاف البوت 」\n│\n│ › تم ايقاف البوت 🔴\n│ › البوت لن يستجيب لأي أمر الآن\n│ › ارسل 《 تشغيل البوت 》 لإعادة تشغيله\n│\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
    event.threadID);
}

async function handleBotStart(api, event) {
  _botEnabled = true;
  try { await setBotConfig('botEnabled', true); } catch (e) {}
  await sendMessage(api,
    `╮───∙⋆⋅「 تشغيل البوت 」\n│\n│ › تم تشغيل البوت 🟢\n│ › البوت نشط الآن ويستجيب للأوامر\n│\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
    event.threadID);
}

function _envIsAlone(bots, envCUser) {
  if (!envCUser || !getEnvCookies()) return false;
  return !bots.some(b => {
    const cu = b.cookies && (b.cookies.find(x => x.key === 'c_user') || {}).value;
    return cu && String(cu) === envCUser;
  });
}

async function buildBotaatMsg(bots) {
  const activeBotId  = await getBotConfig('activeBotId').catch(() => null);
  const autoEnabled  = await getBotConfig('autoRotateEnabled').catch(() => false);
  const autoMinutes  = await getBotConfig('autoRotateMinutes').catch(() => 0);
  const envCUser     = getEnvCUser();
  const showEnv      = _envIsAlone(bots, envCUser);
  const envName      = showEnv ? await getEnvBotName() : null;

  let msg = `╮───────∙⋆⋅ ※ ⋅⋆∙───────╭\n        ✦  البوتات  ✦\n╯───────∙⋆⋅ ※ ⋅⋆∙───────╰\n\n`;
  msg += `╮───∙⋆⋅「 القائمة 」\n│\n`;

  const allBots = [...bots];
  let counter = 1;

  allBots.forEach(b => {
    const isActive = activeBotId && String(b._id) === String(activeBotId);
    const isFailed = b.status === 'failed';
    let tag = '';
    if (isActive)  tag = ' ✦ الحالي';
    else if (isFailed) tag = ' ⛔ فشل';
    msg += `│ ${counter++}. ${b.name}${tag}\n`;
  });

  if (showEnv) {
    const isEnvActive = (activeBotId === 'ENV');
    msg += `│ ${counter++}. ${envName}${isEnvActive ? ' ✦ الحالي' : ''} 📌\n`;
  }

  if (bots.length === 0 && !showEnv) msg += `│ › لا يوجد بوتات مضافة بعد\n`;

  const rotateStr = autoEnabled ? `🟢 كل ${autoMinutes} دقيقة` : '🔴 معطّل';
  msg += `│\n╯───────∙⋆⋅ ※ ⋅⋆∙\n\n`;
  msg += `╮───∙⋆⋅「 التبديل التلقائي Nus 」\n│ › الحالة : ${rotateStr}\n╯───────∙⋆⋅ ※ ⋅⋆∙\n\n`;
  msg += `╮───∙⋆⋅「 الخيارات 」\n│ › ارسل رقم البوت لإدارته\n│ › ارسل 《 إضافة 》 لإضافة بوت جديد\n│ › ارسل 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`;
  return msg;
}

async function handleBotaat(api, event) {
  const { threadID, senderID } = event;
  const bots    = await getBots();
  const envCUser = getEnvCUser();
  const showEnv  = _envIsAlone(bots, envCUser);
  const envName  = showEnv ? await getEnvBotName() : null;

  const sessionBots = bots.map(b => ({ _id: String(b._id), name: b.name, status: b.status || 'active', isEnv: false }));
  if (showEnv) sessionBots.push({ _id: 'ENV', name: envName, status: 'active', isEnv: true });

  await setAdminSession(senderID, { state: 'BOTAAT_MAIN', bots: sessionBots });
  await sendMessage(api, await buildBotaatMsg(bots), threadID);
}

async function handleBotaatSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();

  if (text === 'خروج') {
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'BOTAAT_MAIN') {
    if (text === 'إضافة' || text === 'اضافة') {
      await setAdminSession(senderID, { state: 'BOTAAT_ADD_NAME' });
      await sendMessage(api, `╮───∙⋆⋅「 إضافة بوت 」\n│\n│ › ارسل اسم البوت الجديد\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      return;
    }
    const bots = session.bots || [];
    const idx  = parseInt(text, 10) - 1;
    if (!isNaN(idx) && idx >= 0 && idx < bots.length) {
      const bot = bots[idx];
      await setAdminSession(senderID, { state: 'BOTAAT_BOT_MENU', selBotId: bot._id, selBotName: bot.name, selIsEnv: bot.isEnv || false });
      if (bot.isEnv) {
        await sendMessage(api,
          `╮───∙⋆⋅「 ${bot.name} 📌 」\n│\n│ 1 › تعديل الاسم\n│\n│ ⚠️ هذا الحساب موجود في المتغير البيئي\n│    ولا يمكن حذفه من هنا\n│\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
          threadID);
      } else {
        await sendMessage(api,
          `╮───∙⋆⋅「 ${bot.name} 」\n│\n│ 1 › تعديل الكوكيز\n│ 2 › تعديل الاسم\n│ 3 › حذف البوت\n│\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
          threadID);
      }
      return;
    }
    await sendMessage(api, `⚠️ ارسل رقم بوت، او 《 إضافة 》، او 《 خروج 》`, threadID);
    return;
  }

  if (session.state === 'BOTAAT_BOT_MENU') {
    const isEnv = session.selIsEnv || false;

    if (isEnv) {
      if (text === '1') {
        await setAdminSession(senderID, { state: 'BOTAAT_RENAME', renBotId: 'ENV', renBotName: session.selBotName, renIsEnv: true });
        await sendMessage(api, `╮───∙⋆⋅「 تعديل اسم 📌 › ${session.selBotName} 」\n│\n│ › ارسل الاسم الجديد\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
        return;
      }
      await sendMessage(api, `⚠️ اختر 1 أو 《 خروج 》`, threadID);
      return;
    }

    if (text === '1') {
      await setAdminSession(senderID, { state: 'BOTAAT_EDIT_COOKIES', editBotId: session.selBotId, editBotName: session.selBotName });
      await sendMessage(api, `╮───∙⋆⋅「 تعديل كوكيز › ${session.selBotName} 」\n│\n│ › ارسل الكوكيز الجديدة (JSON)\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      return;
    }
    if (text === '2') {
      await setAdminSession(senderID, { state: 'BOTAAT_RENAME', renBotId: session.selBotId, renBotName: session.selBotName, renIsEnv: false });
      await sendMessage(api, `╮───∙⋆⋅「 تعديل اسم › ${session.selBotName} 」\n│\n│ › ارسل الاسم الجديد\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      return;
    }
    if (text === '3') {
      await setAdminSession(senderID, { state: 'BOTAAT_DELETE_CONFIRM', delBotId: session.selBotId, delBotName: session.selBotName });
      await sendMessage(api,
        `╮───∙⋆⋅「 حذف بوت 」\n│\n│ › البوت : ${session.selBotName}\n│\n│ › ارسل 《 تأكيد 》 للحذف\n│ › او 《 خروج 》 للإلغاء\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
        threadID);
      return;
    }
    await sendMessage(api, `⚠️ اختر 1 أو 2 أو 3 أو 《 خروج 》`, threadID);
    return;
  }

  if (session.state === 'BOTAAT_ADD_NAME') {
    await setAdminSession(senderID, { state: 'BOTAAT_ADD_COOKIES', newBotName: text });
    await sendMessage(api, `╮───∙⋆⋅「 ${text} 」\n│\n│ › ارسل الكوكيز الخاصة بهذا البوت (JSON)\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'BOTAAT_ADD_COOKIES') {
    try {
      const c = JSON.parse(text);
      await addBot(session.newBotName, c);
      await deleteAdminSession(senderID);
      await sendMessage(api, `╮───∙⋆⋅「 تمت الإضافة ✅️ 」\n│\n│ › ${session.newBotName}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    } catch (e) {
      await sendMessage(api, `⚠️ الكوكيز غير صالحة، تأكد أنها JSON صحيح`, threadID);
    }
    return;
  }

  if (session.state === 'BOTAAT_EDIT_COOKIES') {
    try {
      const c = JSON.parse(text);
      await updateBotCookies(session.editBotId, c);
      await markBotActive(session.editBotId);
      await deleteAdminSession(senderID);
      await sendMessage(api, `╮───∙⋆⋅「 تم التعديل ✅️ 」\n│\n│ › ${session.editBotName}\n│ › تم تفعيله مجدداً 🟢\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    } catch (e) {
      await sendMessage(api, `⚠️ الكوكيز غير صالحة، تأكد أنها JSON صحيح`, threadID);
    }
    return;
  }

  if (session.state === 'BOTAAT_RENAME') {
    if (!text || text.length < 1) { await sendMessage(api, `⚠️ الاسم قصير جداً`, threadID); return; }
    if (session.renIsEnv) {
      await setEnvBotName(text);
    } else {
      await updateBotName(session.renBotId, text);
    }
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم تعديل الاسم ✅️ 」\n│\n│ › القديم : ${session.renBotName}\n│ › الجديد : ${text}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'BOTAAT_DELETE_CONFIRM') {
    if (text === 'تأكيد') {
      await deleteBot(session.delBotId);
      const activeBotId = await getBotConfig('activeBotId').catch(() => null);
      if (activeBotId && String(activeBotId) === String(session.delBotId)) {
        await setBotConfig('activeBotId', null).catch(() => {});
      }
      await deleteAdminSession(senderID);
      await sendMessage(api, `╮───∙⋆⋅「 تم الحذف 🗑️ 」\n│\n│ › ${session.delBotName}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    } else {
      await deleteAdminSession(senderID);
      await sendMessage(api, `╮───∙⋆⋅「 إلغاء 」\n│\n│ › تم إلغاء الحذف\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    }
    return;
  }
}

async function handleTabdeel(api, event) {
  const { threadID, senderID } = event;
  const bots        = await getBots();
  const activeBotId = await getBotConfig('activeBotId').catch(() => null);
  const autoEnabled = await getBotConfig('autoRotateEnabled').catch(() => false);
  const autoMinutes = await getBotConfig('autoRotateMinutes').catch(() => 0);
  const envCUser    = getEnvCUser();
  const showEnv     = _envIsAlone(bots, envCUser);
  const envName     = showEnv ? await getEnvBotName() : null;

  let msg = `╮───────∙⋆⋅ ※ ⋅⋆∙───────╭\n      ✦  تبديل البوت  ✦\n╯───────∙⋆⋅ ※ ⋅⋆∙───────╰\n\n`;
  msg += `╮───∙⋆⋅「 البوتات 」\n│\n`;

  let counter = 1;
  bots.forEach(b => {
    const isActive = activeBotId && String(b._id) === String(activeBotId);
    const isFailed = b.status === 'failed';
    let tag = '';
    if (isActive)      tag = ' ✦ الحالي';
    else if (isFailed) tag = ' ⛔ فشل';
    msg += `│ ${counter++}. ${b.name}${tag}\n`;
  });

  if (showEnv) {
    const isEnvActive = (activeBotId === 'ENV');
    msg += `│ ${counter++}. ${envName}${isEnvActive ? ' ✦ الحالي' : ''} 📌\n`;
  }

  if (bots.length === 0 && !showEnv) msg += `│ › لا يوجد بوتات\n`;
  msg += `│\n╯───────∙⋆⋅ ※ ⋅⋆∙\n\n`;

  const rotateStr = autoEnabled ? `🟢 مُفعّل — كل ${autoMinutes} دقيقة` : '🔴 معطّل';
  msg += `╮───∙⋆⋅「 التبديل التلقائي 」\n│ › ${rotateStr}\n╯───────∙⋆⋅ ※ ⋅⋆∙\n\n`;
  msg += `╮───∙⋆⋅「 الخيارات 」\n│ › ارسل رقم البوت للتبديل اليدوي\n│ › 《 تلقائي [دقائق] 》 — تفعيل التبديل التلقائي\n│ › 《 إيقاف تلقائي 》 — إيقاف التبديل التلقائي\n│ › 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`;

  const sessionBots = bots.map(b => ({ _id: String(b._id), name: b.name, status: b.status || 'active', isEnv: false }));
  if (showEnv) sessionBots.push({ _id: 'ENV', name: envName, status: 'active', isEnv: true });

  await setAdminSession(senderID, { state: 'TABDEEL_SELECT', bots: sessionBots });
  await sendMessage(api, msg, threadID);
}

async function handleTabdeelSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();

  if (text === 'خروج') {
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (text === 'إيقاف تلقائي' || text === 'ايقاف تلقائي') {
    await stopAutoRotation();
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 التبديل التلقائي 」\n│\n│ › تم الإيقاف 🔴\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  const autoMatch = text.match(/^تلقائي\s+(\d+)$/);
  if (autoMatch) {
    const minutes = parseInt(autoMatch[1], 10);
    if (minutes < 1 || minutes > 10080) {
      await sendMessage(api, `⚠️ المدة يجب أن تكون بين 1 و 10080 دقيقة`, threadID);
      return;
    }
    const bots = await getBots();
    const active = bots.filter(b => b.status !== 'failed' && b.cookies && b.cookies.length > 0);
    if (active.length < 2) {
      await sendMessage(api, `⚠️ يجب وجود حسابين صالحين على الأقل للتبديل التلقائي`, threadID);
      return;
    }
    await startAutoRotation(minutes, () => {
      setTimeout(() => process.exit(0), 1500);
    });
    await deleteAdminSession(senderID);
    await sendMessage(api,
      `╮───∙⋆⋅「 التبديل التلقائي 」\n│\n│ › تم التفعيل 🟢\n│ › سيتم التبديل كل ${minutes} دقيقة\n│ › عدد الحسابات : ${active.length}\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
      threadID);
    return;
  }

  const bots = session.bots || [];
  const idx  = parseInt(text, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= bots.length) {
    await sendMessage(api, `⚠️ ارسل رقم بوت، او 《 تلقائي [دقائق] 》، او 《 إيقاف تلقائي 》، او 《 خروج 》`, threadID);
    return;
  }

  const bot = bots[idx];
  const activeBotId = await getBotConfig('activeBotId').catch(() => null);

  if (bot.isEnv) {
    if (activeBotId === 'ENV') {
      await deleteAdminSession(senderID);
      await sendMessage(api, `╮───∙⋆⋅「 تبديل 」\n│\n│ › ${bot.name} هو الحساب المستخدم حالياً ✦ 📌\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      return;
    }
    await setBotConfig('activeBotId', 'ENV').catch(() => {});
    await setBotConfig('restartNotifyThread', threadID).catch(() => {});
    await deleteAdminSession(senderID);
    await sendMessage(api,
      `╮───∙⋆⋅「 تبديل البوت 」\n│\n│ › تم الاختيار : ${bot.name} 📌\n│ › جارِ إعادة التشغيل... ⟳\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
      threadID).catch(() => {});
    setTimeout(() => process.exit(0), 2000);
    return;
  }

  if (activeBotId && String(activeBotId) === String(bot._id)) {
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تبديل 」\n│\n│ › ${bot.name} هو الحساب المستخدم حالياً ✦\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  await switchToBot(bot._id);
  await setBotConfig('restartNotifyThread', threadID).catch(() => {});
  await deleteAdminSession(senderID);
  await sendMessage(api,
    `╮───∙⋆⋅「 تبديل البوت 」\n│\n│ › تم الاختيار : ${bot.name}\n│ › جارِ إعادة التشغيل... ⟳\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
    threadID).catch(() => {});
  setTimeout(() => process.exit(0), 2000);
}

async function handleReset(api, event) {
  await setBotConfig('restartNotifyThread', event.threadID);

  const RESTART_MSG =
    `‌\n` +
    `╮─〔جاري اعادة التشغيل ⚠️ 〕─╭\n` +
    `⎔ سيتم اعادة تشغيل البوت سيتوقف عن العمل لمدة 10 الى 20 ثانية ...\n` +
    `╯──────────────────╰`;

  const groupIds = Object.values(config.groupes || {}).map(String).filter(Boolean);
  for (const gid of groupIds) {
    try {
      await sendMessage(api, RESTART_MSG, gid);
    } catch (e) {}
  }

  setTimeout(() => process.exit(0), 2000);
}

module.exports = {
  initBotEnabled,
  isBotEnabled,
  handleBotStop,
  handleBotStart,
  handleBotaat,
  handleBotaatSession,
  handleTabdeel,
  handleTabdeelSession,
  handleReset
};