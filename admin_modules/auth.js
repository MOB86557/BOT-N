const config = require('../config.json');
const { getBotConfig, setBotConfig } = require('../database');
const { sendMessage, extractFbId } = require('../utils');

const ADMIN_ID = String(config.adminId);
let extraAdmins = new Set();

async function initAdminIds() {
  const stored = await getBotConfig('adminIds');
  extraAdmins = stored && Array.isArray(stored)
    ? new Set(stored.map(String))
    : new Set((config.adminIds || []).map(String));
}

async function initGroupes() {
  const stored = await getBotConfig('groupes');
  if (stored && typeof stored === 'object') Object.assign(config.groupes, stored);
}

async function saveAdminIds() { 
  await setBotConfig('adminIds', [...extraAdmins]); 
}

function isAdmin(senderID) {
  const id = String(senderID);
  return id === ADMIN_ID || extraAdmins.has(id);
}

async function handleMoshrefeen(api, event) {
  const list = [...extraAdmins];
  if (list.length === 0) {
    await sendMessage(api,
      `╮───∙⋆⋅「 المشرفون 」\n│\n│ › لا يوجد مشرفون مضافون\n│\n│ ادمن اضافة [ايدي / رابط]\n│ ادمن حذف [ايدي / رابط]\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
      event.threadID); return;
  }
  const lines = list.map((id, i) => `│ ${i + 1}. ${id}`).join('\n');
  await sendMessage(api,
    `╮───∙⋆⋅「 المشرفون 」\n${lines}\n│\n│ ادمن اضافة [ايدي / رابط]\n│ ادمن حذف [ايدي / رابط]\n╯───────∙⋆⋅ ※ ⋅⋆∙`,
    event.threadID);
}

async function handleAdminAdd(api, event, arg) {
  const id = extractFbId(arg.trim());
  if (!id) { await sendMessage(api, `╮───∙⋆⋅「 ادمن اضافة 」\n│\n│ › تعذّر استخراج الايدي\n╯───────∙⋆⋅ ※ ⋅⋆∙`, event.threadID); return; }
  if (id === ADMIN_ID) { await sendMessage(api, `╮───∙⋆⋅「 ادمن اضافة 」\n│\n│ › هذا هو الأدمن الرئيسي بالفعل\n╯───────∙⋆⋅ ※ ⋅⋆∙`, event.threadID); return; }
  if (extraAdmins.has(id)) { await sendMessage(api, `╮───∙⋆⋅「 ادمن اضافة 」\n│\n│ › مشرف بالفعل (${id})\n╯───────∙⋆⋅ ※ ⋅⋆∙`, event.threadID); return; }
  extraAdmins.add(id); await saveAdminIds();
  await sendMessage(api, `╮───∙⋆⋅「 ادمن اضافة 」\n│\n│ › ✅ تمت الإضافة\n│ › الايدي: ${id}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, event.threadID);
}

async function handleAdminRemove(api, event, arg) {
  const id = extractFbId(arg.trim());
  if (!id) { await sendMessage(api, `╮───∙⋆⋅「 ادمن حذف 」\n│\n│ › تعذّر استخراج الايدي\n╯───────∙⋆⋅ ※ ⋅⋆∙`, event.threadID); return; }
  if (id === ADMIN_ID) { await sendMessage(api, `╮───∙⋆⋅「 ادمن حذف 」\n│\n│ › لا يمكن حذف الأدمن الرئيسي\n╯───────∙⋆⋅ ※ ⋅⋆∙`, event.threadID); return; }
  if (!extraAdmins.has(id)) { await sendMessage(api, `╮───∙⋆⋅「 ادمن حذف 」\n│\n│ › ليس في قائمة المشرفين\n╯───────∙⋆⋅ ※ ⋅⋆∙`, event.threadID); return; }
  extraAdmins.delete(id); await saveAdminIds();
  await sendMessage(api, `╮───∙⋆⋅「 ادمن حذف 」\n│\n│ › ✅ تم الحذف\n│ › الايدي: ${id}\n╯───────∙⋆⋅ ※ ⋅⋆∙`, event.threadID);
}

module.exports = {
  ADMIN_ID,
  extraAdmins,
  initAdminIds,
  initGroupes,
  isAdmin,
  handleMoshrefeen,
  handleAdminAdd,
  handleAdminRemove
};