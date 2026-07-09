const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { generateNickname, getKingdomByThreadId, kingdomNamesAr, sendMessage } = require('../utils');
const { getAllPlayers, getPlayer, getProtectedState, saveProtectedState, getProtectionSettings, getGroupSetting, setAdminSession, deleteAdminSession } = require('../database');
const { setTitle, downloadPhoto } = require('./helpers');

const _protectionLocks = new Set();

function _lock(key, ms) {
  _protectionLocks.add(key);
  setTimeout(() => _protectionLocks.delete(key), ms);
}

function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// دالة مساعدة موحدة لحساب الكنية ديناميكياً شاملة كافة الألقاب والرموز التعبيرية والحالات النشطة
async function getDynamicNickname(player, forceMute = false) {
  const { generateNickname } = require('../utils');
  const baseRank = player.rank || 'متدرب';
  let nick = generateNickname(player.nickname, baseRank, player.class, player.warnings || 0);

  // 1. فحص حالة الإنعاش 🏥
  const isRecovery = player.recoveryUntil && new Date(player.recoveryUntil).getTime() > Date.now();
  if (isRecovery) {
    nick += ' 🏥';
  }

  // 2. فحص حالة التجاهل والكتم 🔇
  if (forceMute) {
    if (!nick.includes('🔇')) {
      nick += ' 🔇';
    }
  } else {
    try {
      const { getDB } = require('../database');
      const db = getDB();
      const isIgnored = await db.collection('ignored_players').findOne({ fbId: String(player.fbId) });
      if (isIgnored) {
        if (!nick.includes('🔇')) {
          nick += ' 🔇';
        }
      }
    } catch (e) {}
  }

  return nick;
}

// تحديث كاش الأعضاء في المجموعات الرسمية (العواصم والمدن) ديناميكياً لتفادي استهلاك موارد الخادم
async function updateSystemGroupMembersCache(api) {
  global.systemGroupMembers = global.systemGroupMembers || {};
  const { getDB } = require('../database');
  const db = getDB();

  const kingdomGroupIds = Object.values(config.groupes).filter(Boolean).map(String);
  let cityGroupIds = [];
  try {
    const cities = await db.collection('cities').find().toArray();
    cityGroupIds = cities.map(c => String(c.threadId)).filter(Boolean);
  } catch (e) {}

  const allGroupIds = [...new Set([...kingdomGroupIds, ...cityGroupIds])];
  for (const gid of allGroupIds) {
    try {
      await new Promise((resolve) => {
        api.getThreadInfo(gid, (err, res) => {
          if (!err && res && res.participantIDs) {
            global.systemGroupMembers[gid] = res.participantIDs.map(String);
          }
          resolve();
        });
      });
    } catch (e) {}
  }
}

// تغيير كنية مع إعادة محاولة لتفادي الحظر المؤقت من فيسبوك
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

async function snapshotNicknames() {
  const players = await getAllPlayers();
  const snap    = {};
  for (const p of players) {
    snap[String(p.fbId)] = await getDynamicNickname(p);
  }
  const existing = await getProtectedState('global') || {};
  await saveProtectedState('global', { ...existing, nicknames: snap });
}

async function snapshotGroupNames() {
  const snap = {};
  for (const k of ['solfare', 'niravil', 'murdak']) {
    const setting = await getGroupSetting(k);
    snap[k] = (setting && setting.customName) ? setting.customName : `مملكة ${kingdomNamesAr[k]}`;
  }
  try {
    const { getDB } = require('../database');
    const cities = await getDB().collection('cities').find().toArray();
    for (const city of cities) {
      if (city.threadId && city.name) {
        snap[`city_${city.threadId}`] = city.name;
      }
    }
  } catch (e) { console.error('[حماية] خطأ تحميل أسماء المدن:', e.message); }
  const existing = await getProtectedState('global') || {};
  await saveProtectedState('global', { ...existing, groupNames: snap });
}

async function snapshotGroupPhotos() {
  const snap = {};
  for (const k of ['solfare', 'niravil', 'murdak']) {
    const setting = await getGroupSetting(k);
    const base64 = setting && setting.photoBase64;
    const url    = setting && (setting.defaultPhotoUrl || setting.photoUrl);
    if (base64) snap[k] = { base64, url };
    else if (url) snap[k] = { url };
    else console.warn(`[حماية] ⚠️ لا توجد صورة محفوظة لـ ${k}`);
  }
  try {
    const { getDB } = require('../database');
    const cities = await db.collection('cities').find().toArray();
    for (const city of cities) {
      if (!city.threadId) continue;
      const base64 = city.photoBase64;
      const url = city.photoUrl;
      if (base64) snap[`city_${city.threadId}`] = { base64, url };
      else if (url) snap[`city_${city.threadId}`] = { url };
    }
  } catch (e) { console.error('[حماية] خطأ تحميل صور المدن:', e.message); }
  const existing = await getProtectedState('global') || {};
  await saveProtectedState('global', { ...existing, groupPhotos: snap });
}

