/* sync.js — аккаунт: вход по логину и паролю и синхронизация данных между браузерами.
   Пароль никуда не отправляется. Из логина и пароля в браузере получаются ключ шифрования (остаётся на устройстве)
   и номер аккаунта (по нему сервер находит файл). На сервер уходит только зашифрованная копия данных. */
import { html, useState, useEffect } from './vendor.js';
import { store, hasData, normalize } from './store.js';
import * as C from './core.js';
import { Sheet, Icon, cx, toast, openSheet, sheets } from './ui.js';

const KEY_SYNC = 'tryos-finance-sync';
const API = '/api/sync';
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (buf) => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const normLogin = (s) => String(s || '').trim().toLowerCase();

async function derive(login, password) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('tryos-finance|' + login), iterations: 310000 }, base, 512));
  const id = hex(await crypto.subtle.digest('SHA-256', enc.encode('account|' + login + '|' + hex(bits.slice(32)))));
  return { id, key: b64(bits.slice(0, 32)) };
}
const aes = (key) => crypto.subtle.importKey('raw', unb64(key), 'AES-GCM', false, ['encrypt', 'decrypt']);
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(key), enc.encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64(out);
}
async function unseal(key, data) {
  const raw = unb64(data);
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await aes(key), raw.slice(12))));
}

const stampOf = (st) => `${st.meta.rev || 0}|${st.meta.updatedAt || ''}`;
const body = (st) => JSON.stringify({ ...st, meta: null });
const sameData = (a, b) => body(a) === body(b);

/** cfg: { login, id, key, etag, stamp, syncedAt }. status: off | ok | busy | offline | error | conflict. */
export const sync = { cfg: null, status: 'off', error: '', conflict: null, lastCheck: 0 };
const paint = () => { store.rev++; store.emit(); };
const set = (status, error = '') => { sync.status = status; sync.error = error; paint(); };
const saveCfg = () => { try { if (sync.cfg) localStorage.setItem(KEY_SYNC, JSON.stringify(sync.cfg)); else localStorage.removeItem(KEY_SYNC); } catch { /* приватный режим */ } };
const dirty = () => !!sync.cfg && stampOf(store.state) !== sync.cfg.stamp;
const mark = (etag) => { Object.assign(sync.cfg, { etag, stamp: stampOf(store.state), syncedAt: new Date().toISOString() }); saveCfg(); };

async function call(method, id, etag, payload) {
  let r;
  try { r = await fetch(API, { method, cache: 'no-store', headers: { 'x-sync-id': id, ...(method === 'GET' && etag ? { 'x-sync-etag': etag } : {}), ...(payload ? { 'content-type': 'application/json' } : {}) }, body: payload ? JSON.stringify(payload) : undefined }); }
  catch { throw Object.assign(new Error('Нет связи с сервером'), { offline: true }); }
  let j = null;
  try { j = await r.json(); } catch { /* не JSON */ }
  if (r.status >= 500 || (r.status >= 400 && r.status !== 404 && r.status !== 409)) throw new Error((j && j.error) || `Сервер ответил ошибкой ${r.status}`);
  return { status: r.status, j: j || {} };
}
/** Что лежит в аккаунте: null — ничего, 'same' — то же, что мы уже видели, иначе { etag, state }. */
async function remote(cfg, useEtag) {
  const r = await call('GET', cfg.id, useEtag ? cfg.etag : null);
  if (r.status === 404) return null;
  if (r.j.same) return 'same';
  let st;
  try { st = normalize(await unseal(cfg.key, r.j.doc.data)); } catch { throw new Error('Данные аккаунта не удалось расшифровать'); }
  return { etag: r.j.etag, state: st };
}
function clash(r) { sync.conflict = { state: r.state, etag: r.etag }; set('conflict'); if (!openConflict.shown) openSheet(ConflictSheet, {}); }

