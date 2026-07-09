const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { sendMessage, kingdomNamesAr, generateNickname } = require('../utils');
const { getGroupSetting, updateGroupSetting, getAllPlayers, setAdminSession, deleteAdminSession, getDB } = require('../database');
const { setTitle, downloadPhoto, addUserToGroup } = require('./helpers');

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// دالة مساعدة لحساب الكنيات ديناميكياً لتشمل حالات الإنعاش والتجاهل في إعادة الضبط
async function _getDynamicNickname(player) {
  const baseRank = player.rank || 'متدرب';
  let nick = generateNickname(player.nickname, baseRank, player.class, player.warnings || 0);

  // 1. فحص حالة الإنعاش 🏥
  const isRecovery = player.recoveryUntil && new Date(player.recoveryUntil).getTime() > Date.now();
  if (isRecovery) {
    nick += ' 🏥';
  }

  // 2. فحص حالة التجاهل والكتم 🔇
  try {
    const isIgnored = await getDB().collection('ignored_players').findOne({ fbId: String(player.fbId) });
    if (isIgnored) {
      if (!nick.includes('🔇')) {
        nick += ' 🔇';
      }
    }
  } catch(e) {}

  return nick;
}

// تغيير كنية آمن لمنع حظر الطلبات السريعة
async function _changeNicknameSafe(api, nickname, threadID, userId, attempts = 3, delayMs = 1200) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        api.changeNickname(nickname, String(threadID), String(userId), (err) => {
          if (err) reject(err); else resolve();
        });
      });
      return true;
    } catch (e) {
      if (i === attempts) {
        console.error(`❌ فشل نهائي في تغيير كنية ${userId} في ${threadID} بعد ${attempts} محاولات:`, e.message || e);
        return false;
      }
      await _sleep(delayMs);
    }
  }
  return false;
}

