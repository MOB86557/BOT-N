const { sendMessage, kingdomNamesAr } = require('../utils');
const { getDB, getAllPlayers, getMessageStats, getGroupSetting, setAdminSession, deleteAdminSession } = require('../database');
const config = require('../config.json');

const ADMIN_ID = String(config.adminId);

const COLLECTION_LABELS = {
  players:'اللاعبون', temp_sessions:'جلسات التسجيل', notifications:'الإشعارات',
  counters:'عدادات الفئات', permanent_bans:'المحظورون', disabled_commands:'الكلمات والأوامر المعطلة',
  command_watchers:'منتظرو الأوامر', bots:'البوتات', message_stats:'إحصائيات الرسائل',
  group_settings:'إعدادات القروبات', settings:'الإعدادات', admin_sessions:'جلسات الأدمن',
  market:'السوق', item_transfer_sessions:'جلسات التحويل', agent_conversations:'ذاكرة الوكلاء',
  bot_config:'إعدادات البوت', join_sessions:'جلسات الانضمام', bank_sessions: 'جلسات البنك',
  cities: 'مدن الممالك (أفرع الممالك)'
};
const DB_LIMIT = 512 * 1024 * 1024;
const _mb  = (b) => (b / (1024 * 1024)).toFixed(2);
const _bar = (p, n = 10) => { const f = Math.round((p / 100) * n); return '█'.repeat(f) + '░'.repeat(n - f); };

async function _buildQaeedaMsg() {
  let dbStats = null;
  try { dbStats = await getDB().command({ dbStats: 1, scale: 1 }); } catch (e) {}
  const usedBytes = dbStats ? ((dbStats.dataSize || 0) + (dbStats.indexSize || 0)) : 0;
  const percent   = Math.min(100, Math.round((usedBytes / DB_LIMIT) * 100));
  const icon      = percent >= 90 ? '🔴' : percent >= 70 ? '🟡' : '🟢';
  const colData   = [];
  for (const col of Object.keys(COLLECTION_LABELS)) {
    let count = 0, sz = 0;
    try { count = await getDB().collection(col).countDocuments(); const s = await getDB().command({ collStats: col, scale: 1 }); sz = (s.size || 0) + (s.totalIndexSize || 0); } catch (e) {}
    if (count === 0 && sz === 0) continue;
    colData.push({ col, label: COLLECTION_LABELS[col], count, colMB: _mb(sz) });
  }
  let colLines = '';
  colData.forEach((c, i) => { colLines += `│ ${i + 1}. ${c.label}\n│    ↳ ${c.count} سجل ┇ ${c.colMB} MB\n`; });
  const msg =
    `╮───────∙⋆⋅ ※ ⋅⋆∙───────╭\n   ✦ قاعدة البيانات ✦\n╯───────∙⋆⋅ ※ ⋅⋆∙───────╰\n\n` +
    `╮───∙⋆⋅「 المساحة 」\n│ ${icon} ${_bar(percent)} ${percent}%\n│ › مستخدم  : ${_mb(usedBytes)} MB\n│ › متبقي   : ${_mb(Math.max(0, DB_LIMIT - usedBytes))} MB\n│ › الحد    : ${_mb(DB_LIMIT)} MB\n╯───────∙⋆⋅ ※ ⋅⋆∙\n\n` +
    `╮───∙⋆⋅「 المحتويات 」\n${colLines || '│ › قاعدة البيانات فارغة\n'}╯───────∙⋆⋅ ※ ⋅⋆∙\n\n` +
    `╮───∙⋆⋅「 الخيارات 」\n` +
    `│ › ارسل رقم القسم لحذف محتوياته بالتحديد\n` +
    `│ › ارسل رقم 0 للبدء في 《 الحذف الشامل والكامل لقاعدة البيانات 》 ⚠️\n` +
    `│ › 《 خروج 》\n` +
    `╯───────∙⋆⋅ ※ ⋅⋆∙`;
  return { msg, colData };
}

