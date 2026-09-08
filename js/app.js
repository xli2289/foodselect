import * as S from './store.js';
const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

/* ---------- 状态 ---------- */
let route = 'calendar';
let ctx = { detailId: null, detailFrom: null, calDate: null, libFilter: '', libSearch: '', edit: null, pick: null, rec: null, addDate: null, bringTab: 'plan', bringQ: '' };
let calYear, calMonth;
let todaySelected = null; // 当前选中日期里展开步骤的菜品 id
let modalEl = null;
let toastTimer;

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
}
function use(category) { return S.CAT_LABEL[category] || category; }
/* 相对今天的自然语言标签（无 DST，按天取整即可） */
function relDayLabel(date) {
    const diff = Math.round((S.parseDate(date) - S.parseDate(S.todayStr())) / 86400000);
    return ['今天', '明天', '后天'][diff] || { '-1': '昨天', '-2': '前天' }[diff] || '';
}

/* ---------- 渲染入口 ---------- */
function render() {
    /* 详情页是下钻页，不挂底部 tab 导航，由页面自身提供返回按钮 */
    const nav = route === 'detail' ? '' : navHTML();
    app.innerHTML = view() + nav;
}

function navHTML() {
    const items = [
      ['calendar', 'ic-calendar', '计划'], ['library', 'ic-book', '食谱库'],
      ['shopping', 'ic-cart', '买菜'], ['settings', 'ic-user', '我的']
    ];
    return '<nav class="nav">' + items.map(([r, ic, label]) =>
      `<div data-action="nav" data-route="${r}" class="${route === r ? 'on' : ''}">` +
      `<svg class="ic" viewBox="0 0 24 24"><use href="#${ic}"/></svg><span>${label}</span></div>`
    ).join('') + '</nav>';
}

function view() {
    switch (route) {
      case 'library': return viewLibrary();
      case 'detail': return viewDetail();
      case 'edit': return viewEdit();
      case 'calendar': return viewCalendar();
      case 'shopping': return viewShopping();
      case 'settings': return viewSettings();
      default: return viewCalendar();
    }
}

/* =========================================================
   * ① 日历（首页，含菜品安排）
   * ========================================================= */
function viewCalendar() {
    const today = S.todayStr();
    const selDate = ctx.calDate || today;
    const plan = S.getPlan(selDate);
    const fmt = S.fmtCN(selDate);
    const totalCount = plan.length;

    /* 清除无效选中 */
    if (todaySelected && !plan.includes(todaySelected)) todaySelected = null;

    /* 月导航 */
    const monthNav = `<div class="cal-top">
      <div class="m"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-calendar"/></svg>${calYear}年${calMonth}月</div>
      <div class="nav2">
        <span class="today-btn${selDate === today ? ' off' : ''}" data-action="cal-today">今天</span>
        <button data-action="cal-prev" title="上个月"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-back"/></svg></button>
        <button data-action="cal-next" title="下个月"><svg class="ic" viewBox="0 0 24 24" style="transform:rotate(180deg)"><use href="#ic-back"/></svg></button>
      </div>
    </div>`;

    /* 快捷操作 */
    const calActs = `<div class="cal-acts"><span data-action="apply-lastweek">套用上周</span><span data-action="apply-template">整周模板</span></div>`;

    /* 日历网格 */
    const calGrid = `<div class="week"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
      <div class="days">${daysHTML(selDate)}</div>`;

    /* 前一天 / 后一天 */
    const rel = relDayLabel(selDate);
    const dayNav = `<div class="day-nav">
      <button data-action="day-prev" title="前一天"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-back"/></svg></button>
      <div class="day-title">${fmt}${rel ? `<span class="rel">${rel}</span>` : ''}</div>
      <button data-action="day-next" title="后一天"><svg class="ic" viewBox="0 0 24 24" style="transform:rotate(180deg)"><use href="#ic-back"/></svg></button>
    </div>`;

    /* 菜品卡片 */
    let dishes = '';
    if (totalCount) {
      dishes = plan.map(id => {
        const r = S.getRecipe(id); if (!r) return '';
        const sel = todaySelected === id;
        return `<div class="dish-item ${sel ? 'sel' : ''}" data-action="today-select" data-id="${r.id}">
          <div class="dish-info">
            <span class="cat cat-${r.category}">${use(r.category)}</span>
            <span class="name">${esc(r.name)}</span>
          </div>
          <button class="dish-rm" data-action="today-rm" data-id="${r.id}" data-date="${selDate}">
            <svg class="ic" viewBox="0 0 24 24"><use href="#ic-close"/></svg></button>
        </div>`;
      }).join('');
    } else {
      dishes = `<div class="cal-empty">还没安排，点下面加一道菜吧～</div>`;
    }

    /* 选中菜品的步骤面板 */
    let stepsHTML = '';
    if (todaySelected) {
      const r = S.getRecipe(todaySelected);
      if (r && r.steps.length) {
        stepsHTML = `<div class="steps-panel">
          <div class="steps-head">
            <svg class="ic" viewBox="0 0 24 24" style="width:18px;height:18px;color:var(--orange-d)"><use href="#ic-chef"/></svg>
            <span>${esc(r.name)} · ${r.steps.length} 步</span>
            <button class="btn-link" data-action="open-detail" data-id="${r.id}">查看详情 ›</button>
          </div>
          <ol class="steps-list">${r.steps.map((s, i) =>
            `<li><span class="num">${i + 1}</span><span class="txt">${esc(s)}</span></li>`
          ).join('')}</ol>
        </div>`;
      }
    }

    const totalSteps = plan.reduce((n, id) => { const r = S.getRecipe(id); return n + (r ? r.steps.length : 0); }, 0);
    const time = totalSteps > 0 ? `约 ${Math.max(5, totalSteps * 3)} 分钟` : '';
    const actionBtn = `<button class="add-dish" data-action="open-pick" data-date="${selDate}"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-plus"/></svg>加一道菜</button>
      <button class="recommend-me" data-action="open-recommend" data-date="${selDate}"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-chef"/></svg>不知道吃什么？让我推荐</button>`;

    const metaHTML = `<div class="meta">
      ${totalCount ? `<span>${totalCount} 道菜</span>` : ''}
      ${time ? `<span><svg class="ic" viewBox="0 0 24 24"><use href="#ic-clock"/></svg>${time}</span>` : ''}
    </div>`;

    /* 选中日期的菜品面板 */
    const calHero = `<div class="cal-hero">
      ${dayNav}
      <div class="dish-list">${dishes}</div>
      ${actionBtn}
      ${metaHTML}
    </div>`;

    return `<div class="view">
      ${monthNav}
      ${calActs}
      ${calGrid}
      ${calHero}
      ${stepsHTML}
    </div>`;
}
function recGridHTML() {
    let list = S.getRecipes();
    if (ctx.libFilter) list = list.filter(r => r.category === ctx.libFilter);
    if (ctx.libSearch) {
      const q = ctx.libSearch.toLowerCase();
      list = list.filter(r =>
        r.name.toLowerCase().indexOf(q) >= 0 ||
        r.tags.some(t => t.toLowerCase().indexOf(q) >= 0) ||
        r.ingredients.some(i => i.name.toLowerCase().indexOf(q) >= 0)
      );
    }
    if (!list.length) return '<div class="empty-hint">没有匹配的食谱</div>';
    return list.map(r => {
      const nIng = r.ingredients.length, nStp = r.steps.length;
      const parts = [];
      if (nIng) parts.push(`<span><svg class="ic" viewBox="0 0 24 24"><use href="#ic-bowl"/></svg>${nIng} 样</span>`);
      if (nStp) parts.push(`<span><svg class="ic" viewBox="0 0 24 24"><use href="#ic-clock"/></svg>${nStp} 步</span>`);
      const meta = parts.length
        ? `<div class="t">${parts.join('')}</div>`
        : `<div class="t"><span class="empty">待完善 · 暂无做法</span></div>`;
      return `<div class="rec-card cat-${r.category}" data-action="open-detail" data-id="${r.id}">` +
        `<span class="cat-tag">${use(r.category)}</span>` +
        `<div class="n">${esc(r.name)}</div>${meta}</div>`;
    }).join('');
}
function viewLibrary() {
    const tabs = [{ key: '', name: '全部' }].concat(S.CATEGORIES);
    return `<div class="view">
      <div class="appbar">
        <div class="title"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-book"/></svg>食谱库</div>
        <div class="act" data-action="open-edit" data-id="" title="新建食谱"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-plus"/></svg></div>
      </div>
      <div class="search"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-search"/></svg>
        <input id="lib-search" data-bind="libSearch" placeholder="搜搜今天想吃什么…" value="${esc(ctx.libSearch)}"></div>
      <div class="tabs">${tabs.map(t => `<span class="${ctx.libFilter === t.key ? 'on' : ''}" data-action="lib-filter" data-cat="${t.key}">${t.name}</span>`).join('')}</div>
      <div class="rec-grid" id="rec-grid">${recGridHTML()}</div>
    </div>`;
}

