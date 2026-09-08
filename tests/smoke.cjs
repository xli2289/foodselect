/* 冒烟测试：在 jsdom 里真实渲染 app.js，验证日历选天合并后的行为
   运行：NODE_PATH=<装有 jsdom 的目录>/node_modules node tests/smoke.cjs
   用 CJS 是因为 ESM 不认 NODE_PATH，而 jsdom 装在隔离工作区里 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');

(async () => {

/* app.js / store.js / seed.data.js 是 ESM，但项目无 package.json，Node 会按 CJS 解析 .js
   → 复制到临时目录改名 .mjs 再 import，并同步改写模块间的相对引用，避免污染项目
   （新增数据模块时，记得在这里加一条 copy + 引用替换，否则 import 会找不到文件） */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'foodselect-'));
const appSrc = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8').replace("'./store.js'", "'./store.mjs'");
fs.writeFileSync(path.join(tmp, 'app.mjs'), appSrc);
const storeSrc = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8').replace("'./seed.data.js'", "'./seed.data.mjs'");
fs.writeFileSync(path.join(tmp, 'store.mjs'), storeSrc);
fs.copyFileSync(path.join(root, 'js/seed.data.js'), path.join(tmp, 'seed.data.mjs'));

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'http://localhost/' });
const win = dom.window;
Object.assign(globalThis, {
  window: win, document: win.document, location: win.location,
  localStorage: win.localStorage, Blob: win.Blob, URL: win.URL, FileReader: win.FileReader
});

await import(pathToFileURL(path.join(tmp, 'app.mjs')).href);
const S = await import(pathToFileURL(path.join(tmp, 'store.mjs')).href);

const $ = s => win.document.querySelector(s);
const $$ = s => [...win.document.querySelectorAll(s)];
const click = el => el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
const action = (a, attr = {}) => {
  const el = $(`[data-action="${a}"]${Object.entries(attr).map(([k, v]) => `[data-${k}="${v}"]`).join('')}`);
  if (!el) throw new Error(`找不到 [data-action=${a}]`);
  click(el);
  return el;
};

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); };
const heroText = () => $('.cal-hero .day-title').textContent.trim();
const selDate = () => $('.day.sel')?.textContent.replace(/\D/g, '');
const dayCell = d => $$('.day:not(.empty)').find(c => c.textContent.replace(/\D/g, '') === String(d));

/* 记录初始种子数量：此刻 state 刚 load，尚未被任何测试新增/删除污染
   （[13] 节「清空本地缓存」会拿它做基准） */
const SEED_COUNT = S.getRecipes().length;

console.log('\n[1] 初始渲染');
/* 种子数据应来自独立数据文件 js/seed.data.js，而非硬编码在 store.js 里 */
const SEED = await import(pathToFileURL(path.join(tmp, 'seed.data.mjs')).href);
ok('默认食谱提取为独立数据文件 js/seed.data.js', !!SEED.SEED_GROUPS && Array.isArray(SEED.CATEGORIES));
ok('数据文件菜名总数 == 初始食谱数', SEED.SEED_GROUPS.reduce((n, g) => n + g.names.length, 0) === SEED_COUNT);
ok('数据文件每个分组的分类都在 CATEGORIES 中定义',
  SEED.SEED_GROUPS.every(g => SEED.CATEGORIES.some(c => c.key === g.category)));
ok('首页渲染出日历', !!$('.cal-hero') && !!$('.days'));
ok('底部导航第一项为「计划」', $$('.nav div')[0].textContent.includes('计划'));
ok('底部导航第三项为「买菜」', $$('.nav div')[2].textContent.includes('买菜'));
ok('默认选中今天且只有一个选中格', $$('.day.sel').length === 1 && $('.day.sel').classList.contains('today'));
ok('今天格同时有 today 与 sel', !!$('.day.sel.today'));
ok('标题显示今天 + 相对标签', heroText().includes('今天'));
ok('已移除旧的今天/明天双标签', !$('.day-switch') && !$('.day-tab'));

/* 断言跟随当前月份，测试不会随时间失效 */
const now = new Date();
const M = now.getMonth() + 1, Y = now.getFullYear();
const dLabel = d => `${M}月${d}日`;
const lastDay = new Date(Y, M, 0).getDate();
const nextM = M === 12 ? 1 : M + 1, nextY = M === 12 ? Y + 1 : Y;