async function snapshotBotNickname() {
  const setting = await getGroupSetting('bot_global');
  const nick = setting && setting.botNickname ? setting.botNickname : null;
  const existing = await getProtectedState('global') || {};
  await saveProtectedState('global', { ...existing, botNickname: nick });
}

async function handleProtection(api, event, botId) {
  let settings, state;
  try { settings = await getProtectionSettings('global'); state = await getProtectedState('global'); } catch (e) { return; }
  if (!settings || !state) return;

  const eventAuthor = String(
    event.author ||
    (event.logMessageData && event.logMessageData.actorFbId) ||
    ''
  );

  // ── حماية كنية البوت ──
  if (settings.nicknames && event.logMessageType === 'log:user-nickname' && state.botNickname) {
    const changedIdBot = String(
      (event.logMessageData && (event.logMessageData.participant_id || event.logMessageData.participantId || event.logMessageData.participantID)) || ''
    );
    if (changedIdBot && botId && changedIdBot === String(botId)) {
      const newNickBot = String((event.logMessageData && (event.logMessageData.nickname || event.logMessageData.newNickname)) || '');
      if (newNickBot !== state.botNickname) {
        if (botId && eventAuthor && eventAuthor === String(botId)) return;
        const lockKeyBot = `nick_bot_${event.threadID}`;
        if (_protectionLocks.has(lockKeyBot)) return;
        _lock(lockKeyBot, 8000);
        await _changeNicknameSafe(api, state.botNickname, event.threadID, botId);
        return;
      }
      return;
    }
  }

  // ── حماية كنيات اللاعبين ──
  if (settings.nicknames && event.logMessageType === 'log:user-nickname') {
    const changedId = String(
      (event.logMessageData && (event.logMessageData.participant_id || event.logMessageData.participantId || event.logMessageData.participantID)) || ''
    );
    if (!changedId) return;

    let protectedNick = null;
    const player = await getPlayer(changedId);
    if (player) {
      protectedNick = await getDynamicNickname(player);
    } else if (state.nicknames && state.nicknames[changedId]) {
      protectedNick = state.nicknames[changedId];
    }

    if (!protectedNick) return;

    const newNick = String((event.logMessageData && (event.logMessageData.nickname || event.logMessageData.newNickname)) || '');

    if (newNick === protectedNick) return;
    if (botId && eventAuthor && eventAuthor === String(botId)) return;

    // قفل الحماية الشامل للمستخدم لحمايته عبر جميع مجموعات النظام ومنع التكرار الارتدادي للطلبات
    const lockKey = `nick_${changedId}`;
    if (_protectionLocks.has(lockKey)) return;
    _lock(lockKey, 8000);

    if (!global.systemGroupMembers) {
      await updateSystemGroupMembersCache(api);
    }

    // البحث عن كافة قروبات النظام التي يتواجد بها هذا اللاعب فعلياً وتصحيح كنيته فيها فوراً
    const targetGroupIds = [];
    if (global.systemGroupMembers) {
      for (const [gid, members] of Object.entries(global.systemGroupMembers)) {
        if (members.includes(String(changedId))) {
          targetGroupIds.push(gid);
        }
      }
    }
    if (!targetGroupIds.includes(event.threadID)) {
      targetGroupIds.push(event.threadID);
    }

    for (const gid of targetGroupIds) {
      await _changeNicknameSafe(api, protectedNick, gid, changedId);
      await _sleep(500);
    }
    return;
  }

  // ── حماية أسماء القروبات ──
  if (settings.groupNames && event.logMessageType === 'log:thread-name') {
    if (!state.groupNames) return;

    const kingdom = getKingdomByThreadId(event.threadID);
    const cityKey = `city_${event.threadID}`;
    const snapKey = kingdom || (state.groupNames[cityKey] !== undefined ? cityKey : null);
    if (!snapKey) return;

    const protectedName = state.groupNames[snapKey];
    if (!protectedName) return;

    const newName = String((event.logMessageData && event.logMessageData.name) || '');

    if (newName === protectedName) return;
    if (botId && eventAuthor && eventAuthor === String(botId)) return;

    const lockKey = `name_${event.threadID}`;
    if (_protectionLocks.has(lockKey)) return;
    _lock(lockKey, 6000);

    try { await setTitle(api, protectedName, event.threadID); }
    catch (e) { console.error('❌ خطأ حماية الاسم:', e.message || e); }
    return;
  }

  // ── حماية صور القروبات ──
  if (settings.groupPhotos && event.logMessageType === 'log:thread-image') {
    if (!state.groupPhotos) return;

    const kingdom = getKingdomByThreadId(event.threadID);
    const cityKey = `city_${event.threadID}`;
    const photoEntry = kingdom
      ? state.groupPhotos[kingdom]
      : state.groupPhotos[cityKey];
    if (!photoEntry) return;

    if (botId && eventAuthor && eventAuthor === String(botId)) return;

    const lockKey = `photo_${event.threadID}`;
    if (_protectionLocks.has(lockKey)) return;
    _lock(lockKey, 12000);

    const tmp = path.join(require('os').tmpdir(), `protect_photo_${Date.now()}.jpg`);
    try {
      if (photoEntry.base64) {
        fs.writeFileSync(tmp, Buffer.from(photoEntry.base64, 'base64'));
      } else if (photoEntry.url) {
        await downloadPhoto(photoEntry.url, tmp);
      } else if (typeof photoEntry === 'string') {
        await downloadPhoto(photoEntry, tmp);
      } else {
        _protectionLocks.delete(lockKey);
        return;
      }

      await new Promise((resolve, reject) => {
        api.changeGroupImage(fs.createReadStream(tmp), event.threadID, (err) => {
          try { fs.unlinkSync(tmp); } catch (_) {}
          if (err) return reject(err);
          resolve();
        });
      });
    } catch (e) {
      try { fs.unlinkSync(tmp); } catch (_) {}
      console.error('❌ خطأ حماية الصورة:', e.message || e);
      _protectionLocks.delete(lockKey);
    }
    return;
  }
}