async function handleQaeedaDB(api, event) {
  const { msg, colData } = await _buildQaeedaMsg();
  await setAdminSession(event.senderID, { state: 'QAEEDA_MAIN', colData });
  await sendMessage(api, msg, event.threadID);
}

async function handleQaeedaDBSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();
  if (text === 'خروج') { await deleteAdminSession(senderID); await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return; }
  
  if (session.state === 'QAEEDA_CONFIRM_ALL') {
    if (text === 'حذف كل شيء') {
      try {
        const cols = Object.keys(COLLECTION_LABELS);
        for (const col of cols) {
          try { await getDB().collection(col).deleteMany({}); } catch (e) {}
        }
        await deleteAdminSession(senderID);
        await sendMessage(api, `╮───∙⋆⋅「 تم المسح الشامل والكامل 💀 」\n│\n│ › تم تصفير قاعدة البيانات بالكامل وتطهير كل المجموعات واللاعبين بنجاح.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      } catch (e) {
        await deleteAdminSession(senderID);
        await sendMessage(api, `╮───∙⋆⋅「 خطأ في الحذف ❌ 」\n│\n│ › ${e.message}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
      }
    } else if (text === 'إلغاء' || text === 'الغاء') {
      const { msg: freshMsg, colData } = await _buildQaeedaMsg();
      await setAdminSession(senderID, { state: 'QAEEDA_MAIN', colData });
      await sendMessage(api, freshMsg, threadID);
    } else {
      await sendMessage(api, `⚠️ الرجاء إرسال 《 حذف كل شيء 》 لتأكيد التصفير الشامل أو 《 إلغاء 》 للرجوع.`, threadID);
    }
    return;
  }

  if (text === '0') {
    await setAdminSession(senderID, { state: 'QAEEDA_CONFIRM_ALL' });
    await sendMessage(api, 
      `╮───∙⋆⋅「 ⚠️ تحذير أمني أخير ⚠️ 」\n│\n` +
      `│ 🚫 سيتم حذف قاعدة البيانات بالكامل وبشكل نهائي ولا يمكن الرجوع!\n` +
      `│ 🚫 سيتم تصفير كل حسابات الممالك، الأسلحة، الكوينز، وسجلات اللاعبين والمدن.\n│\n` +
      `│ › ارسل 《 حذف كل شيء 》 للتأكيد النهائي والتصفير.\n` +
      `│ › ارسل 《 إلغاء 》 للعودة للخلف.\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
    return;
  }

  if (session.state === 'QAEEDA_CONFIRM') {
    if (text === 'تأكيد') {
      try { await getDB().collection(session.targetCol).deleteMany({}); await deleteAdminSession(senderID); await sendMessage(api, `╮───∙⋆⋅「 تم الحذف ✅️ 」\n│\n│ › تم مسح : ${session.targetLabel}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); }
      catch (e) { await deleteAdminSession(senderID); await sendMessage(api, `╮───∙⋆⋅「 خطأ ❌ 」\n│\n│ › فشل الحذف\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); }
    } else if (text === 'إلغاء' || text === 'الغاء') {
      const { msg: freshMsg, colData } = await _buildQaeedaMsg();
      await setAdminSession(senderID, { state: 'QAEEDA_MAIN', colData });
      await sendMessage(api, freshMsg, threadID);
    } else { await sendMessage(api, `⚠️ ارسل 《 تأكيد 》 للحذف أو 《 إلغاء 》 للرجوع`, threadID); }
    return;
  }
  
  const colData = session.colData || [], idx = parseInt(text, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= colData.length) { await sendMessage(api, `⚠️ ارسل رقم من القائمة أو 《 خروج 》`, threadID); return; }
  const chosen = colData[idx];
  await setAdminSession(senderID, { state: 'QAEEDA_CONFIRM', targetCol: chosen.col, targetLabel: chosen.label });
  const warn = chosen.col === 'players' ? `│ ⚠️ تحذير: سيتم حذف جميع اللاعبين!\n` : '';
  await sendMessage(api, `╮───∙⋆⋅「 تأكيد الحذف 」\n│\n│ › القسم   : ${chosen.label}\n│ › السجلات : ${chosen.count}\n${warn}│\nارسل 《 تأكيد 》 للمتابعة\nارسل 《 إلغاء 》 للرجوع\n│\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
}

async function handleBayaanat(api, event) {
  const { threadID } = event;
  const db = getDB();
  const allPlayers = await getAllPlayers();
  const total = allPlayers.length;
  const kingdoms = ['solfare', 'niravil', 'murdak'];
  
  let perKingdom = {}, coinsKingdom = {}, totalCoins = 0;
  for (const k of kingdoms) {
    const kp = allPlayers.filter(p => p.kingdom === k && p.fbId !== ADMIN_ID);
    perKingdom[k] = kp.length;
    coinsKingdom[k] = kp.reduce((s, p) => s + (p.coins || 0), 0);
    totalCoins += coinsKingdom[k];
  }
  
  const msgStats = await getMessageStats();
  const todayCount = (msgStats && msgStats.today) ? msgStats.today : 0;
  const weekCount = (msgStats && msgStats.week) ? msgStats.week : 0;
  const monthCount = (msgStats && msgStats.month) ? msgStats.month : 0;

  let marketCount = 0;
  try { marketCount = await db.collection('market').countDocuments({ status: 'active' }); } catch (e) {}
  
  // جلب كافة المدن (الفروع) المضافة من قاعدة البيانات لعرضها بشكل متناسق
  let cities = [];
  try {
    cities = await db.collection('cities').find().toArray();
  } catch (e) {
    console.error('Error fetching cities for bayaanat:', e.message);
  }

  let groupLines = '';
  for (const k of kingdoms) {
    const s = await getGroupSetting(k);
    const gName = (s && s.customName) ? s.customName : `مملكة ${kingdomNamesAr[k]}`;
    
    // تصفية المدن التابعة لهذه المملكة
    const kingdomCities = cities.filter(c => c.kingdom === k);
    let citiesLine = '';
    if (kingdomCities.length > 0) {
      citiesLine = `\n│    ↳ المدن التابعة: ` + kingdomCities.map(c => `«${c.name}»`).join(' - ');
    }
    
    groupLines += `│ › ${kingdomNamesAr[k]}  ┇ ${gName}  [ ${perKingdom[k]} لاعب ]${citiesLine}\n`;
  }
  
  await sendMessage(api,
    `╮───────∙⋆⋅ ※ ⋅⋆∙───────╭\n     ✦ بيانات الممالك والمدن ✦\n╯───────∙⋆⋅ ※ ⋅⋆∙───────╰\n\n` +
    `╮───∙⋆⋅「 الممالك والأفرع 」\n│ › إجمالي اللاعبين : ${total} لاعب\n${groupLines}╯───────∙⋆⋅ ※ ⋅⋆∙\n\n` +
    `╮───∙⋆⋅「 الرسائل 」\n│ › اليوم   : ${todayCount}\n│ › الأسبوع : ${weekCount}\n│ › الشهر   : ${monthCount}\n╯───────∙⋆⋅ ※ ⋅⋆∙\n\n` +
    `╮───∙⋆⋅「 الاقتصاد 」\n│ › إجمالي الكوينز : ${totalCoins}\n│ › سولفارا : ${coinsKingdom['solfare']}\n│ › نيرافيل : ${coinsKingdom['niravil']}\n│ › مورداك  : ${coinsKingdom['murdak']}\n│ › السلع في السوق : ${marketCount}\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
    threadID);
}

module.exports = {
  handleQaeedaDB,
  handleQaeedaDBSession,
  handleBayaanat
};