/* =========================================================
   * ③ 食谱详情
   * ========================================================= */
function viewDetail() {
    const r = S.getRecipe(ctx.detailId);
    if (!r) { route = 'library'; return viewLibrary(); }
    const chips = r.tags.length ? r.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('') : '';
    const ing = r.ingredients.length
        ? r.ingredients.map(i => `<div class="row"><span>${esc(i.name)}</span><span>${esc(i.qty)}</span></div>`).join('')
        : '<div class="empty-hint">还没有记录食材</div>';
    const steps = r.steps.map((s, i) => `<div class="s"><span class="n">${i + 1}</span><span class="t">${esc(s)}</span></div>`).join('');
    return `<div class="view det-view">
      <div class="det-bar">
        <button class="det-back" data-action="detail-back" title="返回"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-back"/></svg></button>
        <div class="det-bar-title">食谱详情</div>
      </div>
      <div class="det-body">
        <div class="det-name">${esc(r.name)}</div>
        <div class="det-meta">
          <span class="cat cat-${r.category}">${use(r.category)}</span>${chips}
        </div>
        <div class="sec-title"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-basket"/></svg>食材</div>
        <div class="ing">${ing}</div>
        <div class="sec-title"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-chef"/></svg>做法</div>
        <div class="steps2">${steps}</div>
        <div class="det-tools">
          <button class="btn ghost" style="flex:1" data-action="open-edit" data-id="${r.id}"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-edit"/></svg>编辑</button>
          <button class="btn ghost" style="flex:1" data-action="dup-recipe" data-id="${r.id}"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-refresh"/></svg>复制</button>
        </div>
        <div class="det-danger"><button class="btn ghost" style="width:100%" data-action="del-recipe" data-id="${r.id}">删除食谱</button></div>
      </div>
      <div class="det-foot">
        <button class="btn primary" data-action="add-to-date" data-id="${r.id}"><svg class="ic" viewBox="0 0 24 24" style="color:#fff"><use href="#ic-plus"/></svg>排入日期</button>
      </div>
    </div>`;
}

/* =========================================================
   * ⑦ 编辑食谱
   * ========================================================= */
