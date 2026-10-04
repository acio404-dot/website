/* ui.js — общие кирпичики интерфейса: иконки, окна, меню, подсказки, поля форм, графики. */
import { html, useState, useEffect, useRef, useLayoutEffect, useErrorBoundary } from './vendor.js';
import { store } from './store.js';
import * as C from './core.js';

export const money = (n) => C.fmtMoney(n, store.state.settings.currency, store.state.settings.currencyPos);
/** Для крупных цифр на плитках: без копеек, если сумма больше сотни. */
export const moneyBig = (n) => money(Math.abs(n) >= 100 ? Math.round(n) : n);
export const cx = (...a) => a.filter(Boolean).join(' ');

/** Расчёты по текущим данным; пересчитываются только когда данные, дата или проект изменились. */
let dcache = { st: null, key: '', val: null };
export function getDerived() {
  const st = store.state, key = `${st.meta.rev}|${C.today()}|${store.ui.project}`;
  if (dcache.st !== st || dcache.key !== key) dcache = { st, key, val: C.derive(st, { project: store.ui.project }) };
  return dcache.val;
}
/** Окна, которые открываются из разных разделов (карточка ученика и т. п.), регистрируются здесь. */
export const sheets = {};
export const open = (name, props) => openSheet(sheets[name], props);
export const go = (path) => afterHistory(() => { location.hash = '#/' + path; });
/** Обёртка для окон, привязанных к записи: если запись удалили (или отменили её создание), окно закрывается само. */
function Gone({ sheetId }) {
  const o = useOverlays();
  useEffect(() => { const top = o.sheets[o.sheets.length - 1]; if (top && top.id === sheetId) closeSheet(); });
  return null;
}
/** Строка-кнопка: открывается кликом, а с клавиатуры — Enter или пробелом. */
export const tap = (fn) => ({ role: 'button', tabindex: 0, onClick: fn, onKeyDown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); fn(e); } } });
export const guard = (key, Inner) => (props) => (store.state[key].some((x) => x.id === props.id) ? html`<${Inner} ...${props} />` : html`<${Gone} sheetId=${props.sheetId} />`);

// ---------- Иконки ----------
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  users: 'M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM22 20v-1.5a4 4 0 0 0-3-3.87M15.5 3.63a3.5 3.5 0 0 1 0 6.75',
  layers: 'M12 2.5 3 7.5l9 5 9-5-9-5zM3 12l9 5 9-5M3 16.5l9 5 9-5',
  cap: 'M2 9.5 12 5l10 4.5-10 4.5L2 9.5zM6 11.5V16c0 1.2 2.7 2.5 6 2.5s6-1.3 6-2.5v-4.5M22 9.5V15',
  chart: 'M3 20h18M7 20v-7M12 20V6M17 20V10',
  calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM4 10h16M8.5 3v4M15.5 3v4',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.8-3.8',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6 6 18',
  alert: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v5M12 16.2v.3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  bell: 'M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  message: 'M4 5.5h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1h-8.5L7 20.5V17H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z',
  phone: 'M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z',
  send: 'M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z',
  edit: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17zM14.5 6.5l3 3',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
  archive: 'M3.5 5h17v4h-17zM5 9v10h14V9M10 13h4',
  undo: 'M8 5 4 9l4 4M4 9h10.5a5.5 5.5 0 0 1 0 11H10',
  download: 'M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14',
  upload: 'M12 16V5M7.5 9 12 4.5 16.5 9M5 20h14',
  left: 'M14.5 6 8.5 12l6 6', right: 'M9.5 6l6 6-6 6', down: 'M6 9.5l6 6 6-6', up: 'M6 14.5l6-6 6 6',
  filter: 'M4 6h16M7 12h10M10 18h4',
  sun: 'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z',
  copy: 'M9 9h10.5v11.5H9zM5 15H3.5V3.5H15V5',
  link: 'M14 4h6v6M20 4l-9 9M18 14v5.5H4.5V6H10',
  refresh: 'M20 11.5a8 8 0 1 0-2.3 6M20 5v6.5h-6.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.8v.2',
  repeat: 'M17 3.5 20.5 7 17 10.5M3.5 11V9a2 2 0 0 1 2-2h15M7 20.5 3.5 17 7 13.5M20.5 13v2a2 2 0 0 1-2 2h-15',
  in: 'M17 7 7 17M7 9v8h8', out: 'M7 17 17 7M9 7h8v8',
  wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H19v3.5M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5H20V8.5H6.5A2.5 2.5 0 0 1 4 7.5zM16 14h.5',
  table: 'M4 5h16v14H4zM4 10h16M4 14.5h16M10 5v14',
  list: 'M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  pause: 'M8 5v14M16 5v14',
  userPlus: 'M15 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M8.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19 8v6M16 11h6',
  database: 'M4 6.5C4 4.8 7.6 3.5 12 3.5s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6.5v11c0 1.7 3.6 3 8 3s8-1.3 8-3v-11M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  zap: 'M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z',
  cash: 'M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6.5 10v4M17.5 10v4',
  menu: 'M4 6.5h16M4 12h16M4 17.5h16',
  file: 'M6 3.5h8l4 4v13H6zM14 3.5v4h4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  sort: 'M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5',
  palette: 'M12 21a9 9 0 1 1 9-9c0 2.2-1.8 3-3.5 3H15a2 2 0 0 0-1.5 3.3c.6.7.2 2.7-1.5 2.7zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01',
  logo: 'M5 19V12M10 19V8M15 19v-5M20 19V5',
};
export function Icon({ name, cls }) {
  return html`<svg class=${cx('ic', cls)} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${name === 'more' || name === 'logo' ? 2.6 : 1.8} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${P[name] || ''} /></svg>`;
}