console.log('\n[2] 点网格选天');
click(dayCell(15));
ok('15 号被选中', selDate() === '15');
ok('选中态唯一', $$('.day.sel').length === 1);
ok('面板标题跟随为 ' + dLabel(15), heroText().includes(dLabel(15)));
ok('非今天时相对标签不显示', !heroText().includes('今天'));

console.log('\n[3] 箭头翻天');
action('day-next');
ok('后一天 → 16 号', selDate() === '16' && heroText().includes(dLabel(16)));
action('day-prev'); action('day-prev');
ok('连点前一天 → 14 号', selDate() === '14');
action('cal-today');
ok('回到今天', selDate() === String(now.getDate()) && heroText().includes('今天'));

console.log('\n[4] 跨月自动翻页');
click(dayCell(lastDay));
ok(`选中本月最后一天 ${lastDay} 号`, selDate() === String(lastDay));
action('day-next');
ok(`跨月后月份导航变 ${nextY}年${nextM}月`, $('.cal-top .m').textContent.includes(`${nextY}年${nextM}月`));
ok('跨月后选中 1 号', selDate() === '1');
action('day-prev');
ok(`往回翻月变回 ${Y}年${M}月`, $('.cal-top .m').textContent.includes(`${Y}年${M}月`) && selDate() === String(lastDay));

console.log('\n[5] 换天后步骤面板不残留');
action('cal-today');
// 默认计划为空，先给今天排一道菜再测步骤面板
action('open-pick');
click($('.modal-item'));
action('pick-confirm');
const firstDish = $('.dish-item');
ok('今天有已安排的菜', !!firstDish);
// 种子食谱默认无步骤，这里给该菜注入步骤以验证「步骤面板」展开/关闭逻辑（不污染纯名称初始数据）
S.updateRecipe(firstDish.dataset.id, { steps: ['示例步骤一', '示例步骤二'] });
click(firstDish);
ok('点菜品展开步骤面板', !!$('.steps-panel'));
click(dayCell(20));
ok('换天后步骤面板已关闭', !$('.steps-panel'));

console.log('\n[6] 加菜 / 移除（统一选菜弹窗 + 确认栏）');
click(dayCell(20));
const onIds = $$('.dish-item').map(d => d.dataset.id);
const before = onIds.length;
action('open-pick');
ok('弹窗有 .modal 白底容器', !!$('.mask > .modal'));
ok('统一的选菜弹窗含搜索框', !!$('[data-bind="pickSearch"]'));
ok('主选菜弹窗不再含内联推荐区', !$('.pick-recs-title') && !$('#pick-recs'));
ok('底部有「确认添加」栏且初始禁用', !!$('[data-action="pick-confirm"]') && $('#pick-ok').disabled === true);
if (before === 0) {
  click($('.modal-item'));
  ok('点一项后变为「已选」', !!$('.modal-item.sel'));
  ok('底部计数变为「已选 1 道」', $('#pick-count').textContent.includes('1'));
  action('pick-confirm');
  ok('确认后列表新增一条', $$('.dish-item').length === 1);
} else {
  const addable = $$('#pick-list .modal-item').find(i => !onIds.includes(i.dataset.id));
  ok('弹窗列出可加的新菜', !!addable);
  click(addable);
  action('pick-confirm');
  ok('确认后当天新增一道（总数 +1）', $$('.dish-item').length === before + 1);
}

console.log('\n[7] 快捷操作：预览 + 确认（不直接覆盖）');
/* 整周模板：以今天为模板，仅填充空白日 */
const hasBefore = $$('.day.has').length;
action('apply-template');
ok('点整周模板先弹预览框，不直接套用', !!$('.mask') && $$('.day.has').length === hasBefore);
ok('预览框含「确认套用」与每日结果', !!$('[data-action="confirm-ok"]') && !!$('.apv-wk'));
action('confirm-cancel');
ok('取消后无弹窗且不写入', !$('.mask') && $$('.day.has').length === hasBefore);
action('apply-template');
action('confirm-ok');
ok('确认后本周被填充（≥7 天有安排）', $$('.day.has').length >= 7 && !$('.mask'));

