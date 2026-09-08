const KEY = 'breakfast_app_v1';

const CATEGORIES = [
    { key: 'mian',  name: '面食' },
    { key: 'zhong', name: '中式主食' },
    { key: 'xi',    name: '西式主食' },
    { key: 'dian',  name: '派·甜点' },
    { key: 'dan',   name: '蛋类' },
    { key: 'rou',   name: '肉类' },
    { key: 'zhou',  name: '粥·饮' },
    { key: 'tang',  name: '汤·馄饨' }
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.key, c.name]));

/* ---------- 日期工具 ---------- */
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayStr() { return dateStr(new Date()); }
function tomorrowStr() { return dateStr(addDays(new Date(), 1)); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function parseDate(s) { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); }
/* 日期角标：仅今天/明天触发，其余返回 null。
   返回 `{label, kind}` 或 `null`，调用方拿到同一形态就能复制复用 */
function dayBadge(dateStr) {
    if (dateStr === todayStr()) return { label: '今', kind: 'today' };
    if (dateStr === tomorrowStr()) return { label: '明', kind: 'tomorrow' };
    return null;
}
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
function fmtCN(s) {
    const d = parseDate(s);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()];
}
/* 相对今天/明天/后天/昨天；其余返回空，由调用方决定如何显示 */
function relLabel(s) {
    const t = todayStr(), tm = tomorrowStr();
    if (s === t) return '今天';
    if (s === tm) return '明天';
    if (s === dateStr(addDays(new Date(), 2))) return '后天';
    if (s === dateStr(addDays(new Date(), -1))) return '昨天';
    return '';
}

