const KEY = 'breakfast_app_v1';

const CATEGORIES = [
    { key: 'zhou', name: '粥' },
    { key: 'mian', name: '面点' },
    { key: 'dan',  name: '蛋' },
    { key: 'xi',   name: '西式' },
    { key: 'yin',  name: '饮品' }
];
const CAT_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.key, c.name]));

/* ---------- 日期工具 ---------- */
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function dateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayStr() { return dateStr(new Date()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function parseDate(s) { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); }
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
function fmtCN(s) {
    const d = parseDate(s);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()];
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

/* ---------- 预置食谱 ---------- */
function seedRecipes() {
    return [
      { id: 'r1', name: '皮蛋瘦肉粥', category: 'zhou', tags: ['清淡', '暖胃', '简单'],
        ingredients: [{ name: '大米', qty: '100 g' }, { name: '皮蛋', qty: '2 个' }, { name: '瘦肉', qty: '200 g' }, { name: '葱花 / 盐', qty: '少许' }],
        steps: ['大米淘净冷水下锅，大火煮开转小火慢熬', '瘦肉切丝、皮蛋切块，粥稠时放入', '加盐胡椒粉，撒葱花，关火出锅'], favorite: true },
      { id: 'r2', name: '葱油饼', category: 'mian', tags: ['香脆', '简单'],
        ingredients: [{ name: '面粉', qty: '300 g' }, { name: '小葱', qty: '1 把' }, { name: '油 / 盐', qty: '适量' }],
        steps: ['面粉加温水和成软面团，醒 20 分钟', '擀薄抹油撒葱花盐，卷起再擀圆', '小火煎至两面金黄'], favorite: false },
      { id: 'r3', name: '茶叶蛋', category: 'dan', tags: ['简单', '提前做'],
        ingredients: [{ name: '鸡蛋', qty: '6 个' }, { name: '红茶 / 酱油 / 香料', qty: '适量' }],
        steps: ['鸡蛋煮熟敲出裂纹', '加茶叶酱油香料卤煮 10 分钟', '泡过夜更入味'], favorite: false },
      { id: 'r4', name: '牛奶燕麦', category: 'yin', tags: ['快捷', '简单'],
        ingredients: [{ name: '牛奶', qty: '1 盒' }, { name: '燕麦', qty: '50 g' }],
        steps: ['燕麦入碗，倒牛奶没过', '微波炉 1 分钟或热水冲泡', '搅匀即食'], favorite: false },
      { id: 'r5', name: '火腿三明治', category: 'xi', tags: ['快捷'],
        ingredients: [{ name: '吐司', qty: '2 片' }, { name: '火腿', qty: '2 片' }, { name: '生菜', qty: '2 片' }, { name: '鸡蛋', qty: '1 个' }],
        steps: ['煎蛋与火腿', '吐司夹蛋、火腿、生菜', '对角切开'], favorite: false },
      { id: 'r6', name: '现磨豆浆', category: 'yin', tags: ['适中', '养生'],
        ingredients: [{ name: '黄豆', qty: '100 g' }],
        steps: ['黄豆提前泡发', '豆浆机加水打浆', '煮沸过滤'], favorite: false }
    ];
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
// 从食谱带入食材（按名称去重合并）
function importRecipeIngredients(recipeId) {
    const r = getRecipe(recipeId); if (!r) return;
    r.ingredients.forEach(ing => {
      const exist = state.shopping.find(s => s.name === ing.name);
      if (exist) { exist.qty = ing.qty || exist.qty; }
      else state.shopping.push({ id: uid('s'), name: ing.name, qty: ing.qty || '', bought: false });
    });
    save();
}

/* ---------- 设置 ---------- */
function getSettings() { return Object.assign({}, state.settings); }
function updateSettings(data) { Object.assign(state.settings, data); save(); }

/* ---------- 导入 / 导出 ---------- */
function exportData() { return JSON.stringify(state, null, 2); }
function importData(json) {
    const obj = JSON.parse(json);
    if (!obj.recipes || !obj.plan) throw new Error('数据格式不正确');
    state = obj; save();
}

/* ---------- 暴露 ---------- */
export {
    CATEGORIES, CAT_LABEL, USING_MEMORY, LS,
    dateStr, todayStr, addDays, parseDate, fmtCN, uid, adjustQty,
    load, save,
    getRecipes, getRecipe, addRecipe, updateRecipe, deleteRecipe,
    getPlan, setPlan, togglePlan, addToPlan, applyLastWeek, applyWeekTemplate, getPlannedRecipeIds,
    getShopping, addShoppingItem, toggleBought, changeQty, delShopping, clearShopping, importRecipeIngredients,
    getSettings, updateSettings,
    exportData, importData
};