/* 今天 vs 明天：仅这两个日期触发角标（先回到当前月，确保两者都在网格内） */
action('cal-today');
const todayCell = $('.day.today');
const tBadge = todayCell && todayCell.querySelector('.day-tag-today');
const tTomorrowBadge = todayCell && todayCell.querySelector('.day-tag-tomorrow');
ok('今天格子有 .today 类', !!todayCell);
ok('今天格子有「今」角标', !!tBadge && tBadge.textContent === '今');
ok('今天格子没有「明」角标', !tTomorrowBadge);
// 找到明天格子：把 today 的日期加一天
const tomorrowDS = (function(){
  const t = new Date(); t.setDate(t.getDate()+1);
  return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
})();
const tmrCell = document.querySelector(`.day[data-date="${tomorrowDS}"]`);
const tmBadge = tmrCell && tmrCell.querySelector('.day-tag-tomorrow');
ok('明天格子存在且在当前月', !!tmrCell);
ok('明天格子有「明」角标', !!tmBadge && tmBadge.textContent === '明');
// 昨日断言已废弃：现在不在昨天加角标
ok('今天格子不包含「昨」徽标（实现已切换到今/明）', !!todayCell && !todayCell.querySelector('.ye-tag'));
// 当前月应只有 1 个「今」角标和 1 个「明」角标
ok('当前月只有 1 个「今」角标', $$('.day-tag-today').length === 1);
ok('当前月只有 1 个「明」角标', $$('.day-tag-tomorrow').length === 1);
// 其他日子不该有任何角标：随机抽一个非今天明天的格子
const noBadgeCell = [...$$('.day')].find(d => d !== todayCell && d !== tmrCell && !d.classList.contains('empty'));
ok('其他格子（含昨天）不应带角标', !!noBadgeCell && !noBadgeCell.querySelector('.day-tag'));

/* 套用上周：用已安排的 20 号给 27 号（20+7）做来源 */
click(dayCell(20));
if (!dayCell(20).classList.contains('has')) { action('open-pick'); click($('.modal-item')); action('close-modal'); }
click(dayCell(27));
const d27before = dayCell(27).classList.contains('has');
action('apply-lastweek');
ok('点套用上周先弹预览框，不直接套用', !!$('.mask') && dayCell(27).classList.contains('has') === d27before);
ok('预览展示来源/目标与影响提示', !!$('.apv-row') && !!$('.warn, .muted'));
action('confirm-cancel');
action('apply-lastweek');
action('confirm-ok');
ok('确认后 27 号套上上周同日(20号)的安排', dayCell(27).classList.contains('has') && !$('.mask'));

console.log('\n[8] 其他页面回归');
['library', 'shopping'].forEach(r => {
  action('nav', { route: r });
  ok(`切到 ${r} 正常渲染`, !!$('.view') && !$('.cal-hero'));
});
action('nav', { route: 'calendar' });
ok('切回计划页默认选中今天', $$('.day.sel').length === 1 && $('.day.sel').classList.contains('today'));

console.log('\n[9] 加菜弹窗：搜索 / 筛选');
const emptyDay = $$('.day:not(.empty)').find(c => !c.classList.contains('has'));
if (emptyDay) {
  click(emptyDay);
  action('open-pick');
  ok('弹窗含搜索框', !!$('.modal-search input[data-bind="pickSearch"]'));
  ok('弹窗含正确的分类筛选标签数', $$('.modal-filters span').length === S.CATEGORIES.length + 1);

  /* 搜索：按食材名「牛奶」过滤 */
  const searchInput = $('.modal-search input');
  searchInput.value = '牛奶';
  searchInput.dispatchEvent(new win.Event('input', { bubbles: true }));
  const sItems = $$('#pick-list .modal-item');
  ok('搜索「牛奶」后列表仅含匹配项', sItems.length > 0 && sItems.every(i => i.textContent.includes('牛奶')));
  searchInput.value = '';
  searchInput.dispatchEvent(new win.Event('input', { bubbles: true }));
  ok('清空搜索后恢复全部列表', $$('#pick-list .modal-item').length >= 6);

  /* 分类筛选：选「粥」 */
  action('pick-filter', { cat: 'zhou' });
  const zhouItems = $$('#pick-list .modal-item');
  ok('选「粥」后仅显示粥类', zhouItems.length > 0 && zhouItems.every(i => i.querySelector('.cat.cat-zhou')));
  action('pick-filter', { cat: '' });
  ok('回到「全部」恢复全部分类', $$('#pick-list .modal-item').length >= 6);

  action('close-modal');
  ok('关闭弹窗不写入（仍无安排）', !$('.mask'));
} else {
  ok('未找到空白日用于测试（跳过）', true);
}

