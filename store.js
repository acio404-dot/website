/* store.js — данные дашборда: хранение в браузере, перенос из старой версии, отмена действий,
   снимки и все изменения (оплаты, ученики, группы, преподаватели, подписки). */
import {
  today, ymOf, ymAdd, ymRange, ymName, dateFor, clampDay, isYm, isISO, isSaneDate, nextDateForDay, r2, uid, norm, fmtMoney, rateAt, setRate,
  studentLedger, ledgerFromHistory, buildIndex, recurringLedger, teacherLines, derive,
} from './core.js';

export const KEY = 'tryos-finance-v2';
export const KEY_V1 = 'edu-finance-v1';
export const KEY_UI = 'tryos-finance-ui';
export const KEY_SNAP = KEY + ':snap:';
export const SCHEMA = 2;
const MAX_SNAPSHOTS = 8;
const MAX_UNDO = 30;

export const DEFAULT_TEMPLATES = {
  soon: 'Здравствуйте, {имя}! Напоминаем об оплате занятий за {месяц}: {сумма}, срок — {срок}. Спасибо!',
  overdue: 'Здравствуйте, {имя}! По нашим записям оплата за {месяц} ({сумма}) ещё не поступила, срок был {срок}. Подскажите, пожалуйста, когда получится оплатить?',
};
export const HOME_WIDGETS = [
  ['kpi', 'Главные цифры'], ['attention', 'Ждём оплату: ученики'], ['payouts', 'Выплатить и оплатить'],
  ['cashflow', 'График доходов и расходов'], ['groups', 'Сбор по группам'], ['upcoming', 'Ближайшие 7 дней'], ['recent', 'Последние операции'],
];
export const ACCENTS = ['blue', 'violet', 'green', 'orange', 'pink', 'graphite'];

export const defaultSettings = () => ({
  orgName: 'TR-YOS Zone', currency: '$', currencyPos: 'auto', remindDays: 3,
  theme: 'auto', accent: 'blue', density: 'cozy',
  quickPay: true, methods: ['Наличные', 'Карта', 'Перевод'], defaultMethod: '',
  categories: [], templates: { ...DEFAULT_TEMPLATES }, messenger: 'whatsapp',
  home: HOME_WIDGETS.map(([id]) => ({ id, on: true })), backupDays: 7, sheets: [],
});
export const emptyState = () => ({
  v: SCHEMA, meta: { createdAt: new Date().toISOString(), updatedAt: null, rev: 0, lastBackupAt: null },
  settings: defaultSettings(), projects: [], groups: [], students: [], teachers: [], recurring: [], payments: [],
});
export const hasData = (st) => !!st && ['projects', 'groups', 'students', 'teachers', 'recurring', 'payments'].some((k) => Array.isArray(st[k]) && st[k].length);