function openEdit(id) {
    const r = id ? S.getRecipe(id) : null;
    ctx.edit = r
      ? { id: r.id, from: 'detail', name: r.name, category: r.category, tags: r.tags.slice(), ingredients: r.ingredients.map(i => ({ name: i.name, qty: i.qty })), steps: r.steps.slice() }
      : { id: '', from: 'library', name: '', category: S.CATEGORIES[0].key, tags: [], ingredients: [{ name: '', qty: '' }], steps: [''] };
    route = 'edit'; render();
}
function viewEdit() {
    const e = ctx.edit;
    const cats = S.CATEGORIES.map(c => `<span class="${e.category === c.key ? 'on' : ''}" data-action="sel-cat" data-cat="${c.key}">${c.name}</span>`).join('');
    const tags = e.tags.map((t, i) =>
      `<span class="tag-chip">${esc(t)}<svg class="ic" viewBox="0 0 24 24" data-action="del-tag" data-i="${i}"><use href="#ic-close"/></svg></span>`).join('');
    const ings = e.ingredients.map((ing, i) =>
      `<div class="row"><span class="drag-h" title="拖拽排序">⠿</span>
        <input class="ni" data-bind="ing-${i}-name" value="${esc(ing.name)}" placeholder="食材">
        <input class="qi" data-bind="ing-${i}-qty" value="${esc(ing.qty)}" placeholder="用量">
        <div class="reorder"><button data-action="move-up" data-type="ing" data-i="${i}" ${i === 0 ? 'disabled' : ''}><svg class="ic" viewBox="0 0 24 24"><path d="M7 14l5-5 5 5"/></svg></button><button data-action="move-down" data-type="ing" data-i="${i}" ${i === e.ingredients.length - 1 ? 'disabled' : ''}><svg class="ic" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg></button></div>
        <button class="di" data-action="del-ing" data-i="${i}"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-close"/></svg></button></div>`).join('');
    const steps = e.steps.map((s, i) =>
      `<div class="row"><span class="drag-h" title="拖拽排序">⠿</span><span class="n">${i + 1}</span>
        <textarea data-bind="step-${i}" placeholder="这一步怎么做…">${esc(s)}</textarea>
        <div class="reorder"><button data-action="move-up" data-type="step" data-i="${i}" ${i === 0 ? 'disabled' : ''}><svg class="ic" viewBox="0 0 24 24"><path d="M7 14l5-5 5 5"/></svg></button><button data-action="move-down" data-type="step" data-i="${i}" ${i === e.steps.length - 1 ? 'disabled' : ''}><svg class="ic" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg></button></div>
        <button class="di" data-action="del-step" data-i="${i}"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-close"/></svg></button></div>`).join('');
    return `<div class="view">
      <div class="edit-head">
        <div class="back" data-action="edit-back"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-back"/></svg></div>
        <div class="t"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-edit"/></svg>${e.id ? '编辑食谱' : '新建食谱'}</div>
      </div>
      <div class="form-sec"><div class="lab">名称</div><input class="f-input" data-bind="name" value="${esc(e.name)}" placeholder="如 皮蛋瘦肉粥"></div>
      <div class="form-sec"><div class="lab">分类</div><div class="chip-sel">${cats}</div></div>
      <div class="form-sec"><div class="lab">标签</div><div class="tag-edit">${tags}
        <span class="tag-add" data-action="add-tag"><svg class="ic" viewBox="0 0 24 24" style="width:13px;height:13px"><use href="#ic-plus"/></svg>加标签</span>
        <input class="tag-input" data-action="add-tag-input" placeholder="输入后回车" style="display:none"></div></div>
      <div class="form-sec"><div class="lab"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-basket"/></svg>食材</div>
        <div class="ing-edit">${ings}</div>
        <div class="add-line" data-action="add-ing"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><use href="#ic-plus"/></svg>加一行食材</div></div>
      <div class="form-sec"><div class="lab"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-chef"/></svg>做法</div>
        <div class="step-edit">${steps}</div>
        <div class="add-line" data-action="add-step"><svg class="ic" viewBox="0 0 24 24" style="width:14px;height:14px"><use href="#ic-plus"/></svg>加一步</div></div>
      <div class="edit-foot">
        <button class="btn ghost" style="flex:1" data-action="edit-back"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-close"/></svg>取消</button>
        <button class="btn primary" style="flex:1.4" data-action="save-recipe" data-id="${e.id}"><svg class="ic" viewBox="0 0 24 24" style="color:#fff"><use href="#ic-save"/></svg>保存</button>
      </div>
    </div>`;
}
function saveRecipe() {
    const e = ctx.edit;
    const data = {
      name: e.name.trim(), category: e.category,
      tags: e.tags.map(t => t.trim()).filter(Boolean),
      ingredients: e.ingredients.filter(i => i.name.trim()).map(i => ({ name: i.name.trim(), qty: (i.qty || '').trim() })),
      steps: e.steps.map(s => s.trim()).filter(Boolean)
    };
    if (!data.name) { toast('请填写食谱名称'); return; }
    if (!data.steps.length) { toast('至少写一步做法'); return; }
    if (e.id) { S.updateRecipe(e.id, data); toast('已保存'); ctx.detailId = e.id; route = 'detail'; }
    else { const r = S.addRecipe(data); toast('已新建食谱'); ctx.detailId = r.id; route = 'detail'; }
    ctx.edit = null; render();
}

