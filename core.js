/* core.js — чистая логика без DOM и хранилища: даты, деньги, начисления, долги, зарплаты, сводки.
   Всё считается из исходных данных (ученики, оплаты), поэтому удаление или правка записи
   автоматически пересчитывает долги и статусы. */

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
export const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// ---------- Даты ----------
export const pad = (n) => String(n).padStart(2, '0');
export const fmtISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
let todayOverride = null;
/** Для тестов и демо: зафиксировать «сегодня». */
export const setToday = (iso) => { todayOverride = iso || null; };
export const today = () => todayOverride || fmtISO(new Date());
export const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return fmtISO(d); };
export const diffDays = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 86400000);
export const ymOf = (iso) => String(iso).slice(0, 7);
export const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; };
export const ymDiff = (a, b) => { const [ay, am] = a.split('-').map(Number); const [by, bm] = b.split('-').map(Number); return (ay - by) * 12 + (am - bm); };
export const ymRange = (from, to) => { const out = []; if (!from || !to) return out; for (let ym = from, i = 0; ym <= to && i < 600; ym = ymAdd(ym, 1), i++) out.push(ym); return out; };
export const ymMax = (...a) => a.filter(Boolean).reduce((m, x) => (x > m ? x : m));
export const daysInYm = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const clampDay = (d) => Math.min(31, Math.max(1, Math.round(Number(d)) || 1));
/** Дата оплаты в месяце: день обрезается по длине месяца (31-е в феврале → 28/29). */
export const dateFor = (ym, day) => `${ym}-${pad(Math.min(clampDay(day), daysInYm(ym)))}`;
/** Ближайшая дата с этим днём месяца: сегодня или позже. */
export function nextDateForDay(day, t = today()) { const a = dateFor(ymOf(t), day); return a >= t ? a : dateFor(ymAdd(ymOf(t), 1), day); }
export const isYm = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const isISO = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s);
/** Дата, с которой можно работать: правильный вид и разумный год (опечатка «0026» не пройдёт). */
export const isSaneDate = (s) => isISO(s) && s >= '2000-01-01' && s <= '2100-12-31';

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
export const ymShort = (ym, withYear) => { const [y, m] = ym.split('-').map(Number); return MONTHS_SHORT[m - 1] + (withYear || y !== Number(today().slice(0, 4)) ? ' ' + String(y).slice(2) : ''); };
export const ymLong = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
export const ymName = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1].toLowerCase();
export const ymPrep = (ym) => MONTHS_PREP[Number(ym.slice(5, 7)) - 1];
export const ymGen = (ym) => MONTHS_GEN[Number(ym.slice(5, 7)) - 1];
export function fmtDate(iso, withYear) {
  if (!iso) return '—';
  const d = parseISO(iso);
  const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return withYear || d.getFullYear() !== Number(today().slice(0, 4)) ? `${base} ${d.getFullYear()}` : base;
}
export function fmtDateLong(iso) { const d = parseISO(iso); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`; }
export function relDays(iso, t = today()) {
  const n = diffDays(iso, t);
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n === -1) return 'вчера';
  if (n < 0) return `${-n} ${plural(-n, 'день', 'дня', 'дней')} назад`;
  return `через ${n} ${plural(n, 'день', 'дня', 'дней')}`;
}
/** «сен, окт» или «сен 25 — фев» для длинных списков. */
export function ymList(yms) {
  const u = [...new Set(yms)].sort();
  if (!u.length) return '';
  if (u.length <= 3) return u.map((x) => ymShort(x)).join(', ');
  return `${ymShort(u[0])} — ${ymShort(u[u.length - 1])}`;
}

// ---------- Деньги и текст ----------
export const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PREFIX_CUR = ['$', '€', '£', '₺', '¥'];
/** Сумма с валютой: целые — без копеек, дробные — всегда с двумя знаками. */
export function fmtMoney(n, cur = '$', pos = 'auto') {
  n = r2(n);
  const abs = (Number.isInteger(n) ? nf : nf2).format(Math.abs(n));
  const before = pos === 'before' || (pos !== 'after' && PREFIX_CUR.includes(cur));
  const s = before ? `${cur}${abs}` : `${abs} ${cur}`;
  return n < 0 ? `−${s}` : s;
}
export function shortNum(v) {
  const f = (x) => String(Math.round(x * 10) / 10).replace('.', ',');
  const a = Math.abs(v);
  if (a >= 1e6) return `${f(v / 1e6)}М`;
  if (a >= 1e4) return `${f(v / 1e3)}К`;
  if (a >= 1e3) return `${f(v / 1e3)}К`;
  return String(Math.round(v));
}
/** Для сравнения имён и поиска: без регистра и диакритики (ё = е, İ/ı = i, ş = s), лишние пробелы убраны. */
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').toLowerCase().trim().replace(/\s+/g, ' ');
export const initials = (name) => { const p = String(name || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase(); };
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
/** Сумма из текста: «1 205,50», «$1,205.50», «1.500» (тысячи), «150 ₺», «-12,5», «(100)». Берётся первое число в строке. */
export function parseAmount(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u00a0\u202f\u2009]/g, ' ').trim();
  const m = s.match(/\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?(?!\d)|\d[\d.,]*/);
  if (!m) return null;
  const neg = /[-−–][^\d]*$/.test(s.slice(0, m.index)) || /^\(.*\)$/.test(s);
  let t = m[0].replace(/ /g, '').replace(/[.,]+$/, '');
  const dots = t.split('.').length - 1, commas = t.split(',').length - 1;
  const grouped = (sep) => new RegExp(`^[1-9]\\d{0,2}(\\${sep}\\d{3})+$`).test(t);
  if (dots && commas) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (commas) t = grouped(',') ? t.replace(/,/g, '') : commas === 1 ? t.replace(',', '.') : '';
  else if (dots) t = grouped('.') ? t.replace(/\./g, '') : dots === 1 ? t : '';
  const n = t ? Number(t) : NaN;
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}
/** Подстановка в шаблон сообщения: {имя}, {сумма}, … Неизвестные метки остаются как есть. */
export const fillTemplate = (tpl, vars) => String(tpl || '').replace(/\{([^{}]+)\}/g, (m, k) => (vars[k.trim().toLowerCase()] != null ? String(vars[k.trim().toLowerCase()]) : m));

// ---------- Ставки с датой начала действия ----------
/** Действующая запись на месяц ym: последняя с from ≤ ym; если таких нет — самая ранняя. */
export function rateAt(rates, ym) {
  let best = null, first = null;
  for (const r of rates || []) {
    if (!first || r.from < first.from) first = r;
    if (r.from <= ym && (!best || r.from >= best.from)) best = r;
  }
  return best || first;
}
/** Поставить новое значение с месяца from: записи с этого месяца и позже заменяются. */
export function setRate(rates, from, patch) {
  const keep = (rates || []).filter((r) => r.from < from);
  const prev = rateAt(rates, from) || {};
  const next = { ...prev, ...patch, from };
  const last = keep.length ? keep.reduce((a, b) => (a.from >= b.from ? a : b)) : null;
  const same = last && Object.keys(next).every((k) => k === 'from' || next[k] === last[k]) && Object.keys(last).every((k) => k === 'from' || next[k] === last[k]);
  return same ? keep : [...keep, next].sort((a, b) => (a.from < b.from ? -1 : 1));
}

// ---------- Статусы ----------
export const STATUS_ORDER = { overdue: 0, today: 1, soon: 2, later: 3, ok: 3, paid: 4, skip: 5 };
export const STATUS_LABEL = { overdue: 'Просрочено', today: 'Сегодня', soon: 'Скоро', later: 'По графику', ok: 'В порядке', paid: 'Оплачено', skip: 'Пауза' };
export function dueStatus(due, t, remindDays) {
  const n = diffDays(due, t);
  return n < 0 ? 'overdue' : n === 0 ? 'today' : n <= remindDays ? 'soon' : 'later';
}
const worst = (list) => list.reduce((w, c) => (STATUS_ORDER[c.status] < STATUS_ORDER[w] ? c.status : w), 'ok');

// ---------- Ученик: начисления и расчёт долга ----------
/** Все начисления ученика по месяц toYm включительно: помесячные + разовые. */
export function studentCharges(s, toYm) {
  const out = [];
  if (s.payType !== 'package' && isYm(s.startYm)) {
    const end = s.endYm && s.endYm < toYm ? s.endYm : toYm;
    for (const ym of ymRange(s.startYm, end)) {
      const ov = s.overrides ? s.overrides[ym] : undefined;
      const base = Number((rateAt(s.rates, ym) || {}).price) || 0;
      const due = s.firstDue && ymOf(s.firstDue) === ym ? s.firstDue : dateFor(ym, s.payDay);
      out.push({ key: 'm:' + ym, kind: 'month', ym, due, amount: ov != null ? Math.max(0, Number(ov) || 0) : base, base, custom: ov != null });
    }
  }
  for (const x of s.extras || []) {
    if (!isISO(x.date) || ymOf(x.date) > toYm) continue;
    out.push({ key: 'x:' + x.id, kind: 'extra', id: x.id, ym: ymOf(x.date), due: x.date, amount: Math.max(0, Number(x.amount) || 0), label: x.label || 'Доп. начисление' });
  }
  out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.kind === b.kind ? 0 : a.kind === 'month' ? -1 : 1));
  return out;
}

/** Расчёт по ученику: оплаты гасят начисления от старых к новым (долги, частичные оплаты и предоплаты считаются сами). */
export function studentLedger(s, pays, opt = {}) {
  const t = opt.today || today();
  const remind = opt.remindDays ?? 3;
  const paid = r2((pays || []).reduce((a, p) => a + (Number(p.amount) || 0), 0));
  if (s.payType === 'package') {
    const size = Math.max(1, Number(s.pkg && s.pkg.size) || 1);
    const left = (Number(s.pkg && s.pkg.bonus) || 0) + (pays || []).reduce((a, p) => a + (Number(p.lessons) || 0), 0) - (Number(s.pkg && s.pkg.used) || 0);
    const price = Number((rateAt(s.rates, ymOf(t)) || {}).price) || 0;
    const status = s.archived ? 'ok' : left <= 0 ? 'overdue' : left <= 1 ? 'soon' : 'ok';
    return { package: true, lessonsLeft: left, size, price, charges: [], paid, credit: 0, status, debt: status === 'overdue' ? price : 0, dueNow: status !== 'ok' ? price : 0, due: [], next: null, paidThrough: null };
  }
  let toYm = ymMax(ymOf(t), ymOf(addDays(t, remind)), opt.toYm);
  if (isYm(s.startYm) && s.startYm > toYm && !s.archived) toYm = s.startYm; // начнёт платить позже — показываем первый срок
  // разовые начисления с более поздним сроком тоже должны быть видны (не дальше двух лет)
  for (const x of s.extras || []) if (isISO(x.date) && ymOf(x.date) > toYm && ymDiff(ymOf(x.date), toYm) <= 24) toYm = ymOf(x.date);
  let charges = studentCharges(s, toYm);
  let total = charges.reduce((a, c) => a + c.amount, 0);
  // Продлеваем горизонт, пока всё начисленное оплачено: так видна и предоплата, и дата следующей оплаты
  for (let i = 0, flat = 0; i < 36 && paid >= total - 0.004 && !(s.endYm && toYm >= s.endYm) && isYm(s.startYm); i++) {
    toYm = ymAdd(toYm, 1);
    charges = studentCharges(s, toYm);
    const next = charges.reduce((a, c) => a + c.amount, 0);
    if (next <= total) { if (++flat > 3) break; } else flat = 0; // цена 0 или долгая пауза — предоплату не на что разнести
    total = next;
  }
  let pool = paid;
  for (const c of charges) {
    c.paid = r2(Math.min(c.amount, pool));
    pool = r2(pool - c.paid);
    c.rest = r2(c.amount - c.paid);
    c.status = c.amount <= 0 ? 'skip' : c.rest <= 0 ? 'paid' : dueStatus(c.due, t, remind);
  }
  const open = charges.filter((c) => c.rest > 0);
  const due = open.filter((c) => c.status !== 'later');
  let paidThrough = null;
  for (const c of charges) { if (c.kind !== 'month') continue; if (c.status === 'paid' || c.status === 'skip') { if (c.status === 'paid') paidThrough = c.ym; } else break; }
  return {
    charges, paid, credit: pool,
    status: worst(due),
    debt: r2(due.filter((c) => c.status === 'overdue').reduce((a, c) => a + c.rest, 0)),
    dueNow: r2(due.reduce((a, c) => a + c.rest, 0)),
    due, next: open[0] || null, paidThrough, toYm,
  };
}

/** Месяц, с которого логично менять цену: первый, начиная с текущего, по которому ещё ничего не оплачено. */
export function firstUnpaidYm(L, cur) {
  let last = null;
  for (const c of (L && L.charges) || []) { if (c.kind !== 'month' || c.ym < cur) continue; if (!(c.paid > 0)) return c.ym; last = c.ym; }
  return last ? ymAdd(last, 1) : cur;
}

/** Перенос из старой версии: превращает «дату следующей оплаты» и историю оплат в помесячные начисления
    так, чтобы на начало месяца nextDue долг был нулевым. Возвращает { startYm, endYm, overrides }. */
export function ledgerFromHistory(price, pays, nextDue, archived) {
  const nYm = ymOf(nextDue), lastYm = ymAdd(nYm, -1);
  // оплата в месяце срока, но раньше самого срока — это опоздавшая оплата за прошлый период
  const hist = (pays || []).filter((p) => p.date < nextDue).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!hist.length) return { startYm: nYm, endYm: archived ? lastYm : null, overrides: {} };
  const mOf = (p) => (ymOf(p.date) > lastYm ? lastYm : ymOf(p.date));
  const firstYm = mOf(hist[0]);
  const months = ymRange(firstYm, lastYm);
  const bucket = {};
  for (const p of hist) bucket[mOf(p)] = r2((bucket[mOf(p)] || 0) + (Number(p.amount) || 0));
  const overrides = {};
  let i = 0;
  while (i < months.length) {
    let j = i + 1;
    while (j < months.length && !bucket[months[j]]) j++;
    let pool = bucket[months[i]] || 0; // оплата первого месяца покрывает отрезок до следующей оплаты
    for (let k = i; k < j; k++) {
      const c = k === j - 1 ? pool : price > 0 ? Math.min(price, pool) : r2(pool / (j - k));
      pool = r2(pool - c);
      if (r2(c) !== r2(price)) overrides[months[k]] = r2(c);
    }
    i = j;
  }
  return { startYm: firstYm, endYm: archived ? lastYm : null, overrides };
}

// ---------- Индекс оплат ----------
export function buildIndex(state) {
  const byStudent = new Map(), byTeacher = new Map(), recPaid = new Map(), byGroup = new Map(), bySolo = new Map();
  const students = new Map(state.students.map((s) => [s.id, s]));
  const push = (m, k, v) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };
  for (const p of state.payments) {
    if (p.kind === 'income' && p.personId) {
      push(byStudent, p.personId, p);
      const st = students.get(p.personId);
      const gid = p.groupId != null ? p.groupId : (st && st.groupId) || '';
      if (gid) push(byGroup, gid, p); else push(bySolo, p.personId, p);
    } else if (p.kind === 'salary' && p.personId && !p.legacy) push(byTeacher, p.personId, p);
    if (p.recurringId && p.period) recPaid.set(p.recurringId + '|' + p.period, p);
  }
  // оплаты с датой в промежутке (after; to]
  const sumBetween = (list, after, to) => r2((list || []).reduce((a, p) => a + (p.date > after && p.date <= to ? Number(p.amount) || 0 : 0), 0));
  return {
    students,
    studentPays: (id) => byStudent.get(id) || [],
    teacherPays: (id) => byTeacher.get(id) || [],
    recurringPaid: (id, ym) => recPaid.get(id + '|' + ym) || null,
    groupIncome: (gid, after, to) => sumBetween(byGroup.get(gid), after, to),
    soloIncome: (sid, after, to) => sumBetween(bySolo.get(sid), after, to),
  };
}

// ---------- Преподаватель: начисления и выплаты ----------
function payLines(lines, prefix, name, pay, endYm, baseFn, toYm, src, refId) {
  const rates = (pay && pay.rates) || [];
  if (!rates.length) return;
  const from = rates.reduce((m, r) => (r.from < m ? r.from : m), rates[0].from);
  const to = endYm && endYm < toYm ? endYm : toYm;
  for (const ym of ymRange(from, to)) {
    const r = rateAt(rates, ym);
    if (!r || r.from > ym) continue;
    const pct = r.mode === 'percent';
    const due = dateFor(ym, pay.payDay);
    // процент — от оплат, полученных после прошлого дня выплаты и по этот день включительно: к сроку сумма уже не меняется
    const prev = dateFor(ymAdd(ym, -1), pay.payDay), after = pct && isISO(r.after) && r.after > prev ? r.after : prev;
    const base = pct ? baseFn(after, due) : 0;
    const amount = pct ? r2(base * (Number(r.amount) || 0) / 100) : Number(r.amount) || 0;
    if (amount > 0) lines.push({ key: `${prefix}:${ym}`, ym, due, amount, src, refId, label: name, pct: pct ? Number(r.amount) || 0 : null, base, win: pct ? [addDays(after, 1), due] : null });
  }
}
export function teacherLines(t, state, idx, toYm) {
  const lines = [];
  if (t.payType === 'salary') {
    for (const ym of ymRange(t.startYm, toYm)) {
      const a = Number((rateAt(t.rates, ym) || {}).amount) || 0;
      if (a > 0) lines.push({ key: 'sal:' + ym, ym, due: dateFor(ym, t.payDay), amount: a, src: 'salary', label: 'Оклад' });
    }
  } else if (t.payType === 'perLesson') {
    for (const ym of Object.keys(t.lessons || {}).sort()) {
      const n = Number(t.lessons[ym]) || 0, rate = Number((rateAt(t.rates, ym) || {}).amount) || 0;
      if (ym <= toYm && n > 0 && rate > 0) lines.push({ key: 'les:' + ym, ym, due: dateFor(ymAdd(ym, 1), t.payDay), amount: r2(n * rate), src: 'lessons', n, rate, label: `${n} ${plural(n, 'занятие', 'занятия', 'занятий')}` });
    }
  } else if (t.payType === 'perGroup') {
    for (const g of state.groups) if (g.teacherId === t.id) payLines(lines, 'g:' + g.id, g.name, g.pay, g.endYm, (after, to) => idx.groupIncome(g.id, after, to), toYm, 'group', g.id);
    for (const s of state.students) if (!s.groupId && s.teacherId === t.id) payLines(lines, 's:' + s.id, s.name, s.pay, s.endYm, (after, to) => idx.soloIncome(s.id, after, to), toYm, 'student', s.id);
  }
  // преподаватель в архиве: начисления со сроком после даты архива не идут (проведённые занятия остаются)
  const stop = t.archived && isISO(t.archivedAt) ? t.archivedAt : null;
  const out = stop ? lines.filter((c) => c.due <= stop || c.src === 'lessons') : lines;
  // «замороженные» начисления: уже заработанное по группам, ученикам и схемам, которые с тех пор изменились или удалены
  for (const f of t.frozen || []) if (isYm(f.ym) && isISO(f.due) && Number(f.amount) > 0) out.push({ key: 'f:' + f.id, ym: f.ym, due: f.due, amount: Number(f.amount), src: 'frozen', frozenId: f.id, label: f.label || 'Начисление' });
  out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.label !== b.label ? String(a.label).localeCompare(String(b.label), 'ru') : a.key < b.key ? -1 : 1));
  return out;
}
export function teacherLedger(t, state, idx, opt = {}) {
  const tday = opt.today || today();
  const remind = opt.remindDays ?? 3;
  const toYm = ymMax(ymOf(tday), ymOf(addDays(tday, remind)), opt.toYm);
  const lines = teacherLines(t, state, idx, toYm);
  const paid = r2(idx.teacherPays(t.id).reduce((a, p) => a + (Number(p.amount) || 0), 0));
  let pool = paid;
  for (const c of lines) {
    c.paid = r2(Math.min(c.amount, pool));
    pool = r2(pool - c.paid);
    c.rest = r2(c.amount - c.paid);
    c.status = c.rest <= 0 ? 'paid' : dueStatus(c.due, tday, remind);
  }
  const open = lines.filter((c) => c.rest > 0);
  const due = open.filter((c) => c.status !== 'later');
  let next = open[0] || null;
  if (!next && !t.archived) {
    // всё выплачено — заглядываем на два месяца вперёд, чтобы показать ближайшую выплату (в lines она не попадает)
    const have = new Set(lines.map((c) => c.key));
    let ahead = pool;
    for (const c of teacherLines(t, state, idx, ymAdd(toYm, 2))) {
      if (have.has(c.key)) continue;
      const p = r2(Math.min(c.amount, ahead)); ahead = r2(ahead - p);
      if (c.amount - p > 0) { next = { ...c, paid: p, rest: r2(c.amount - p), status: 'later' }; break; }
    }
  }
  return {
    lines, paid, credit: pool, status: t.archived ? 'ok' : worst(due),
    debt: r2(due.filter((c) => c.status === 'overdue').reduce((a, c) => a + c.rest, 0)),
    dueNow: r2(due.reduce((a, c) => a + c.rest, 0)),
    due, next,
    accrued: r2(lines.reduce((a, c) => a + c.amount, 0)),
  };
}
/** Сколько строк «за группу / ученика» у преподавателя ещё без суммы. */
export function teacherUnset(t, state) {
  if (t.payType !== 'perGroup') return [];
  const empty = (pay) => !pay || !(pay.rates || []).some((r) => Number(r.amount) > 0);
  return [
    ...state.groups.filter((g) => g.teacherId === t.id && !g.archived && empty(g.pay)).map((g) => ({ kind: 'group', id: g.id, name: g.name })),
    ...state.students.filter((s) => !s.groupId && s.teacherId === t.id && !s.archived && empty(s.pay)).map((s) => ({ kind: 'student', id: s.id, name: s.name })),
  ];
}

// ---------- Регулярные расходы (подписки) ----------
export function recurringLedger(r, idx, opt = {}) {
  const t = opt.today || today();
  const remind = opt.remindDays ?? 3;
  let toYm = ymMax(ymOf(t), ymOf(addDays(t, remind)), opt.toYm);
  if (r.endYm && r.endYm < toYm) toYm = r.endYm;
  const items = [];
  for (const ym of ymRange(r.startYm, toYm)) {
    const due = dateFor(ym, r.payDay);
    const pay = idx.recurringPaid(r.id, ym);
    const skipped = !!(r.skipped && r.skipped[ym]);
    items.push({ key: `r:${r.id}:${ym}`, ym, due, amount: Number(r.amount) || 0, pay, status: pay ? 'paid' : skipped || !(Number(r.amount) > 0) ? 'skip' : dueStatus(due, t, remind) });
  }
  const open = items.filter((c) => c.status !== 'paid' && c.status !== 'skip');
  const due = open.filter((c) => c.status !== 'later');
  let next = open[0] || null;
  if (!next && !r.archived && isYm(r.startYm)) {
    // ближайшее будущее списание: первый неоплаченный и не пропущенный месяц (в items он не попадает)
    let ym = ymMax(ymAdd(toYm, 1), r.startYm);
    for (let i = 0; i < 24 && !(r.endYm && ym > r.endYm); i++, ym = ymAdd(ym, 1)) {
      if (idx.recurringPaid(r.id, ym) || (r.skipped && r.skipped[ym])) continue;
      next = { key: `r:${r.id}:${ym}`, ym, due: dateFor(ym, r.payDay), amount: Number(r.amount) || 0, pay: null, status: 'later' };
      break;
    }
  }
  return { items, due, status: r.archived ? 'ok' : worst(due), dueNow: r2(due.reduce((a, c) => a + c.amount, 0)), next };
}

// ---------- Сводки ----------
export const isIn = (p) => p.kind === 'income' || p.kind === 'otherIncome';
export const KIND_LABEL = { income: 'Оплата ученика', salary: 'Зарплата', expense: 'Расход', otherIncome: 'Другой доход' };
export const expenseCat = (p) => (p.kind === 'salary' ? 'Зарплаты' : p.category || 'Без категории');

/** Всё, что экрану нужно знать о текущем состоянии. project: 'all' или id проекта. */
export function derive(state, opt = {}) {
  const t = opt.today || today();
  const project = opt.project || 'all';
  const remindDays = Number(state.settings.remindDays) || 0;
  const o = { today: t, remindDays, toYm: opt.toYm };
  const inProject = (x) => project === 'all' || (x.projectId || '') === project;
  const inProjectT = (x) => project === 'all' || !x.projectId || x.projectId === project;
  const idx = buildIndex(state);
  const groups = new Map(state.groups.map((g) => [g.id, g]));
  const teachers = new Map(state.teachers.map((x) => [x.id, x]));
  const sl = new Map(), tl = new Map(), rl = new Map();
  for (const s of state.students) sl.set(s.id, studentLedger(s, idx.studentPays(s.id), o));
  for (const x of state.teachers) tl.set(x.id, teacherLedger(x, state, idx, o));
  for (const r of state.recurring) rl.set(r.id, recurringLedger(r, idx, o));
  const byStatus = (a, b, La, Lb) => STATUS_ORDER[La.status] - STATUS_ORDER[Lb.status] || ((La.due[0] || {}).due || '9').localeCompare((Lb.due[0] || {}).due || '9') || a.name.localeCompare(b.name, 'ru');
  const activeStudents = state.students.filter((s) => !s.archived && inProject(s));
  const debtors = activeStudents.filter((s) => sl.get(s.id).status !== 'ok').sort((a, b) => byStatus(a, b, sl.get(a.id), sl.get(b.id)));
  const activeTeachers = state.teachers.filter((x) => !x.archived && inProjectT(x));
  const teachersDue = activeTeachers.filter((x) => tl.get(x.id).status !== 'ok' && tl.get(x.id).dueNow > 0).sort((a, b) => byStatus(a, b, tl.get(a.id), tl.get(b.id)));
  const activeRecurring = state.recurring.filter((r) => !r.archived && inProject(r));
  const recurringDue = activeRecurring.filter((r) => rl.get(r.id).status !== 'ok').sort((a, b) => byStatus(a, b, rl.get(a.id), rl.get(b.id)));
  const payments = state.payments.filter(inProject);
  const ym = ymOf(t), prev = ymAdd(ym, -1);
  const month = (m) => {
    let inc = 0, out = 0;
    for (const p of payments) if (ymOf(p.date) === m) { if (isIn(p)) inc += Number(p.amount) || 0; else out += Number(p.amount) || 0; }
    return { income: r2(inc), out: r2(out), net: r2(inc - out) };
  };
  const sum = (list, f) => r2(list.reduce((a, x) => a + f(x), 0));
  return {
    today: t, ym, project, remindDays, idx, groups, teachers, inProject, inProjectT,
    student: (id) => sl.get(id), teacher: (id) => tl.get(id), recurring: (id) => rl.get(id),
    activeStudents, debtors, activeTeachers, teachersDue, activeRecurring, recurringDue, payments,
    activeGroups: state.groups.filter((g) => !g.archived && inProject(g)),
    kpi: {
      toCollect: sum(debtors, (s) => sl.get(s.id).dueNow),
      overdue: sum(debtors, (s) => sl.get(s.id).debt),
      overdueCount: debtors.filter((s) => sl.get(s.id).status === 'overdue').length,
      toPay: r2(sum(teachersDue, (x) => tl.get(x.id).dueNow) + sum(recurringDue, (r) => rl.get(r.id).dueNow)),
      // всё неоплаченное со сроком до конца текущего месяца (включая старые долги)
      expectedRest: sum(activeStudents, (s) => sl.get(s.id).charges.reduce((a, c) => a + (c.rest > 0 && ymOf(c.due) <= ym ? c.rest : 0), 0)),
      cur: month(ym), prev: month(prev),
    },
    month,
  };
}

/** Сбор за месяц: сколько начислено и сколько из этого уже оплачено, по группам. */
export function collection(state, d, ym) {
  const rows = new Map();
  const row = (key, label, g) => { if (!rows.has(key)) rows.set(key, { key, label, group: g || null, expected: 0, collected: 0, count: 0, paidCount: 0 }); return rows.get(key); };
  for (const s of d.activeStudents) {
    if (s.payType === 'package') continue;
    let L = d.student(s.id);
    if (ym > L.toYm) L = studentLedger(s, d.idx.studentPays(s.id), { today: d.today, remindDays: d.remindDays, toYm: ym });
    const c = L.charges.find((x) => x.kind === 'month' && x.ym === ym);
    if (!c || c.amount <= 0) continue;
    const g = d.groups.get(s.groupId);
    const r = row(g ? g.id : '', g ? g.name : 'Индивидуально', g);
    r.expected = r2(r.expected + c.amount); r.collected = r2(r.collected + c.paid); r.count++; if (c.rest <= 0) r.paidCount++;
  }
  const list = [...rows.values()].sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : a.label.localeCompare(b.label, 'ru')));
  return { rows: list, expected: r2(list.reduce((a, r) => a + r.expected, 0)), collected: r2(list.reduce((a, r) => a + r.collected, 0)), count: list.reduce((a, r) => a + r.count, 0), paidCount: list.reduce((a, r) => a + r.paidCount, 0) };
}

/** Таблица «строки × месяцы» как в Numbers: доходы по группам и расходы по категориям (по датам оплат). */
export function plMatrix(state, months, project = 'all') {
  const inP = (x) => project === 'all' || (x.projectId || '') === project;
  const set = new Set(months);
  const students = new Map(state.students.map((s) => [s.id, s]));
  const groups = new Map(state.groups.map((g) => [g.id, g]));
  const teachers = new Map(state.teachers.map((x) => [x.id, x]));
  const groupByName = new Map(state.groups.map((g) => [norm(g.name), g]));
  const inc = new Map(), exp = new Map();
  const add = (m, key, init, ym, v) => { if (!m.has(key)) m.set(key, { ...init, cells: {}, total: 0 }); const r = m.get(key); r.cells[ym] = r2((r.cells[ym] || 0) + v); r.total = r2(r.total + v); };
  for (const p of state.payments) {
    const ym = ymOf(p.date);
    if (!inP(p) || !set.has(ym)) continue;
    const v = Number(p.amount) || 0;
    if (isIn(p)) {
      const st = p.kind === 'income' && p.personId ? students.get(p.personId) : null;
      const g = p.kind === 'income' ? (p.groupId ? groups.get(p.groupId) : p.groupId === '' ? null : (st && groups.get(st.groupId)) || (p.category && groupByName.get(norm(p.category))) || null) : null;
      if (g) add(inc, 'g:' + g.id, { label: g.name, sub: (teachers.get(g.teacherId) || {}).name || '', section: 0 }, ym, v);
      else if (st) add(inc, 's:' + st.id, { label: st.name, sub: (teachers.get(st.teacherId) || {}).name || '', section: 1 }, ym, v);
      else add(inc, 'o:' + (p.category || p.personName || 'Доход'), { label: p.category || p.personName || 'Доход', sub: '', section: 2 }, ym, v);
    } else add(exp, expenseCat(p), { label: expenseCat(p) }, ym, v);
  }
  for (const r of state.recurring) if (!r.archived && inP(r) && !exp.has(r.name)) exp.set(r.name, { label: r.name, cells: {}, total: 0 });
  const income = [...inc.values()].sort((a, b) => a.section - b.section || a.label.localeCompare(b.label, 'ru'));
  const expense = [...exp.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'ru'));
  const tot = (rows) => { const o = {}; for (const ym of months) o[ym] = r2(rows.reduce((a, r) => a + (r.cells[ym] || 0), 0)); return o; };
  const tin = tot(income), tout = tot(expense), net = {};
  for (const ym of months) net[ym] = r2(tin[ym] - tout[ym]);
  const s = (o) => r2(months.reduce((a, ym) => a + o[ym], 0));
  return { months, income, expense, totalIn: tin, totalOut: tout, net, sumIn: s(tin), sumOut: s(tout), sumNet: s(net) };
}

/** События по дням для календаря и списка «ближайшие дни». */
export function eventsBetween(state, d, from, to) {
  const ev = [];
  const toYm = ymOf(to);
  const o = { today: d.today, remindDays: d.remindDays, toYm };
  for (const s of d.activeStudents) {
    if (s.payType === 'package') continue;
    const L = studentLedger(s, d.idx.studentPays(s.id), o);
    for (const c of L.charges) if (c.due >= from && c.due <= to && c.amount > 0) ev.push({ date: c.due, dir: 'in', kind: 'student', id: s.id, name: s.name, amount: c.rest > 0 ? c.rest : c.amount, status: c.status, sub: c.kind === 'extra' ? c.label : (d.groups.get(s.groupId) || {}).name || 'индивидуально', charge: c });
  }
  for (const x of d.activeTeachers) {
    const L = teacherLedger(x, state, d.idx, o);
    const byDue = new Map();
    for (const c of L.lines) if (c.due >= from && c.due <= to) { const e = byDue.get(c.due) || { date: c.due, dir: 'out', kind: 'teacher', id: x.id, name: x.name, amount: 0, rest: 0, labels: [] }; e.amount = r2(e.amount + c.amount); e.rest = r2(e.rest + c.rest); e.labels.push(c.label); e.status = e.status && STATUS_ORDER[e.status] < STATUS_ORDER[c.status] ? e.status : c.status; byDue.set(c.due, e); }
    for (const e of byDue.values()) ev.push({ ...e, amount: e.rest > 0 ? e.rest : e.amount, sub: 'зарплата · ' + e.labels.join(', ') });
  }
  for (const r of d.activeRecurring) {
    const L = recurringLedger(r, d.idx, o);
    for (const c of L.items) if (c.due >= from && c.due <= to && c.status !== 'skip') ev.push({ date: c.due, dir: 'out', kind: 'recurring', id: r.id, name: r.name, amount: c.amount, status: c.status, sub: r.auto ? 'подписка · автосписание' : 'подписка', period: c.ym });
  }
  ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.dir === b.dir ? a.name.localeCompare(b.name, 'ru') : a.dir === 'in' ? -1 : 1));
  return ev;
}

/** Быстрый ввод: «лиза 150» → { query: 'лиза', amount: 150, words: 'лиза' }. Сумма — последнее число в строке;
    «1 500» читается как полторы тысячи. words — текст без суммы в исходном виде (для названия категории). */
export function parseQuick(text) {
  const parts = String(text || '').replace(/(\d)[\u00a0\u202f\u2009](?=\d)/g, '$1').trim().split(/\s+/).filter(Boolean);
  const isAmt = (w) => /^[$€₺₽£]?\d[\d.,]*[$€₺₽£]?$/.test(w) && parseAmount(w) > 0;
  let j = parts.length - 1;
  while (j >= 0 && !isAmt(parts[j])) j--;
  if (j < 0) return { query: norm(parts.join(' ')), amount: null, words: parts.join(' ') };
  let i = j;
  while (i > 0 && /^\d{3}([.,]\d{1,2})?[$€₺₽£]?$/.test(parts[i]) && /^[$€₺₽£]?\d{1,3}$/.test(parts[i - 1])) i--;
  const amount = parseAmount(parts.slice(i, j + 1).join(' '));
  const words = [...parts.slice(0, i), ...parts.slice(j + 1)].join(' ');
  return { query: norm(words), amount: amount > 0 ? amount : null, words };
}
/** Нечёткое совпадение для поиска: начало слова лучше середины. 0 — не подходит. */
export function matchScore(name, q) {
  const n = norm(name);
  if (!q) return 1;
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  if (n.split(' ').some((w) => w.startsWith(q))) return 60;
  if (n.includes(q)) return 40;
  const qs = q.split(' ');
  if (qs.length > 1 && qs.every((w) => n.includes(w))) return 30;
  return 0;
}