// ---------- Всплывающие слои: окна, меню, подсказки ----------
const ov = { sheets: [], menu: null, toasts: [], n: 0, subs: new Set() };
const emit = () => { for (const f of [...ov.subs]) f(); };
export const overlays = ov;
export function useOverlays() { const [, set] = useState(0); useEffect(() => { const f = () => set((x) => x + 1); ov.subs.add(f); return () => ov.subs.delete(f); }, []); return ov; }

/* Окна и меню связаны с историей браузера, чтобы кнопка «назад» на телефоне закрывала верхний слой.
   Источник правды — список ov.sheets; записи истории — лишь «ловушки» для кнопки «назад». У каждой записи свой номер
   и метка сеанса, поэтому запись от уже закрытого окна (после перезагрузки, кнопки «вперёд», перехода между разделами)
   распознаётся и обезвреживается, а не путает счёт открытых окон. */
const TOKEN = Math.random().toString(36).slice(2);
let pendingBack = 0, backTimer = 0;
const queue = [];
const flush = () => { while (queue.length && !pendingBack) queue.shift()(); };
const afterHistory = (fn) => { if (pendingBack) queue.push(fn); else fn(); };
const mine = (hid) => { try { const hs = history.state; return !!hs && hs.s === TOKEN && hs.ov === hid; } catch { return false; } };
const pushEntry = (hid) => { try { history.pushState({ ov: hid, s: TOKEN }, ''); return true; } catch { return false; } };
/** Слой закрыт — убираем его запись из истории, если она сейчас верхняя. */
function unwind(hid) {
  afterHistory(() => {
    if (!mine(hid)) return;
    pendingBack = 1;
    clearTimeout(backTimer);
    backTimer = setTimeout(() => { pendingBack = 0; flush(); }, 500); // страховка, если браузер не сообщил о возврате
    try { history.back(); } catch { pendingBack = 0; clearTimeout(backTimer); }
  });
}
/** Открыть окно. Comp получает свои props и close(). */
export function openSheet(Comp, props = {}) {
  afterHistory(() => {
    const sh = { id: ++ov.n, hid: 'w' + ov.n, Comp, props };
    sh.hist = pushEntry(sh.hid);
    ov.sheets.push(sh);
    emit();
  });
}
/** Закрыть верхнее окно: с экрана оно исчезает сразу, поэтому повторное нажатие «Записать» невозможно. */
export function closeSheet() {
  const top = ov.sheets.pop(); if (!top) return;
  emit();
  if (top.hist) unwind(top.hid);
}
export function closeAllSheets() { if (ov.sheets.length) { ov.sheets = []; emit(); } }
/** Заменить верхнее окно другим (шаг мастера), не трогая историю браузера. */
export function replaceSheet(Comp, props = {}) {
  afterHistory(() => {
    const top = ov.sheets[ov.sheets.length - 1];
    if (!top) return openSheet(Comp, props);
    ov.sheets[ov.sheets.length - 1] = { id: ++ov.n, hid: top.hid, hist: top.hist, Comp, props };
    emit();
  });
}
function dropSheet(sheet) { const i = ov.sheets.indexOf(sheet); if (i < 0) return; ov.sheets.splice(i, 1); emit(); if (sheet.hist) unwind(sheet.hid); }
if (typeof window !== 'undefined') {
  try { if (history.state && history.state.ov) history.replaceState(null, ''); } catch { /* ignore */ }
  window.addEventListener('popstate', () => {
    clearTimeout(backTimer); pendingBack = 0;
    let hs = null, hid = null, changed = false;
    try { hs = history.state; } catch { /* ignore */ }
    if (hs && hs.ov) { if (hs.s === TOKEN) hid = hs.ov; else { try { history.replaceState(null, ''); } catch { /* ignore */ } } } // запись из прошлого сеанса
    if (ov.menu && ov.menu.hid !== hid) { ov.menu = null; changed = true; }
    if (hid == null) { if (ov.sheets.length) { ov.sheets = []; changed = true; } }
    else if (hid !== 0 && !(ov.menu && ov.menu.hid === hid)) {
      const i = ov.sheets.findIndex((x) => x.hid === hid);
      if (i < 0) { try { history.replaceState({ ov: 0, s: TOKEN }, ''); } catch { /* ignore */ } } // запись уже закрытого слоя — обезвреживаем
      else if (ov.sheets.length > i + 1) { ov.sheets.length = i + 1; changed = true; }
    }
    if (changed) emit();
    flush();
  });
  // экранная клавиатура на телефоне: окно занимает видимую часть экрана, кнопки не прячутся под клавиатурой
  const vv = window.visualViewport;
  if (vv) {
    const fit = () => { const r = document.documentElement.style; r.setProperty('--vvh', Math.round(vv.height) + 'px'); r.setProperty('--vvt', Math.round(vv.offsetTop) + 'px'); };
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
  }
}
export function toast(text, action, ms) {
  const id = ++ov.n;
  ov.toasts = [{ id, text, action }]; // всегда одна подсказка: кнопка «Отменить» относится к последнему действию
  emit();
  setTimeout(() => { ov.toasts = ov.toasts.filter((t) => t.id !== id); emit(); }, ms || (action ? 7000 : 2800));
}
export function dismissToast(id) { ov.toasts = ov.toasts.filter((t) => t.id !== id); emit(); }
/** Меню рядом с кнопкой: items = [{ label, icon, hint, danger, on, onClick } | 'sep' | { title }]. */
export function openMenu(e, items) {
  const el = e && (e.currentTarget || e.target);
  const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 20, right: 20, top: 20, bottom: 20 };
  const rect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  if (ov.menu) closeMenu();
  afterHistory(() => {
    const m = { id: ++ov.n, hid: 'm' + ov.n, rect, items: items.filter(Boolean), from: el && el.focus ? el : null };
    m.hist = pushEntry(m.hid);
    ov.menu = m;
    emit();
  });
}
export function closeMenu() {
  const m = ov.menu; if (!m) return;
  ov.menu = null; emit();
  if (m.hist) unwind(m.hid);
  try { if (m.from && document.contains(m.from)) m.from.focus({ preventScroll: true }); } catch { /* не критично */ }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]';