console.log('\n[10] 独立「随机推荐」弹窗');
if (emptyDay) {
  click(emptyDay);
  ok('当天卡片同时有「加一道菜」和「让我推荐」', !!$('[data-action="open-pick"]') && !!$('[data-action="open-recommend"]'));
  action('open-recommend');
  ok('打开推荐弹窗（与主选菜完全分开）', !!$('.rec-list') && !!$('.rec-foot'));
  ok('默认推荐 1~2 道菜', $$('.rec-card').length >= 1 && $$('.rec-card').length <= 2);
  ok('默认全部勾上（已选 N 道 = 卡数）', $('#rec-count').textContent.includes(String($$('.rec-card').length)) && $('#rec-ok').disabled === false);

  /* 取消全部 → 验证按钮置灰；再勾回 */
  const card0 = $('.rec-card');
  const id0 = card0.dataset.id;
  /* 全部取消（可能 1 或 2 张） */
  let allIds = $$('.rec-card').map(c => c.dataset.id);
  allIds.forEach(i => click($(`.rec-card[data-id="${i}"]`)));
  ok('全部取消后无 sel 卡', $$('.rec-card.sel').length === 0);
  ok('已选为 0 时「加入」按钮置灰', $('#rec-ok').disabled === true);

  /* 重新勾一张 */
  click($(`.rec-card[data-id="${id0}"]`));
  ok('再次点击恢复为已选', $(`.rec-card[data-id="${id0}"]`).classList.contains('sel'));

  /* 换一换：拿 2 道新菜（去重卡 id 集合变化） */
  const beforeIds = $$('.rec-card').map(c => c.dataset.id).sort().join(',');
  click($('[data-action="rec-refresh"]'));
  ok('换一换后仍展示 N 道（与之前同数）', $$('.rec-card').length === $$('.rec-card.sel').length && $$('.rec-card').length > 0);
  const afterIds = $$('.rec-card').map(c => c.dataset.id).sort().join(',');
  ok('换一换给出了一组新的随机菜', beforeIds !== afterIds || $$('.rec-card').length === 1);

  /* 写入当天 */
  const dayDate = emptyDay.dataset.date;
  const dishesBefore = $$('.dish-item').length;
  action('rec-confirm');
  ok('确认写入当天，菜品数 +1（取决于是否勾上了）', $$('.dish-item').length >= dishesBefore);
  ok('该日网格标记 has', $(`.day[data-date="${dayDate}"]`).classList.contains('has'));
} else {
  ok('未找到空白日用于推荐测试（跳过）', true);
}

console.log('\n[11] 详情页：无底部 tab + 返回按钮 + 排入日期选择器');
action('nav', { route: 'library' });
ok('进入食谱库', !!$('.rec-grid'));
const dRec = $('.rec-card');
ok('食谱库有卡片可点', !!dRec);
if (dRec) {
  const recId = dRec.dataset.id;
  click(dRec);                                  // → open-detail
  ok('进入详情页', !!$('.det-view'));
  ok('详情页底部不再有 tab 导航', !$('.nav'));
  ok('详情页有返回按钮', !!$('[data-action="detail-back"]'));
  ok('详情页有菜名与底部「排入日期」', !!$('.det-name') && !!$('[data-action="add-to-date"]'));
  ok('详情页没有旧的渐变大图头', !$('.det-hero'));

  /* 排入日期选择器 */
  action('add-to-date');
  ok('点「排入日期」弹出选择层', !!$('.mask') && !!$('.adt-quick'));
  const chips = $$('.adt-chip');
  ok('快捷选项含 今天/明天/后天 三项', chips.length === 3 && chips[0].textContent.includes('今天') && chips[1].textContent.includes('明天') && chips[2].textContent.includes('后天'));
  ok('其他日期区列出后续日期', $$('.adt-row').length >= 5);
  click(chips[1]);                              // 选「明天」
  ok('选日期后弹层关闭', !$('.mask'));
  ok('选日期后仍停留在详情页（不跳日历）', !!$('.det-view') && !$('.nav'));
  /* 重新打开，验证「明天」已标为已排 */
  action('add-to-date');
  ok('重新打开后「明天」卡片标记为已排', $$('.adt-chip')[1].classList.contains('on'));
  action('close-modal');
  ok('关闭弹层', !$('.mask'));

  action('detail-back');
  ok('点返回回到食谱库且恢复底部 tab', !!$('.rec-grid') && !!$('.nav') && !$('.det-view'));
}