let pushing = false, timer = 0, firstDirty = 0;
/** Отправить данные этого устройства в аккаунт. */
export async function push(force) {
  clearTimeout(timer); firstDirty = 0;
  if (!sync.cfg || sync.conflict || pushing || (!force && !dirty())) return;
  pushing = true; set('busy');
  try {
    const stamp = stampOf(store.state);
    const r = await call('PUT', sync.cfg.id, null, { etag: sync.cfg.etag || null, doc: { data: await seal(sync.cfg.key, store.state) } });
    if (r.status === 409) { pushing = false; return await pull(true); }
    Object.assign(sync.cfg, { etag: r.j.etag, stamp, syncedAt: new Date().toISOString() }); saveCfg();
    set('ok');
  } catch (e) { set(e.offline ? 'offline' : 'error', e.message); }
  finally { pushing = false; }
  if (dirty() && sync.status === 'ok') schedule();
}
/** Проверить, нет ли в аккаунте изменений с другого устройства, и забрать их. */
export async function pull(force) {
  if (!sync.cfg || sync.conflict || pushing) return;
  sync.lastCheck = Date.now();
  try {
    const r = await remote(sync.cfg, !force);
    if (r === 'same') { set('ok'); if (dirty()) await push(); return; }
    if (!r) { sync.cfg.etag = null; return await push(true); } // файла в аккаунте нет — кладём свой
    if (sameData(r.state, store.state)) { mark(r.etag); set('ok'); }
    else if (!dirty()) { store.adopt(r.state, 'Перед обновлением из аккаунта'); mark(r.etag); set('ok'); toast('Данные обновлены из аккаунта'); }
    else clash(r);
  } catch (e) { set(e.offline ? 'offline' : 'error', e.message); }
}
function schedule() {
  if (!sync.cfg || sync.conflict) return;
  if (!firstDirty) firstDirty = Date.now();
  clearTimeout(timer);
  // ждём паузу в 8 секунд после последнего изменения, но не дольше 40 секунд от первого
  timer = setTimeout(() => { if (document.visibilityState !== 'hidden') push(); }, Math.max(500, Math.min(8000, 40000 - (Date.now() - firstDirty))));
}
/** Выбор при расхождении: 'remote' — взять данные аккаунта, 'local' — оставить данные этого устройства. */
export async function resolve(choice) {
  const c = sync.conflict; if (!c || !sync.cfg) return;
  sync.conflict = null;
  if (choice === 'remote') { store.adopt(c.state, 'Перед загрузкой из аккаунта'); mark(c.etag); set('ok'); toast('Загружены данные из аккаунта. Прежние данные этого устройства — в автоснимках'); }
  else { sync.cfg.etag = c.etag; saveCfg(); await push(true); if (sync.status === 'ok') toast('Данные этого устройства отправлены в аккаунт'); }
}
export async function signIn(login, password, create) {
  const l = normLogin(login);
  if (!crypto || !crypto.subtle) throw new Error('Этот браузер не умеет шифровать данные — откройте сайт по адресу https://');
  const k = await derive(l, password);
  const cfg = { login: l, id: k.id, key: k.key, etag: null, stamp: '', syncedAt: null };
  const r = await remote(cfg, false);
  if (!r && !create) throw new Error('Неверный логин или пароль');
  sync.cfg = cfg; sync.conflict = null; saveCfg();
  if (!r) { await push(true); if (sync.status !== 'ok') { const msg = sync.error || 'Не удалось создать аккаунт'; signOut(); throw new Error(msg); } return 'created'; }
  if (!hasData(store.state) || sameData(r.state, store.state)) { if (!sameData(r.state, store.state)) store.adopt(r.state); mark(r.etag); set('ok'); return 'loaded'; }
  clash(r);
  return 'conflict';
}
export function signOut() { clearTimeout(timer); sync.cfg = null; sync.conflict = null; saveCfg(); set('off'); }