async function handleTa3deel(api, event) {
  const { threadID, senderID } = event;
  const botNickSetting = await getGroupSetting('bot_global');
  const currentBotNick = (botNickSetting && botNickSetting.botNickname) ? botNickSetting.botNickname : 'غير محدد';
  await setAdminSession(senderID, { state: 'DATA_MAIN' });
  await sendMessage(api,
    `╮───────∙⋆⋅ ※ ⋅⋆∙───────╭\n         ✦ تعديل القروبات ✦\n╯───────∙⋆⋅ ※ ⋅⋆∙───────╰\n\n` +
    `╮───∙⋆⋅「 الخيارات 」\n│ 1 › تعديل اسم سولفارا (العاصمة)\n│ 2 › تعديل اسم نيرافيل (العاصمة)\n│ 3 › تعديل اسم مورداك (العاصمة)\n` +
    `│ 4 › تعديل صورة سولفارا (العاصمة)\n│ 5 › تعديل صورة نيرافيل (العاصمة)\n│ 6 › تعديل صورة مورداك (العاصمة)\n` +
    `│ 7 › تعديل كنية البوت (على جميع المجموعات)\n` +
    `│    ↳ الحالية: ${currentBotNick}\n` +
    `│ 8 › 🏙️ إدارة مدن الممالك (أفرع الممالك الثلاث)\n` +
    `│ 9 › خروج\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
    threadID);
}

async function handleDataSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();
  if (text === 'خروج' || text === '9') { await deleteAdminSession(senderID); await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return; }
  
  if (session.state === 'DATA_MAIN') {
    const kMap = { '1':'solfare','2':'niravil','3':'murdak','4':'solfare','5':'niravil','6':'murdak' };
    if (['1','2','3'].includes(text)) {
      await setAdminSession(senderID, { state: 'DATA_AWAIT_NAME', kingdom: kMap[text] });
      await sendMessage(api, `╮───∙⋆⋅「 تعديل الاسم 」\n│\n│ › ارسل الاسم الجديد لـ ${kingdomNamesAr[kMap[text]]}\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return;
    }
    if (['4','5','6'].includes(text)) {
      await setAdminSession(senderID, { state: 'DATA_AWAIT_PHOTO', kingdom: kMap[text] });
      await sendMessage(api, `╮───∙⋆⋅「 تعديل الصورة 」\n│\n│ › ارسل الصورة الجديدة لـ ${kingdomNamesAr[kMap[text]]}\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return;
    }
    if (text === '7') {
      const s = await getGroupSetting('bot_global');
      const cur = (s && s.botNickname) ? s.botNickname : 'غير محدد';
      await setAdminSession(senderID, { state: 'DATA_AWAIT_BOT_NICK' });
      await sendMessage(api, `╮───∙⋆⋅「 تعديل كنية البوت 」\n│\n│ › الكنية الحالية : ${cur}\n│\n│ › ارسل الكنية الجديدة للبوت\n│ › (ستُطبق على جميع القروبات)\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return;
    }
    if (text === '8') {
      await setAdminSession(senderID, { state: 'CITIES_MAIN' });
      const msg = 
        `╮───────∙⋆⋅ ※ ⋅⋆∙───────╭\n      ✦ إدارة مدن الممالك ✦\n╯───────∙⋆⋅ ※ ⋅⋆∙───────╰\n\n` +
        `╮───∙⋆⋅「 الخيارات 」\n` +
        `│ 1 › عرض كافة المدن الحالية وتفاصيلها\n` +
        `│ 2 › إضافة مدينة جديدة (فرع تحت مملكة)\n` +
        `│ 3 › تعديل بيانات مدينة مسجلة\n` +
        `│ 4 › حذف مدينة\n` +
        `│ 5 › رجوع للقائمة السابقة\n` +
        `╯───────∙⋆⋅ ※ ⋅⋆∙`;
      await sendMessage(api, msg, threadID);
      return;
    }
    await sendMessage(api, `⚠️ اختر رقماً من 1 إلى 9`, threadID); return;
  }
  
  if (session.state === 'DATA_AWAIT_NAME') {
    const k = session.kingdom;
    await updateGroupSetting(k, { customName: text, defaultName: text });
    const gid = config.groupes[k]; if (gid) await setTitle(api, text, gid);
    try {
      const { snapshotGroupNames } = require('./protection');
      await snapshotGroupNames();
    } catch (e) { console.error('خطأ تحديث snapshot الأسماء:', e.message); }
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم التعديل 」\n│\n│ › اسم ${kingdomNamesAr[k]} : ${text}\n│ › تم حفظه كاسم افتراضي ✅️\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return;
  }
  
  if (session.state === 'DATA_AWAIT_PHOTO') {
    const k = session.kingdom;
    const photo = (event.attachments || []).find(a => a.type === 'photo' || a.type === 'sticker');
    if (!photo) { await sendMessage(api, `⚠️ لم يتم إرسال صورة، أرسل صورة أو 《 خروج 》`, threadID); return; }
    const photoUrl = photo.url || photo.previewUrl || photo.largePreviewUrl;
    if (!photoUrl) { await sendMessage(api, `⚠️ تعذر الحصول على رابط الصورة`, threadID); return; }
    const gid = config.groupes[k];
    const tmp = path.join(require('os').tmpdir(), `group_photo_${Date.now()}.jpg`);
    let photoBase64 = null;
    try {
      await downloadPhoto(photoUrl, tmp);
      photoBase64 = require('fs').readFileSync(tmp).toString('base64');
    } catch (e) { console.error('خطأ تنزيل صورة القروب:', e); }
    await updateGroupSetting(k, { photoUrl, defaultPhotoUrl: photoUrl, photoBase64 });
    try {
      const { snapshotGroupPhotos } = require('./protection');
      await snapshotGroupPhotos();
    } catch (e) { console.error('خطأ تحديث snapshot الصور:', e.message); }
    if (gid && photoBase64) {
      try {
        await new Promise(r => api.changeGroupImage(fs.createReadStream(tmp), gid, () => { try { require('fs').unlinkSync(tmp); } catch (_) {} r(); }));
      } catch (e) { console.error('خطأ تغيير صورة القروب:', e); }
    } else { try { require('fs').unlinkSync(tmp); } catch (_) {} }
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم التعديل 」\n│\n│ › تم تحديث صورة ${kingdomNamesAr[k]} ✅️\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return;
  }
  
  if (session.state === 'DATA_AWAIT_BOT_NICK') {
    if (!text || text.length < 1) { await sendMessage(api, `⚠️ الكنية قصيرة جداً`, threadID); return; }
    await updateGroupSetting('bot_global', { botNickname: text });
    const botId = api.getCurrentUserID ? (typeof api.getCurrentUserID === 'function' ? api.getCurrentUserID() : api.getCurrentUserID) : null;
    if (botId) {
      for (const gid of Object.values(config.groupes).filter(Boolean)) {
        try { await new Promise(r => api.changeNickname(text, String(gid), String(botId), () => r())); } catch(e) {}
      }
    }
    try {
      const { snapshotBotNickname } = require('./protection');
      await snapshotBotNickname();
    } catch(e) {}
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم التعديل ✅️ 」\n│\n│ › كنية البوت الجديدة : ${text}\n│ › تم تطبيقها على جميع القروبات\n│ › تم حفظها كقيمة افتراضية\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return;
  }
}