// ---------- Приведение к правильной форме (на случай старых или правленых вручную файлов) ----------
const str = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const num = (v) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? n : 0; };
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const when = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null);
/** Дата с днём, которого нет в месяце (31 февраля), сдвигается на последний день месяца. */
const fixDate = (v) => (isISO(v) ? dateFor(v.slice(0, 7), Number(v.slice(8))) : null);
const SHEET_KINDS = ['students', 'teachers', 'expenses', 'payments'];
const normSheet = (x) => {
  const o = { id: str(x.id) || uid(), name: str(x.name), url: str(x.url), type: SHEET_KINDS.includes(x.type) ? x.type : 'students', projectId: str(x.projectId),
    autoSync: x.autoSync === true, archiveMissing: x.archiveMissing === true, enabled: x.enabled !== false, mapping: {}, lastSync: when(x.lastSync) || '', lastError: str(x.lastError) };
  for (const [k, v] of Object.entries(obj(x.mapping))) if (Number.isInteger(v) && v >= 0 && v < 1000 && /^[a-zA-Z]{1,20}$/.test(k)) o.mapping[k] = v;
  if (Array.isArray(x.headers)) o.headers = x.headers.slice(0, 1000).map(str);
  if (Number.isInteger(x.baseYear)) o.baseYear = x.baseYear;
  const r = obj(x.lastResult), res = {};
  for (const k of ['created', 'updated', 'archived', 'payments', 'months', 'skipped']) if (r[k] != null) res[k] = num(r[k]);
  if (Object.keys(res).length) o.lastResult = res;
  return o;
};
const normPay = (pay, fallbackDay) => {
  if (!pay || typeof pay !== 'object') return { payDay: clampDay(fallbackDay || 1), rates: [] };
  const rates = (Array.isArray(pay.rates) ? pay.rates : []).filter((r) => r && isYm(r.from)).map((r) => { const o = { from: r.from, mode: r.mode === 'percent' ? 'percent' : 'fixed', amount: Math.max(0, num(r.amount)) }; if (isISO(r.after)) o.after = r.after; return o; });
  return { payDay: clampDay(pay.payDay || fallbackDay || 1), rates };
};
export function normalize(raw) {
  const base = emptyState();
  const st = obj(raw);
  const M = obj(st.meta), S0 = obj(st.settings), D = base.settings, T = obj(S0.templates);
  const out = { v: SCHEMA, meta: { createdAt: when(M.createdAt) || base.meta.createdAt, updatedAt: when(M.updatedAt), rev: Math.max(0, Math.round(num(M.rev))), lastBackupAt: when(M.lastBackupAt) } };
  if (M.migratedFrom) { out.meta.migratedFrom = str(M.migratedFrom); out.meta.migratedAt = when(M.migratedAt); }
  if (M.demo === true) { out.meta.demo = true; out.meta.demoRev = Math.max(0, Math.round(num(M.demoRev))); }
  const known = new Set(HOME_WIDGETS.map(([id]) => id));
  const home = (Array.isArray(S0.home) ? S0.home : []).filter((w) => w && known.has(w.id)).map((w) => ({ id: w.id, on: w.on !== false }));
  for (const [id] of HOME_WIDGETS) if (!home.some((w) => w.id === id)) home.push({ id, on: true });
  const list = (v) => [...new Set((Array.isArray(v) ? v : []).map((c) => str(c).trim()).filter(Boolean))];
  out.settings = {
    orgName: str(S0.orgName).trim() || D.orgName, currency: str(S0.currency).trim().slice(0, 6) || '$', currencyPos: ['auto', 'before', 'after'].includes(S0.currencyPos) ? S0.currencyPos : 'auto',
    remindDays: Math.max(0, Math.min(30, Math.round(num(S0.remindDays ?? D.remindDays)))),
    theme: ['auto', 'light', 'dark'].includes(S0.theme) ? S0.theme : 'auto', accent: ACCENTS.includes(S0.accent) ? S0.accent : 'blue', density: ['cozy', 'compact'].includes(S0.density) ? S0.density : 'cozy',
    quickPay: S0.quickPay !== false, methods: Array.isArray(S0.methods) ? list(S0.methods) : D.methods, defaultMethod: str(S0.defaultMethod),
    categories: list(S0.categories), templates: { soon: str(T.soon).trim() ? str(T.soon) : DEFAULT_TEMPLATES.soon, overdue: str(T.overdue).trim() ? str(T.overdue) : DEFAULT_TEMPLATES.overdue },
    messenger: ['whatsapp', 'telegram'].includes(S0.messenger) ? S0.messenger : 'whatsapp', home,
    backupDays: S0.backupDays == null ? D.backupDays : Math.max(0, Math.min(365, Math.round(num(S0.backupDays)))),
    sheets: (Array.isArray(S0.sheets) ? S0.sheets : []).filter((x) => x && typeof x === 'object' && !Array.isArray(x)).map(normSheet),
  };
  const arr = (k) => (Array.isArray(st[k]) ? st[k].filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []);
  const cur = ymOf(today());
  out.projects = arr('projects').map((p) => ({ id: str(p.id) || uid(), name: str(p.name), notes: str(p.notes) }));
  out.groups = arr('groups').map((g, i) => ({
    id: str(g.id) || uid(), name: str(g.name), projectId: str(g.projectId), teacherId: str(g.teacherId), subject: str(g.subject), schedule: str(g.schedule),
    color: Number.isInteger(g.color) ? ((g.color % 8) + 8) % 8 : i % 8, payType: g.payType === 'package' ? 'package' : 'monthly', price: Math.max(0, num(g.price)), payDay: clampDay(g.payDay),
    lessonsInPackage: Math.max(1, Math.round(num(g.lessonsInPackage)) || 8), notes: str(g.notes), archived: !!g.archived, endYm: isYm(g.endYm) ? g.endYm : null, pay: normPay(g.pay, g.payDay),
  }));
  out.students = arr('students').map((s) => {
    const startYm = isYm(s.startYm) ? s.startYm : cur;
    const rates = (Array.isArray(s.rates) ? s.rates : []).filter((r) => r && isYm(r.from)).map((r) => ({ from: r.from, price: Math.max(0, num(r.price)) }));
    const overrides = {};
    for (const [k, v] of Object.entries(s.overrides && typeof s.overrides === 'object' ? s.overrides : {})) if (isYm(k) && v != null) overrides[k] = Math.max(0, num(v));
    const o = {
      id: str(s.id) || uid(), name: str(s.name), groupId: str(s.groupId), projectId: str(s.projectId), teacherId: str(s.teacherId), subject: str(s.subject),
      phone: str(s.phone), telegram: str(s.telegram), notes: str(s.notes), archived: !!s.archived,
      payType: s.payType === 'package' ? 'package' : 'monthly', payDay: clampDay(s.payDay), startYm, endYm: isYm(s.endYm) ? s.endYm : null,
      rates: rates.length ? rates : [{ from: startYm, price: Math.max(0, num(s.price)) }], overrides,
      extras: (Array.isArray(s.extras) ? s.extras : []).filter((x) => x && isISO(x.date)).map((x) => ({ id: str(x.id) || uid(), date: fixDate(x.date), amount: Math.max(0, num(x.amount)), label: str(x.label) })),
      pkg: s.payType === 'package' ? { size: Math.max(1, Math.round(num(s.pkg && s.pkg.size)) || 8), bonus: num(s.pkg && s.pkg.bonus), used: Math.max(0, num(s.pkg && s.pkg.used)) } : null,
      remindedAt: isISO(s.remindedAt) ? s.remindedAt : null, remindCount: Math.max(0, Math.round(num(s.remindCount))),
      pay: s.pay && typeof s.pay === 'object' ? normPay(s.pay, s.payDay) : null, createdAt: isISO(s.createdAt) ? s.createdAt : null,
    };
    if (isISO(s.firstDue)) o.firstDue = fixDate(s.firstDue);
    if (str(s.sourceId)) o.sourceId = str(s.sourceId);
    if (o.archived && str(s.archivedBy)) o.archivedBy = str(s.archivedBy);
    return o;
  });
  out.teachers = arr('teachers').map((t) => {
    const startYm = isYm(t.startYm) ? t.startYm : cur;
    const rates = (Array.isArray(t.rates) ? t.rates : []).filter((r) => r && isYm(r.from)).map((r) => ({ from: r.from, amount: Math.max(0, num(r.amount)) }));
    const lessons = {};
    for (const [k, v] of Object.entries(t.lessons && typeof t.lessons === 'object' ? t.lessons : {})) if (isYm(k) && num(v) > 0) lessons[k] = Math.round(num(v));
    const o = {
      id: str(t.id) || uid(), name: str(t.name), projectId: str(t.projectId), subject: str(t.subject), phone: str(t.phone), telegram: str(t.telegram), notes: str(t.notes), archived: !!t.archived,
      payType: ['salary', 'perLesson', 'perGroup'].includes(t.payType) ? t.payType : 'salary', payDay: clampDay(t.payDay), startYm, rates: rates.length ? rates : [{ from: startYm, amount: 0 }], lessons,
      // уже заработанное по группам, ученикам и схемам, которые с тех пор изменились (см. keepAccrued)
      frozen: (Array.isArray(t.frozen) ? t.frozen : []).filter((f) => f && isYm(f.ym) && isISO(f.due) && num(f.amount) > 0).map((f) => ({ id: str(f.id) || uid(), ym: f.ym, due: fixDate(f.due), amount: r2(num(f.amount)), label: str(f.label) })),
    };
    if (o.archived) o.archivedAt = isISO(t.archivedAt) ? t.archivedAt : today();
    if (str(t.sourceId)) o.sourceId = str(t.sourceId);
    return o;
  });
  out.recurring = arr('recurring').map((r) => ({
    id: str(r.id) || uid(), name: str(r.name), projectId: str(r.projectId), amount: Math.max(0, num(r.amount)), payDay: clampDay(r.payDay),
    startYm: isYm(r.startYm) ? r.startYm : cur, endYm: isYm(r.endYm) ? r.endYm : null, auto: r.auto === true, autoFrom: r.auto === true && isISO(r.autoFrom) ? r.autoFrom : null, notes: str(r.notes), archived: !!r.archived,
    skipped: Object.fromEntries(Object.entries(obj(r.skipped)).filter(([k, v]) => isYm(k) && v).map(([k]) => [k, true])),
  }));
  out.payments = arr('payments').map((p) => {
    // запись с нечитаемой датой не выбрасываем (это деньги): ставим сегодняшнюю и помечаем в комментарии
    const date = fixDate(p.date);
    const o = {
      id: str(p.id) || uid(), kind: ['income', 'salary', 'expense', 'otherIncome'].includes(p.kind) ? p.kind : 'expense', date: date || today(), amount: Math.abs(num(p.amount)),
      personId: str(p.personId), personName: str(p.personName), category: str(p.category), projectId: str(p.projectId), note: date ? str(p.note) : [str(p.note), 'дата не распознана — проверьте'].filter(Boolean).join(' · '), method: str(p.method),
    };
    if (p.groupId != null) o.groupId = str(p.groupId);
    if (str(p.recurringId)) { o.recurringId = str(p.recurringId); if (isYm(p.period)) o.period = p.period; }
    if (p.lessons != null) o.lessons = num(p.lessons);
    for (const k of ['legacy', 'auto']) if (p[k] === true) o[k] = true;
    if (str(p.sourceId)) o.sourceId = str(p.sourceId);
    const created = typeof p.createdAt === 'number' ? p.createdAt : typeof p.createdAt === 'string' ? Date.parse(p.createdAt) : NaN;
    if (Number.isFinite(created)) o.createdAt = created;
    return o;
  });
  return out;
}