/* ---------- 选天：网格点击与前后翻天共用一个入口 ---------- */
function selectDay(ds) {
    const d = S.parseDate(ds);
    calYear = d.getFullYear(); calMonth = d.getMonth() + 1;   // 网格跟着选中日期走
    ctx.calDate = ds;
    todaySelected = null;                                     // 换天后不残留上一天展开的步骤
    render();
}
function stepDay(dir) {
    selectDay(S.dateStr(S.addDays(S.parseDate(ctx.calDate || S.todayStr()), dir)));
}
/* 面板已在视野内时不做滚动，避免每次点日期都跳一下 */
function scrollHeroIntoView() {
    const ch = document.querySelector('.cal-hero');
    if (ch && typeof ch.scrollIntoView === 'function') ch.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function daysHTML(selDate) {
    const first = new Date(calYear, calMonth - 1, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    let cells = '';
    for (let i = 0; i < startDay; i++) cells += '<div class="day empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = calYear + '-' + pad(calMonth) + '-' + pad(d);
      const isToday = ds === S.todayStr();
      const isSel = ds === selDate;
      const plan = S.getPlan(ds);
      const has = plan.length > 0;
      const badge = S.dayBadge(ds);
      const cls = 'day' + (isSel ? ' sel' : '') + (isToday ? ' today' : '') + (has ? ' has' : '');
      const tagHTML = badge ? `<span class="day-tag day-tag-${badge.kind}">${badge.label}</span>` : '';
      const dot = has ? `<span class="dot ${plan.length >= 2 ? 'o' : ''}"></span>` : '';
      cells += `<div class="${cls}" data-action="open-day" data-date="${ds}">${tagHTML}${d}${dot}</div>`;
    }
    return cells;
}

/* =========================================================
   * ⑤ 买菜单（手动维护）
   * ========================================================= */
function shopItemHTML(it) {
    const q = `<span class="qty-ctrl">
      <button data-action="shop-dec" data-id="${it.id}"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-minus"/></svg></button>
      <span class="q">${esc(it.qty || '1')}</span>
      <button data-action="shop-inc" data-id="${it.id}"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-plus"/></svg></button></span>`;
    return `<div class="shop-item ${it.bought ? 'done' : ''}">
      <span class="box" data-action="shop-toggle" data-id="${it.id}"></span>
      <span class="name">${esc(it.name)}</span>${q}
      <button class="del-btn" data-action="shop-del" data-id="${it.id}"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-close"/></svg></button></div>`;
}
function viewShopping() {
    const { groups, loose } = S.getShoppingGrouped();
    const groupHTML = groups.length ? groups.map(g => {
      const rel = S.relLabel(g.date);
      const dateLabel = rel ? rel : S.fmtCN(g.date);
      const unBought = g.items.filter(i => !i.bought).length;
      const statusTag = g.allBought
        ? `<span class="shop-status ok"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-check"/></svg>已备齐</span>`
        : (unBought === g.items.length ? `<span class="shop-status wait">还差 ${unBought} 样</span>` : `<span class="shop-status wait">还差 ${unBought} 样</span>`);
      const doneBtn = g.allBought
        ? `<button class="done-btn" data-action="finish-planned" data-rid="${g.recipe.id}" data-date="${g.date}"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-check"/></svg>已做完这道菜</button>`
        : '';
      const title = `${dateLabel} · ${esc(g.recipe.name)}`;
      return `<div class="shop-group">
        <div class="shop-group-head">
          <span class="shop-group-title"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-calendar"/></svg>${title}</span>
          ${statusTag}${doneBtn}
        </div>
        <div class="shop-group-body">${g.items.map(shopItemHTML).join('')}</div>
      </div>`;
    }).join('') : '';
    const looseHTML = loose.length
      ? `<div class="shop-group"><div class="shop-group-head"><span class="shop-group-title"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-cart"/></svg>手动添加</span></div><div class="shop-group-body">${loose.map(shopItemHTML).join('')}</div></div>`
      : '';
    const items = groupHTML + looseHTML;
    return `<div class="view">
      <div class="appbar"><div class="title"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-cart"/></svg>买菜</div></div>
      <div class="add-row">
        <input class="add-input" id="shop-input" placeholder="添加要买的，如 鸡蛋">
        <button class="add-btn" data-action="shop-add"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-plus"/></svg></button>
      </div>
      <button class="bring-btn" data-action="bring-open">
        <svg class="ic" viewBox="0 0 24 24"><use href="#ic-basket"/></svg>
        <span class="bring-btn-text">从计划 / 食谱库带入食材</span>
        <svg class="ic bring-btn-go" viewBox="0 0 24 24"><use href="#ic-back"/></svg>
      </button>
      <div class="sec-title">买菜清单 <span class="muted">（手动维护）</span></div>
      <div class="shop-list">${items || '<div class="empty-hint">买菜清单是空的，先加点要买的</div>'}</div>
      ${(groups.length || loose.length) ? '<div class="clear" data-action="shop-clear"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-broom"/></svg>清空买菜清单</div>' : ''}
    </div>`;
}

/* 买菜页「带入食材」弹层（按钮触发）：tab 切「计划 / 食谱库」，点菜直接复用 import-recipe */
function renderBringModal() {
    const tab = ctx.bringTab || 'plan';
    const q = (ctx.bringQ || '').toLowerCase().trim();
    const curShop = S.getShopping();
    const tabHTML = `<div class="tabs">
      <button class="tab ${tab === 'plan' ? 'on' : ''}" data-action="bring-tab" data-tab="plan">
        <svg class="ic" viewBox="0 0 24 24"><use href="#ic-calendar"/></svg>计划</button>
      <button class="tab ${tab === 'lib' ? 'on' : ''}" data-action="bring-tab" data-tab="lib">
        <svg class="ic" viewBox="0 0 24 24"><use href="#ic-book"/></svg>食谱库</button>
    </div>`;
    const searchHTML = tab === 'lib'
      ? `<div class="bring-search"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-search"/></svg>
          <input id="bring-q" data-bind="bringQ" placeholder="搜食谱名/标签/食材…" value="${esc(ctx.bringQ)}"></div>`
      : '';
    let bodyHTML;
    if (tab === 'plan') {
      const recs = S.getPlannedRecipeIds().map(id => S.getRecipe(id)).filter(Boolean);
      bodyHTML = recs.length
        ? recs.map(r => bringItemHTML(r, curShop)).join('')
        : '<div class="empty-hint">还没有安排菜品，先去日历里加点菜</div>';
    } else {
      let recs;
      if (q) {
        recs = S.getRecipes().filter(r =>
          r.name.toLowerCase().includes(q) ||
          r.tags.some(t => t.toLowerCase().includes(q)) ||
          r.ingredients.some(i => i.name.toLowerCase().includes(q))
        );
      } else {
        recs = S.getRecipes();
      }
      bodyHTML = recs.length
        ? recs.map(r => bringItemHTML(r, curShop)).join('')
        : '<div class="empty-hint">没有匹配的食谱</div>';
    }
    openModal(`<div class="modal-head">
        <svg class="ic" viewBox="0 0 24 24"><use href="#ic-basket"/></svg>带入食材
        <button class="x" data-action="close-modal"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-close"/></svg></button></div>
      ${tabHTML}
      ${searchHTML}
      <div class="bring-list" id="bring-list">${bodyHTML}</div>
      <div class="modal-foot">
        <span class="muted">点一道菜自动关闭弹窗并加入清单</span>
        <button class="btn ghost" data-action="close-modal">关闭</button>
      </div>`);
}

function bringItemHTML(r, curShop) {
    const imported = r.ingredients.length > 0 && r.ingredients.every(i => curShop.some(s => s.name === i.name));
    const dates = S.getPlannedDatesForRecipe(r.id);
    const pickDate = dates.length ? dates[0] : '';
    const dateHint = pickDate ? `<span class="bring-date">${S.relLabel(pickDate) || S.fmtCN(pickDate)}</span>` : '';
    return `<div class="bring-item ${imported ? 'sel' : ''}" data-action="import-recipe" data-id="${r.id}" data-date="${pickDate}">
      <span class="cat cat-${r.category}">${use(r.category)}</span>
      <span class="bring-name">${esc(r.name)}</span>
      ${dateHint}
      <button class="bring-go ${imported ? 'on' : ''}">${imported ? '已加入' : '+ 带入'}</button>
    </div>`;
}

/* =========================================================
   * ⑥ 我的 / 设置（含清空本地缓存）
   * ========================================================= */
function fmtBytes(n) {
    if (!n) return '0 B';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function viewSettings() {
    const info = S.storageInfo();
    const storeMode = info.usingMemory
      ? '<span class="set-warn">内存（临时）</span>'
      : '<span class="set-ok">浏览器本地</span>';
    const stats = [
      ['食谱', info.recipes + ' 道'],
      ['计划', info.planDays + ' 天'],
      ['清单', info.shoppingItems + ' 项']
    ].map(([k, v]) => `<div class="set-stat"><b>${v}</b><span>${k}</span></div>`).join('');

    return `<div class="view">
      <div class="appbar"><div class="title"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-user"/></svg>我的</div></div>

      <div class="set-card">
        <div class="set-card-head"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-signal"/></svg>存储状态</div>
        <div class="set-kv"><span>存储方式</span>${storeMode}</div>
        <div class="set-kv"><span>存储位置</span><code>${esc(S.KEY)}</code></div>
        <div class="set-kv"><span>占用空间</span>${fmtBytes(info.bytes)}</div>
        <div class="set-stats">${stats}</div>
        ${info.usingMemory ? '<div class="set-tip">当前环境禁用了本地存储，数据仅在本次会话保留，关闭页面即丢失。</div>' : ''}
      </div>

      <div class="sec-title">数据清理</div>
      <div class="set-list">
        <div class="set-row">
          <div class="set-row-txt"><b>清空日历计划</b><span>移除已安排的 ${info.planDays} 天菜单，保留食谱库</span></div>
          <button class="set-btn" data-action="clear-plan">清空</button>
        </div>
        <div class="set-row">
          <div class="set-row-txt"><b>清空买菜清单</b><span>移除清单中 ${info.shoppingItems} 项，保留食谱库</span></div>
          <button class="set-btn" data-action="clear-shopping">清空</button>
        </div>
      </div>

      <div class="sec-title">危险操作</div>
      <div class="set-list">
        <div class="set-row danger">
          <div class="set-row-txt"><b>清空本地缓存</b><span>清除本机全部数据并恢复初始 71 道菜谱；自建食谱、计划、清单都会丢失，且不可撤销</span></div>
          <button class="set-btn danger" data-action="reset-all"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-broom"/></svg>清空缓存</button>
        </div>
      </div>
    </div>`;
}

/* =========================================================
   * 弹层（选食谱）
   * ========================================================= */
function openPick(date) {
    ctx.pick = { date: date, q: '', cat: '', selected: new Set() };
    renderPickModal();
}
function renderPickModal() {
    const date = ctx.pick.date;
    openModal(`<div class="modal-head"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-calendar"/></svg>${S.fmtCN(date)} · 选择菜品
      <button class="x" data-action="close-modal"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-close"/></svg></button></div>
      <div class="modal-search"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-search"/></svg>
        <input data-bind="pickSearch" placeholder="搜索菜名 / 标签 / 食材…" value="${esc(ctx.pick.q)}"></div>
      <div class="modal-filters" id="pick-filters">${pickFiltersHTML()}</div>
      <div class="modal-list" id="pick-list">${pickListHTML()}</div>
      <div class="pick-foot">
        <span id="pick-count">已选 0 道</span>
        <button class="btn primary" data-action="pick-confirm" id="pick-ok" disabled><svg class="ic" viewBox="0 0 24 24" style="color:#fff"><use href="#ic-check"/></svg>确认添加</button>
      </div>`);
    updatePickFoot();
}
function pickFiltersHTML() {
    const tabs = [{ key: '', name: '全部' }].concat(S.CATEGORIES);
    return tabs.map(t => `<span class="${ctx.pick.cat === t.key ? 'on' : ''}" data-action="pick-filter" data-cat="${t.key}">${t.name}</span>`).join('');
}
function pickListHTML() {
    let list = S.getRecipes();
    if (ctx.pick.cat) list = list.filter(r => r.category === ctx.pick.cat);
    if (ctx.pick.q) {
        const q = ctx.pick.q.toLowerCase();
        list = list.filter(r =>
            r.name.toLowerCase().indexOf(q) >= 0 ||
            r.tags.some(t => t.toLowerCase().indexOf(q) >= 0) ||
            r.ingredients.some(i => i.name.toLowerCase().indexOf(q) >= 0)
        );
    }
    if (!list.length) return '<div class="empty-hint">没有匹配的食谱</div>';
    return list.map(r => {
        const on = ctx.pick.selected.has(r.id);
        return `<div class="modal-item ${on ? 'sel' : ''}" data-action="pick" data-id="${r.id}">
          <span class="cat cat-${r.category}">${use(r.category)}</span>${esc(r.name)}
          <span class="go">${on ? '<svg class="ic" viewBox="0 0 24 24" style="width:13px;height:13px;color:#fff"><use href="#ic-check"/></svg>已选' : '选'}</span></div>`;
    }).join('');
}
/* ---------- 独立推荐弹窗（与全列表选菜完全解耦） ---------- */
function openRecommend(date) {
    const onDate = S.getPlan(date);
    const pool = S.getRecipes().filter(r => !onDate.includes(r.id));
    if (!pool.length) { toast('食谱都用上啦，去食谱库添加新菜吧'); return; }
    /* 默认推 2 道；池子太小则少推，但至少 1 道 */
    const n = Math.min(2, pool.length);
    ctx.rec = { date: date, picks: pickRandom(pool, n), selected: new Set() };
    ctx.rec.picks.forEach(r => ctx.rec.selected.add(r.id));
    renderRecommendModal();
}
function renderRecommendModal() {
    const date = ctx.rec.date;
    openModal(`<div class="modal-head"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-chef"/></svg>随机推荐
      <button class="x" data-action="close-modal"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-close"/></svg></button></div>
      <div class="rec-sub">${S.fmtCN(date)} · 不知道吃什么？点选你想要的</div>
      <div class="modal-list rec-list">${recListHTML()}</div>
      <div class="rec-foot">
        <button class="rec-refresh-btn" data-action="rec-refresh"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-refresh"/></svg>换一换</button>
        <span id="rec-count">已选 0 道</span>
        <button class="btn primary" data-action="rec-confirm" id="rec-ok" disabled>加入</button>
      </div>`);
    updateRecFoot();
}
function recListHTML() {
    if (!ctx.rec.picks.length) return '<div class="rec-empty">没有可推荐的菜了～</div>';
    return ctx.rec.picks.map(r => {
        const on = ctx.rec.selected.has(r.id);
        return `<div class="rec-card ${on ? 'sel' : ''}" data-action="rec-toggle" data-id="${r.id}">
          <span class="rec-check"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-check"/></svg></span>
          <div class="rec-meta">
            <div class="rec-cat-row"><span class="cat cat-${r.category}">${use(r.category)}</span></div>
            <div class="rec-name">${esc(r.name)}</div>
          </div>
        </div>`;
    }).join('');
}
function updateRecFoot() {
    if (!modalEl || !ctx.rec) return;
    const cnt = modalEl.querySelector('#rec-count');
    const ok = modalEl.querySelector('#rec-ok');
    if (cnt) cnt.textContent = '已选 ' + ctx.rec.selected.size + ' 道';
    if (ok) {
        ok.disabled = ctx.rec.selected.size === 0;
        ok.innerHTML = ctx.rec.selected.size > 0
            ? `<svg class="ic" viewBox="0 0 24 24" style="color:#fff;width:16px;height:16px"><use href="#ic-check"/></svg>加入 ${ctx.rec.selected.size} 道`
            : '加入';
    }
}
function updatePickFoot() {
    if (!modalEl || !ctx.pick) return;
    const cnt = modalEl.querySelector('#pick-count');
    const ok = modalEl.querySelector('#pick-ok');
    if (cnt) cnt.textContent = '已选 ' + ctx.pick.selected.size + ' 道';
    if (ok) ok.disabled = ctx.pick.selected.size === 0;
}
function openModal(html) {
    closeModal();
    modalEl = document.createElement('div');
    modalEl.className = 'mask';
    modalEl.innerHTML = '<div class="modal">' + html + '</div>';
    app.appendChild(modalEl);
}
function closeModal() { if (modalEl) { modalEl.remove(); modalEl = null; } }
function renderAddToDateModal() {
    const rId = ctx.addDate && ctx.addDate.recipeId;
    if (!rId) return;
    const labels = ['今天', '明天', '后天'];
    const quick = [];
    for (let i = 0; i < 3; i++) {
      const d = S.dateStr(S.addDays(new Date(), i));
      const on = S.getPlan(d).includes(rId);
      quick.push(`<div class="adt-chip ${on ? 'on' : ''}" data-action="add-date" data-date="${d}">
        <span class="adt-chip-label">${labels[i]}</span>
        <span class="adt-chip-date">${S.fmtCN(d).split(' ')[0]}</span>
        ${on ? '<span class="adt-chip-done"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-check"/></svg></span>' : ''}
      </div>`);
    }
    let list = '';
    for (let i = 3; i <= 13; i++) {
      const d = S.dateStr(S.addDays(new Date(), i));
      const on = S.getPlan(d).includes(rId);
      list += `<div class="adt-row ${on ? 'on' : ''}" data-action="add-date" data-date="${d}">
        <span class="adt-row-date">${S.fmtCN(d)}</span>
        ${on ? '<span class="adt-row-done"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-check"/></svg>已排</span>' : '<span class="adt-row-go">排入 ›</span>'}
      </div>`;
    }
    openModal(`<div class="modal-head"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-calendar"/></svg>排入哪一天？
      <button class="x" data-action="close-modal"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-close"/></svg></button></div>
      <div class="adt-quick">${quick.join('')}</div>
      <div class="sec-sub">或选择其他日期</div>
      <div class="modal-list adt-list">${list}</div>
      <div class="pick-foot"><span class="adt-hint">选择日期后直接排入，可重复排入不同天</span>
        <button class="btn ghost" data-action="close-modal">取消</button></div>`);
}

/* 从数组中随机取 n 个不重复元素（用于推荐） */
function pickRandom(arr, n) {
    const copy = arr.slice();
    const result = [];
    for (let i = 0; i < n && copy.length; i++) {
      result.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return result;
}

/* ---------- 自定义居中确认弹窗 ---------- */
let confirmCb = null;
function customConfirm(msg, onYes) {
    confirmCb = onYes;
    closeModal();
    modalEl = document.createElement('div');
    modalEl.className = 'mask center';
    modalEl.innerHTML = `<div class="modal"><div class="modal-head"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-close"/></svg>确认操作
      <button class="x" data-action="confirm-cancel"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-close"/></svg></button></div>
      <div class="modal-list" style="text-align:center;padding:20px 16px 24px">
        <div style="font-size:16px;font-weight:600;color:var(--ink);margin-bottom:20px">${esc(msg)}</div>
        <div style="display:flex;gap:10px">
          <button class="btn ghost" style="flex:1" data-action="confirm-cancel">取消</button>
          <button class="btn primary" style="flex:1" data-action="confirm-ok">确定</button>
        </div>
      </div></div>`;
    app.appendChild(modalEl);
}

/* ---------- 套用类操作：「预览 + 确认」弹窗 ---------- */
// 把一组食谱 id 渲染成小标签
function dishChips(ids) {
    if (!ids || !ids.length) return '<span class="muted">暂无安排</span>';
    return ids.map(id => {
        const r = S.getRecipe(id);
        if (!r) return '<span class="dchip del">已删除的食谱</span>';
        return `<span class="dchip"><span class="cat cat-${r.category}">${use(r.category)}</span>${esc(r.name)}</span>`;
    }).join('');
}
// 通用预览弹窗：点「确认」才执行 confirmCb，绝不直接写入
function openApplyModal(title, ic, bodyHTML, confirmLabel, confirmCbFn) {
    confirmCb = confirmCbFn;
    openModal(`<div class="modal-head"><svg class="ic" viewBox="0 0 24 24"><use href="#${ic}"/></svg>${title}
      <button class="x" data-action="confirm-cancel"><svg class="ic" viewBox="0 0 24 24"><use href="#ic-close"/></svg></button></div>
      <div class="modal-list">${bodyHTML}
        <div style="display:flex;gap:10px;margin-top:16px">
          <button class="btn ghost" style="flex:1" data-action="confirm-cancel">取消</button>
          <button class="btn primary" style="flex:1" data-action="confirm-ok">${confirmLabel}</button>
        </div>
      </div>`);
}
// 套用上周同日：先预览「来源 / 套用到 / 影响」，确认后才覆盖
function openLastWeekPreview() {
    const date = ctx.calDate || S.todayStr();
    const src = S.dateStr(S.addDays(S.parseDate(date), -7));
    const srcIds = S.getPlan(src);
    if (!srcIds.length) { toast('上周同日（' + S.fmtCN(src) + '）还没有安排，无法套用'); return; }
    const curIds = S.getPlan(date);
    const body = `
      <div class="apv-row"><span class="apv-lab">来自</span><b>${S.fmtCN(src)}</b><span class="apv-note">（上周同日）</span></div>
      <div class="apv-dishes">${dishChips(srcIds)}</div>
      <div class="apv-row"><span class="apv-lab">套用到</span><b>${S.fmtCN(date)}</b></div>
      <div class="apv-dishes">${dishChips(curIds)}</div>
      ${curIds.length
        ? `<div class="warn">⚠ 将替换该日已有的 ${curIds.length} 道菜，请确认</div>`
        : `<div class="muted" style="margin-top:4px">该日暂无安排，将直接填入</div>`}
    `;
    openApplyModal('套用上周同日', 'ic-refresh', body, '确认套用',
        () => { S.applyLastWeek(date); toast('已套用上周同日'); render(); });
}
// 整周模板：以今天为模板，仅填充本周空白日（不覆盖已有），预览后确认
function openTemplatePreview() {
    const base = S.getPlan(S.todayStr());
    if (!base.length) { toast('今天还没有安排，无法作为模板'); return; }
    const dow = (new Date().getDay() + 6) % 7;                 // 周一 = 0
    const monday = S.addDays(S.parseDate(S.todayStr()), -dow);
    let rows = '';
    for (let i = 0; i < 7; i++) {
        const d = S.dateStr(S.addDays(monday, i));
        const cur = S.getPlan(d);
        const res = cur.length
            ? `<span class="keep">保持现有 ${cur.length} 道</span>`
            : `<span class="fill">填入 ${base.length} 道</span>`;
        rows += `<div class="apv-wk"><span class="apv-day">${S.fmtCN(d)}</span>${res}</div>`;
    }
    const body = `
      <div class="muted" style="margin-bottom:10px">以<b style="color:var(--ink)">今天</b>的 ${base.length} 道菜为模板，填充本周空白日：</div>
      <div class="apv-week">${rows}</div>
      <div class="warn">仅填充空白日，已有安排的日期不会被覆盖</div>
    `;
    openApplyModal('套用整周模板', 'ic-calendar', body, '确认套用',
        () => { S.applyWeekTemplate(); toast('已套用整周模板'); render(); });
}

/* =========================================================
   * 事件
   * ========================================================= */
function bindEdit(bind, val) {
    const e = ctx.edit; if (!e) return;
    if (bind === 'name') e.name = val;
    else if (bind.indexOf('ing-') === 0) {
      const m = bind.match(/^ing-(\d+)-(name|qty)$/); if (m) e.ingredients[+m[1]][m[2]] = val;
    } else if (bind.indexOf('step-') === 0) {
      const m = bind.match(/^step-(\d+)$/); if (m) e.steps[+m[1]] = val;
    }
}

app.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.bind === 'libSearch') { ctx.libSearch = t.value; const g = document.getElementById('rec-grid'); if (g) g.innerHTML = recGridHTML(); return; }
    if (t.dataset.bind === 'pickSearch' && ctx.pick) { ctx.pick.q = t.value; const l = modalEl && modalEl.querySelector('#pick-list'); if (l) l.innerHTML = pickListHTML(); return; }
    if (t.dataset.bind === 'bringQ') {
      ctx.bringQ = t.value;
      const l = modalEl && modalEl.querySelector('#bring-list');
      if (l) {
        const q = (ctx.bringQ || '').toLowerCase().trim();
        const curShop = S.getShopping();
        let recs = q
          ? S.getRecipes().filter(r =>
              r.name.toLowerCase().includes(q) ||
              r.tags.some(tg => tg.toLowerCase().includes(q)) ||
              r.ingredients.some(i => i.name.toLowerCase().includes(q))
            )
          : S.getRecipes();
        l.innerHTML = recs.length
          ? recs.map(r => bringItemHTML(r, curShop)).join('')
          : '<div class="empty-hint">没有匹配的食谱</div>';
      }
      return;
    }
    if (t.dataset.action === 'add-tag-input' && t.value.trim()) { ctx.edit.tags.push(t.value.trim()); t.value = ''; render(); setTimeout(() => { const ti = document.querySelector('[data-action="add-tag-input"]'); if (ti) ti.focus(); }, 50); return; }
    if (t.dataset.bind) { bindEdit(t.dataset.bind, t.value); }
});

