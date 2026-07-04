const { sendMessage, kingdomNamesAr } = require('../utils');
const { setAdminSession, deleteAdminSession, getAllPlayers, addNotification } = require('../database');
const config = require('../config.json');

const ADMIN_ID = String(config.adminId);

async function handleIshaarAdmin(api, event) {
  const { threadID, senderID } = event;
  await setAdminSession(senderID, { state: 'ISHAAR_KINGDOM' });
  await sendMessage(api, `╮───∙⋆⋅「 إشعار 」\n│\n│ › اختر المملكة :\n│ 1 › سولفارا\n│ 2 › نيرافيل\n│ 3 › مورداك\n│ 4 › الكل\n│\n│ › او 《 خروج 》\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID);
}

async function handleIshaarSession(api, event, session) {
  const { threadID, senderID, body } = event;
  const text = (body || '').trim();
  if (text === 'خروج') { await deleteAdminSession(senderID); await sendMessage(api, `╮───∙⋆⋅「 تم الخروج 」\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return; }
  
  if (session.state === 'ISHAAR_KINGDOM') {
    const kMap = { '1':'solfare','2':'niravil','3':'murdak','4':'all' };
    if (!kMap[text]) { await sendMessage(api, `⚠️ اختر رقماً من 1 إلى 4`, threadID); return; }
    await setAdminSession(senderID, { state: 'ISHAAR_TEXT', kingdom: kMap[text] });
    await sendMessage(api, `╮───∙⋆⋅「 إشعار › ${text === '4' ? 'جميع الممالك' : kingdomNamesAr[kMap[text]]} 」\n│\n│ › اكتب نص الإشعار\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return;
  }
  
  if (session.state === 'ISHAAR_TEXT') {
    const k = session.kingdom;
    const players = await getAllPlayers(k === 'all' ? null : k);
    let count = 0;
    for (const p of players) { 
      if (p.fbId === ADMIN_ID) continue; 
      await addNotification(p.fbId, `📢 إشعار من الإدارة :\n${text}`); 
      count++; 
    }
    await deleteAdminSession(senderID);
    await sendMessage(api, `╮───∙⋆⋅「 تم الإشعار 」\n│\n│ › أُرسل إلى : ${k === 'all' ? 'جميع الممالك' : kingdomNamesAr[k]}\n│ › عدد المستقبلين : ${count}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, threadID); return;
  }
}

module.exports = {
  handleIshaarAdmin,
  handleIshaarSession
};