async function handleHimaya(api, event) {
  const { threadID, senderID } = event;
  const settings = await getProtectionSettings('global') || {};
  const si = (v) => v ? '🟢' : '🔴';
  const msg =
    `╮───∙⋆⋅「 الحماية 」\n│\n` +
    `│ 1 › حماية الكنيات          ${si(settings.nicknames)}\n` +
    `│ 2 › حماية أسماء القروبات   ${si(settings.groupNames)}\n` +
    `│ 3 › حماية الصور            ${si(settings.groupPhotos)}\n` +
    `│ 4 › حماية الكل\n│ 5 › إيقاف الكل\n│ › 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`;
  await setAdminSession(senderID, { state: 'HIMAYA_MAIN' });
  await sendMessage(api, msg, threadID);
}

async function handleHimayaSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();
  if (text === 'خروج') { await deleteAdminSession(senderID); await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return; }

  const current   = await getProtectionSettings('global') || {};
  let newSettings = {
    nicknames:   current.nicknames   || false,
    groupNames:  current.groupNames  || false,
    groupPhotos: current.groupPhotos || false,
  };

  if      (text === '1') { newSettings.nicknames   = !current.nicknames;   if (newSettings.nicknames)   await snapshotNicknames();  }
  else if (text === '2') { newSettings.groupNames  = !current.groupNames;  if (newSettings.groupNames)  await snapshotGroupNames(); }
  else if (text === '3') { newSettings.groupPhotos = !current.groupPhotos; if (newSettings.groupPhotos) await snapshotGroupPhotos(); }
  else if (text === '4') {
    newSettings = { nicknames: true, groupNames: true, groupPhotos: true };
    await snapshotNicknames(); await snapshotGroupNames(); await snapshotGroupPhotos();
  }
  else if (text === '5') { newSettings = { nicknames: false, groupNames: false, groupPhotos: false }; }
  else { await sendMessage(api, `⚠️ اختر من 1 إلى 5`, threadID); return; }

  await saveProtectionSettings('global', newSettings);
  await deleteAdminSession(senderID);
  const si = (v) => v ? '🟢' : '🔴';
  await sendMessage(api,
    `╮───∙⋆⋅「 الحماية › تحديث 」\n│\n│ › الكنيات   ${si(newSettings.nicknames)}\n│ › الأسماء   ${si(newSettings.groupNames)}\n│ › الصور     ${si(newSettings.groupPhotos)}\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
    threadID);
}

module.exports = {
  handleHimaya,
  handleHimayaSession,
  handleProtection,
  snapshotNicknames,
  snapshotGroupNames,
  snapshotGroupPhotos,
  snapshotBotNickname,
  getDynamicNickname,
  updateSystemGroupMembersCache
};