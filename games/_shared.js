/*
 * ═══════════════════════════════════════════════════════════════════════
 *  games/_shared.js — أدوات وبيانات مشتركة بين كل ألعاب دار الألعاب
 * ═══════════════════════════════════════════════════════════════════════
 *  هذا الملف يحتوي على دوال مساعدة عامة تستخدمها أكثر من لعبة.
 *  لا تحتاج لرفع هذا الملف عادة إلا إذا كنت تعدل دالة مشتركة (shuffle, إلخ).
 */

'use strict';

// إيموجيات للعبة الدخيل
const INTRUDER_EMOJIS = ['🦊', '🐯', '🍎', '🐶', '🎯', '🌸', '🚀', '🦋', '🐱', '🐼', '🍕', '🎸', '🌈', '🐮', '🦁', '🐸', '🐨', '🦖', '🍩', '🥑', '🛸', '🎈', '🔑', '💎', '🎨', '🎪', '⚽', '🚗', '👻', '🌵', '🌽'];

// إيموجيات خيوط القنبلة
const BOMB_WIRES = ['🔴', '🔵', '🟢', '🟡', '⚫', '⚪', '🟤', '🟣', '🟠', '🟨'];

// إيموجيات أعلام الدول والبلدان المطابقة
const FLAG_DB = [
  { flag: '🇲🇦', ans: 'المغرب' }, { flag: '🇩🇿', ans: 'الجزائر' }, { flag: '🇸🇦', ans: 'السعودية' },
  { flag: '🇪🇬', ans: 'مصر' }, { flag: '🇵🇸', ans: 'فلسطين' }, { flag: '🇮🇶', ans: 'العراق' },
  { flag: '🇸🇾', ans: 'سوريا' }, { flag: '🇹🇳', ans: 'تونس' }, { flag: '🇯🇴', ans: 'الأردن' },
  { flag: '🇦🇪', ans: 'الإمارات' }, { flag: '🇶🇦', ans: 'قطر' }, { flag: '🇴🇲', ans: 'عمان' },
  { flag: '🇾🇪', ans: 'اليمن' }, { flag: '🇱🇧', ans: 'لبنان' }, { flag: '🇰🇼', ans: 'الكويت' },
  { flag: '🇧🇭', ans: 'البحرين' }, { flag: '🇸🇩', ans: 'السودان' }, { flag: '🇱🇾', ans: 'ليبيا' }
];

// كلمات عالم نيكسوس للألعاب اللغوية
const NEXUS_WORDS = ['نيكسوس', 'مورداك', 'سولفارا', 'نيرافيل', 'فارس', 'ساحر', 'معالج', 'مجند', 'كوينز', 'مملكة'];

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function scrambleWord(word) {
  const chars = word.split('');
  shuffleArray(chars);
  return chars.join(' ');
}

function generateIntruderGrid() {
  const base = [...INTRUDER_EMOJIS];
  shuffleArray(base);

  const pairs = base.slice(0, 15);
  const intruder = base[15];

  const gridArray = [...pairs, ...pairs, intruder];
  shuffleArray(gridArray);

  return { grid: gridArray.join(' '), intruder };
}

function renderXOBoard(board) {
  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  const grid = board.map((v, i) => v || emojis[i]);
  return `${grid[0]}${grid[1]}${grid[2]}\n` +
         `${grid[3]}${grid[4]}${grid[5]}\n` +
         `${grid[6]}${grid[7]}${grid[8]}`;
}

function renderWires(wires) {
  return wires.map((w, i) => {
    if (w === '✂️') return `『 ${i + 1} 』✂️ مقطوع`;
    return `『 ${i + 1} 』${w} الخيط الملون`;
  }).join('\n');
}

function checkXOWinner(board, symbol) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  return winPatterns.some(p => p.every(idx => board[idx] === symbol));
}

function findBestXOMove(board, selfSymbol, oppSymbol) {
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      board[i] = selfSymbol;
      if (checkXOWinner(board, selfSymbol)) {
        board[i] = null;
        return i;
      }
      board[i] = null;
    }
  }

  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      board[i] = oppSymbol;
      if (checkXOWinner(board, oppSymbol)) {
        board[i] = null;
        return i;
      }
      board[i] = null;
    }
  }

  if (board[4] === null) return 4;

  const av = [];
  board.forEach((v, i) => { if (v === null) av.push(i); });
  return av[Math.floor(Math.random() * av.length)];
}

module.exports = {
  INTRUDER_EMOJIS,
  BOMB_WIRES,
  FLAG_DB,
  NEXUS_WORDS,
  shuffleArray,
  scrambleWord,
  generateIntruderGrid,
  renderXOBoard,
  renderWires,
  checkXOWinner,
  findBestXOMove
};
