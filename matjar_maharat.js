// matjar_maharat.js
// متجر المهارات: عرض/شراء/امتلاك/تفعيل المهارات الخاصة بكل فئة (فارس / معالج / ساحر)
// المخطوطات تُمنح تلقائياً عند القتل (تُضاف من hijoom.js) وتُخزَّن كغرض عادي من نوع resource بالحقيبة

const { getPlayer, updatePlayer, addXP, removeItemFromBag } = require('./database');
const { sendReply, sendImageFromUrl, getKingdomByThreadIdFull } = require('./utils');

// ===== إعدادات عامة =====

const SCROLL_NAME = 'مخطوطة';
const SKILLS_PAGE_SIZE = 4;

// صورة تفعيل المهارة (تُرسل قبل رسالة التأكيد النصية)
const SKILL_ACTIVATION_IMAGE = 'https://i.ibb.co/gLhxk6Qg/26e958709396.jpg';

// أسماء الفئات بصيغة الجمع لعنوان المتجر
const classPluralNames = {
  'فارس': 'الفرسان',
  'معالج': 'المعالجين',
  'ساحر': 'السحرة'
};

// ===== قاعدة بيانات المهارات لكل فئة =====
// type: 'attack_multiplier' → تأثير هجومي يُطبَّق تلقائياً عند الهجوم بسلاح معين طالما المهارة مفعّلة
const SKILLS_BY_CLASS = {
  'فارس': [
    {
      name: 'تعزيز الصخرة',
      effect: 'مضاعفة ضرر الهجوم بالسيف الصخري الى ثلاثة اضعاف | تبقى المهارة فعالة حتى الهجوم ثلاث مرات ثم يجب الانتضار ساعة واحدة قبل اعادة استعمالها',
      epCost: 100,
      level: 6,
      priceScrolls: 1,
      type: 'attack_multiplier',
      weaponRequired: 'السيف الصخري',
      multiplier: 3,
      maxUses: 3,
      cooldownMs: 60 * 60 * 1000
    }
  ],
  'معالج': [],
  'ساحر': []
};

// ===== مساعدات =====

function getSkillDef(className, skillName) {
  const list = SKILLS_BY_CLASS[className] || [];
  return list.find(s => s.name === skillName);
}

function findSkillDefByNameAnyClass(skillName) {
  for (const cls of Object.keys(SKILLS_BY_CLASS)) {
    const found = SKILLS_BY_CLASS[cls].find(s => s.name === skillName);
    if (found) return { def: found, className: cls };
  }
  return null;
}

function getScrollCount(player) {
  const bag = player.bag || [];
  const item = bag.find(i => i.type === 'resource' && i.name === SCROLL_NAME);
  return item ? item.quantity : 0;
}

function formatSkillBlock(skill) {
  return (
    `____________________________\n` +
    `⌑ اسم المهارة : ${skill.name}\n` +
    `⌑ التأثير :  ${skill.effect}\n` +
    `⌑ استهلاك الطاقة : ${skill.epCost}\n` +
    `⌑ المستوى : ${skill.level}\n` +
    `                ⛁السعر ⛁ : ${skill.priceScrolls} مخطوطة `
  );
}

// ===== عرض متجر المهارات (حسب فئة اللاعب) =====

async function handleMatjarMaharat(api, event, pageNum = 1) {
  const { threadID, senderID, messageID } = event;
  const kingdom = await getKingdomByThreadIdFull(threadID);
  if (!kingdom) return;

  const player = await getPlayer(senderID);
  if (!player) {
    await sendReply(api, `يجب التسجيل اولاً\nارسل 《 تسجيل 》للانضمام`, messageID, threadID);
    return;
  }

  const playerClass = player.class;
  const skills = SKILLS_BY_CLASS[playerClass] || [];

  if (skills.length === 0) {
    await sendReply(api, `⚠️ لا توجد مهارات متاحة لفئتك حالياً`, messageID, threadID);
    return;
  }

  const totalPages = Math.ceil(skills.length / SKILLS_PAGE_SIZE);
  const page = Math.max(1, Math.min(pageNum, totalPages));
  const start = (page - 1) * SKILLS_PAGE_SIZE;
  const pageSkills = skills.slice(start, start + SKILLS_PAGE_SIZE);

  const skillsText = pageSkills.map(formatSkillBlock).join('\n');
  const scrollCount = getScrollCount(player);
  const className = classPluralNames[playerClass] || playerClass;

  const msg =
    `𒇔𒅂𒅂𒅂𒅂𒅂𒅂𒅂𒅂𒅂𒇔\n` +
    `       ⎈ متجر مهارات ${className}  ⎈ \n` +
    `𒇔𒅂𒅂𒅂𒅂𒅂𒅂𒅂𒅂𒅂𒇔\n` +
    `⦿ مخطوطاتك : ${scrollCount}\n` +
    `${skillsText}\n` +
    `____________________________\n` +
    `❓️ الصفحة ${page}/${totalPages} للانتقال لاخرى رد على هذه الرسالة برقمها\n` +
    `❓️ لشراء اي مهارة اكتب شراء مهارة ثم اسمها`;

  await sendReply(api, msg, messageID, threadID);
}