/** Запуск при открытии дашборда. Возвращает обещание, которое выполняется после первой сверки с аккаунтом (или через 5 секунд). */
export function startSync() {
  try { sync.cfg = JSON.parse(localStorage.getItem(KEY_SYNC) || 'null'); } catch { sync.cfg = null; }
  if (sync.cfg && !(sync.cfg.id && sync.cfg.key)) sync.cfg = null;
  sync.status = sync.cfg ? 'ok' : 'off';
  store.subscribe(() => { if (sync.cfg && !sync.conflict && !pushing && dirty()) schedule(); });
  document.addEventListener('visibilitychange', () => {
    if (!sync.cfg) return;
    if (document.visibilityState === 'hidden') { if (dirty()) push(); }
    else if (Date.now() - sync.lastCheck > 60000) pull();
  });
  setInterval(() => { if (sync.cfg && document.visibilityState !== 'hidden' && Date.now() - sync.lastCheck > 290000) pull(); }, 60000);
  window.addEventListener('online', () => { if (sync.cfg) pull(); });
  window.addEventListener('storage', (e) => { if (e.key === KEY_SYNC) { try { sync.cfg = JSON.parse(e.newValue || 'null'); } catch { sync.cfg = null; } if (!sync.cfg) { sync.conflict = null; sync.status = 'off'; } paint(); } });
  if (!sync.cfg) return Promise.resolve();
  return Promise.race([pull(), new Promise((r) => setTimeout(r, 5000))]);
}

