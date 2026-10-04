/* app.js — запуск дашборда: каркас страницы, навигация, горячие клавиши, автоматические действия. */
import { html, render, useState, useEffect, useReducer, useErrorBoundary } from './vendor.js';
import { store, act, hasData, KEY } from './store.js';
import * as C from './core.js';
import { cx, Icon, Overlays, overlays, openSheet, closeAllSheets, closeMenu, toast, getDerived, open, go, openMenu, download } from './ui.js';
import './forms.js';
import { QuickAdd, Palette } from './quick.js';
import { Home, backupNow } from './home.js';
import { Students } from './students.js';
import { Groups, Teachers } from './groups.js';
import { Finance } from './finance.js';
import { Calendar } from './calendar.js';
import { Settings } from './settings.js';
import { syncAll } from './sheets.js';

const PAGES = {
  home: { title: 'Обзор', icon: 'home', view: Home },
  students: { title: 'Ученики', icon: 'users', view: Students },
  groups: { title: 'Группы', icon: 'layers', view: Groups },
  teachers: { title: 'Преподаватели', icon: 'cap', view: Teachers },
  finance: { title: 'Финансы', icon: 'chart', view: Finance },
  calendar: { title: 'Календарь', icon: 'calendar', view: Calendar },
  settings: { title: 'Настройки', icon: 'settings', view: Settings },
};
const MAIN = ['home', 'students', 'groups', 'teachers', 'finance', 'calendar'];
const route = () => { const p = location.hash.replace(/^#\/?/, '').split('/')[0]; return Object.prototype.hasOwnProperty.call(PAGES, p) ? p : 'home'; };
const href = (p) => '#/' + (p === 'home' ? '' : p);
const isTyping = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
/** Горячая клавиша по букве, а на русской и других нелатинских раскладках — по положению клавиши. */
const hot = (e, ch, code) => { const k = (e.key || '').toLowerCase(); return k === ch || (!/^[a-z0-9]$/.test(k) && e.code === code); };
const sysDark = () => !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

function applyLook() {
  const s = store.state.settings, r = document.documentElement;
  if (s.theme === 'light' || s.theme === 'dark') r.dataset.theme = s.theme; else delete r.dataset.theme;
  r.dataset.accent = s.accent; r.dataset.density = s.density;
}

/** Если раздел не смог отрисоваться, показываем понятное сообщение и даём сохранить данные. */
function Boundary({ children, page }) {
  const [error, reset] = useErrorBoundary((e) => { try { console.error(e); } catch { /* нет консоли */ } });
  useEffect(() => { if (error) reset(); }, [page]);
  if (!error) return children;
  return html`<div class="card"><div class="empty"><${Icon} name="alert" /><b>Этот раздел не открылся</b><p>Данные целы. Обновите страницу; если ошибка повторится — скачайте копию данных и напишите, что вы делали перед этим.</p><div class="toolbar"><button class="btn primary" onClick=${() => location.reload()}><${Icon} name="refresh" cls="s" />Обновить страницу</button><button class="btn" onClick=${backupNow}><${Icon} name="download" cls="s" />Скачать копию</button></div><p class="hint">${String((error && error.message) || error)}</p></div></div>`;
}

function App() {
  const [, force] = useReducer((x) => x + 1, 0);
  const [page, setPage] = useState(route());
  const [day, setDay] = useState(C.today());
  useEffect(() => store.subscribe(force), []);
  useEffect(() => {
    const onHash = () => { closeMenu(); closeAllSheets(); setPage(route()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    const onStorage = (e) => { if (e.key === KEY && e.newValue) store.reloadFromStorage(); };
    window.addEventListener('storage', onStorage);
    // новый день: пересчитать сроки, записать автосписания, сделать снимок
    const tick = () => { const t = C.today(); if (document.visibilityState !== 'hidden') { setDay((old) => { if (old !== t) { act.runAuto(); store.dailySnapshot(); } return t; }); } };
    const timer = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && hot(e, 'k', 'KeyK')) { e.preventDefault(); if (!overlays.sheets.some((s) => s.Comp === Palette)) openSheet(Palette, {}); return; }
      if (mod && hot(e, 'z', 'KeyZ') && !e.shiftKey && !isTyping(e)) { if (store.undoStack.length) { e.preventDefault(); store.undo(); } return; }
      if (mod || e.altKey || isTyping(e) || overlays.sheets.length || overlays.menu) return;
      if (e.key === '/' || (e.code === 'Slash' && !e.shiftKey && e.key === '.')) { e.preventDefault(); openSheet(Palette, {}); } // на русской раскладке эта клавиша печатает точку
      else if (hot(e, 'n', 'KeyN')) { e.preventDefault(); openSheet(QuickAdd, {}); }
    };
    window.addEventListener('keydown', onKey);
    // тема «как в системе» переключается вместе с системой
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    if (mq && mq.addEventListener) mq.addEventListener('change', force);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('storage', onStorage); clearInterval(timer); document.removeEventListener('visibilitychange', tick); window.removeEventListener('keydown', onKey); if (mq && mq.removeEventListener) mq.removeEventListener('change', force); };
  }, []);
  // каждое изменение данных — подсказка с кнопкой «Отменить»
  const last = store.last;
  useEffect(() => { if (last && last.label) toast(last.label, last.undo ? { label: 'Отменить', fn: () => { if (!store.undo(last.id)) toast('После этого были другие изменения — отмените их по очереди: ⌘Z'); } } : null); }, [last && last.id]);
  useEffect(() => { if (store.saveError) toast('Не удалось сохранить: в браузере закончилось место. Скачайте копию в «Настройках».'); }, [store.saveError, store.rev]);
  const st = store.state, s = st.settings, d = getDerived();
  useEffect(applyLook, [s.theme, s.accent, s.density]);
  const overdue = d.debtors.filter((x) => d.student(x.id).status === 'overdue').length;
  useEffect(() => { document.title = `${overdue ? `(${overdue}) ` : ''}${s.orgName} · Финансы`; }, [overdue, s.orgName]);
  const P = PAGES[page];
  const badge = (p) => (p === 'students' && d.debtors.length ? html`<span class=${cx('nav-badge', !overdue && 'soft')}>${d.debtors.length}</span>` : p === 'teachers' && d.teachersDue.length ? html`<span class="nav-badge soft">${d.teachersDue.length}</span>` : null);
  const dark = s.theme === 'dark' || (s.theme !== 'light' && sysDark());
  const toggleTheme = () => act.setSettings({ theme: dark ? 'light' : 'dark' });
  const projects = st.projects.length > 1 ? html`<select class="input sm" style="width:auto;max-width:170px" aria-label="Проект" value=${store.ui.project} onChange=${(e) => store.setUI({ project: e.target.value, studentsGroup: 'all' })}><option value="all">Все проекты</option>${st.projects.map((p) => html`<option value=${p.id} selected=${p.id === store.ui.project}>${p.name}</option>`)}</select>` : null;
  const more = (e) => openMenu(e, [
    ...['groups', 'teachers', 'calendar', 'settings'].map((p) => ({ label: PAGES[p].title, icon: PAGES[p].icon, on: page === p, hint: p === 'teachers' && d.teachersDue.length ? String(d.teachersDue.length) : '', onClick: () => go(p) })),
    'sep',
    { label: dark ? 'Светлая тема' : 'Тёмная тема', icon: dark ? 'sun' : 'moon', onClick: toggleTheme },
    hasData(st) && { label: 'Скачать резервную копию', icon: 'download', onClick: backupNow },
  ]);
  const sub = page === 'home' ? new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(C.parseISO(day)) : page === 'students' ? `${d.activeStudents.length} ${C.plural(d.activeStudents.length, 'ученик', 'ученика', 'учеников')}${d.debtors.length ? ` · ждём оплату от ${d.debtors.length}` : ''}` : '';
  return html`<div class="app">
    <aside class="side">
      <a class="brand" href="#/" style="color:inherit;text-decoration:none"><span class="logo"><${Icon} name="logo" /></span><div><b>${s.orgName}</b><small>Финансы</small></div></a>
      <nav class="nav" aria-label="Разделы">${MAIN.map((p) => html`<a class=${cx('nav-item', page === p && 'is-active')} href=${href(p)} title=${PAGES[p].title}><${Icon} name=${PAGES[p].icon} /><span>${PAGES[p].title}</span>${badge(p)}</a>`)}</nav>
      <div class="side-foot">
        <a class=${cx('nav-item', page === 'settings' && 'is-active')} href="#/settings" title="Настройки"><${Icon} name="settings" /><span>Настройки</span></a>
        <button class="nav-item" onClick=${toggleTheme} title=${dark ? 'Светлая тема' : 'Тёмная тема'}><${Icon} name=${dark ? 'sun' : 'moon'} /><span>${dark ? 'Светлая тема' : 'Тёмная тема'}</span></button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="topbar-title"><h1>${P.title}</h1>${sub && html`<div class="sub">${sub}</div>`}</div>
        <div class="topbar-actions">
          ${projects}
          <button class="search-btn only-wide" onClick=${() => openSheet(Palette, {})}><${Icon} name="search" cls="s" /><span>Поиск и быстрый ввод</span><kbd>⌘K</kbd></button>
          <button class="btn icon ghost only-narrow" aria-label="Поиск" onClick=${() => openSheet(Palette, {})}><${Icon} name="search" /></button>
          <button class="btn primary only-wide" onClick=${() => openSheet(QuickAdd, {})}><${Icon} name="plus" cls="s" />Запись</button>
        </div>
      </header>
      <main class="page" key=${page}><${Boundary} page=${page}><${P.view} /><//></main>
    </div>
    <nav class="tabbar" aria-label="Разделы">
      <a class=${cx('tab', page === 'home' && 'is-active')} href="#/"><${Icon} name="home" />Обзор</a>
      <a class=${cx('tab', page === 'students' && 'is-active')} href="#/students"><${Icon} name="users" />Ученики${overdue > 0 && html`<span class="nav-badge">${overdue}</span>`}</a>
      <button class="tab tab-add" aria-label="Новая запись" onClick=${() => openSheet(QuickAdd, {})}><span><${Icon} name="plus" cls="l" /></span></button>
      <a class=${cx('tab', page === 'finance' && 'is-active')} href="#/finance"><${Icon} name="chart" />Финансы</a>
      <button class=${cx('tab', ['groups', 'teachers', 'calendar', 'settings'].includes(page) && 'is-active')} onClick=${more}><${Icon} name="menu" />Ещё</button>
    </nav>
    <${Overlays} />
  </div>`;
}

/** Запасной экран: если данные в браузере не удалось даже прочитать, даём их скачать и начать заново. */
function Rescue({ error }) {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { /* нет доступа */ }
  return html`<div class="onboard" style="padding:0 16px"><span class="logo"><${Icon} name="alert" cls="l" /></span><h1>Дашборд не запустился</h1>
    <p class="muted">Сохранённые в браузере данные не удалось прочитать. Они не удалены: скачайте их файлом — по нему данные можно восстановить.</p>
    <div class="toolbar" style="justify-content:center">${raw && html`<button class="btn primary" onClick=${() => download('tryos-finance-povrezhdennye-dannye.json', raw)}><${Icon} name="download" cls="s" />Скачать данные</button>`}<button class="btn" onClick=${() => location.reload()}><${Icon} name="refresh" cls="s" />Обновить страницу</button></div>
    <p class="hint">${String((error && error.message) || error)}</p></div>`;
}

let bootError = null;
try { store.init(); } catch (e) { bootError = e; try { console.error(e); } catch { /* нет консоли */ } }
applyLook();
if (bootError) render(html`<${Rescue} error=${bootError} />`, document.getElementById('app'));
else {
  try { act.runAuto(); } catch (e) { try { console.error(e); } catch { /* нет консоли */ } }
  render(html`<${App} />`, document.getElementById('app'));
  if (store.state.settings.sheets.some((x) => x.url && x.autoSync && x.enabled !== false)) syncAll(true, true);
  // просим браузер не очищать данные сайта самостоятельно (поддерживается не везде; отказ не страшен)
  const keep = () => { try { if (hasData(store.state) && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch { /* не поддерживается */ } };
  keep();
  let asked = hasData(store.state);
  store.subscribe(() => { if (!asked && hasData(store.state)) { asked = true; keep(); } });
}