// ===== شراء مهارة =====

async function handleBuySkill(api, event, skillName) {
  const { threadID, senderID, messageID } = event;
  const kingdom = await getKingdomByThreadIdFull(threadID);
  if (!kingdom) return false;

  const player = await getPlayer(senderID);
  if (!player) {
    await sendReply(api, `يجب التسجيل اولاً\nارسل 《 تسجيل 》للانضمام`, messageID, threadID);
    return true;
  }

  const skill = getSkillDef(player.class, skillName);
  if (!skill) {
    await sendReply(api, `❌ لا توجد مهارة بهذا الاسم لفئتك`, messageID, threadID);
    return true;
  }

  const ownedSkills = player.skills || [];
  if (ownedSkills.some(s => s.name === skill.name)) {
    await sendReply(api, `❌ أنت تمتلك هذه المهارة بالفعل`, messageID, threadID);
    return true;
  }

  const playerLevel = player.level || 1;
  if (playerLevel < skill.level) {
    await sendReply(api,
      `┍━━━━[ ❌ فشل الشراء ]━━━━◊\n` +
      `┋ 🎯 المهارة : ${skill.name}\n` +
      `┋ 📊 المستوى المطلوب : ${skill.level}\n` +
      `┋ 📊 مستواك الحالي : ${playerLevel}\n` +
      `┕━━━━━━━━━━━━━━━━━◊`,
      messageID, threadID);
    return true;
  }

  const scrollCount = getScrollCount(player);
  if (scrollCount < skill.priceScrolls) {
    await sendReply(api,
      `┍━━━━[ ❌ فشل الشراء ]━━━━◊\n` +
      `┋ 📜 المطلوب : ${skill.priceScrolls} مخطوطة\n` +
      `┋ 📜 لديك : ${scrollCount} مخطوطة\n` +
      `┋ 📜 ينقصك : ${skill.priceScrolls - scrollCount} مخطوطة\n` +
      `┕━━━━━━━━━━━━━━━━━◊`,
      messageID, threadID);
    return true;
  }

  await removeItemFromBag(String(senderID), SCROLL_NAME, skill.priceScrolls);
  const newOwned = [...ownedSkills, { name: skill.name, purchasedAt: new Date() }];
  await updatePlayer(String(senderID), { skills: newOwned });

  await addXP(String(senderID), 15, api, threadID).catch(() => {});

  const remaining = scrollCount - skill.priceScrolls;
  await sendReply(api,
    `┍━━━━[ ✅ تمت عملية الشراء ]━━━━◊\n` +
    `┋ 🎯 المهارة : ${skill.name}\n` +
    `┋ 📜 المطلوب : ${skill.priceScrolls} مخطوطة\n` +
    `┋ 📜 كان لديك : ${scrollCount} مخطوطة\n` +
    `┋ 📜 المتبقي بعد الشراء : ${remaining} مخطوطة\n` +
    `┕━━━━━━━━━━━━━━━━━◊`,
    messageID, threadID);
  return true;
}

// ===== "مهاراتي" — عرض المهارات المملوكة =====

async function handleMySkills(api, event) {
  const { threadID, senderID, messageID } = event;
  const player = await getPlayer(senderID);
  if (!player) {
    await sendReply(api, `يجب التسجيل اولاً\nارسل 《 تسجيل 》للانضمام`, messageID, threadID);
    return;
  }

  const owned = player.skills || [];
  if (owned.length === 0) {
    await sendReply(api,
      `❐ لا تمتلك أي مهارات حالياً\nيمكنك شراء مهارة من 《 متجر مهارات 》`,
      messageID, threadID);
    return;
  }

  const list = owned.map((s, idx) => `${idx + 1} 》 ${s.name}`).join('\n');

  await sendReply(api,
    `❖ مهاراتك المملوكة ❖\n${list}\n\n` +
    `❓️ رد على هذه الرسالة برقم المهارة لمعرفة كل تفاصيلها\n` +
    `❓️ لاستعمال اي مهارة اكتب تفعيل مهارة ثم اسمها`,
    messageID, threadID);
}

// ===== الرد برقم على "مهاراتي" لعرض تفاصيل مهارة مملوكة =====

async function handleMySkillsDetailReply(api, event, num) {
  const { threadID, senderID, messageID } = event;
  const player = await getPlayer(senderID);
  if (!player) return;

  const owned = player.skills || [];
  if (isNaN(num) || num < 1 || num > owned.length) {
    await sendReply(api, `❌ رقم غير صحيح، الرجاء اختيار رقم بين 1 و ${owned.length}`, messageID, threadID);
    return;
  }

  const ownedSkill = owned[num - 1];
  const found = findSkillDefByNameAnyClass(ownedSkill.name);
  if (!found) {
    await sendReply(api, `⚠️ تعذر إيجاد تفاصيل هذه المهارة`, messageID, threadID);
    return;
  }

  await sendReply(api, formatSkillBlock(found.def), messageID, threadID);
}