app.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) { if (e.target === modalEl) closeModal(); return; }
    const a = el.dataset.action;
    const id = el.dataset.id;

    switch (a) {
      case 'nav': {
        const r = el.dataset.route;
        route = r; ctx.calDate = null;
        render();                                            // 立即切换，不依赖 hashchange
        if (location.hash.slice(1) !== r) location.hash = '#' + r;  // 同步地址栏（值相同则不触发事件）
        break;
      }

      case 'open-detail': ctx.detailFrom = route; ctx.detailId = id; route = 'detail'; render();
        if (location.hash.slice(1) !== 'detail:' + id) location.hash = 'detail:' + id;
        break;
      case 'detail-back': {
        const from = ctx.detailFrom || 'library';
        ctx.detailId = null; route = from; render();
        if (location.hash.slice(1) !== from) location.hash = '#' + from;
        break;
      }
      case 'open-edit': openEdit(id); break;
      case 'open-pick': openPick(el.dataset.date); break;
      case 'open-recommend': openRecommend(el.dataset.date); break;
      case 'add-to-today': case 'add-to-date': {
        ctx.addDate = { recipeId: id };
        renderAddToDateModal();
        break;
      }
      case 'add-date': {
        const rId = ctx.addDate && ctx.addDate.recipeId;
        const d = el.dataset.date;
        if (!rId || !d) break;
        if (S.getPlan(d).includes(rId)) { toast(S.fmtCN(d).split(' ')[0] + ' 已排入此菜'); ctx.addDate = null; closeModal(); break; }
        S.addToPlan(d, rId);
        toast('已排入 ' + S.fmtCN(d).split(' ')[0]);
        ctx.addDate = null;
        closeModal();
        break;
      }
      case 'del-recipe': customConfirm('确定删除该食谱？', () => { S.deleteRecipe(id); toast('已删除'); route = 'library'; render(); }); break;

      /* 选中日期：网格与箭头共用同一入口 */
      case 'open-day': { selectDay(el.dataset.date); scrollHeroIntoView(); break; }
      case 'day-prev': case 'day-next': { stepDay(a === 'day-prev' ? -1 : 1); scrollHeroIntoView(); break; }
      case 'cal-today': {
        const t = new Date();
        calYear = t.getFullYear(); calMonth = t.getMonth() + 1;
        selectDay(S.todayStr());
        break;
      }
      case 'today-select': todaySelected = (todaySelected === id) ? null : id; render(); break;
      case 'today-rm': customConfirm('确定从当天移除这道菜？', () => { S.togglePlan(el.dataset.date || S.todayStr(), id); toast('已移除'); render(); }); break;
      case 'apply-lastweek': openLastWeekPreview(); break;

      case 'lib-filter': ctx.libFilter = el.dataset.cat; render(); break;

      case 'sel-cat': ctx.edit.category = el.dataset.cat; render(); break;
      case 'add-tag': { const ti = document.querySelector('[data-action="add-tag-input"]'); if (ti) { ti.style.display = 'inline-block'; ti.focus(); } break; }
      case 'del-tag': ctx.edit.tags.splice(+el.dataset.i, 1); render(); break;
      case 'add-ing': ctx.edit.ingredients.push({ name: '', qty: '' }); render(); break;
      case 'del-ing': ctx.edit.ingredients.splice(+el.dataset.i, 1); render(); break;
      case 'add-step': ctx.edit.steps.push(''); render(); break;
      case 'del-step': ctx.edit.steps.splice(+el.dataset.i, 1); render(); break;
      case 'save-recipe': saveRecipe(); break;
      case 'edit-back': if (ctx.edit.from === 'detail' && ctx.edit.id) { ctx.detailId = ctx.edit.id; route = 'detail'; } else route = 'library'; ctx.edit = null; render(); break;

      case 'cal-prev': calMonth--; if (calMonth < 1) { calMonth = 12; calYear--; } render(); break;
      case 'cal-next': calMonth++; if (calMonth > 12) { calMonth = 1; calYear++; } render(); break;
      case 'apply-template': openTemplatePreview(); break;

      case 'shop-add': { const inp = document.getElementById('shop-input'); S.addShoppingItem(inp.value); inp.value = ''; render(); break; }
      case 'shop-toggle': S.toggleBought(id); render(); break;
      case 'shop-inc': S.changeQty(id, 1); render(); break;
      case 'shop-dec': S.changeQty(id, -1); render(); break;
      case 'shop-del': customConfirm('确定删除该项？', () => { S.delShopping(id); render(); }); break;
      case 'shop-clear': customConfirm('清空整个清单？', () => { S.clearShopping(); render(); }); break;
      case 'import-recipe': {
        const date = (el && el.dataset && el.dataset.date) || '';
        S.importRecipeIngredients(id, date);
        toast(date ? '已带入食材（关联计划）' : '已带入食材');
        render();
        break;
      }
      case 'bring-open':
        ctx.bringTab = 'plan';
        ctx.bringQ = '';
        renderBringModal();
        break;
      case 'bring-tab':
        ctx.bringTab = el.dataset.tab;
        ctx.bringQ = '';
        renderBringModal();
        break;
      case 'finish-planned': {
        const rid = (el && el.dataset && el.dataset.rid) || id;
        S.finishPlannedRecipe(rid, el.dataset.date);
        toast('已做完，清掉对应食材并从计划移除');
        render();
        break;
      }

      /* ---- 设置页：数据清理 ---- */
      case 'clear-plan':
        customConfirm('确定清空日历计划？已安排的菜单会全部移除（食谱库保留）。', () => {
          S.clearPlan(); todaySelected = null; toast('已清空日历计划'); render();
        });
        break;
      case 'clear-shopping':
        customConfirm('确定清空买菜清单？', () => {
          S.clearShopping(); toast('已清空买菜清单'); render();
        });
        break;
      case 'reset-all':
        customConfirm('确定清空本地缓存？自建食谱、日历计划、买菜清单都会丢失，且不可撤销。', () => {
          S.resetAll();
          ctx = { detailId: null, detailFrom: null, calDate: S.todayStr(), libFilter: '', libSearch: '', edit: null, pick: null, rec: null, addDate: null, bringTab: 'plan', bringQ: '' };
          todaySelected = null; route = 'settings';
          toast('已清空本地缓存，恢复初始数据');
          render();
        });
        break;

      case 'dup-recipe': {
        const r = S.getRecipe(id);
        if (r) { const nr = S.addRecipe({ name: r.name + '（副本）', category: r.category, tags: r.tags.slice(), ingredients: r.ingredients.map(i => ({ name: i.name, qty: i.qty })), steps: r.steps.slice() }); toast('已复制食谱'); ctx.detailId = nr.id; route = 'detail'; render(); }
        break;
      }
      case 'move-up': case 'move-down': {
        const type = el.dataset.type, idx = +el.dataset.i, dir = a === 'move-up' ? -1 : 1;
        const arr = type === 'ing' ? ctx.edit.ingredients : ctx.edit.steps;
        const ni = idx + dir;
        if (ni >= 0 && ni < arr.length) { const tmp = arr[idx]; arr[idx] = arr[ni]; arr[ni] = tmp; render(); }
        break;
      }

      case 'pick': {
        if (!ctx.pick) break;
        if (ctx.pick.selected.has(id)) ctx.pick.selected.delete(id);
        else ctx.pick.selected.add(id);
        if (modalEl) {
          const listEl = modalEl.querySelector('#pick-list'); if (listEl) listEl.innerHTML = pickListHTML();
          updatePickFoot();
        }
        break;
      }
      case 'pick-confirm': {
        if (!ctx.pick) break;
        const date = ctx.pick.date;
        const onDate = S.getPlan(date);
        let n = 0;
        ctx.pick.selected.forEach(sid => {
          if (!onDate.includes(sid)) { S.togglePlan(date, sid); n++; }
        });
        closeModal();
        ctx.pick = null;
        toast(n ? `已添加 ${n} 道菜` : '没有新增菜品');
        render();
        break;
      }
      case 'pick-filter': {
        if (!ctx.pick) break;
        ctx.pick.cat = el.dataset.cat;
        if (modalEl) {
          const f = modalEl.querySelector('#pick-filters'); if (f) f.innerHTML = pickFiltersHTML();
          const l = modalEl.querySelector('#pick-list'); if (l) l.innerHTML = pickListHTML();
        }
        break;
      }
      case 'pick-refresh': break;   // 保留分支兼容（推荐已迁到独立弹窗，这里什么都不做）
      case 'rec-toggle': {
        if (!ctx.rec) break;
        if (ctx.rec.selected.has(id)) ctx.rec.selected.delete(id);
        else ctx.rec.selected.add(id);
        if (modalEl) {
          const list = modalEl.querySelector('.rec-list'); if (list) list.innerHTML = recListHTML();
          updateRecFoot();
        }
        break;
      }
      case 'rec-refresh': {
        const sw = ctx.rec; if (!sw) break;
        const onDate = S.getPlan(sw.date);
        const pool = S.getRecipes().filter(r => !onDate.includes(r.id));
        if (!pool.length) { toast('没有更多可推荐的菜了'); break; }
        const cur = new Set(sw.picks.map(r => r.id));
        let fresh = pool.filter(r => !cur.has(r.id));
        if (!fresh.length) fresh = pool;
        const n = Math.min(2, fresh.length);
        sw.picks = pickRandom(fresh, n);
        /* 默认全选；但每张卡片刷新时按"上次是否勾选过同分类"做轻量记忆会更友好
           —— 保持简单，直接全部默认勾上，让用户主动取消 */
        sw.selected = new Set(sw.picks.map(r => r.id));
        if (modalEl) {
          const list = modalEl.querySelector('.rec-list'); if (list) list.innerHTML = recListHTML();
          updateRecFoot();
        }
        break;
      }
      case 'rec-confirm': {
        if (!ctx.rec) break;
        const date = ctx.rec.date;
        const onDate = S.getPlan(date);
        let n = 0;
        ctx.rec.selected.forEach(sid => {
          if (!onDate.includes(sid)) { S.togglePlan(date, sid); n++; }
        });
        closeModal();
        ctx.rec = null;
        toast(n ? `已加入 ${n} 道菜` : '没有新增菜品');
        render();
        break;
      }
      case 'close-modal': closeModal(); render(); break;
      case 'confirm-cancel': closeModal(); confirmCb = null; break;
      case 'confirm-ok': { const cb = confirmCb; closeModal(); confirmCb = null; if (cb) cb(); break; }
    }
});