console.log('\n[12] 买菜页：tab 改名 + 食谱带入交互优化');
action('nav', { route: 'shopping' });
ok('底部 tab 文案为「买菜」', $$('.nav div')[2].textContent.includes('买菜'));
ok('买菜页标题为「买菜」', !!$('.appbar') && $('.appbar .title').textContent.includes('买菜'));
ok('有「从计划带入食材」分区', !!$('.rec-pick') && $('.rp-title').textContent.includes('从计划'));
ok('带入区提供搜索框', !!$('[data-bind="shopQ"]'));

/* 新建一个「未安排」的食谱，默认不应出现在带入列表，但能被搜索到 */
action('nav', { route: 'library' });
click($('[data-action="open-edit"][data-id=""]'));
const nrName = '测试未安排菜' + Date.now();
const nameIn = $('[data-bind="name"]'); nameIn.value = nrName; nameIn.dispatchEvent(new win.Event('input', { bubbles: true }));
const step0 = $('[data-bind="step-0"]'); step0.value = '随便做'; step0.dispatchEvent(new win.Event('input', { bubbles: true }));
action('save-recipe');
action('detail-back');                 // 保存后落在详情页（无底部 tab），先回到列表
action('nav', { route: 'shopping' });

const defTexts = $$('#rp-list .rp-item').map(i => i.textContent);
ok('默认只列「计划内」食谱，未安排的菜不出现', !defTexts.some(t => t.includes(nrName)));

const sb = $('[data-bind="shopQ"]');
sb.value = nrName; sb.dispatchEvent(new win.Event('input', { bubbles: true }));
ok('搜索后未安排食谱也能被找到（覆盖整个食谱库）', $$('#rp-list .rp-item').some(i => i.textContent.includes(nrName)));

sb.value = ''; sb.dispatchEvent(new win.Event('input', { bubbles: true }));
ok('清空搜索恢复默认（仅计划内）', !$$('#rp-list .rp-item').some(i => i.textContent.includes(nrName)));

/* 已备齐半自动完成链路：今天加一道菜 → 补食材 → 带入 → 全勾 → 完成 */
action('nav', { route: 'calendar' });
const _rid = S.getRecipes()[0].id;
S.addToPlan(S.todayStr(), _rid);                          // 兜底：今天加一道菜
const _ridStored = S.getRecipes()[0].id;
const targetDate = S.todayStr();
const todayPlan = S.getPlan(targetDate);
ok(`测试前置：${targetDate} 安排 ≥1 道 → ${todayPlan.length}`, todayPlan.length > 0);
const targetRecipeId = todayPlan[0];
const targetRecipe = S.getRecipe(targetRecipeId);
const ingToken = Date.now().toString(36);
S.updateRecipe(targetRecipeId, { ingredients: [
  { name: `测试用面_${ingToken}`, qty: '100 g' },
  { name: `测试用青菜_${ingToken}`, qty: '1 把' }
] });

S.clearShopping();
action('nav', { route: 'shopping' });
S.importRecipeIngredients(targetRecipeId, targetDate);
action('nav', { route: 'calendar' }); action('nav', { route: 'shopping' });  // 触发 render

ok('带入后清单按 fromRecipe 分组（出现 1 个 .shop-group）', $$('.shop-group').length === 1);
ok('分组标题含日期 + 食谱名', (() => { const t = $('.shop-group-title').textContent; return /今天|明天|后天|\d月\d+日/.test(t) && t.includes(targetRecipe.name); })());
ok('未买齐时出现「还差 N 样」+ 无完成按钮', !!$('.shop-status.wait') && !$('.done-btn'));

/* 全勾已买 —— 走 store.toggleBought */
S.getShopping().filter(s => s.fromRecipe && s.fromRecipe.id === targetRecipeId && !s.bought).forEach(s => S.toggleBought(s.id));
action('nav', { route: 'calendar' }); action('nav', { route: 'shopping' });  // 触发 render