function uid(p) { return (p || 'id') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* ---------- 数量增减（支持 "100 g" / "2 个" / "少许"） ---------- */
function adjustQty(qty, delta) {
    const m = String(qty).match(/^(.*?)(\d+)\s*(.*)$/);
    if (!m) return qty;                     // 无可解析数字则原样
    let num = parseInt(m[2], 10) + delta;
    if (num < 0) num = 0;
    return (m[1] + num + ' ' + m[3]).trim();
}

/* ---------- 预置食谱（按分类整理的初始数据） ---------- */
function seedRecipes() {
    const groups = [
        ['mian',  ['牛肉面（含加蛋番茄牛肉面）', '意大利面', '竹升面', '方便面', '炝锅面', '莜面鱼鱼']],
        ['zhong', ['煎饼', '手抓饼', '土豆丝饼', '糯玉米饼', '牛肉饼', '牛肉馅饼', '煎饺子', '包子', '猪肉包子', '小馒头', '馒头', '奶香馒头', '油条', '汤圆', '粑粑', '海鲜年糕', '藕合']],
        ['xi',    ['面包', '面包片', '黄油面包', '烤芝士面包片', '芝士果酱面包片', '法棍', '贝果', '牛角包', '三明治', '披萨', '芝士牛肉卷', '薯饼']],
        ['dian',  ['苹果派', '香蕉派', '燕麦派', '炸鲜奶']],
        ['dan',   ['鸡蛋', '摊鸡蛋', '煎鸡蛋', '茶叶蛋', '鸡蛋羹', '面包块鸡蛋', '面包片夹鸡蛋']],
        ['rou',   ['牛排', '牛肉肠', '黑虎虾肠', '川香鸡柳', '鸡块', '牙签肉', '叉烧肉', '小肚']],
        ['zhou',  ['粥', '小米粥', '小米南瓜粥', '小米燕麦粥', '燕麦粥', '燕麦米粥', '杂粮粥', '豆腐脑', '黑芝麻糊', '芝麻糊', '山药糊', '燕麦牛奶', '酸奶燕麦', '牛奶', '牛奶咖啡']],
        ['tang',  ['馄饨', '虾仁馄饨']]
    ];
    let n = 0;
    const list = [];
    groups.forEach(([cat, names]) => names.forEach(name => {
        list.push({ id: 'r' + (++n), name, category: cat, tags: [], ingredients: [], steps: [], favorite: false });
    }));
    return list;
}

function seed() {
    return {
      recipes: seedRecipes(),
      plan: {},
      shopping: [],
      settings: { family: '我们家', breakfastReminder: true, reminderTime: '07:00', shoppingReminder: true }
    };
}

/* ---------- 存储适配：localStorage 不可用时降级为内存存储 ----------
   * （部分浏览器在 file:// 或隐私模式下会禁用 localStorage，
   *   此时数据仅在本次会话内保留，但应用仍可完整使用）            */
const LS = (function () {
    try {
      localStorage.setItem('__probe__', '1');
      localStorage.removeItem('__probe__');
      return localStorage;
    } catch (e) {
      const mem = {};
      return {
        _memory: true,
        getItem: k => (k in mem ? mem[k] : null),
        setItem: (k, v) => { mem[k] = String(v); },
        removeItem: k => { delete mem[k]; }
      };
    }
})();
const USING_MEMORY = !!LS._memory;

/* ---------- 读写 ---------- */
let state;
function load() {
    try {
      const raw = LS.getItem(KEY);
      if (raw) {
        state = JSON.parse(raw);
        return;
      }
    } catch (e) { /* ignore */ }
    state = seed();
    save();
}
function save() {
    try { LS.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 容量或隐私模式 */ }
}

/* ---------- 食谱 CRUD ---------- */
function getRecipes() { return state.recipes.slice(); }
function getRecipe(id) { return state.recipes.find(r => r.id === id) || null; }
function addRecipe(data) {
    const r = Object.assign({ id: uid('r'), favorite: false, tags: [], ingredients: [], steps: [] }, data);
    state.recipes.push(r); save(); return r;
}
function updateRecipe(id, data) {
    const r = getRecipe(id); if (!r) return null;
    Object.assign(r, data); save(); return r;
}
function deleteRecipe(id) {
    state.recipes = state.recipes.filter(r => r.id !== id);
    Object.keys(state.plan).forEach(d => { state.plan[d] = state.plan[d].filter(x => x !== id); });
    save();
}

/* ---------- 日期规划 ---------- */
function getPlan(date) { return (state.plan[date] || []).slice(); }
function setPlan(date, ids) { state.plan[date] = ids.slice(); save(); }
function togglePlan(date, recipeId) {
    const cur = getPlan(date);
    const i = cur.indexOf(recipeId);
    if (i >= 0) cur.splice(i, 1); else cur.push(recipeId);
    if (cur.length) state.plan[date] = cur; else delete state.plan[date];
    save(); return cur;
}
// 套用上周：把上周同日安排复制给今天/指定日
function applyLastWeek(date) {
    const src = dateStr(addDays(parseDate(date), -7));
    const ids = getPlan(src);
    setPlan(date, ids);
    return ids;
}
// 整周模板：用本周已有安排模式套到整周（这里实现为：把 today 的安排复制到本周剩余未安排的日期）
function applyWeekTemplate() {
    const t = new Date();
    const base = getPlan(dateStr(t));
    for (let i = 0; i < 7; i++) {
      const d = dateStr(addDays(t, i));
      if (!state.plan[d] || !state.plan[d].length) state.plan[d] = base.slice();
    }
    save();
}
// 确保某道菜排进指定日期（已存在则不动，不会因 toggle 误删）
function addToPlan(date, recipeId) {
    const cur = getPlan(date);
    if (cur.indexOf(recipeId) < 0) { cur.push(recipeId); state.plan[date] = cur; save(); }
    return cur;
}
// 计划里出现过的全部食谱 id（去重）——买菜页默认只列这些，避免列出整个食谱库
function getPlannedRecipeIds() {
    const ids = new Set();
    Object.values(state.plan).forEach(arr => { if (Array.isArray(arr)) arr.forEach(id => ids.add(id)); });
    return [...ids];
}

/* ---------- 买菜单（手动维护） ---------- */
function getShopping() { return state.shopping.slice(); }
function addShoppingItem(name, qty) {
    name = (name || '').trim(); if (!name) return;
    state.shopping.push({ id: uid('s'), name, qty: qty || '', bought: false }); save();
}
function toggleBought(id) {
    const it = state.shopping.find(s => s.id === id); if (it) { it.bought = !it.bought; save(); }
}
function changeQty(id, delta) {
    const it = state.shopping.find(s => s.id === id); if (it) { it.qty = adjustQty(it.qty, delta); save(); }
}
function delShopping(id) { state.shopping = state.shopping.filter(s => s.id !== id); save(); }
function clearShopping() { state.shopping = []; save(); }
// 从食谱带入食材（按名称去重合并）。date 可选：从日历/计划带入时传，存进 fromRecipe 用于后续「已备齐 → 从计划移除」链路
function importRecipeIngredients(recipeId, date) {
    const r = getRecipe(recipeId); if (!r) return;
    const src = date ? { id: r.id, name: r.name, date } : null;
    r.ingredients.forEach(ing => {
      const exist = state.shopping.find(s => s.name === ing.name && s.fromRecipe && (!src || s.fromRecipe.id === src.id) && s.fromRecipe.date === (src && src.date));
      if (exist) { exist.qty = ing.qty || exist.qty; }
      else state.shopping.push({ id: uid('s'), name: ing.name, qty: ing.qty || '', bought: false, fromRecipe: src });
    });
    save();
}
/* 找某食谱在日历里出现过的所有日期（按时间升序） */
function getPlannedDatesForRecipe(recipeId) {
    return Object.keys(state.plan).filter(d => state.plan[d].indexOf(recipeId) >= 0).sort();
}
/* 按 fromRecipe 分组：带源的成组、孤立项单列；统计每组的"备齐"情况 */
function getShoppingGrouped() {
    const groups = [];
    const byKey = {};
    const loose = [];
    state.shopping.forEach(it => {
      const k = it.fromRecipe ? (it.fromRecipe.id + '|' + it.fromRecipe.date) : '';
      if (!k) { loose.push(it); return; }
      if (!byKey[k]) { byKey[k] = { recipe: { id: it.fromRecipe.id, name: it.fromRecipe.name }, date: it.fromRecipe.date, items: [], allBought: false }; groups.push(byKey[k]); }
      byKey[k].items.push(it);
    });
    groups.forEach(g => { g.allBought = g.items.length > 0 && g.items.every(i => i.bought); });
    return { groups, loose };
}
/* 完成一道计划中的菜：清空对应组的购物项 + 从 plan 中移除该食谱 */
function finishPlannedRecipe(recipeId, date) {
    state.shopping = state.shopping.filter(s => !(s.fromRecipe && s.fromRecipe.id === recipeId && s.fromRecipe.date === date));
    if (state.plan[date]) {
      state.plan[date] = state.plan[date].filter(r => r !== recipeId);
      if (state.plan[date].length === 0) delete state.plan[date];
    }
    save();
}

/* ---------- 设置 ---------- */
function getSettings() { return Object.assign({}, state.settings); }
function updateSettings(data) { Object.assign(state.settings, data); save(); }

/* ---------- 缓存 / 数据清理 ---------- */
/* 统计当前数据规模与占用，供设置页展示 */
function storageInfo() {
    let raw = '';
    try { raw = LS.getItem(KEY) || ''; } catch (e) { raw = ''; }
    let bytes = raw.length;                       // 兜底：按字符数
    try { bytes = new Blob([raw]).size; } catch (e) { /* 环境无 Blob 则用字符数 */ }
    return {
      usingMemory: USING_MEMORY,                  // true = localStorage 不可用，数据在内存里（刷新即丢）
      bytes,
      recipes: state.recipes.length,
      planDays: Object.keys(state.plan).length,
      shoppingItems: state.shopping.length
    };
}
/* 仅清空日历计划（保留食谱库与买菜清单） */
function clearPlan() { state.plan = {}; save(); }
/* 清空本地缓存并恢复初始数据：移除 localStorage 记录 + 重置为种子状态
   注意：会丢失自建食谱 / 计划 / 清单，不可撤销，调用方需二次确认 */
function resetAll() {
    try { LS.removeItem(KEY); } catch (e) { /* 隐私模式 */ }
    state = seed();
    save();
}

/* ---------- 导入 / 导出 ---------- */
function exportData() { return JSON.stringify(state, null, 2); }
function importData(json) {
    const obj = JSON.parse(json);
    if (!obj.recipes || !obj.plan) throw new Error('数据格式不正确');
    state = obj; save();
}

/* ---------- 暴露 ---------- */
export {
    CATEGORIES, CAT_LABEL, USING_MEMORY, LS, KEY,
    dateStr, todayStr, tomorrowStr, addDays, parseDate, fmtCN, relLabel, dayBadge, uid, adjustQty,
    load, save,
    getRecipes, getRecipe, addRecipe, updateRecipe, deleteRecipe,
    getPlan, setPlan, togglePlan, addToPlan, applyLastWeek, applyWeekTemplate, getPlannedRecipeIds,
    getShopping, addShoppingItem, toggleBought, changeQty, delShopping, clearShopping, importRecipeIngredients,
    getPlannedDatesForRecipe, getShoppingGrouped, finishPlannedRecipe,
    getSettings, updateSettings,
    storageInfo, clearPlan, resetAll,
    exportData, importData
};