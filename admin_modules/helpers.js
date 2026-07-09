const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { extractFbId } = require('../utils');
const { getPlayer, getPlayerByNickname } = require('../database');

function downloadPhoto(url, dest, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
    const proto = url.startsWith('https') ? require('https') : require('http');
    const file  = fs.createWriteStream(dest);
    proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if ([301, 302, 307].includes(res.statusCode)) {
        file.close(); try { fs.unlinkSync(dest); } catch (_) {}
        return downloadPhoto(res.headers.location, dest, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close(); try { fs.unlinkSync(dest); } catch (_) {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', (err) => { file.close(); try { fs.unlinkSync(dest); } catch (_) {} reject(err); });
    }).on('error', (err) => { file.close(); try { fs.unlinkSync(dest); } catch (_) {} reject(err); });
  });
}

function setTitle(api, title, threadID) {
  return new Promise((resolve) => {
    try { api.setTitle(title, threadID, () => resolve()); }
    catch (e) { resolve(); }
  });
}

function kickUser(api, fbId, threadID) {
  return new Promise((resolve) => {
    try { api.removeUserFromGroup(String(fbId), threadID, (err) => resolve(!err)); }
    catch (e) { resolve(false); }
  });
}

function addUserToGroup(api, fbId, threadID) {
  return new Promise((resolve) => {
    try { api.addUserToGroup(String(fbId), threadID, (err) => resolve(!err)); }
    catch (e) { resolve(false); }
  });
}

async function kickFromAllGroups(api, fbId) {
  for (const gid of Object.values(config.groupes).map(String)) {
    await kickUser(api, fbId, gid);
  }
}

// طرد اللاعب من كل القروبات (كل العواصم + كل المدن) ما عدا مدينته/عاصمته الأصلية
// تُستخدم عند تنزيل رتبة لاعب حصرية (امبراطور/حاكم/نائب حاكم/جنرال/قائد) لرتبة مجند بعد استبداله
async function kickFromGroupsExceptOwnCity(api, fbId, kingdom, registeredCityName) {
  const { getDB } = require('../database');
  const db = getDB();

  // تحديد القروب المستثنى (مدينته الأصلية، أو عاصمة مملكته إن لم تكن له مدينة محددة)
  let keepThreadId = null;
  try {
    if (registeredCityName && registeredCityName !== 'العاصمة') {
      const cityDoc = await db.collection('cities').findOne({ kingdom, name: registeredCityName });
      keepThreadId = cityDoc ? String(cityDoc.threadId) : (config.groupes[kingdom] ? String(config.groupes[kingdom]) : null);
    } else {
      keepThreadId = config.groupes[kingdom] ? String(config.groupes[kingdom]) : null;
    }
  } catch (e) {
    keepThreadId = config.groupes[kingdom] ? String(config.groupes[kingdom]) : null;
  }

  // كل القروبات الموجودة بالنظام: العواصم الثلاث + كل المدن بكل الممالك
  const allCapitals = Object.values(config.groupes).map(String);
  let allCityIds = [];
  try {
    allCityIds = (await db.collection('cities').find({}).toArray()).map(c => String(c.threadId));
  } catch (e) {}
  const allGroupIds = [...new Set([...allCapitals, ...allCityIds])];

  for (const gid of allGroupIds) {
    if (gid === keepThreadId) continue;
    await kickUser(api, fbId, gid);
  }
}

async function resolveTarget(text, event) {
  if (event && event.messageReply && (!text || text.trim() === '')) {
    const targetId = String(event.messageReply.senderID);
    return { player: await getPlayer(targetId), fbId: targetId };
  }
  const t = (text || '').trim();
  if (/^\d{10,}$/.test(t)) return { player: await getPlayer(t), fbId: t };
  const extracted = extractFbId(t);
  if (extracted) return { player: await getPlayer(extracted), fbId: extracted };
  const player = await getPlayerByNickname(t);
  if (player) return { player, fbId: player.fbId };
  return { player: null, fbId: null };
}

module.exports = {
  downloadPhoto,
  setTitle,
  kickUser,
  addUserToGroup,
  kickFromAllGroups,
  kickFromGroupsExceptOwnCity,
  resolveTarget
};