// ===== تفعيل مهارة (الأمر: تفعيل مهارة ثم اسمها) =====

async function handleActivateSkill(api, event, skillName) {
  const { threadID, senderID, messageID } = event;
  const player = await getPlayer(senderID);
  if (!player) {
    await sendReply(api, `يجب التسجيل اولاً\nارسل 《 تسجيل 》للانضمام`, messageID, threadID);
    return true;
  }

  const owned = (player.skills || []).find(s => s.name === skillName);
  if (!owned) {
    await sendReply(api, `❌ أنت لا تمتلك هذه المهارة`, messageID, threadID);
    return true;
  }

  const found = findSkillDefByNameAnyClass(skillName);
  if (!found) {
    await sendReply(api, `⚠️ حدث خطأ في تحديد المهارة`, messageID, threadID);
    return true;
  }
  const skill = found.def;

  const activeSkills = player.activeSkills || {};
  const state = activeSkills[skill.name];
  const now = Date.now();

  if (state && state.cooldownUntil && now < state.cooldownUntil) {
    const remainMs = state.cooldownUntil - now;
    const mins = Math.ceil(remainMs / 60000);
    await sendReply(api,
      `❌ لا يمكنك تفعيل هذه المهارة الآن\n⏳ الوقت المتبقي لإعادة التفعيل : ${mins} دقيقة`,
      messageID, threadID);
    return true;
  }

  if (state && state.usesLeft > 0) {
    await sendReply(api,
      `⚠️ المهارة مفعلة بالفعل ولا تزال فعالة\n🔁 الاستخدامات المتبقية : ${state.usesLeft}`,
      messageID, threadID);
    return true;
  }

  const currentEP = player.ep ?? 1000;
  if (currentEP < skill.epCost) {
    await sendReply(api,
      `❌ طاقة غير كافية لتفعيل المهارة\n⚡ المطلوب : ${skill.epCost}\n🔋 لديك : ${currentEP}`,
      messageID, threadID);
    return true;
  }

  const newActiveSkills = { ...activeSkills };
  newActiveSkills[skill.name] = {
    usesLeft: skill.maxUses,
    activatedAt: new Date()
  };

  await updatePlayer(String(senderID), {
    ep: currentEP - skill.epCost,
    activeSkills: newActiveSkills
  });

  // 📸 إرسال صورة تفعيل المهارة أولاً، ثم رسالة التأكيد النصية
  try {
    await sendImageFromUrl(api, SKILL_ACTIVATION_IMAGE, threadID);
  } catch (e) {
    console.error('[matjar_maharat] Error sending skill activation image:', e.message);
  }

  await sendReply(api,
    `✅ تم تفعيل مهارة 《 ${skill.name} 》 بنجاح!\n` +
    `⌑ التأثير : ${skill.effect}\n` +
    `⚡ الطاقة المستهلكة : ${skill.epCost}\n` +
    `🔋 طاقتك المتبقية : ${currentEP - skill.epCost}`,
    messageID, threadID);
  return true;
}

// ===== تُستدعى من hijoom.js عند الهجوم لتطبيق التأثيرات الهجومية للمهارات المفعّلة =====
// تُرجع: { multiplier, messages, activeSkills } — المُضاعِف الإجمالي، رسائل توضيحية، وحالة المهارات المحدّثة بعد الاستهلاك
function applyOffensiveSkillEffects(player, weapon) {
  const activeSkills = { ...(player.activeSkills || {}) };
  let multiplier = 1;
  const messages = [];

  for (const skillName of Object.keys(activeSkills)) {
    const state = activeSkills[skillName];
    if (!state || !state.usesLeft || state.usesLeft <= 0) continue;

    const found = findSkillDefByNameAnyClass(skillName);
    if (!found) continue;
    const skill = found.def;

    if (skill.type === 'attack_multiplier' && skill.weaponRequired === weapon.name) {
      multiplier *= skill.multiplier;

      const newState = { ...state, usesLeft: state.usesLeft - 1 };

      if (newState.usesLeft <= 0) {
        newState.cooldownUntil = Date.now() + skill.cooldownMs;
        messages.push(`⚠️ انتهى مفعول مهارة 《 ${skill.name} 》! يمكن اعادة تفعيلها بعد ساعة واحدة`);
      } else {
        messages.push(`✨ تأثير مهارة 《 ${skill.name} 》 فعّال (متبقٍ ${newState.usesLeft} استخدام)`);
      }
      activeSkills[skillName] = newState;
    }
  }

  return { multiplier, messages, activeSkills };
}

module.exports = {
  SCROLL_NAME,
  SKILLS_BY_CLASS,
  handleMatjarMaharat,
  handleBuySkill,
  handleMySkills,
  handleMySkillsDetailReply,
  handleActivateSkill,
  applyOffensiveSkillEffects,
  getScrollCount
};