// ---------- Интерфейс ----------
const when = (iso) => { if (!iso) return ''; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'только что' : m < 60 ? `${m} мин назад` : new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
export function syncLabel() {
  const s = sync.status;
  return s === 'off' ? 'Аккаунт не подключён' : s === 'busy' ? 'Синхронизация…' : s === 'offline' ? 'Нет связи — изменения отправятся позже' : s === 'error' ? sync.error || 'Ошибка синхронизации' : s === 'conflict' ? 'Данные различаются — нужен выбор' : dirty() ? 'Есть неотправленные изменения' : `Синхронизировано ${when(sync.cfg && sync.cfg.syncedAt)}`;
}
const count = (st) => `${st.students.length} ${C.plural(st.students.length, 'ученик', 'ученика', 'учеников')}, ${st.payments.length} ${C.plural(st.payments.length, 'запись', 'записи', 'записей')}${st.meta.updatedAt ? `, изменено ${new Date(st.meta.updatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`;

function SignInSheet({ close, create: c0 }) {
  const [create, setCreate] = useState(!!c0);
  const [v, setV] = useState({ login: '', password: '', again: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const on = (k) => (e) => { setV({ ...v, [k]: e.target.value }); setErr(''); };
  const submit = async () => {
    if (busy) return;
    if (normLogin(v.login).length < 3) return setErr('Логин — не короче 3 символов');
    if (v.password.length < 8) return setErr('Пароль — не короче 8 символов');
    if (create && v.password !== v.again) return setErr('Пароли не совпадают');
    setBusy(true);
    try {
      const res = await signIn(v.login, v.password, create);
      close();
      if (res !== 'conflict') toast(res === 'created' ? 'Аккаунт создан — данные этого устройства сохранены в нём' : create ? 'Такой аккаунт уже есть — вы вошли, данные загружены' : 'Вы вошли — данные загружены');
    } catch (e) { setErr((e && e.message) || 'Не получилось войти'); setBusy(false); }
  };
  return html`<${Sheet} title=${create ? 'Новый аккаунт' : 'Вход в аккаунт'} cls="narrow" onClose=${close} onSubmit=${submit}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary" disabled=${busy}>${busy ? 'Минуту…' : create ? 'Создать аккаунт' : 'Войти'}</button>`}>
    <div class="stack" style="gap:14px">
      <div class="seg" role="tablist"><button type="button" role="tab" class=${cx(!create && 'is-active')} onClick=${() => { setCreate(false); setErr(''); }}>Войти</button><button type="button" role="tab" class=${cx(create && 'is-active')} onClick=${() => { setCreate(true); setErr(''); }}>Создать аккаунт</button></div>
      <div class="field"><label for="acc-login">Логин</label><input id="acc-login" class="input" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" value=${v.login} onInput=${on('login')} placeholder="например, tryos-zone" /></div>
      <div class="field"><label for="acc-pass">Пароль</label><input id="acc-pass" class="input" type="password" name="password" autocomplete=${create ? 'new-password' : 'current-password'} value=${v.password} onInput=${on('password')} /></div>
      ${create && html`<div class="field"><label for="acc-again">Пароль ещё раз</label><input id="acc-again" class="input" type="password" autocomplete="new-password" value=${v.again} onInput=${on('again')} /></div>`}
      ${err && html`<div class="banner warn" role="alert"><${Icon} name="alert" /><div class="grow small">${err}</div></div>`}
      <p class="hint">${create ? 'В аккаунт сохранятся данные этого устройства. Они шифруются вашим паролем прямо в браузере: без пароля их не прочитает никто, поэтому восстановить забытый пароль нельзя — запишите его.' : 'Введите логин и пароль, которые придумали при создании аккаунта. Данные загрузятся на это устройство и дальше будут обновляться сами.'}</p>
    </div>
  <//>`;
}
const openConflict = { shown: false };
function ConflictSheet({ close }) {
  const c = sync.conflict;
  useEffect(() => { openConflict.shown = true; return () => { openConflict.shown = false; }; }, []);
  const done = (choice) => { close(); if (choice) resolve(choice); };
  if (!c) { return html`<${Sheet} title="Синхронизация" cls="narrow" onClose=${() => done()}><p class="muted">Расхождений больше нет.</p><//>`; }
  return html`<${Sheet} title="Какие данные оставить?" cls="narrow" onClose=${() => done()}
    foot=${html`<button class="btn" onClick=${() => done('local')}>Это устройство</button><button class="btn primary" onClick=${() => done('remote')}>Из аккаунта</button>`}>
    <div class="stack" style="gap:12px">
      <p class="muted">Данные в аккаунте и на этом устройстве различаются. Выберите, какие считать правильными — вторые сохранятся в автоснимках этого устройства.</p>
      <div class="preview"><span><b>В аккаунте:</b> ${count(c.state)}</span><span><b>На этом устройстве:</b> ${count(store.state)}</span></div>
    </div>
  <//>`;
}
/** Блок «Аккаунт» в настройках. */
export function AccountCard() {
  const on = !!sync.cfg, s = sync.status;
  return html`<section class="card"><div class="card-head"><div><h2>Аккаунт и синхронизация</h2><div class="hint">Один логин и пароль — одни и те же данные в любом браузере и на телефоне</div></div></div>
    ${on ? html`<div class="setrow"><div><b>${sync.cfg.login}</b><div class="hint" style=${s === 'error' || s === 'conflict' ? 'color:var(--overdue)' : ''}>${syncLabel()}</div></div>
        <div class="ctl">${s === 'conflict' ? html`<button class="btn sm primary" onClick=${() => openSheet(ConflictSheet, {})}>Выбрать</button>` : html`<button class="btn sm" disabled=${s === 'busy'} onClick=${() => pull(true)}><${Icon} name="refresh" cls="s" /><span class="only-wide">Синхронизировать</span></button>`}<button class="btn sm ghost" onClick=${() => { signOut(); toast('Вы вышли. Данные остались на этом устройстве, но больше не синхронизируются'); }}>Выйти</button></div></div>`
      : html`<div class="setrow"><div><b>Аккаунт не подключён</b><div class="hint">Сейчас данные хранятся только в этом браузере. Создайте аккаунт здесь, а в других браузерах просто войдите в него.</div></div>
        <div class="ctl"><button class="btn primary" onClick=${() => openSheet(SignInSheet, { create: true })}>Создать аккаунт</button><button class="btn" onClick=${() => openSheet(SignInSheet, {})}>Войти</button></div></div>`}
  </section>`;
}
sheets.signIn = SignInSheet; sheets.syncConflict = ConflictSheet;