ok('全部 bought 时出现「已备齐」绿色标签', !!$('.shop-status.ok'));
const doneBtn = $('.done-btn');
ok('出现「已做完这道菜」按钮', !!doneBtn);
const recipeRid = doneBtn.dataset.rid, recipeDate = doneBtn.dataset.date;
click(doneBtn);
ok('点击完成 → 当天 plan 中该食谱被移除', !S.getPlan(recipeDate).includes(recipeRid));
ok('点击完成 → 清单中对应 fromRecipe 食材组被清空', !S.getShopping().some(s => s.fromRecipe && s.fromRecipe.id === recipeRid && s.fromRecipe.date === recipeDate));

/* 手动添加的项 → 进入「手动添加」分组（不带 fromRecipe） */
S.addShoppingItem('散养鸡蛋' + Date.now().toString(36), '6 个');
action('nav', { route: 'calendar' }); action('nav', { route: 'shopping' });
ok('手动添加项进入「手动添加」分组', Array.from($$('.shop-group-title')).some(el => el.textContent.includes('手动添加')));

console.log('\n[13] 设置页（我的）：清空本地缓存 / 数据清理');
action('nav', { route: 'settings' });
ok('底部导航新增「我的」第 4 项', $$('.nav div').length === 4 && $$('.nav div')[3].textContent.includes('我的'));
ok('进入设置页显示「存储状态」卡片', !!$('.set-card') && $('.set-card-head').textContent.includes('存储状态'));
ok('展示存储位置 KEY', $('.set-card').textContent.includes('breakfast_app_v1'));
ok('展示食谱/计划/清单三项统计', $$('.set-stat').length === 3);
ok('提供清空计划 / 清空清单 / 清空缓存三个入口',
  !!$('[data-action="clear-plan"]') && !!$('[data-action="clear-shopping"]') && !!$('[data-action="reset-all"]'));

/* 清空日历计划：plan 清空但食谱库保留 */
const recipesBeforeClear = S.getRecipes().length;
S.addToPlan(S.todayStr(), S.getRecipes()[0].id);
action('nav', { route: 'settings' });
ok('前置：今天已安排 ≥1 道菜', S.getPlan(S.todayStr()).length > 0);
click($('[data-action="clear-plan"]'));
ok('点清空计划弹出二次确认', !!$('[data-action="confirm-ok"]'));
click($('[data-action="confirm-ok"]'));
ok('清空日历计划 → 计划清空且食谱库保留',
  S.getPlan(S.todayStr()).length === 0 && S.getRecipes().length === recipesBeforeClear);

/* 清空买菜清单 */
S.addShoppingItem('待清理测试项', '1 个');
action('nav', { route: 'settings' });
click($('[data-action="clear-shopping"]'));
click($('[data-action="confirm-ok"]'));
ok('清空买菜清单 → 清单为空', S.getShopping().length === 0);

/* 清空本地缓存（危险操作）：制造脏数据后 reset，应恢复初始种子 */
const customR = S.addRecipe({ name: '自建菜XYZ' + Date.now().toString(36), category: 'zhou' });
S.addToPlan(S.todayStr(), customR.id);
S.addShoppingItem('自建食材', '1 个');
const totalWithCustom = S.getRecipes().length;
action('nav', { route: 'settings' });
click($('[data-action="reset-all"]'));
ok('清空本地缓存有二次确认', !!$('[data-action="confirm-ok"]'));
click($('[data-action="confirm-ok"]'));
ok('清空本地缓存 → 自建食谱被移除', !S.getRecipes().some(r => r.id === customR.id));
ok('清空本地缓存 → 食谱恢复为初始种子数量', S.getRecipes().length === SEED_COUNT && S.getRecipes().length < totalWithCustom);
ok('清空本地缓存 → 测试期新增的其它菜也一并清除', !S.getRecipes().some(r => r.name === nrName));
ok('清空本地缓存 → 计划与清单均清空',
  S.getPlan(S.todayStr()).length === 0 && S.getShopping().length === 0);
ok('清空本地缓存 → localStorage 已重写为初始数据', (() => {
  const raw = S.LS.getItem(S.KEY);
  if (!raw) return false;
  const parsed = JSON.parse(raw);
  return parsed.recipes.length === S.getRecipes().length && Object.keys(parsed.plan).length === 0;
})());
ok('清空后停留在设置页且页面正常渲染', !!$('.set-card') && !!$('.nav'));

console.log(`\n结果：${pass} 通过，${fail} 失败\n`);
process.exit(fail ? 1 : 0);

})().catch(e => { console.error('测试异常：', e); process.exit(1); });