const isTopLayer = (el) => { const all = document.querySelectorAll('.sheet, .palette'); return all[all.length - 1] === el; };
/** Tab ходит по кругу внутри верхнего окна и не уходит на страницу под ним. */
function trapTab(e, el) {
  if (e.key !== 'Tab' || !el || overlays.menu || !isTopLayer(el)) return;
  const list = [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
  if (!list.length) { e.preventDefault(); return; }
  const a = list[0], z = list[list.length - 1], cur = document.activeElement;
  if (!el.contains(cur) || cur === el) { e.preventDefault(); (e.shiftKey ? z : a).focus(); }
  else if (e.shiftKey && cur === a) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && cur === z) { e.preventDefault(); a.focus(); }
}
export function Sheet({ title, onClose, children, foot, cls, side, onSubmit }) {
  const close = onClose || closeSheet;
  const box = useRef(null), born = useRef(Date.now());
  // фокус переходит в окно и возвращается обратно после закрытия
  useEffect(() => {
    const prev = document.activeElement, el = box.current;
    if (el && !el.contains(document.activeElement)) {
      const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const first = !touch && el.querySelector('.sheet-body input:not([type=checkbox]):not([type=date]), .sheet-body textarea');
      (first || el).focus({ preventScroll: true });
      if (first && first.select && first.classList.contains('big')) first.select();
    }
    const onKey = (e) => trapTab(e, el);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true }); };
  }, []);
  const body = html`
    <div class="handle"></div>
    <div class="sheet-head"><h2>${title}</h2><button type="button" class="btn ghost icon sm" onClick=${close} aria-label="Закрыть"><${Icon} name="x" /></button></div>
    <div class="sheet-body">${children}</div>
    ${foot && html`<div class="sheet-foot">${foot}</div>`}`;
  const stop = (e) => e.stopPropagation();
  // двойной клик по строке не должен тут же закрыть только что открытое окно
  const outside = (e) => { if (e.target === e.currentTarget && Date.now() - born.current > 350) close(); };
  return html`<div class=${cx('backdrop', side && 'drawer')} onMouseDown=${outside}>
    ${onSubmit
      ? html`<form ref=${box} tabindex="-1" class=${cx('sheet', cls)} role="dialog" aria-modal="true" aria-label=${title} onMouseDown=${stop} onSubmit=${(e) => { e.preventDefault(); onSubmit(e); }}>${body}</form>`
      : html`<div ref=${box} tabindex="-1" class=${cx('sheet', cls)} role="dialog" aria-modal="true" aria-label=${title} onMouseDown=${stop}>${body}</div>`}
  </div>`;
}
function Menu({ menu }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, r = menu.rect;
    let left = r.left;
    if (left + w > vw - 8) left = Math.max(8, r.right - w);
    let top = r.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
    setPos({ left, top });
    const first = el.querySelector('.menu-item');
    if (first) first.focus({ preventScroll: true });
  }, [menu.id]);
  // стрелки и Tab ходят по пунктам меню
  const onKey = (e) => {
    const list = [...ref.current.querySelectorAll('.menu-item')], i = list.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); if (list.length) list[(n + list.length) % list.length].focus(); };
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) go(i + 1);
    else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
  };
  // закрываем по click, а не по касанию: иначе то же касание «проваливается» в кнопку под меню
  return html`<div class="menu-shade" onClick=${closeMenu}></div>
    <div class="menu" ref=${ref} role="menu" onKeyDown=${onKey} style=${pos ? `left:${pos.left}px;top:${pos.top}px` : 'left:-999px;top:0'}>
      ${menu.items.map((it) => it === 'sep' ? html`<div class="menu-sep"></div>` : it.title ? html`<div class="menu-title">${it.title}</div>`
        : html`<button type="button" role="menuitem" class=${cx('menu-item', it.danger && 'danger', it.on && 'is-on')} onClick=${() => { closeMenu(); it.onClick && it.onClick(); }}>
            ${it.icon && html`<${Icon} name=${it.icon} />`}<span>${it.label}</span>${it.on ? html`<small><${Icon} name="check" cls="s" /></small>` : it.hint && html`<small>${it.hint}</small>`}
          </button>`)}
    </div>`;
}
/** Окно, которое не смогло отрисоваться, закрывается с сообщением и не роняет весь дашборд. */
function SheetHost({ sheet }) {
  const [error] = useErrorBoundary((e) => { try { console.error(e); } catch { /* нет консоли */ } });
  useEffect(() => { if (error) { dropSheet(sheet); toast('Окно не открылось. Данные целы; если это повторится — обновите страницу.'); } }, [error]);
  if (error) return null;
  return html`<${sheet.Comp} ...${sheet.props} close=${closeSheet} sheetId=${sheet.id} />`;
}
export function Overlays() {
  const o = useOverlays();
  useEffect(() => {
    const onKey = (e) => { if (e.key !== 'Escape') return; if (o.menu) closeMenu(); else if (o.sheets.length) closeSheet(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { document.documentElement.style.overflow = o.sheets.length ? 'hidden' : ''; }, [o.sheets.length]);
  // подсказки не закрывают заголовок окна, а при открытом поиске остаются внизу (вверху — строка ввода)
  const top = o.sheets[o.sheets.length - 1];
  return html`
    ${o.sheets.map((s) => html`<${SheetHost} key=${s.id} sheet=${s} />`)}
    ${o.menu && html`<${Menu} key=${o.menu.id} menu=${o.menu} />`}
    <div class=${cx('toasts', top && top.Comp !== sheets.palette && 'top')} role="status" aria-live="polite">
      ${o.toasts.map((t) => html`<div class=${cx('toast', !t.action && 'plain')} key=${t.id}><span>${t.text}</span>${t.action && html`<button type="button" onClick=${() => { dismissToast(t.id); t.action.fn(); }}>${t.action.label}</button>`}</div>`)}
    </div>`;
}
/** Подтверждение опасного действия. */
export function confirmSheet({ title, text, ok = 'Удалить', danger = true, onOk, alt }) {
  openSheet(({ close }) => html`<${Sheet} title=${title} cls="narrow" foot=${html`<button class="btn" onClick=${close}>Отмена</button>${alt && html`<button class="btn" onClick=${() => { close(); setTimeout(alt.onClick, 0); }}>${alt.label}</button>`}<button class=${cx('btn', danger ? 'danger' : 'primary')} onClick=${() => { close(); setTimeout(onOk, 0); }}>${ok}</button>`}><p class="muted">${text}</p><//>`);
}

// ---------- Мелкие элементы ----------
/** Короткая подпись группы: «Group J1» → «J1», «Математика · утро» → «МУ». */
export const abbr = (name) => { const p = String(name || '').trim().split(/[\s·]+/).filter(Boolean); const last = p[p.length - 1] || '?'; return p.length > 1 && last.length <= 3 ? last.toUpperCase() : C.initials(p.slice(0, 2).join(' ')); };
export function Avatar({ name, color, size, icon, group }) {
  return html`<span class=${cx('avatar', size, icon ? 'ico' : color != null && 'c' + color)}>${icon ? html`<${Icon} name=${icon} />` : group ? abbr(name) : C.initials(name)}</span>`;
}
const PILL_ICON = { overdue: 'alert', today: 'clock', soon: 'clock', ok: 'check', paid: 'check' };
export function Pill({ status, children }) {
  return html`<span class=${cx('pill', status)}>${PILL_ICON[status] && html`<${Icon} name=${PILL_ICON[status]} />`}${children || C.STATUS_LABEL[status]}</span>`;
}
/** Подпись срока: «просрочено 27 дней», «сегодня», «через 3 дня». */
export function dueText(due, t = C.today()) {
  const n = C.diffDays(due, t);
  if (n < 0) return `просрочено ${-n} дн.`;
  return C.relDays(due, t);
}
/** То же для метки в списке: на телефоне слово «просрочено» прячется — остаются значок и число дней. */
export function DueLabel({ due }) {
  const n = C.diffDays(due, C.today());
  if (n < 0) return html`<span class="only-wide">просрочено </span>${-n} дн.`;
  return n > 1 ? html`<span class="only-wide">через </span>${n} ${C.plural(n, 'день', 'дня', 'дней')}` : C.relDays(due);
}
/** Короткое описание состояния ученика: что должен и когда следующая оплата. */
export function studentInfo(s, L) {
  if (L.package) return { main: L.lessonsLeft <= 0 ? 'Абонемент закончился' : `Осталось ${L.lessonsLeft} ${C.plural(L.lessonsLeft, 'занятие', 'занятия', 'занятий')} из ${L.size}`, amount: L.dueNow, when: '' };
  if (L.due.length) {
    const months = C.ymList(L.due.filter((c) => c.kind === 'month').map((c) => c.ym));
    const extra = L.due.filter((c) => c.kind === 'extra').map((c) => c.label).join(', ');
    return { main: [months && `за ${months}`, extra].filter(Boolean).join(' + '), amount: L.dueNow, when: dueText(L.due[0].due), first: L.due[0] };
  }
  if (L.next) return { main: `Следующая оплата ${C.fmtDate(L.next.due)}`, amount: 0, next: L.next.rest, when: C.relDays(L.next.due) };
  if (s.archived) return { main: 'В архиве', amount: 0, when: '' };
  const price = Number((C.rateAt(s.rates, C.ymOf(C.today())) || {}).price) || 0;
  return { main: price ? 'Нет начислений' : 'Цена не задана', amount: 0, when: '' };
}
export function Empty({ icon, title, children, action }) {
  return html`<div class="empty">${icon && html`<${Icon} name=${icon} />`}${title && html`<b>${title}</b>`}${children && html`<p>${children}</p>`}${action}</div>`;
}
export function Seg({ value, onChange, options, cls }) {
  return html`<div class=${cx('seg', cls)} role="tablist">${options.map(([v, label, icon]) => html`<button type="button" role="tab" aria-selected=${value === v} class=${value === v ? 'is-active' : ''} onClick=${() => onChange(v)}>${icon && html`<${Icon} name=${icon} cls="s" />`}${label}</button>`)}</div>`;
}
export function Switch({ checked, onChange, children, label }) {
  return html`<label class="switch"><input type="checkbox" role="switch" aria-label=${children ? null : label} checked=${!!checked} onChange=${(e) => onChange(e.target.checked)} /><i></i>${children && html`<span>${children}</span>`}</label>`;
}
export function Meter({ value, max, title }) {
  const p = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return html`<div class=${cx('meter', p >= 99.9 && 'done')} role="meter" aria-valuenow=${Math.round(p)} aria-valuemin="0" aria-valuemax="100" title=${title || `${Math.round(p)}%`}><i style=${`width:${p}%`}></i></div>`;
}
export function SearchInput({ value, onInput, placeholder, auto }) {
  const ref = useRef(null);
  useEffect(() => { if (auto && ref.current) ref.current.focus(); }, []);
  return html`<div class="input-wrap"><${Icon} name="search" /><input ref=${ref} class="input" type="search" placeholder=${placeholder || 'Поиск…'} value=${value} onInput=${(e) => onInput(e.target.value)} /></div>`;
}

// ---------- Формы ----------
export function useForm(initial) {
  const [v, setV] = useState(initial);
  const set = (k, val) => setV((old) => (typeof k === 'object' ? { ...old, ...k } : { ...old, [k]: val }));
  return [v, set];
}
/** Поля по описанию: { k, label, type, opts, ph, hint, span, show, req, ...attrs }. */
export function Fields({ fields, v, set, cls }) {
  return html`<div class=${cx('form-grid', cls)}>${fields.filter((f) => f && (!f.show || f.show(v))).map((f) => html`<${Field} key=${f.k || f.sec} f=${f} v=${v} set=${set} />`)}</div>`;
}
function Field({ f, v, set }) {
  if (f.sec) return html`<div class="form-sec"><h3>${f.sec}</h3>${f.hint && html`<div class="hint">${f.hint}</div>`}</div>`;
  if (f.type === 'custom') return html`<div class=${cx('field', f.span && 'span-2')}>${f.label && html`<label>${f.label}</label>`}${f.render(v, set)}${f.hint && html`<div class="hint">${f.hint}</div>`}</div>`;
  const val = v[f.k] ?? '';
  const on = (e) => { set(f.k, e.target.value); if (f.onChange) f.onChange(e.target.value, set, v); };
  const common = { id: 'f-' + f.k, name: f.k, required: !!f.req, placeholder: f.ph || '' };
  let ctl;
  if (f.type === 'select') ctl = html`<select class="input" ...${common} value=${val} onChange=${on}>${f.opts.map(([ov, label]) => html`<option value=${ov} selected=${String(ov) === String(val)}>${label}</option>`)}</select>`;
  else if (f.type === 'textarea') ctl = html`<textarea class="input" ...${common} rows=${f.rows || 3} value=${val} onInput=${on}></textarea>`;
  else if (f.type === 'switch') ctl = html`<${Switch} checked=${!!v[f.k]} onChange=${(c) => set(f.k, c)}>${f.text}<//>`;
  else if (f.type === 'seg') ctl = html`<${Seg} value=${val} onChange=${(x) => { set(f.k, x); if (f.onChange) f.onChange(x, set, v); }} options=${f.opts} />`;
  else if (f.type === 'money' || f.type === 'number') ctl = html`<input class="input" ...${common} type="text" inputmode=${f.type === 'money' ? 'decimal' : 'numeric'} autocomplete="off" value=${val} onInput=${on} list=${f.list} />`;
  else ctl = html`<input class="input" ...${common} type=${f.type || 'text'} value=${val} onInput=${on} min=${f.min} max=${f.max} list=${f.list} autocomplete="off" />`;
  return html`<div class=${cx('field', f.span && 'span-2')}>${f.label && f.type !== 'switch' && html`<label for=${'f-' + f.k}>${f.label}</label>`}${ctl}${f.hint && html`<div class="hint">${typeof f.hint === 'function' ? f.hint(v) : f.hint}</div>`}</div>`;
}
/** Варианты месяцев для списков «с какого месяца»: [['2026-10', 'Октябрь 2026'], …]. */
export function monthOptions(from, to, current) {
  const list = C.ymRange(from, to).map((ym) => [ym, C.ymLong(ym) + (ym === current ? ' — сейчас' : '')]);
  return list.reverse();
}

// ---------- Файлы и буфер ----------
export function download(name, content, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
/** Ячейка CSV: числа — с десятичной запятой (как ждут Excel и Numbers в русской и турецкой раскладке), текст — в кавычках.
    Текст, который таблица приняла бы за формулу (=, +, -, @ в начале), получает апостроф; телефоны не трогаем. */
const csvCell = (c) => {
  if (typeof c === 'number') return Number.isFinite(c) ? String(c).replace('.', ',') : '';
  let t = String(c ?? '');
  if (/^[=+\-@\t\r]/.test(t) && !/^[+-]?[\d\s().-]*$/.test(t)) t = "'" + t;
  return `"${t.replace(/"/g, '""')}"`;
};
export const toCSV = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
  }
}
/** Выбрать файл и прочитать его как текст. CSV из Excel в кодировке Windows-1251 распознаётся сам. */
export function pickFile(accept, onText) {
  document.querySelectorAll('input[data-pick]').forEach((x) => x.remove());
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = accept; inp.dataset.pick = '1'; inp.tabIndex = -1; inp.setAttribute('aria-hidden', 'true');
  inp.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    inp.remove();
    if (!f) return;
    const r = new FileReader();
    r.onerror = () => toast('Файл не читается');
    r.onload = () => {
      const buf = new Uint8Array(r.result);
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
      catch { try { text = new TextDecoder('windows-1251').decode(buf); } catch { text = new TextDecoder().decode(buf); } }
      onText(text, f.name);
    };
    r.readAsArrayBuffer(f);
  };
  document.body.appendChild(inp); // на iPhone выбор файла срабатывает надёжно, только если поле есть на странице
  inp.click();
}

// ---------- Графики ----------
export function useWidth(ref, fallback = 600) {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const upd = () => { const x = el.clientWidth; if (x > 0) setW(x); };
    upd();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(upd); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}
function niceCeil(v) { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10) * p; }
const topBar = (x, y, w, h) => { if (h <= 0.5) return ''; const r = Math.min(4, h, w / 2); return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`; };
/** Доходы и расходы по месяцам: два столбика на месяц, подсказка при наведении и касании. data: [{ ym, income, out }]. */
export function CashChart({ data, height = 220, onPick }) {
  const ref = useRef(null);
  const W = useWidth(ref);
  const [hot, setHot] = useState(-1);
  const padL = 40, padR = 6, padT = 18, padB = 26;
  const max = niceCeil(Math.max(1, ...data.flatMap((m) => [m.income, m.out])));
  const pw = Math.max(50, W - padL - padR), ph = height - padT - padB;
  const y = (v) => padT + ph - (v / max) * ph;
  const band = pw / data.length, bw = Math.max(5, Math.min(22, band * 0.28)), gap = 2;
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const pick = (i) => setHot(i);
  const m = hot >= 0 ? data[hot] : null;
  const best = data.reduce((b, d, i) => (d.income > (data[b] || { income: -1 }).income ? i : b), 0);
  return html`<div class="chart" ref=${ref} onMouseLeave=${() => setHot(-1)}>
    <svg viewBox=${`0 0 ${W} ${height}`} height=${height} role="img" aria-label="Доходы и расходы по месяцам">
      ${ticks.map((t) => html`<line class=${t === 0 ? 'base' : 'gridl'} x1=${padL} x2=${W - padR} y1=${y(t)} y2=${y(t)} />`)}
      ${ticks.map((t) => html`<text x=${padL - 8} y=${y(t) + 4} text-anchor="end">${C.shortNum(t)}</text>`)}
      ${data.map((d, i) => {
        const cx0 = padL + band * i + band / 2;
        return html`<g>
          <rect class=${cx('hit', hot === i && 'on')} x=${padL + band * i} y=${padT - 8} width=${band} height=${ph + 8} rx="6" onMouseEnter=${() => pick(i)} onClick=${() => { pick(i); if (onPick) onPick(d); }} onTouchStart=${() => pick(i)} />
          <path class="s1" d=${topBar(cx0 - bw - gap / 2, y(d.income), bw, padT + ph - y(d.income))} pointer-events="none" />
          <path class="s2" d=${topBar(cx0 + gap / 2, y(d.out), bw, padT + ph - y(d.out))} pointer-events="none" />
          ${i === best && d.income > 0 && hot < 0 && html`<text class="lbl" x=${cx0 - bw / 2 - gap / 2} y=${y(d.income) - 6} text-anchor="middle">${C.shortNum(d.income)}</text>`}
          <text x=${cx0} y=${height - 7} text-anchor="middle" class=${d.ym === C.ymOf(C.today()) ? 'lbl' : ''}>${C.MONTHS_SHORT[Number(d.ym.slice(5, 7)) - 1]}</text>
        </g>`;
      })}
    </svg>
    ${m && html`<div class="tip" style=${`left:${Math.min(Math.max(padL + band * hot + band / 2, 96), W - 96)}px;top:${Math.max(y(Math.max(m.income, m.out)) - 8, 86)}px`}>
      <b class="t">${C.ymLong(m.ym)}</b>
      <div><span><i style="background:var(--series-1)"></i>Доходы</span><b>${money(m.income)}</b></div>
      <div><span><i style="background:var(--series-2)"></i>Расходы</span><b>${money(m.out)}</b></div>
      <div><span>Прибыль</span><b>${money(m.income - m.out)}</b></div>
    </div>`}
  </div>`;
}
/** Мини-график на плитке: прошлые месяцы приглушены, текущий — цветом. */
export function Spark({ values, color = 'var(--series-1)' }) {
  const n = values.length, max = Math.max(1, ...values.map((v) => Math.abs(v))), neg = values.some((v) => v < 0);
  const H = 30, base = neg ? H / 2 : H, scale = (neg ? H / 2 : H - 2) / max;
  return html`<svg class="spark" viewBox=${`0 0 ${n * 10} ${H}`} preserveAspectRatio="none" aria-hidden="true">${values.map((v, i) => { const h = Math.max(1.5, Math.abs(v) * scale); return html`<rect x=${i * 10 + 1.5} y=${v < 0 ? base : base - h} width="7" height=${h} rx="1.5" fill=${i === n - 1 ? color : 'var(--surface-3)'} />`; })}</svg>`;
}
/** Горизонтальные полоски: одна величина по категориям. rows: [{ label, value }]. */
export function HBars({ rows, kind, max }) {
  const top = max || Math.max(1, ...rows.map((r) => r.value));
  return html`<div class="hbars">${rows.map((r) => html`<div class=${cx('hbar', kind)} title=${`${r.label}: ${money(r.value)}`}><span class="name">${r.label}</span><span class="track"><i style=${`width:${Math.max(0.5, (r.value / top) * 100)}%`}></i></span><span class="v">${money(r.value)}</span></div>`)}</div>`;
}