async function handleCitiesSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();
  const db = getDB();
  
  if (text === 'خروج') {
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }
  
  if (session.state === 'CITIES_MAIN') {
    if (text === '1') {
      const cities = await db.collection('cities').find().toArray();
      if (cities.length === 0) {
        await sendMessage(api, `╮───∙⋆⋅「 المدن المسجلة 」\n│\n│ › لا توجد أي مدن حالياً في قاعدة البيانات.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
        return;
      }
      let m = `╮───∙⋆⋅「 المدن الحالية 」\n`;
      cities.forEach((c, i) => {
        m += `│ ${i + 1}. ${c.name} (تابعة لـ: ${kingdomNamesAr[c.kingdom]})\n│    ↳ اسم القروب: ${c.groupName || c.name}\n│    ↳ ID: ${c.threadId}\n`;
      });
      m += `╯───────∙⋆⋅ ※ ⋅⋆∙`;
      await sendMessage(api, m, threadID);
      return;
    }
    if (text === '2') {
      await setAdminSession(senderID, { state: 'CITIES_ADD_KINGDOM' });
      await sendMessage(api, `╮───∙⋆⋅「 إضافة مدينة 」\n│\n│ اختر المملكة التي ستتبع لها هذه المدينة:\n│ 1 › سولفارا\n│ 2 › نيرافيل\n│ 3 › مورداك\n│\n│ › او اكتب 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      return;
    }
    if (text === '3') {
      const cities = await db.collection('cities').find().toArray();
      if (cities.length === 0) {
        await sendMessage(api, `⚠️ لا توجد مدن مسجلة حالياً لتعديلها.`, threadID);
        return;
      }
      let m = `╮───∙⋆⋅「 تعديل مدينة 」\n│\n`;
      cities.forEach((c, i) => {
        m += `│ ${i + 1}. ${c.name} [مملكة ${kingdomNamesAr[c.kingdom]}]\n│    ↳ القروب: ${c.groupName || c.name}\n`;
      });
      m += `│\n│ › ارسل رقم المدينة لتعديلها\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`;
      await setAdminSession(senderID, { state: 'CITIES_EDIT_SELECT', citiesList: cities });
      await sendMessage(api, m, threadID);
      return;
    }
    if (text === '4') {
      const cities = await db.collection('cities').find().toArray();
      if (cities.length === 0) {
        await sendMessage(api, `⚠️ لا توجد مدن مسجلة لحذفها.`, threadID);
        return;
      }
      let m = `╮───∙⋆⋅「 حذف مدينة 」\n│\n`;
      cities.forEach((c, i) => {
        m += `│ ${i + 1}. ${c.name} [مملكة ${kingdomNamesAr[c.kingdom]}]\n│    ↳ القروب: ${c.groupName || c.name}\n`;
      });
      m += `│\n│ › ارسل رقم المدينة لحذفها نهائياً\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`;
      await setAdminSession(senderID, { state: 'CITIES_DELETE_SELECT', citiesList: cities });
      await sendMessage(api, m, threadID);
      return;
    }
    if (text === '5') {
      await deleteAdminSession(senderID);
      await handleTa3deel(api, event);
      return;
    }
    await sendMessage(api, `⚠️ الرجاء اختيار خيار صحيح من القائمة (1 - 5).`, threadID);
    return;
  }
  
  if (session.state === 'CITIES_ADD_KINGDOM') {
    const kMap = { '1': 'solfare', '2': 'niravil', '3': 'murdak' };
    const k = kMap[text];
    if (!k) {
      await sendMessage(api, `⚠️ خيار غير صحيح. اختر من (1 - 3).`, threadID);
      return;
    }
    await setAdminSession(senderID, { state: 'CITIES_ADD_AWAIT_NAME', kingdom: k });
    await sendMessage(api,
      `╮───∙⋆⋅「 إضافة مدينة - الخطوة 1/3 」\n│\n` +
      `│ › المملكة: ${kingdomNamesAr[k]}\n│\n` +
      `│ ارسل اسم المدينة كما سيظهر في الخريطة:\n` +
      `│ (هذا الاسم لن يتغير تلقائياً)\n│\n` +
      `│ › او اكتب 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }
  
  if (session.state === 'CITIES_ADD_AWAIT_NAME') {
    if (!text || text.length < 2) {
      await sendMessage(api, `⚠️ اسم المدينة قصير جداً، حاول مجدداً.`, threadID);
      return;
    }
    await setAdminSession(senderID, { state: 'CITIES_ADD_AWAIT_GROUP_NAME', kingdom: session.kingdom, cityName: text });
    await sendMessage(api,
      `╮───∙⋆⋅「 إضافة مدينة - الخطوة 2/3 」\n│\n` +
      `│ › اسم المدينة (الخريطة): ${text}\n│\n` +
      `│ ارسل اسم القروب الفعلي:\n` +
      `│ (هذا الاسم سيُطبق على القروب وقد يتغير)\n│\n` +
      `│ › او اكتب 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'CITIES_ADD_AWAIT_GROUP_NAME') {
    if (!text || text.length < 2) {
      await sendMessage(api, `⚠️ اسم القروب قصير جداً، حاول مجدداً.`, threadID);
      return;
    }
    await setAdminSession(senderID, { state: 'CITIES_ADD_AWAIT_THREAD_ID', kingdom: session.kingdom, cityName: session.cityName, groupName: text });
    await sendMessage(api,
      `╮───∙⋆⋅「 إضافة مدينة - الخطوة 3/3 」\n│\n` +
      `│ › اسم المدينة (الخريطة): ${session.cityName}\n` +
      `│ › اسم القروب الفعلي: ${text}\n│\n` +
      `│ ارسل ايدي القروب (Thread ID) الخاص بهذه المدينة:\n` +
      `│ (تأكد من صحة الايدي لتجنب المشاكل)\n│\n` +
      `│ › او اكتب 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'CITIES_ADD_AWAIT_THREAD_ID') {
    if (!text || !/^[0-9]+$/.test(text)) {
      await sendMessage(api, `⚠️ ايدي القروب غير صحيح. يجب أن يكون أرقاماً فقط.`, threadID);
      return;
    }
    const threadId = text;
    const { kingdom, cityName, groupName } = session;
    
    const existingCity = await db.collection('cities').findOne({ threadId });
    if (existingCity) {
      await sendMessage(api, `⚠️ هذا الايدي (${threadId}) مسجل بالفعل لمدينة ${existingCity.name}.`, threadID);
      return;
    }

    await db.collection('cities').insertOne({ kingdom, name: cityName, groupName, threadId });
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم إضافة مدينة جديدة ✅ 」\n│\n│ › المدينة: ${cityName}\n│ › المملكة: ${kingdomNamesAr[kingdom]}\n│ › القروب: ${groupName}\n│ › الايدي: ${threadId}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'CITIES_EDIT_SELECT') {
    const idx = parseInt(text, 10) - 1;
    const list = session.citiesList || [];
    if (isNaN(idx) || idx < 0 || idx >= list.length) {
      await sendMessage(api, `⚠️ رقم غير صحيح من القائمة.`, threadID);
      return;
    }
    const selectedCity = list[idx];
    await setAdminSession(senderID, { state: 'CITIES_EDIT_MAIN', selectedCity });
    await sendMessage(api,
      `╮───∙⋆⋅「 تعديل مدينة: ${selectedCity.name} 」\n│\n` +
      `│ 1 › تعديل اسم المدينة (الخريطة)\n` +
      `│ 2 › تعديل اسم القروب الفعلي\n` +
      `│ 3 › تعديل ايدي القروب (Thread ID)\n` +
      `│ 4 › رجوع للقائمة السابقة\n` +
      `│\n` +
      `│ › او اكتب 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'CITIES_EDIT_MAIN') {
    const { selectedCity } = session;
    if (text === '4' || text === 'رجوع') {
      await deleteAdminSession(senderID);
      await handleCitiesSession(api, event, { state: 'CITIES_MAIN' }); // Simulate going back to main cities menu
      return;
    }
    if (text === '1') {
      await setAdminSession(senderID, { state: 'CITIES_EDIT_AWAIT_NAME', selectedCity });
      await sendMessage(api, `╮───∙⋆⋅「 تعديل اسم المدينة 」\n│\n│ › الاسم الحالي: ${selectedCity.name}\n│ › ارسل الاسم الجديد:\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      return;
    }
    if (text === '2') {
      await setAdminSession(senderID, { state: 'CITIES_EDIT_AWAIT_GROUP_NAME', selectedCity });
      await sendMessage(api, `╮───∙⋆⋅「 تعديل اسم القروب 」\n│\n│ › الاسم الحالي: ${selectedCity.groupName}\n│ › ارسل الاسم الجديد:\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      return;
    }
    if (text === '3') {
      await setAdminSession(senderID, { state: 'CITIES_EDIT_AWAIT_THREAD_ID', selectedCity });
      await sendMessage(api, `╮───∙⋆⋅「 تعديل ايدي القروب 」\n│\n│ › الايدي الحالي: ${selectedCity.threadId}\n│ › ارسل الايدي الجديد:\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      return;
    }
    await sendMessage(api, `⚠️ الرجاء اختيار خيار صحيح من القائمة (1 - 4).`, threadID);
    return;
  }

  if (session.state === 'CITIES_EDIT_AWAIT_NAME') {
    const { selectedCity } = session;
    if (!text || text.length < 2) {
      await sendMessage(api, `⚠️ اسم المدينة قصير جداً، حاول مجدداً.`, threadID);
      return;
    }
    await db.collection('cities').updateOne({ _id: selectedCity._id }, { $set: { name: text } });
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم التعديل ✅ 」\n│\n│ › تم تحديث اسم المدينة من ${selectedCity.name} إلى ${text}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'CITIES_EDIT_AWAIT_GROUP_NAME') {
    const { selectedCity } = session;
    if (!text || text.length < 2) {
      await sendMessage(api, `⚠️ اسم القروب قصير جداً، حاول مجدداً.`, threadID);
      return;
    }
    await db.collection('cities').updateOne({ _id: selectedCity._id }, { $set: { groupName: text } });
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم التعديل ✅ 」\n│\n│ › تم تحديث اسم القروب من ${selectedCity.groupName} إلى ${text}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'CITIES_EDIT_AWAIT_THREAD_ID') {
    const { selectedCity } = session;
    if (!text || !/^[0-9]+$/.test(text)) {
      await sendMessage(api, `⚠️ ايدي القروب غير صحيح. يجب أن يكون أرقاماً فقط.`, threadID);
      return;
    }
    const existingCity = await db.collection('cities').findOne({ threadId: text });
    if (existingCity && String(existingCity._id) !== String(selectedCity._id)) {
      await sendMessage(api, `⚠️ هذا الايدي (${text}) مسجل بالفعل لمدينة ${existingCity.name}.`, threadID);
      return;
    }
    await db.collection('cities').updateOne({ _id: selectedCity._id }, { $set: { threadId: text } });
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم التعديل ✅ 」\n│\n│ › تم تحديث ايدي القروب من ${selectedCity.threadId} إلى ${text}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'CITIES_DELETE_SELECT') {
    const idx = parseInt(text, 10) - 1;
    const list = session.citiesList || [];
    if (isNaN(idx) || idx < 0 || idx >= list.length) {
      await sendMessage(api, `⚠️ رقم غير صحيح من القائمة.`, threadID);
      return;
    }
    const cityToDelete = list[idx];
    await db.collection('cities').deleteOne({ _id: cityToDelete._id });
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم الحذف ✅ 」\n│\n│ › تم حذف مدينة ${cityToDelete.name} بنجاح.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }
}

async function handleBotGroups(api, event) {
  const { threadID, senderID } = event;
  const db = getDB();
  const botGroups = await db.collection('bot_groups').find().toArray();

  if (botGroups.length === 0) {
    await sendMessage(api, `╮───∙⋆⋅「 قروبات البوت 」\n│\n│ › لا توجد أي قروبات مسجلة حالياً للبوت.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  let msg = `╮───∙⋆⋅「 قروبات البوت المسجلة 」\n`;
  botGroups.forEach((g, i) => {
    msg += `│ ${i + 1}. ${g.name} (ID: ${g.threadId})\n`;
  });
  msg += `╯───────∙⋆⋅ ※ ⋅⋆∙`;
  await sendMessage(api, msg, threadID);
}

async function handleBotGroupsSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();
  const db = getDB();

  if (text === 'خروج') {
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'BOT_GROUPS_MAIN') {
    // Logic for managing bot groups (add, remove, list)
    // This part is not fully implemented in the provided snippet, but would go here.
    await sendMessage(api, `⚠️ هذه الوظيفة قيد التطوير.`, threadID);
    return;
  }
}

async function handleEadatDabt(api, event) {
  const { threadID, senderID } = event;
  await setAdminSession(senderID, { state: 'RESET_MAIN' });
  await sendMessage(api,
    `╮───────∙⋆⋅ ※ ⋅⋆∙───────╭\n      ✦ إعادة ضبط إعدادات ✦\n╯───────∙⋆⋅ ※ ⋅⋆∙───────╰\n\n` +
    `╮───∙⋆⋅「 الخيارات 」\n` +
    `│ 1 › إعادة ضبط أسماء القروبات\n` +
    `│ 2 › إعادة ضبط صور القروبات\n` +
    `│ 3 › إعادة ضبط كنية البوت\n` +
    `│ 4 › إعادة ضبط جميع الكنيات للاعبين\n` +
    `│ 5 › رجوع\n` +
    `╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
}

async function handleEadatDabtSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();

  if (text === '5' || text === 'رجوع' || text === 'خروج') {
    await deleteAdminSession(senderID);
    await handleTa3deel(api, event);
    return;
  }

  if (session.state === 'RESET_MAIN') {
    if (text === '1') {
      await sendMessage(api, `⏳ جاري إعادة ضبط أسماء القروبات...`, threadID);
      try {
        const { snapshotGroupNames } = require('./protection');
        await snapshotGroupNames(true); // true to force reset
        await deleteAdminSession(senderID);
        await sendMessage(api, `╮───∙⋆⋅「 تم إعادة الضبط ✅ 」\n│\n│ › تم إعادة ضبط أسماء القروبات بنجاح.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      } catch (e) {
        await deleteAdminSession(senderID);
        await sendMessage(api, `❌ فشل إعادة ضبط أسماء القروبات: ${e.message || e}`, threadID);
      }
      return;
    }
    if (text === '2') {
      await sendMessage(api, `⏳ جاري إعادة ضبط صور القروبات...`, threadID);
      try {
        const { snapshotGroupPhotos } = require('./protection');
        await snapshotGroupPhotos(true); // true to force reset
        await deleteAdminSession(senderID);
        await sendMessage(api, `╮───∙⋆⋅「 تم إعادة الضبط ✅ 」\n│\n│ › تم إعادة ضبط صور القروبات بنجاح.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      } catch (e) {
        await deleteAdminSession(senderID);
        await sendMessage(api, `❌ فشل إعادة ضبط صور القروبات: ${e.message || e}`, threadID);
      }
      return;
    }
    if (text === '3') {
      await sendMessage(api, `⏳ جاري إعادة ضبط كنية البوت...`, threadID);
      try {
        const { snapshotBotNickname } = require('./protection');
        await snapshotBotNickname(true); // true to force reset
        await deleteAdminSession(senderID);
        await sendMessage(api, `╮───∙⋆⋅「 تم إعادة الضبط ✅ 」\n│\n│ › تم إعادة ضبط كنية البوت بنجاح.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      } catch (e) {
        await deleteAdminSession(senderID);
        await sendMessage(api, `❌ فشل إعادة ضبط كنية البوت: ${e.message || e}`, threadID);
      }
      return;
    }
    if (text === '4') {
      await sendMessage(api, `⏳ جاري إعادة ضبط جميع الكنيات للاعبين...`, threadID);
      try {
        const players = await getAllPlayers();
        for (const player of players) {
          const newNick = await _getDynamicNickname(player);
          if (player.nickname !== newNick) {
            await _changeNicknameSafe(api, newNick, threadID, player.fbId);
          }
        }
        await deleteAdminSession(senderID);
        await sendMessage(api, `╮───∙⋆⋅「 تم إعادة الضبط ✅ 」\n│\n│ › تم إعادة ضبط جميع الكنيات للاعبين بنجاح.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      } catch (e) {
        await deleteAdminSession(senderID);
        await sendMessage(api, `❌ فشل إعادة ضبط كنيات اللاعبين: ${e.message || e}`, threadID);
      }
      return;
    }
    await sendMessage(api, `⚠️ الرجاء اختيار خيار صحيح من القائمة (1 - 5).`, threadID);
    return;
  }
}

async function handleQarobaat(api, event) {
  const { threadID, senderID } = event;
  await setAdminSession(senderID, { state: 'QAROBAAT_MAIN' });
  await sendMessage(api,
    `╮───────∙⋆⋅ ※ ⋅⋆∙───────╭\n      ✦ إدارة قروبات الممالك ✦\n╯───────∙⋆⋅ ※ ⋅⋆∙───────╰\n\n` +
    `╮───∙⋆⋅「 الخيارات 」\n` +
    `│ 1 › عرض ايديات القروبات الحالية\n` +
    `│ 2 › تعديل ايدي قروب مملكة\n` +
    `│ 3 › رجوع\n` +
    `╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
}

async function handleQarobaatSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();

  if (text === '3' || text === 'رجوع' || text === 'خروج') {
    await deleteAdminSession(senderID);
    await handleTa3deel(api, event);
    return;
  }

  if (session.state === 'QAROBAAT_MAIN') {
    if (text === '1') {
      let msg = `╮───∙⋆⋅「 ايديات القروبات الحالية 」\n`;
      for (const k in config.groupes) {
        msg += `│ › ${kingdomNamesAr[k]}: ${config.groupes[k] || 'غير محدد'}\n`;
      }
      msg += `╯───────∙⋆⋅ ※ ⋅⋆∙`;
      await sendMessage(api, msg, threadID);
      return;
    }
    if (text === '2') {
      await setAdminSession(senderID, { state: 'QAROBAAT_EDIT_SELECT' });
      await sendMessage(api,
        `╮───∙⋆⋅「 تعديل ايدي قروب 」\n│\n` +
        `│ اختر المملكة لتعديل ايدي قروبها:\n` +
        `│ 1 › سولفارا\n` +
        `│ 2 › نيرافيل\n` +
        `│ 3 › مورداك\n` +
        `│\n` +
        `│ › او اكتب 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      return;
    }
    await sendMessage(api, `⚠️ الرجاء اختيار خيار صحيح من القائمة (1 - 3).`, threadID);
    return;
  }

  if (session.state === 'QAROBAAT_EDIT_SELECT') {
    const kMap = { '1': 'solfare', '2': 'niravil', '3': 'murdak' };
    const k = kMap[text];
    if (!k) {
      await sendMessage(api, `⚠️ خيار غير صحيح. اختر من (1 - 3).`, threadID);
      return;
    }
    await setAdminSession(senderID, { state: 'QAROBAAT_EDIT_AWAIT_ID', kingdom: k });
    await sendMessage(api, `╮───∙⋆⋅「 تعديل ايدي قروب ${kingdomNamesAr[k]} 」\n│\n│ › الايدي الحالي: ${config.groupes[k] || 'غير محدد'}\n│ › ارسل الايدي الجديد:\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'QAROBAAT_EDIT_AWAIT_ID') {
    const { kingdom } = session;
    if (!text || !/^[0-9]+$/.test(text)) {
      await sendMessage(api, `⚠️ ايدي القروب غير صحيح. يجب أن يكون أرقاماً فقط.`, threadID);
      return;
    }
    config.groupes[kingdom] = text;
    fs.writeFileSync(path.join(__dirname, '../config.json'), JSON.stringify(config, null, 2));
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم التعديل ✅ 」\n│\n│ › تم تحديث ايدي قروب ${kingdomNamesAr[kingdom]} إلى ${text}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }
}

async function handleIdafa(api, event) {
  const { threadID, senderID } = event;
  await setAdminSession(senderID, { state: 'IDAFA_MAIN' });
  await sendMessage(api,
    `╮───────∙⋆⋅ ※ ⋅⋆∙───────╭\n      ✦ إضافة مستخدم لقروب ✦\n╯───────∙⋆⋅ ※ ⋅⋆∙───────╰\n\n` +
    `╮───∙⋆⋅「 الخيارات 」\n` +
    `│ 1 › سولفارا\n` +
    `│ 2 › نيرافيل\n` +
    `│ 3 › مورداك\n` +
    `│ 4 › جميع القروبات\n` +
    `│ 5 › رجوع\n` +
    `╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
}

async function handleIdafaSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();
  const arNames = { 'solfare': 'سولفارا', 'niravil': 'نيرافيل', 'murdak': 'مورداك' };

  if (text === 'خروج' || text === '5') {
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return;
  }
  const map = { '1':'solfare','2':'niravil','3':'murdak','4':'all' };
  const choice = map[text];
  if (!choice) { await sendMessage(api, `⚠️ اختر رقماً من 1 إلى 5`, threadID); return; }

  await deleteAdminSession(senderID);

  if (choice === 'all') {
    const results = [];
    for (const [k, gid] of Object.entries(config.groupes)) {
      const ok = await addUserToGroup(api, senderID, String(gid));
      results.push(`│ › ${arNames[k] || k} : ${ok ? '✅' : '❌'}`);
    }
    await sendMessage(api, `╮───∙⋆⋅「 اضافة للكل 」\n${results.join('\n')}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
  } else {
    const gid = config.groupes[choice];
    if (!gid) { await sendMessage(api, `╮───∙⋆⋅「 اضافة 」\n│\n│ › لم يتم تحديد ايدي هذا القروب\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return; }
    const ok = await addUserToGroup(api, senderID, String(gid));
    await sendMessage(api, `╮───∙⋆⋅「 اضافة 」\n│\n│ › المملكة : ${arNames[choice]}\n│ › النتيجة : ${ok ? '✅ تمت الإضافة' : '❌ فشلت الإضافة'}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
  }
}

async function handleMessageRequests(api, event) {
  const { threadID, senderID } = event;
  await sendMessage(api, `⏳ جارِ جلب طلبات المراسلة والطلبات الاحتيالية...`, threadID);

  api.getThreadList(20, null, ["PENDING"], (err1, pendingList) => {
    api.getThreadList(20, null, ["OTHER"], async (err2, otherList) => {
      if (err1 && err2) {
        await sendMessage(api, `❌ فشل جلب طلبات المراسلة: ${err1?.message || err2?.message || 'خطأ غير معروف'}`, threadID);
        return;
      }

      const pList = pendingList || [];
      const oList = otherList || [];

      if (pList.length === 0 && oList.length === 0) {
        await sendMessage(api, `╮───∙⋆⋅「 طلبات المراسلة 」\n│\n│ › 🎉 لا توجد أي طلبات مراسلة حالياً (سواء عادية أو احتيالية).\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
        return;
      }

      let msg = `╮───────∙⋆⋅ ※ ⋅⋆∙───────╭\n     ✦ طلبات المراسلة الواردة ✦\n╯───────∙⋆⋅ ※ ⋅⋆∙───────╰\n\n`;
      const reqsList = [];

      let index = 1;
      pList.forEach(t => {
        msg += `│ ${index}. 👤 ${t.name || 'مستخدم غير معروف'}\n│    ↳ النوع: عادية\n│    ↳ الرسالة: ${t.snippet || 'لا يوجد نص رسالة'}\n│    ↳ ID: ${t.threadID}\n\n`;
        reqsList.push({ threadID: t.threadID, name: t.name, snippet: t.snippet, folder: 'عادية', isPending: true });
        index++;
      });

      oList.forEach(t => {
        msg += `│ ${index}. ⚠️ ${t.name || 'مستخدم غير معروف'}\n│    ↳ النوع: احتيالية / سبام\n│    ↳ الرسالة: ${t.snippet || 'لا يوجد نص رسالة'}\n│    ↳ ID: ${t.threadID}\n\n`;
        reqsList.push({ threadID: t.threadID, name: t.name, snippet: t.snippet, folder: 'احتيالية', isPending: false });
        index++;
      });

      msg += `╮───∙⋆⋅「 الخيارات 」\n` +
             `│ › ارسل [رقم الطلب] لرؤية التفاصيل وقبولها أو رفضها\n` +
             `│ › اكتب 《 خروج 》 للإلغاء\n` +
             `╯───────∙⋆⋅ ※ ⋅⋆∙`;

      await setAdminSession(senderID, { state: 'MSG_REQS_MAIN', reqsList });
      await sendMessage(api, msg, threadID);
    });
  });
}

async function handleMessageRequestsSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();

  if (text === 'خروج') {
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'MSG_REQS_MAIN') {
    const idx = parseInt(text, 10) - 1;
    const list = session.reqsList || [];
    if (isNaN(idx) || idx < 0 || idx >= list.length) {
      await sendMessage(api, `⚠️ رقم غير صحيح من القائمة.`, threadID);
      return;
    }

    const selectedReq = list[idx];
    await setAdminSession(senderID, { state: 'MSG_REQS_ACTION', selectedReq, reqsList: list });

    const msg =
      `╮───∙⋆⋅「 تفاصيل طلب المراسلة 」\n` +
      `│ › الاسم : ${selectedReq.name || 'غير معروف'}\n` +
      `│ › الايدي: ${selectedReq.threadID}\n` +
      `│ › النوع : ${selectedReq.folder}\n` +
      `│ › الرسالة: ${selectedReq.snippet || 'لا يوجد'}\n` +
      `╯───────∙⋆⋅ ※ ⋅⋆∙\n\n` +
      `╮───∙⋆⋅「 الخيارات 」\n` +
      `│ 1 › قبول (نقل إلى الصندوق الوارد)\n` +
      `│ 2 › رفض (تجاهل وحذف الطلب)\n` +
      `│ 3 › رجوع للقائمة\n` +
      `╯───────∙⋆⋅ ※ ⋅⋆∙`;
    await sendMessage(api, msg, threadID);
    return;
  }

  if (session.state === 'MSG_REQS_ACTION') {
    const req = session.selectedReq;
    if (text === '3' || text === 'رجوع') {
      await deleteAdminSession(senderID);
      await handleMessageRequests(api, event);
      return;
    }

    if (text === '1' || text === 'قبول') {
      try {
        await new Promise((resolve, reject) => {
          api.handleMessageRequest(String(req.threadID), true, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        await deleteAdminSession(senderID);
        await sendMessage(api, `╮───∙⋆⋅「 تم القبول ✅ 」\n│\n│ › تم قبول طلب مراسلة: ${req.name || req.threadID}\n│ › تم نقل المحادثة إلى الصندوق الوارد بنجاح.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      } catch (e) {
        await deleteAdminSession(senderID);
        await sendMessage(api, `❌ فشل قبول الطلب: ${e.message || e}`, threadID);
      }
      return;
    }

    if (text === '2' || text === 'رفض') {
      try {
        await new Promise((resolve, reject) => {
          api.handleMessageRequest(String(req.threadID), false, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        await deleteAdminSession(senderID);
        await sendMessage(api, `╮───∙⋆⋅「 تم الرفض 🗑️ 」\n│\n│ › تم رفض طلب مراسلة: ${req.name || req.threadID}\n│ › تم تجاهل وحذف الطلب بنجاح.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      } catch (e) {
        await deleteAdminSession(senderID);
        await sendMessage(api, `❌ فشل رفض الطلب: ${e.message || e}`, threadID);
      }
      return;
    }
  }
}

module.exports = {
  handleTa3deel,
  handleDataSession,
  handleEadatDabt,
  handleEadatDabtSession,
  handleQarobaat,
  handleQarobaatSession,
  handleIdafa,
  handleIdafaSession,
  handleCitiesSession,
  handleBotGroups,
  handleBotGroupsSession,
  handleMessageRequests,
  handleMessageRequestsSession
};