/* =========================================================
   * 初始化
   * ========================================================= */
function applyHash() {
    const h = location.hash.slice(1);
    if (h.indexOf('detail:') === 0) { ctx.detailId = h.slice(7); route = 'detail'; }
    else if (h.indexOf('edit:') === 0) { openEdit(h.slice(5)); return; }
    else if (['library', 'calendar', 'shopping', 'settings'].includes(h)) { route = h; ctx.calDate = null; }
    render();
}
function init() {
    S.load();
    const t = new Date(); calYear = t.getFullYear(); calMonth = t.getMonth() + 1;
    ctx.calDate = S.todayStr();
    applyHash();
    // 本地存储不可用（如部分浏览器的 file:// 模式）时提示
    if (S.USING_MEMORY) setTimeout(() => toast('提示：当前环境禁用了本地存储，数据仅在本次会话保留'), 900);
}
// 地址栏变化（前进/后退、手动输入、分享链接）
window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (h.indexOf('detail:') === 0) {
      const id = h.slice(7);
      if (route !== 'detail' || ctx.detailId !== id) { ctx.detailId = id; route = 'detail'; render(); }
    } else if (h.indexOf('edit:') === 0) {
      openEdit(h.slice(5));
    } else if (['library', 'calendar', 'shopping', 'settings'].includes(h)) {
      if (route !== h) { route = h; ctx.calDate = null; render(); }   // 避免与 nav 的 render 重复
    }
});
init();