// ---------- Перенос из старой версии (edu-finance-v1) ----------
export function migrateV1(raw, t = today()) {
  const src = obj(raw);
  const arr = (k) => (Array.isArray(src[k]) ? src[k].filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []);
  const S = obj(src.settings);
  const st = emptyState();
  Object.assign(st.settings, {
    currency: str(S.currency).trim() || '$', remindDays: S.remindDays == null ? 3 : num(S.remindDays),
    theme: S.theme,
    // подключённые таблицы переносим выключенными: соответствие колонок нужно один раз подтвердить в новой версии
    sheets: (Array.isArray(S.sheets) ? S.sheets : []).filter((x) => x && typeof x === 'object').map((x) => ({ ...x, autoSync: false, headers: undefined })),
  });
  st.projects = arr('projects').map((p) => ({ id: p.id, name: p.name, notes: p.notes }));
  if (st.projects.length === 1 && str(st.projects[0].name).trim()) st.settings.orgName = str(st.projects[0].name).trim();
  const convPay = (pay, day, archived) => {
    if (!pay) return { payDay: clampDay(day || 1), rates: [] };
    const next = isISO(pay.nextDue) ? pay.nextDue : nextDateForDay(pay.payDay || day || 1, t);
    return { payDay: clampDay(pay.payDay || day || 1), rates: archived ? [] : [{ from: ymOf(next), mode: pay.mode === 'percent' ? 'percent' : 'fixed', amount: num(pay.amount) }] };
  };
  st.groups = arr('groups').map((g, i) => ({ ...g, color: i % 8, endYm: null, pay: convPay(g.pay, g.payDay, g.archived) }));
  const groupByName = new Map(st.groups.map((g) => [norm(g.name), g.id]));
  const recNext = new Map(arr('recurring').map((r) => [r.id, isISO(r.nextDue) ? r.nextDue : null]));
  const oldStudents = new Map(arr('students').map((s) => [s.id, s]));
  st.payments = arr('payments').map((p) => {
    const kind = p.kind === 'other' ? 'expense' : p.kind;
    const o = { ...p, kind, amount: Math.abs(num(p.amount)), date: isISO(p.date) ? p.date : t, personId: str(p.personId) };
    if (kind === 'income') { const gid = p.category ? groupByName.get(norm(p.category)) : null; o.groupId = gid || str((oldStudents.get(p.personId) || {}).groupId); }
    if (kind === 'salary') o.legacy = true; // выплаты до переноса не засчитываются в новый расчёт зарплат
    if (kind === 'expense' && recNext.has(o.personId)) {
      // оплата подписки в месяце срока, но раньше самого срока — это опоздавшая оплата за прошлый месяц
      const nd = recNext.get(o.personId), ym = ymOf(o.date);
      o.recurringId = o.personId; o.period = nd && o.date < nd && ym >= ymOf(nd) ? ymAdd(ymOf(nd), -1) : ym; o.personId = '';
    }
    return o;
  });
  const incomeOf = new Map();
  for (const p of st.payments) if (p.kind === 'income' && p.personId) { if (!incomeOf.has(p.personId)) incomeOf.set(p.personId, []); incomeOf.get(p.personId).push(p); }
  st.students = arr('students').map((s) => {
    const o = { ...s, telegram: '', extras: [], remindCount: s.remindedAt ? 1 : 0 };
    const price = Math.max(0, num(s.price));
    if (s.payType === 'package') {
      o.startYm = ymOf(t); o.endYm = null; o.rates = [{ from: o.startYm, price }]; o.overrides = {};
      o.pkg = { size: Math.max(1, Math.round(num(s.lessonsInPackage)) || 8), bonus: num(s.lessonsLeft), used: 0 };
    } else {
      const next = isISO(s.nextDue) ? s.nextDue : nextDateForDay(s.payDay || 1, t);
      const L = ledgerFromHistory(price, incomeOf.get(s.id) || [], next, !!s.archived);
      Object.assign(o, L, { rates: [{ from: L.startYm, price }], payDay: clampDay(s.payDay || Number(next.slice(8, 10))) });
    }
    o.pay = s.groupId ? null : convPay(s.pay, s.payDay, s.archived);
    return o;
  });
  st.teachers = arr('teachers').map((x) => {
    const payType = x.payType === 'perLesson' ? 'perLesson' : x.payType === 'perGroup' ? 'perGroup' : 'salary';
    // у преподавателя в архиве старая «дата следующей выплаты» ничего не значит — долг за время архива не копим
    const next = isISO(x.nextDue) && !x.archived ? x.nextDue : nextDateForDay(x.payDay || 5, t);
    const startYm = ymOf(next);
    const lessons = {};
    if (payType === 'perLesson' && num(x.lessonsDone) > 0) lessons[ymAdd(startYm, -1)] = Math.round(num(x.lessonsDone));
    return { ...x, telegram: '', payType, payDay: clampDay(x.payDay || Number(next.slice(8, 10))), startYm, rates: [{ from: payType === 'perLesson' ? ymAdd(startYm, -1) : startYm, amount: num(x.rate) }], lessons, frozen: [], archivedAt: x.archived ? t : undefined };
  });
  st.recurring = arr('recurring').map((r) => ({ ...r, startYm: ymOf(isISO(r.nextDue) ? r.nextDue : nextDateForDay(r.payDay || 1, t)), endYm: null, auto: false, skipped: {} }));
  st.settings.categories = [...new Set([...st.recurring.map((r) => str(r.name)), ...st.payments.filter((p) => p.kind === 'expense').map((p) => str(p.category))].map((c) => c.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  st.meta.migratedFrom = 'v1';
  st.meta.migratedAt = new Date().toISOString();
  return normalize(st);
}
/** Принять любой файл копии: новый формат как есть, старый — с переносом. Бросает ошибку с понятным текстом, если файл не годится. */
export function importAny(file) {
  if (!file || typeof file !== 'object' || Array.isArray(file) || !Array.isArray(file.students) || !Array.isArray(file.payments)) throw new Error('Файл не похож на копию данных дашборда');
  const ver = file.v == null ? null : Number(file.v);
  if (ver != null && Number.isFinite(ver) && ver > SCHEMA) throw new Error('Эта копия сделана в более новой версии дашборда. Обновите страницу и попробуйте ещё раз.');
  // формат определяем по содержимому, а не только по номеру версии: у новой копии есть meta и ставки с датой начала
  const looksNew = ver === SCHEMA || (file.meta && typeof file.meta === 'object' && file.students.every((x) => !x || typeof x !== 'object' || Array.isArray(x.rates)));
  let st;
  try { st = looksNew ? normalize(file) : migrateV1(file); derive(st); } // derive — проверка, что с этими данными дашборд сможет работать
  catch { throw new Error('В файле есть данные, которые не удаётся прочитать. Текущие данные не изменены.'); }
  return st;
}

// ---------- Хранилище ----------
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
const listeners = new Set();
export const KEY_BROKEN = KEY + ':broken';
export const defaultUI = () => ({ project: 'all', studentsView: 'list', studentsFilter: 'all', studentsGroup: 'all', studentsSort: 'status', financeTab: 'summary', financeRange: 6, journalKind: 'all', matrixEnd: null, calMonth: null, dismissed: {} });
/** Настройки вида не должны ломать экран: неверные типы сбрасываются, фильтр по удалённому проекту или группе снимается. */
function cleanUI(ui, st) {
  const d = defaultUI();
  for (const k of Object.keys(d)) {
    if (d[k] === null) { if (!isYm(ui[k])) ui[k] = null; }
    else if (typeof ui[k] !== typeof d[k] || (k === 'dismissed' && (!ui[k] || Array.isArray(ui[k])))) ui[k] = d[k];
  }
  if (st) {
    if (ui.project !== 'all' && (st.projects.length < 2 || !st.projects.some((p) => p.id === ui.project))) ui.project = 'all';
    if (ui.studentsGroup !== 'all' && ui.studentsGroup !== 'solo' && !st.groups.some((g) => g.id === ui.studentsGroup)) ui.studentsGroup = 'all';
  }
  return ui;
}
const parseObj = (txt) => { try { const o = JSON.parse(txt); return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; } };
/** Данные годятся для работы: приводятся к форме и по ним считаются сводки. Иначе — null. */
const usable = (o, make = normalize) => { try { const st = make(o); derive(st); return st; } catch { return null; } };

export const store = {
  state: emptyState(), ui: defaultUI(), rev: 0, undoStack: [], last: null, boot: 'empty', persistent: true, storage: null, recovered: null, saveError: false,

  init(storage) {
    try { this.storage = storage || globalThis.localStorage; this.storage.getItem(KEY); } catch { this.storage = memory(); this.persistent = false; }
    if (!this.storage) { this.storage = memory(); this.persistent = false; }
    const raw = (k) => { try { return this.storage.getItem(k); } catch { return null; } };
    this.recovered = null; this.boot = 'empty';
    const curRaw = raw(KEY);
    let state = curRaw ? usable(parseObj(curRaw) || undefined, (o) => { if (!o) throw new Error('bad'); return normalize(o); }) : null;
    if (state) this.boot = hasData(state) ? 'ready' : 'empty';
    else {
      if (curRaw) {
        // сохранённые данные не читаются: откладываем их в сторону (можно скачать) и берём самый свежий автоснимок
        try { this.storage.setItem(KEY_BROKEN, curRaw); } catch { /* нет места — не страшно */ }
        for (const k of this.snapshotKeys().reverse()) {
          const snap = parseObj(raw(k));
          const st = snap && snap.state ? usable(snap.state) : null;
          if (st && hasData(st)) { state = st; this.boot = 'ready'; this.recovered = { from: 'snapshot', at: when(snap.at) }; break; }
        }
      }
      if (!state) {
        const old = parseObj(raw(KEY_V1));
        const st = hasData(old) ? usable(old, migrateV1) : null;
        if (st) { state = st; this.boot = 'migrated'; if (curRaw) this.recovered = { from: 'v1' }; }
      }
      if (!state) { state = emptyState(); if (curRaw) this.recovered = { from: 'empty' }; }
      this.state = state;
      if (hasData(state) || curRaw) this.save();
    }
    this.state = state;
    if (!this.recovered && raw(KEY_BROKEN)) this.recovered = { from: 'earlier' }; // сообщение о восстановлении ещё не закрыли
    this.ui = cleanUI({ ...defaultUI(), ...(parseObj(raw(KEY_UI)) || {}) }, this.state);
    this.undoStack = []; this.last = null; this.rev++;
    if (hasData(this.state)) this.dailySnapshot();
    return this.boot;
  },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit() { for (const fn of [...listeners]) fn(); },
  save() {
    const body = JSON.stringify(this.state);
    for (let i = 0; i <= MAX_SNAPSHOTS; i++) {
      try { this.storage.setItem(KEY, body); this.saveError = false; return true; }
      catch { const old = this.snapshotKeys()[0]; if (!old) break; try { this.storage.removeItem(old); } catch { break; } } // места нет — освобождаем его за счёт самых старых снимков
    }
    this.saveError = true;
    return false;
  },
  /** Любое изменение данных: fn меняет state на месте. Запоминается для «Отменить». Если fn упала — данные остаются прежними. */
  commit(label, fn, opt = {}) {
    const before = JSON.stringify(this.state);
    let res;
    try { res = fn(this.state); }
    catch (e) { this.state = normalize(JSON.parse(before)); this.rev++; this.emit(); throw e; }
    this.state.meta.rev = (this.state.meta.rev || 0) + 1;
    this.state.meta.updatedAt = new Date().toISOString();
    cleanUI(this.ui, this.state);
    this.save(); this.rev++;
    if (!opt.noUndo) { this.undoStack.push({ label, before, id: this.rev, replace: !!opt.replace }); if (this.undoStack.length > MAX_UNDO) this.undoStack.shift(); }
    this.last = opt.silent ? null : { id: this.rev, label, undo: !opt.noUndo, action: opt.action || null };
    this.emit();
    return res;
  },
  /** Отменить последнее действие. Если передан id — только когда последним было именно оно. */
  undo(id) {
    const top = this.undoStack[this.undoStack.length - 1];
    if (!top || (id != null && top.id !== id)) return null;
    const u = this.undoStack.pop();
    const now = this.state.meta;
    this.state = normalize(JSON.parse(u.before));
    // отметка о скачанной копии и счётчик изменений назад не откатываются (кроме отмены полной замены данных)
    if (!u.replace && now.lastBackupAt && !(this.state.meta.lastBackupAt > now.lastBackupAt)) this.state.meta.lastBackupAt = now.lastBackupAt;
    this.state.meta.rev = (now.rev || 0) + 1;
    cleanUI(this.ui, this.state);
    this.save(); this.rev++;
    this.last = { id: this.rev, label: `Отменено: ${u.label}`, undo: false };
    this.emit();
    return u.label;
  },
  /** Полная замена данных (импорт, восстановление, демо) — со снимком прежнего состояния. */
  replace(next, label, reason) {
    if (hasData(this.state)) this.snapshot(reason || label);
    return this.commit(label, () => {
      const st = normalize(next);
      st.meta.rev = this.state.meta.rev || 0;
      if (st.meta.demo) st.meta.demoRev = st.meta.rev + 1;
      this.state = st;
    }, { replace: true });
  },
  setUI(patch) {
    Object.assign(this.ui, patch);
    cleanUI(this.ui, this.state);
    try { this.storage.setItem(KEY_UI, JSON.stringify(this.ui)); } catch { /* не критично */ }
    this.rev++; this.emit();
  },
  /** Данные изменились в другой вкладке. */
  reloadFromStorage() {
    let raw = null;
    try { raw = this.storage.getItem(KEY); } catch { return; }
    const st = raw ? usable(parseObj(raw) || undefined, (o) => { if (!o) throw new Error('bad'); return normalize(o); }) : null;
    if (!st) return;
    this.state = st; cleanUI(this.ui, st); this.undoStack = []; this.rev++; this.last = null; this.emit();
  },

  // --- снимки (автоматические копии внутри браузера) ---
  snapshotKeys() { const keys = []; try { for (let i = 0; i < this.storage.length; i++) { const k = this.storage.key(i); if (k && k.startsWith(KEY_SNAP)) keys.push(k); } } catch { /* нет доступа */ } return keys.sort(); },
  /** Записать снимок. Возвращает true, если снимок есть (записан сейчас или уже был такой же). */
  snapshot(reason) {
    if (!hasData(this.state)) return false;
    const body = JSON.stringify(this.state);
    const keys = this.snapshotKeys();
    try { const last = keys.length ? JSON.parse(this.storage.getItem(keys[keys.length - 1]) || 'null') : null; if (last && JSON.stringify(last.state) === body) return true; } catch { /* последний снимок повреждён — пишем новый */ }
    this.snapSeq = ((this.snapSeq || 0) + 1) % 1000;
    const key = KEY_SNAP + Date.now() + String(this.snapSeq).padStart(3, '0');
    const val = JSON.stringify({ at: new Date().toISOString(), reason: reason || 'Автоснимок', state: this.state });
    // сначала пишем новый снимок; если не хватает места — освобождаем его за счёт самых старых
    let done = false;
    for (let i = 0; i <= keys.length && !done; i++) {
      try { this.storage.setItem(key, val); done = true; }
      catch { const old = keys.shift(); if (!old) break; try { this.storage.removeItem(old); } catch { break; } }
    }
    if (!done) return false;
    // большие базы: снимков держим меньше, чтобы не занять всё место в браузере
    const keep = Math.max(1, Math.min(MAX_SNAPSHOTS, Math.floor(1500000 / Math.max(1, body.length))));
    const all = this.snapshotKeys();
    for (const k of all.slice(0, Math.max(0, all.length - keep))) { try { this.storage.removeItem(k); } catch { /* в следующий раз */ } }
    return true;
  },
  dailySnapshot() {
    const keys = this.snapshotKeys();
    const lastAt = keys.length ? Number(keys[keys.length - 1].slice(KEY_SNAP.length, KEY_SNAP.length + 13)) : 0;
    if (!(Date.now() - lastAt <= 20 * 3600 * 1000)) this.snapshot('Ежедневный автоснимок');
  },
  snapshots() {
    return this.snapshotKeys().reverse().map((k) => { try { const s = JSON.parse(this.storage.getItem(k)); return { key: k, at: when(s.at), reason: str(s.reason), students: (s.state.students || []).length, payments: (s.state.payments || []).length }; } catch { return null; } }).filter((x) => x && x.at);
  },
  restoreSnapshot(key) {
    let s = null;
    try { s = parseObj(this.storage.getItem(key)); } catch { /* ниже */ }
    const st = s && s.state ? usable(s.state) : null;
    if (!st) throw new Error('Снимок не читается');
    this.replace(st, 'Снимок восстановлен', 'Перед восстановлением снимка');
  },
  exportJSON() { return JSON.stringify(this.state, null, 2); },
  markBackup() { this.commit('', (st) => { st.meta.lastBackupAt = new Date().toISOString(); }, { noUndo: true, silent: true }); },
  legacyRaw() { try { return this.storage.getItem(KEY_V1); } catch { return null; } },
  /** Данные, которые не удалось прочитать при запуске (если такое было). */
  brokenRaw() { try { return this.storage.getItem(KEY_BROKEN); } catch { return null; } },
  dropBroken() { try { this.storage.removeItem(KEY_BROKEN); } catch { /* не критично */ } this.recovered = null; this.rev++; this.emit(); },
};

// ---------- Действия ----------
const money = (n) => fmtMoney(n, store.state.settings.currency, store.state.settings.currencyPos);
const byId = (list, id) => list.find((x) => x.id === id);
const trimmed = (v) => str(v).trim();
const dateOr = (v) => (isSaneDate(v) ? v : today());
/** Ник в Telegram из любой записи: «@user», «t.me/user», «https://t.me/user?start=1» → «user». */
const tgHandle = (v) => trimmed(v).replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '').replace(/^@+/, '').replace(/[/?#\s].*$/, '');
/** Месяц, с которого разумно начинать новое начисление: текущий, если день оплаты ещё впереди, иначе следующий. */
export const defaultStartYm = (payDay, t = today()) => ymOf(nextDateForDay(payDay, t));
function mergePay(old, d, fallbackDay, reset) {
  const payDay = clampDay(d.payDay || (old && old.payDay) || fallbackDay || 1);
  const mode = d.mode === 'percent' ? 'percent' : 'fixed';
  const amount = Math.max(0, num(d.amount));
  const from = isYm(d.from) ? d.from : defaultStartYm(payDay);
  const prev = reset ? [] : (old && old.rates) || [];
  if (!prev.length && !amount) return { payDay, rates: [] };
  if (!reset && d.changed === false) return { payDay, rates: prev };
  return { payDay, rates: setRate(prev, from, { mode, amount }) };
}
/** Начать начисления по схеме заново с месяца from: более ранние месяцы больше не начисляются. */
function rebasePay(pay, from) {
  if (!pay || !Array.isArray(pay.rates) || !pay.rates.length) return pay;
  const cur = rateAt(pay.rates, from);
  const head = cur && cur.from <= from ? [{ ...cur, from }] : [];
  return { payDay: pay.payDay, rates: [...head, ...pay.rates.filter((r) => r.from > from)] };
}
/** Все группы и индивидуальные ученики преподавателя начинают начисляться заново с ближайшего срока. */
function restartSources(st, teacherId, t) {
  for (const g of st.groups) if (g.teacherId === teacherId) g.pay = rebasePay(g.pay, defaultStartYm(g.pay.payDay, t));
  for (const s of st.students) if (!s.groupId && s.teacherId === teacherId && s.pay) s.pay = rebasePay(s.pay, defaultStartYm(s.pay.payDay, t));
}
/** Заработанное преподавателем не должно пропадать, когда меняется привязка: группу передали другому или удалили,
    ученик ушёл в архив или в группу, поменялась схема оплаты. Сравниваем начисления до и после изменения и
    «замораживаем» исчезнувшие — те, чей срок уже наступил, и уже проведённые занятия. */
export function keepAccrued(st, teacherIds, fn) {
  const t0 = today(), toYm = ymAdd(ymOf(t0), 1);
  const ids = [...new Set((teacherIds || []).filter(Boolean))];
  if (!ids.length) return fn();
  const lines = () => { const idx = buildIndex(st); return new Map(ids.map((id) => { const t = byId(st.teachers, id); return [id, t ? teacherLines(t, st, idx, toYm) : []]; })); };
  const before = lines();
  const res = fn();
  const after = lines();
  for (const id of ids) {
    const t = byId(st.teachers, id); if (!t) continue;
    const left = new Set(after.get(id).map((c) => c.key));
    for (const c of before.get(id)) if (!left.has(c.key) && c.src !== 'frozen' && (c.due <= t0 || c.src === 'lessons')) t.frozen.push({ id: uid(), ym: c.ym, due: c.due, amount: c.amount, label: c.label });
  }
  return res;
}
function rememberCategory(st, name) { const c = trimmed(name); if (c && c !== 'Зарплаты' && !st.settings.categories.includes(c)) st.settings.categories.push(c); }
const paidThroughOf = (st, s) => studentLedger(s, buildIndex(st).studentPays(s.id), { remindDays: 0 }).paidThrough;
/** В архив: начисления останавливаются. Неоплаченное списывается (или остаётся долгом, если keepDebt). */
export function archiveStudentIn(st, s, keepDebt, by) {
  s.archived = true;
  if (by) s.archivedBy = by; else delete s.archivedBy;
  if (s.payType !== 'package') { const pt = keepDebt ? ymOf(today()) : paidThroughOf(st, s); s.endYm = pt && pt >= s.startYm ? pt : ymAdd(s.startYm, -1); }
}
/** Из архива: месяцы, проведённые в архиве, не начисляются ни ученику, ни его преподавателю. */
export function restoreStudentIn(st, s) {
  const t = today(), cur = ymOf(t);
  s.archived = false; delete s.archivedBy;
  if (s.payType !== 'package') {
    if (s.endYm && s.endYm >= s.startYm) for (const ym of ymRange(ymAdd(s.endYm, 1), ymAdd(cur, -1))) s.overrides[ym] = 0;
    else if (s.startYm < cur) s.startYm = cur;
    s.endYm = null;
    if (dateFor(cur, s.payDay) < t && !(s.overrides[cur] != null)) s.firstDue = t;
  }
  if (!s.groupId && s.pay) s.pay = rebasePay(s.pay, defaultStartYm(s.pay.payDay, t));
}

export const act = {
  // --- оплаты ---
  payStudent(id, v = {}) {
    const s = byId(store.state.students, id); if (!s) return null;
    const amount = r2(Math.abs(num(v.amount))); if (!amount) return null;
    const g = byId(store.state.groups, s.groupId);
    const p = { id: uid(), kind: 'income', date: dateOr(v.date), amount, personId: s.id, personName: s.name, category: g ? g.name : '', groupId: s.groupId || '', projectId: s.projectId || '', note: trimmed(v.note), method: str(v.method ?? store.state.settings.defaultMethod), createdAt: Date.now() };
    if (s.payType === 'package') p.lessons = v.lessons != null ? num(v.lessons) : (s.pkg && s.pkg.size) || 1;
    return store.commit(`Оплата: ${s.name} — ${money(amount)}`, (st) => { st.payments.push(p); const x = byId(st.students, id); x.remindedAt = null; x.remindCount = 0; return p; }, { action: { type: 'payment', id: p.id } });
  },
  /** Несколько оплат одним действием (вся группа оплатила): items = [{ id, amount }]. */
  payMany(items, v = {}) {
    const st0 = store.state;
    const list = items.map((it) => ({ s: byId(st0.students, it.id), amount: r2(Math.abs(num(it.amount))) })).filter((x) => x.s && x.amount > 0);
    if (!list.length) return [];
    const made = list.map(({ s, amount }) => { const g = byId(st0.groups, s.groupId); const p = { id: uid(), kind: 'income', date: dateOr(v.date), amount, personId: s.id, personName: s.name, category: g ? g.name : '', groupId: s.groupId || '', projectId: s.projectId || '', note: trimmed(v.note), method: str(v.method ?? st0.settings.defaultMethod), createdAt: Date.now() }; if (s.payType === 'package') p.lessons = (s.pkg && s.pkg.size) || 1; return p; });
    return store.commit(`Оплаты: ${made.length} ${made.length === 1 ? 'ученик' : made.length < 5 ? 'ученика' : 'учеников'} — ${money(made.reduce((a, p) => a + p.amount, 0))}`, (st) => { for (const p of made) { st.payments.push(p); const x = byId(st.students, p.personId); x.remindedAt = null; x.remindCount = 0; } return made; });
  },
  payTeacher(id, v = {}) {
    const t = byId(store.state.teachers, id); if (!t) return null;
    const amount = r2(Math.abs(num(v.amount))); if (!amount) return null;
    const p = { id: uid(), kind: 'salary', date: dateOr(v.date), amount, personId: t.id, personName: t.name, category: 'Зарплаты', projectId: t.projectId || '', note: trimmed(v.note), method: str(v.method ?? store.state.settings.defaultMethod), createdAt: Date.now() };
    return store.commit(`Выплата: ${t.name} — ${money(amount)}`, (st) => { st.payments.push(p); return p; }, { action: { type: 'payment', id: p.id } });
  },
  payRecurring(id, ym, v = {}) {
    const r = byId(store.state.recurring, id); if (!r) return null;
    const amount = r2(Math.abs(num(v.amount ?? r.amount))); if (!amount) return null;
    const p = { id: uid(), kind: 'expense', date: dateOr(v.date), amount, personId: '', personName: r.name, category: r.name, projectId: r.projectId || '', note: trimmed(v.note), method: str(v.method ?? ''), recurringId: r.id, period: isYm(ym) ? ym : ymOf(today()), createdAt: Date.now() };
    if (v.auto) p.auto = true;
    return store.commit(`${r.name}: оплачено ${money(amount)}`, (st) => { st.payments.push(p); rememberCategory(st, r.name); return p; }, { action: { type: 'payment', id: p.id }, silent: !!v.silent });
  },
  skipRecurring(id, ym, on = true) {
    const r = byId(store.state.recurring, id); if (!r || !isYm(ym)) return;
    store.commit(`${r.name}: ${on ? `${ymName(ym)} пропущен` : `пропуск за ${ymName(ym)} отменён`}`, (st) => { const x = byId(st.recurring, id); if (on) x.skipped[ym] = true; else delete x.skipped[ym]; });
  },
  /** Ручная запись: расход, другой доход, оплата ученика или выплата преподавателю. */
  addPayment(v) {
    const st0 = store.state;
    const amount = r2(Math.abs(num(v.amount))); if (!amount) return null;
    if (v.kind === 'income' && v.personId) return this.payStudent(v.personId, v);
    if (v.kind === 'salary' && v.personId) return this.payTeacher(v.personId, v);
    const kind = v.kind === 'otherIncome' ? 'otherIncome' : v.kind === 'salary' ? 'salary' : v.kind === 'income' ? 'otherIncome' : 'expense';
    const category = kind === 'salary' ? 'Зарплаты' : trimmed(v.category);
    const p = { id: uid(), kind, date: dateOr(v.date), amount, personId: '', personName: trimmed(v.personName) || category || (kind === 'expense' ? 'Расход' : 'Доход'), category, projectId: str(v.projectId), note: trimmed(v.note), method: str(v.method ?? st0.settings.defaultMethod), createdAt: Date.now() };
    if (kind === 'expense' && category) {
      // расход с названием подписки закрывает её ближайшее неоплаченное списание — иначе подписка осталась бы «к оплате»
      const r = st0.recurring.find((x) => !x.archived && norm(x.name) === norm(category));
      const L = r ? recurringLedger(r, buildIndex(st0), { today: p.date > today() ? p.date : today(), remindDays: 0 }) : null;
      const c = L && (L.due[0] || (L.next && L.next.ym <= ymOf(p.date) ? L.next : null));
      if (c) Object.assign(p, { recurringId: r.id, period: c.ym, personName: r.name, category: r.name });
    }
    return store.commit(`${kind === 'expense' ? 'Расход' : kind === 'salary' ? 'Выплата' : 'Доход'}: ${p.personName} — ${money(amount)}`, (st) => { st.payments.push(p); if (kind === 'expense') rememberCategory(st, p.category); return p; }, { action: { type: 'payment', id: p.id } });
  },
  updatePayment(id, patch) {
    const p0 = byId(store.state.payments, id); if (!p0) return;
    store.commit('Запись изменена', (st) => {
      const p = byId(st.payments, id), oldCat = p.category;
      if (patch.amount != null) { const a = r2(Math.abs(num(patch.amount))); if (a > 0) p.amount = a; }
      if (isSaneDate(patch.date)) p.date = patch.date;
      for (const k of ['note', 'method', 'category', 'projectId']) if (patch[k] != null) p[k] = k === 'projectId' || k === 'method' ? str(patch[k]) : trimmed(patch[k]);
      if (patch.lessons != null && p.lessons != null) p.lessons = num(patch.lessons);
      // название записи следует за категорией, только если оно и было названием категории
      if ((p.kind === 'expense' || p.kind === 'otherIncome') && !p.recurringId && patch.category != null && p.category && (!p.personName || p.personName === oldCat)) p.personName = p.category;
      if (p.kind === 'expense' && !p.recurringId) rememberCategory(st, p.category);
    });
  },
  deletePayment(id) {
    const p = byId(store.state.payments, id); if (!p) return;
    store.commit(`Запись удалена: ${p.personName} — ${money(p.amount)}`, (st) => {
      st.payments = st.payments.filter((x) => x.id !== id);
      // удалённое автосписание не должно тут же записаться заново: месяц помечается пропущенным
      const r = p.auto && p.recurringId && p.period ? byId(st.recurring, p.recurringId) : null;
      if (r && r.auto) r.skipped[p.period] = true;
    });
  },

  // --- ученики ---
  saveStudent(d, id) {
    const name = trimmed(d.name); if (!name) return null;
    const s0 = id ? byId(store.state.students, id) : null;
    if (id && !s0) return null;
    const g0 = byId(store.state.groups, str(d.groupId));
    // индивидуальный ученик уходит от преподавателя (к другому или в группу) — уже заработанное остаётся за прежним
    const detach = !!s0 && !s0.groupId && !!s0.teacherId && (!!g0 || str(d.teacherId) !== s0.teacherId);
    return store.commit(id ? `Сохранено: ${name}` : `Ученик добавлен: ${name}`, (st) => keepAccrued(st, detach ? [s0.teacherId] : [], () => {
      const t = today(), cur = ymOf(t);
      let s = id ? byId(st.students, id) : null;
      const isNew = !s;
      const g = byId(st.groups, str(d.groupId));
      const price = Math.max(0, num(d.price));
      const payDay = clampDay(d.payDay || (g && g.payDay) || 1);
      if (isNew) {
        const startYm = isYm(d.startYm) ? d.startYm : cur;
        s = normalize({ students: [{ id: uid(), startYm, rates: [{ from: startYm, price }], createdAt: t }], payments: [] }).students[0];
        if (startYm === cur && dateFor(cur, payDay) < t) s.firstDue = t; // добавили после дня оплаты — первый платёж ждём сегодня, а не «просрочен»
        st.students.push(s);
      } else {
        if (isYm(d.startYm) && d.startYm !== s.startYm) { if (d.startYm < s.startYm) { const first = s.rates.reduce((a, b) => (a.from <= b.from ? a : b)); if (first.from > d.startYm) first.from = d.startYm; } s.startYm = d.startYm; delete s.firstDue; }
        const from = isYm(d.rateFrom) ? d.rateFrom : cur;
        if (d.priceWas == null || num(d.priceWas) !== price) s.rates = setRate(s.rates, from < s.startYm ? s.startYm : from, { price });
      }
      const movedOut = !isNew && !!s.groupId && !g, oldTeacher = s.teacherId, oldName = s.name;
      // в группе преподаватель ученика — преподаватель группы
      Object.assign(s, { name, groupId: g ? g.id : '', projectId: g ? g.projectId : str(d.projectId), teacherId: g && g.teacherId ? g.teacherId : str(d.teacherId), subject: trimmed(d.subject), phone: trimmed(d.phone), telegram: tgHandle(d.telegram), notes: trimmed(d.notes), payDay });
      s.payType = d.payType === 'package' ? 'package' : 'monthly';
      if (s.payType === 'package') {
        const used = Math.max(0, num(s.pkg && s.pkg.used)), size = Math.max(1, Math.round(num(d.pkgSize)) || 8);
        const paidLessons = st.payments.reduce((a, p) => a + (p.kind === 'income' && p.personId === s.id ? num(p.lessons) : 0), 0);
        // пустое поле «осталось занятий»: у нового ученика — 0 (ждём оплату абонемента), у прежнего — сколько было
        const left = d.lessonsLeft === '' || d.lessonsLeft == null ? (s.pkg ? num(s.pkg.bonus) + paidLessons - used : 0) : Math.round(num(d.lessonsLeft));
        s.pkg = { size, used, bonus: left - paidLessons + used };
      } else s.pkg = null;
      // оплата преподавателю за индивидуального ученика; в группе платят за группу
      const teacherChanged = !isNew && oldTeacher !== s.teacherId;
      if (s.groupId) s.pay = null;
      else if (d.pay && !Array.isArray(d.pay.rates)) s.pay = mergePay(s.pay, d.pay, payDay, movedOut || teacherChanged);
      else if (movedOut || teacherChanged) s.pay = { payDay: clampDay((s.pay && s.pay.payDay) || payDay), rates: [] };
      if (!isNew && oldName !== name) for (const p of st.payments) if (p.kind === 'income' && p.personId === s.id) p.personName = name;
      return s;
    }));
  },
  archiveStudent(id, keepDebt) {
    const s0 = byId(store.state.students, id); if (!s0 || s0.archived) return;
    store.commit(`${s0.name}: в архиве`, (st) => keepAccrued(st, [s0.groupId ? '' : s0.teacherId], () => archiveStudentIn(st, byId(st.students, id), keepDebt)));
  },
  restoreStudent(id) {
    const s0 = byId(store.state.students, id); if (!s0 || !s0.archived) return;
    store.commit(`${s0.name}: возвращён из архива`, (st) => keepAccrued(st, [s0.groupId ? '' : s0.teacherId], () => restoreStudentIn(st, byId(st.students, id))));
  },
  deleteStudent(id) {
    const s = byId(store.state.students, id); if (!s) return;
    store.commit(`Ученик удалён: ${s.name}`, (st) => keepAccrued(st, [s.groupId ? '' : s.teacherId], () => { st.students = st.students.filter((x) => x.id !== id); }));
  },
  remindStudent(id, label) {
    const s = byId(store.state.students, id); if (!s) return;
    store.commit(label || `Отмечено: напомнили — ${s.name}`, (st) => { const x = byId(st.students, id); x.remindedAt = today(); x.remindCount = (x.remindCount || 0) + 1; });
  },
  /** Сумма начисления за конкретный месяц: число — своя сумма, 0 — пауза, null — вернуть обычную цену. */
  setOverride(id, ym, amount) {
    const s = byId(store.state.students, id); if (!s || !isYm(ym)) return;
    if (amount != null && !Number.isFinite(Number(amount))) return;
    store.commit(amount == null ? `${s.name}: обычная цена за ${ymName(ym)}` : num(amount) === 0 ? `${s.name}: ${ymName(ym)} без начисления` : `${s.name}: начисление за ${ymName(ym)} изменено`, (st) => {
      const x = byId(st.students, id);
      if (amount == null) delete x.overrides[ym]; else x.overrides[ym] = Math.max(0, r2(amount));
    });
  },
  addExtra(id, v) {
    const s = byId(store.state.students, id); if (!s) return;
    const amount = r2(Math.abs(num(v.amount))); if (!amount) return;
    store.commit(`${s.name}: доп. начисление ${money(amount)}`, (st) => { byId(st.students, id).extras.push({ id: uid(), date: dateOr(v.date), amount, label: trimmed(v.label) || 'Доп. начисление' }); });
  },
  removeExtra(id, extraId) {
    const s = byId(store.state.students, id); if (!s) return;
    store.commit(`${s.name}: доп. начисление удалено`, (st) => { const x = byId(st.students, id); x.extras = x.extras.filter((e) => e.id !== extraId); });
  },
  lessonUsed(id, delta) {
    const s = byId(store.state.students, id); if (!s || !s.pkg) return;
    const n = Math.max(0, num(s.pkg.used) + delta); if (n === num(s.pkg.used)) return;
    store.commit(`${s.name}: ${delta > 0 ? 'занятие проведено' : 'занятие возвращено'}`, (st) => { byId(st.students, id).pkg.used = n; });
  },

  // --- группы ---
  saveGroup(d, id) {
    const name = trimmed(d.name); if (!name) return null;
    const g0 = id ? byId(store.state.groups, id) : null;
    if (id && !g0) return null;
    // группу передают другому преподавателю — уже заработанное остаётся за прежним
    const handover = !!g0 && str(d.teacherId) !== g0.teacherId;
    return store.commit(id ? `Сохранено: ${name}` : `Группа добавлена: ${name}`, (st) => keepAccrued(st, handover ? [g0.teacherId] : [], () => {
      let g = id ? byId(st.groups, id) : null;
      const isNew = !g;
      if (isNew) { g = normalize({ groups: [{ id: uid(), color: st.groups.length % 8 }], students: [], payments: [] }).groups[0]; st.groups.push(g); }
      const oldPrice = g.price, oldTeacher = g.teacherId, oldName = g.name;
      const payDay = clampDay(d.payDay || g.payDay);
      Object.assign(g, { name, projectId: str(d.projectId), teacherId: str(d.teacherId), subject: trimmed(d.subject), schedule: trimmed(d.schedule), payType: d.payType === 'package' ? 'package' : 'monthly', price: Math.max(0, num(d.price)), payDay, lessonsInPackage: Math.max(1, Math.round(num(d.lessonsInPackage)) || 8), notes: trimmed(d.notes) });
      if (Number.isInteger(d.color)) g.color = ((d.color % 8) + 8) % 8;
      if (d.pay && !Array.isArray(d.pay.rates)) g.pay = mergePay(g.pay, d.pay, payDay, !isNew && oldTeacher !== g.teacherId);
      else if (!isNew && oldTeacher !== g.teacherId) g.pay = { payDay: g.pay.payDay, rates: [] };
      if (!isNew) {
        const from = isYm(d.applyFrom) ? d.applyFrom : null;
        for (const s of st.students) {
          if (s.groupId !== g.id) continue;
          s.projectId = g.projectId;
          if (oldTeacher !== g.teacherId) s.teacherId = g.teacherId;
          if (from && !s.archived && s.payType !== 'package' && num((rateAt(s.rates, from) || {}).price) === oldPrice && oldPrice !== g.price) s.rates = setRate(s.rates, from < s.startYm ? s.startYm : from, { price: g.price });
        }
        if (oldName !== g.name) for (const p of st.payments) if (p.kind === 'income' && p.groupId === g.id && p.category === oldName) p.category = g.name;
      }
      return g;
    }));
  },
  /** В архив и обратно. withStudents — вместе с группой уходят в архив её ученики (и вместе с ней возвращаются). */
  archiveGroup(id, on = true, withStudents = false) {
    const g = byId(store.state.groups, id); if (!g || !!g.archived === !!on) return;
    const mark = 'group:' + id;
    store.commit(`${g.name}: ${on ? 'в архиве' : 'возвращена'}`, (st) => keepAccrued(st, [g.teacherId], () => {
      const x = byId(st.groups, id), t = today(), cur = ymOf(t);
      x.archived = !!on;
      if (on) {
        x.endYm = dateFor(cur, x.pay.payDay) <= t ? cur : ymAdd(cur, -1);
        if (withStudents) for (const s of st.students) if (s.groupId === id && !s.archived) archiveStudentIn(st, s, false, mark);
      } else {
        x.pay = rebasePay(x.pay, defaultStartYm(x.pay.payDay, t)); // месяцы в архиве преподавателю не начисляются
        x.endYm = null;
        for (const s of st.students) if (s.groupId === id && s.archived && s.archivedBy === mark) restoreStudentIn(st, s);
      }
    }));
  },
  deleteGroup(id) {
    const g = byId(store.state.groups, id); if (!g) return;
    store.commit(`Группа удалена: ${g.name}`, (st) => keepAccrued(st, [g.teacherId], () => {
      st.groups = st.groups.filter((x) => x.id !== id);
      for (const s of st.students) if (s.groupId === id) { s.groupId = ''; s.pay = null; if (s.archivedBy === 'group:' + id) delete s.archivedBy; }
    }));
  },

  // --- преподаватели ---
  saveTeacher(d, id) {
    const name = trimmed(d.name); if (!name) return null;
    const t0 = id ? byId(store.state.teachers, id) : null;
    if (id && !t0) return null;
    const payType = ['salary', 'perLesson', 'perGroup'].includes(d.payType) ? d.payType : 'salary';
    // смена схемы оплаты — заработанное по прежней схеме остаётся
    const typeChanged = !!t0 && t0.payType !== payType;
    return store.commit(id ? `Сохранено: ${name}` : `Преподаватель добавлен: ${name}`, (st) => keepAccrued(st, typeChanged ? [id] : [], () => {
      let t = id ? byId(st.teachers, id) : null;
      const isNew = !t;
      const payDay = clampDay(d.payDay || 5);
      const amount = Math.max(0, num(d.rate));
      const now = today(), cur = ymOf(now);
      const startFor = (from) => (payType === 'perLesson' ? cur : isYm(from) ? from : defaultStartYm(payDay, now));
      if (isNew) { const startYm = startFor(d.rateFrom); t = normalize({ teachers: [{ id: uid(), startYm, rates: [{ from: startYm, amount }] }], students: [], payments: [] }).teachers[0]; st.teachers.push(t); }
      else if (typeChanged) {
        t.startYm = startFor(null); t.rates = [{ from: t.startYm, amount }]; t.lessons = {}; // новая схема — с ближайшего срока
        if (payType === 'perGroup') restartSources(st, t.id, now);
      }
      else if (d.rateWas == null || num(d.rateWas) !== amount) { const from = isYm(d.rateFrom) ? d.rateFrom : cur; t.rates = setRate(t.rates, from, { amount }); if (from < t.startYm) t.startYm = from; }
      Object.assign(t, { name, projectId: str(d.projectId), subject: trimmed(d.subject), phone: trimmed(d.phone), telegram: tgHandle(d.telegram), notes: trimmed(d.notes), payType, payDay });
      for (const p of st.payments) if (p.personId === t.id && p.kind === 'salary') p.personName = t.name;
      return t;
    }));
  },
  archiveTeacher(id, on = true) {
    const t = byId(store.state.teachers, id); if (!t || !!t.archived === !!on) return;
    store.commit(`${t.name}: ${on ? 'в архиве' : 'возвращён'}`, (st) => keepAccrued(st, on ? [] : [id], () => {
      const x = byId(st.teachers, id), now = today();
      x.archived = !!on;
      if (on) { x.archivedAt = now; return; } // начисления со сроком после этой даты не идут
      delete x.archivedAt;
      // время в архиве не начисляется: схема продолжается с ближайшего срока
      if (x.payType === 'salary') { const from = defaultStartYm(x.payDay, now); if (x.startYm < from) { const r = rateAt(x.rates, from); x.rates = [{ from, amount: r ? r.amount : 0 }, ...x.rates.filter((q) => q.from > from)]; x.startYm = from; } }
      else if (x.payType === 'perGroup') restartSources(st, id, now);
    }));
  },
  deleteTeacher(id) {
    const t = byId(store.state.teachers, id); if (!t) return;
    store.commit(`Преподаватель удалён: ${t.name}`, (st) => { st.teachers = st.teachers.filter((x) => x.id !== id); for (const g of st.groups) if (g.teacherId === id) g.teacherId = ''; for (const s of st.students) if (s.teacherId === id) s.teacherId = ''; });
  },
  teacherLesson(id, delta, ym = ymOf(today())) {
    const t = byId(store.state.teachers, id); if (!t) return;
    const n = Math.max(0, num(t.lessons[ym]) + delta); if (n === num(t.lessons[ym])) return;
    store.commit(`${t.name}: ${delta > 0 ? '+1 занятие' : '−1 занятие'}`, (st) => { const x = byId(st.teachers, id); if (n) x.lessons[ym] = n; else delete x.lessons[ym]; });
  },
  /** Убрать сохранённое («замороженное») начисление, если оно не нужно. */
  removeFrozen(id, frozenId) {
    const t = byId(store.state.teachers, id); const f = t && t.frozen.find((x) => x.id === frozenId); if (!f) return;
    store.commit(`${t.name}: начисление убрано — ${f.label}, ${money(f.amount)}`, (st) => { const x = byId(st.teachers, id); x.frozen = x.frozen.filter((q) => q.id !== frozenId); });
  },

  // --- подписки ---
  saveRecurring(d, id) {
    const name = trimmed(d.name); if (!name) return null;
    const r = store.commit(id ? `Сохранено: ${name}` : `Подписка добавлена: ${name}`, (st) => {
      let r = id ? byId(st.recurring, id) : null;
      const payDay = clampDay(d.payDay || 1);
      if (!r) { r = normalize({ recurring: [{ id: uid(), startYm: isYm(d.startYm) ? d.startYm : defaultStartYm(payDay) }], students: [], payments: [] }).recurring[0]; st.recurring.push(r); }
      else if (isYm(d.startYm)) r.startYm = d.startYm;
      const oldName = r.name, wasAuto = r.auto;
      Object.assign(r, { name, projectId: str(d.projectId), amount: Math.max(0, num(d.amount)), payDay, auto: !!d.auto, notes: trimmed(d.notes) });
      // автосписание действует с месяца, когда его включили: старые неоплаченные месяцы сами не записываются
      r.autoFrom = r.auto ? (wasAuto && r.autoFrom) || today() : null;
      if (oldName && oldName !== name) for (const p of st.payments) if (p.recurringId === r.id) { p.personName = name; if (p.category === oldName) p.category = name; }
      rememberCategory(st, name);
      return r;
    });
    if (r && r.auto) this.runAuto();
    return r;
  },
  archiveRecurring(id, on = true) {
    const r = byId(store.state.recurring, id); if (!r) return;
    store.commit(`${r.name}: ${on ? 'отключена' : 'включена'}`, (st) => { const x = byId(st.recurring, id); x.archived = on; if (!on && x.startYm < ymOf(today())) x.startYm = defaultStartYm(x.payDay); });
  },
  deleteRecurring(id) {
    const r = byId(store.state.recurring, id); if (!r) return;
    store.commit(`Подписка удалена: ${r.name}`, (st) => { st.recurring = st.recurring.filter((x) => x.id !== id); });
  },
  /** Автосписание: подписки с галочкой «списывается автоматически» записываются в расходы сами. */
  runAuto() {
    const st = store.state, idx = buildIndex(st), made = [];
    for (const r of st.recurring) {
      if (r.archived || !r.auto || !(r.amount > 0)) continue;
      for (const c of recurringLedger(r, idx, { remindDays: 0 }).items) if ((c.status === 'overdue' || c.status === 'today') && !c.pay && (!r.autoFrom || c.ym >= ymOf(r.autoFrom))) made.push({ r, c });
    }
    if (!made.length) return [];
    store.commit(`Автосписание: ${made.length === 1 ? `${made[0].r.name} — ${money(made[0].r.amount)}` : `${made.length} ${made.length < 5 ? 'записи' : 'записей'} на ${money(made.reduce((a, x) => a + x.r.amount, 0))}`}`, (s) => {
      for (const { r, c } of made) s.payments.push({ id: uid(), kind: 'expense', date: c.due, amount: r.amount, personId: '', personName: r.name, category: r.name, projectId: r.projectId || '', note: 'автосписание', method: '', recurringId: r.id, period: c.ym, auto: true, createdAt: Date.now() });
    });
    return made;
  },

  // --- проекты, настройки, категории ---
  saveProject(d, id) {
    const name = trimmed(d.name); if (!name) return null;
    return store.commit(id ? `Сохранено: ${name}` : `Проект добавлен: ${name}`, (st) => { let p = id ? byId(st.projects, id) : null; if (!p) { p = { id: uid(), name: '', notes: '' }; st.projects.push(p); } p.name = name; p.notes = trimmed(d.notes); return p; });
  },
  deleteProject(id) {
    const p = byId(store.state.projects, id); if (!p) return;
    store.commit(`Проект удалён: ${p.name}`, (st) => { st.projects = st.projects.filter((x) => x.id !== id); for (const k of ['groups', 'students', 'teachers', 'recurring', 'payments']) for (const x of st[k]) if (x.projectId === id) x.projectId = ''; for (const x of st.settings.sheets) if (x.projectId === id) x.projectId = ''; });
  },
  setSettings(patch, label) { store.commit(label || 'Настройки сохранены', (st) => { Object.assign(st.settings, patch); st.settings = normalize({ settings: st.settings, students: [], payments: [] }).settings; }, { silent: !label }); },
  renameCategory(from, to) {
    const a = trimmed(from), b = trimmed(to); if (!a || !b || a === b) return;
    store.commit(`Категория: «${a}» → «${b}»`, (st) => {
      for (const p of st.payments) if (p.kind === 'expense' && p.category === a) { p.category = b; if (p.personName === a) p.personName = b; }
      for (const r of st.recurring) if (r.name === a) r.name = b;
      st.settings.categories = [...new Set(st.settings.categories.map((c) => (c === a ? b : c)))];
      rememberCategory(st, b);
    });
  },
  removeCategory(name) { store.commit(`Категория убрана из списка: ${name}`, (st) => { st.settings.categories = st.settings.categories.filter((c) => c !== name); }); },
  wipe() { store.replace(emptyState(), 'Все данные удалены', 'Перед удалением всех данных'); },
};

/** Все категории расходов: из настроек, подписок и уже записанных расходов. */
export function allCategories(st = store.state) {
  const set = new Set(st.settings.categories);
  for (const p of st.payments) if (p.kind === 'expense' && p.category) set.add(p.category);
  for (const r of st.recurring) if (r.name) set.add(r.name);
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}
