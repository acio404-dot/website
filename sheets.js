/* sheets.js — импорт из Google Таблиц и CSV: ученики, преподаватели, расходы «категория × месяц», журнал платежей. */
import { html, useState } from './vendor.js';
import { store, normalize, keepAccrued, archiveStudentIn, restoreStudentIn } from './store.js';
import * as C from './core.js';
import { Sheet, Fields, useForm, open, replaceSheet, toast, pickFile, sheets } from './ui.js';

export const SHEET_TYPES = { students: 'Ученики', teachers: 'Преподаватели', expenses: 'Расходы (категория × месяц)', payments: 'Журнал платежей' };
const NOT_TEACHER = /преподав|учител|teacher|öğretmen|hoca/i;
const FIELDS = {
  students: [
    ['name', 'Имя ученика *', /ученик|student|öğrenci|имя|фио|name|isim|^ad( soyad)?$/i, NOT_TEACHER], ['group', 'Группа', /групп|group|grup|sınıf/i], ['teacher', 'Преподаватель', NOT_TEACHER],
    ['subject', 'Предмет', /предмет|subject|ders|курс|course/i], ['price', 'Цена в месяц', /цена|сумма|стоим|price|amount|fee|ücret|tutar/i], ['payDay', 'День оплаты (число месяца)', /день оплаты|число|pay ?day/i],
    ['nextDue', 'Дата следующей оплаты', /следующ|срок|дата оплаты|due|next|son ödeme/i], ['status', 'Статус (оплачено / нет)', /статус|status|durum|оплатил|оплачено|ödendi/i],
    ['phone', 'Телефон', /тел|phone|telefon|whatsapp/i], ['telegram', 'Telegram', /telegram|телеграм|^tg$/i], ['notes', 'Заметка', /замет|коммент|примеч|note|comment|^not$/i],
  ],
  teachers: [
    ['name', 'Имя *', /имя|фио|преподав|учител|teacher|name|öğretmen|hoca/i], ['subject', 'Предмет', /предмет|subject|ders|курс/i], ['rate', 'Оклад или ставка', /оклад|ставк|сумма|зарпл|rate|salary|maaş|ücret/i],
    ['perLesson', 'За занятие? (да/нет)', /за заняти|per lesson|ders başı/i], ['payDay', 'День выплаты', /день выплат|число|pay ?day/i], ['phone', 'Телефон', /тел|phone|telefon/i], ['notes', 'Заметка', /замет|коммент|примеч|note|comment/i],
  ],
  expenses: [['category', 'Категория *', /категор|category|статья|расход|kategori|month/i]],
  payments: [
    ['date', 'Дата *', /дата|date|tarih/i], ['name', 'Кто / что *', /кто|имя|ученик|name|назван|описан|student|isim/i], ['amount', 'Сумма *', /сумма|amount|tutar|price/i],
    ['kind', 'Тип (доход / расход)', /тип|вид|kind|type|tür/i], ['category', 'Категория / группа', /категор|групп|category|group/i], ['note', 'Комментарий', /коммент|замет|примеч|note|comment/i],
  ],
};
const MUST = { students: 'name', teachers: 'name', expenses: 'category', payments: 'name' };
// месяц в заголовке или дате: сокращение («янв», «sep»), полное название или падеж («января»); «Маркетинг» и «Subtotal» месяцами не считаются
const MONTHS = [
  ['январь', 'january', 'ocak'], ['февраль', 'february', 'şubat', 'subat'], ['март', 'march', 'mart'], ['апрель', 'april', 'nisan'], ['май', 'may', 'mayıs', 'mayis'], ['июнь', 'june', 'haziran'],
  ['июль', 'july', 'temmuz'], ['август', 'august', 'ağustos', 'agustos'], ['сентябрь', 'september', 'eylül', 'eylul'], ['октябрь', 'october', 'ekim'], ['ноябрь', 'november', 'kasım', 'kasim'], ['декабрь', 'december', 'aralık', 'aralik'],
];
const low = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const monthByName = (word) => {
  const w = low(word).replace(/[^a-zа-яёçğıöşü]/g, '');
  if (w.length < 3) return 0;
  for (let i = 0; i < 12; i++) for (const full of MONTHS[i]) {
    const stem = full.replace(/[ьй]$/, '');
    if (full.startsWith(w) || (w === 'sept' && i === 8) || (w.startsWith(stem) && w.length - stem.length <= 2 && /[а-яё]$/.test(full))) return i + 1;
  }
  return 0;
};
const TOTAL_ROW = /^(итого|итог|всего|сумма|total|subtotal|sum|toplam|расходы всего|доходы всего|прибыль|profit|net)\s*:?$/i;
const isPaidWord = (v) => { const s = low(v); return !/^(не\s|нет|un|not\s|no$)|не\s?оплач|ödenmedi/.test(s) && /оплач|paid|ödendi|^да$|^yes$|^\+$|✓|✔|^ok$|^1$|true/.test(s); };

/** Какой разделитель в файле: тот, что вне кавычек встречается в первых строках одинаковое число раз. */
function guessDelim(text) {
  const head = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 6);
  let best = ',', top = -1;
  for (const d of [';', '\t', ',']) {
    const counts = head.map((line) => { let n = 0, q = false; for (const c of line) { if (c === '"') q = !q; else if (c === d && !q) n++; } return n; });
    const score = counts[0] ? counts[0] + (counts.every((n) => n === counts[0]) ? 1000 : 0) : 0;
    if (score > top) { top = score; best = d; }
  }
  return best;
}
export function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const delim = guessDelim(text);
  const rows = []; let row = [], cell = '', q = false, quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell === '' && !quoted) { q = true; quoted = true; } // кавычка открывает ячейку только в её начале
    else if (c === delim) { row.push(cell); cell = ''; quoted = false; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; quoted = false; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
/** В колонке с датами через «/» день стоит первым? true / false, а если по данным не понять — null. */
export function slashDayFirst(values) {
  let res = null;
  for (const v of values) { const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\//); if (!m) continue; if (+m[1] > 12) return true; if (+m[2] > 12) res = false; }
  return res;
}
/** Дата из ячейки. dayFirst — порядок в датах через «/»; по умолчанию месяц/день, как отдаёт Google Таблица с американскими настройками. */
export function parseDateCell(v, dayFirst) {
  const s = String(v || '').trim(); if (!s) return null;
  let m;
  const mk = (y, mo, d) => (mo >= 1 && mo <= 12 && d >= 1 && d <= C.daysInYm(`${y}-${C.pad(mo)}`) ? `${y}-${C.pad(mo)}-${C.pad(d)}` : null);
  const yr = (y) => (String(y).length === 2 ? '20' + y : String(y));
  const Y = '(\\d{4}|\\d{2})(?!\\d)';
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/))) return mk(m[1], +m[2], +m[3]);
  if ((m = s.match(new RegExp('^(\\d{1,2})\\.(\\d{1,2})\\.' + Y)))) return mk(yr(m[3]), +m[2], +m[1]);
  if ((m = s.match(new RegExp('^(\\d{1,2})\\/(\\d{1,2})\\/' + Y)))) { const a = +m[1], b = +m[2]; return a > 12 || (dayFirst && b <= 12) ? mk(yr(m[3]), b, a) : mk(yr(m[3]), a, b); }
  if ((m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?!\d)/))) return mk(m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})\s+([^\d\s.,]+)\.?,?\s+(\d{4})(?!\d)/)) && monthByName(m[2])) return mk(m[3], monthByName(m[2]), +m[1]); // 5 октября 2026, 5 Oct 2026
  if ((m = s.match(/^([^\d\s.,]+)\.?\s+(\d{1,2}),?\s+(\d{4})(?!\d)/)) && monthByName(m[1])) return mk(m[3], monthByName(m[1]), +m[2]); // October 5, 2026
  return null;
}
/** Месяц из заголовка колонки: { ym } — с годом, { mo } — только месяц (год определится по соседним колонкам). */
function monthOfHeader(v) {
  const s = low(v); if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})[-./](\d{1,2})(?![\d])/)) && +m[2] >= 1 && +m[2] <= 12) return { ym: `${m[1]}-${C.pad(m[2])}` };
  if ((m = s.match(/^(\d{1,2})[./-](\d{4})$/)) && +m[1] >= 1 && +m[1] <= 12) return { ym: `${m[2]}-${C.pad(m[1])}` };
  if ((m = s.match(/^([^\d\s.,]+)\.?,?\s*((?:\d{4}|\d{2})?)$/)) && monthByName(m[1])) { const y = m[2]; return y ? { ym: `${y.length === 2 ? '20' + y : y}-${C.pad(monthByName(m[1]))}` } : { mo: monthByName(m[1]) }; }
  const iso = parseDateCell(s);
  return iso ? { ym: iso.slice(0, 7) } : null;
}
export function parseMonthHeader(v, year) { const r = monthOfHeader(v); return !r ? null : r.ym || `${year || C.today().slice(0, 4)}-${C.pad(r.mo)}`; }
/** Колонки-месяцы таблицы расходов. Заголовки без года получают год по порядку: после декабря идёт январь следующего года;
    baseYear — год первой такой колонки, он запоминается при подключении и не «уезжает» с наступлением нового года. */
export function monthColumns(headers, skip, baseYear) {
  const out = [];
  let year = baseYear || Number(C.today().slice(0, 4)), last = 0;
  headers.forEach((h, i) => {
    if (i === skip) return;
    const r = monthOfHeader(h); if (!r) return;
    if (r.ym) { out.push({ i, ym: r.ym }); year = Number(r.ym.slice(0, 4)); last = Number(r.ym.slice(5)); return; }
    if (last && r.mo < last) year++;
    last = r.mo;
    out.push({ i, ym: `${year}-${C.pad(r.mo)}` });
  });
  return out;
}
export function toCsvUrl(url) {
  url = String(url || '').trim();
  let m;
  const gid = (url.match(/[?&#]gid=(\d+)/) || [])[1];
  if ((m = url.match(/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/e\/([^/]+)\/pub/))) return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=csv${gid ? '&gid=' + gid : ''}`;
  if ((m = url.match(/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/))) return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv&headers=1${gid ? '&gid=' + gid : ''}`;
  return url;
}
const HELP = 'Проверьте доступ: Файл → Поделиться → «Все, у кого есть ссылка» (Читатель).';
export async function fetchSheetCSV(url) {
  const csvUrl = toCsvUrl(url);
  if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(csvUrl)) throw new Error('Нужна ссылка на Google Таблицу: она начинается с docs.google.com/spreadsheets');
  const check = (t) => { if (/<html|<!doctype/i.test(t.slice(0, 300))) throw new Error('html'); return t; };
  try { const r = await fetch(csvUrl, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return check(await r.text()); }
  catch {
    let r;
    try { r = await fetch('/api/sheet?url=' + encodeURIComponent(csvUrl), { cache: 'no-store' }); } catch { throw new Error('Не удалось загрузить таблицу. ' + HELP); }
    if (!r.ok) { let msg = ''; try { msg = (await r.json()).error; } catch { /* не JSON */ } throw new Error(msg || 'Не удалось загрузить таблицу. ' + HELP); }
    try { return check(await r.text()); } catch { throw new Error('Google не отдал таблицу. ' + HELP); }
  }
}
export function autoMapping(type, headers) {
  const map = {}, used = new Set();
  for (const [f, , re, not] of FIELDS[type] || []) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && re.test(low(h)) && !(not && not.test(low(h))));
    if (i >= 0) { map[f] = i; used.add(i); }
  }
  // обязательная колонка не нашлась по названию — берём первую свободную
  if (map[MUST[type]] == null) { const i = headers.findIndex((_, idx) => !used.has(idx)); map[MUST[type]] = i >= 0 ? i : 0; }
  return map;
}
/** Короткий постоянный номер подключения по ссылке и типу: повторное подключение той же таблицы заменяет свои записи, а не дублирует их. */
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
export const sourceIdFor = (url, type) => 'gs:' + type + ':' + hash(toCsvUrl(url));
/** Колонки могли сдвинуться с тех пор, как их сопоставили: ищем каждую по сохранённому заголовку. */
export function resolveMapping(src, headers) {
  const out = {};
  for (const [f, i] of Object.entries(src.mapping || {})) {
    const want = (src.headers || [])[i];
    if (want == null || low(headers[i]) === low(want)) { out[f] = i; continue; }
    const j = want === '' ? -1 : headers.findIndex((h) => low(h) === low(want));
    if (j < 0) throw new Error(`В таблице изменились колонки: не нашлась «${want || 'колонка ' + (i + 1)}». Откройте подключение и проверьте соответствие — данные не тронуты.`);
    out[f] = j;
  }
  return out;
}

/** Применить строки таблицы к данным. Вызывается внутри store.commit; при ошибке commit возвращает данные в прежний вид. */
export function applyRows(st, src, rows) {
  const headers = rows[0] || [], body = rows.slice(1), m = src.mapping || {};
  const col = (row, f) => (m[f] != null && m[f] !== '' ? String(row[m[f]] ?? '').trim() : null);
  const projectId = typeof src.projectId === 'string' ? src.projectId : (st.projects[0] || {}).id || '';
  const t = C.today(), cur = C.ymOf(t);
  const res = { created: 0, updated: 0, archived: 0, payments: 0, skipped: 0 };
  const make = (key, obj) => normalize({ [key]: [obj], students: key === 'students' ? [obj] : [], payments: [] })[key][0];
  const same = (a, b) => C.norm(a) === C.norm(b);
  const group = (name, pid) => { let g = st.groups.find((x) => same(x.name, name)); if (!g) { g = make('groups', { id: C.uid(), name: name.trim(), projectId: pid, color: st.groups.length % 8 }); st.groups.push(g); } return g; };
  const findTeacher = (name) => st.teachers.find((y) => same(y.name, name));
  const teacher = (name, pid, extra) => { let x = findTeacher(name); if (!x) { x = make('teachers', { id: C.uid(), name: name.trim(), projectId: pid, payType: 'perGroup', payDay: 5, ...extra }); st.teachers.push(x); } return x; };
  const had = st.payments.filter((p) => p.sourceId === src.id).length;
  if (src.type === 'students') {
    const idx = C.buildIndex(st), used = new Set();
    const mine = st.students.filter((x) => x.sourceId === src.id && !x.archived); // кто числился за этой таблицей до загрузки
    const dayFirst = slashDayFirst(body.map((row) => col(row, 'nextDue')));
    for (const row of body) {
      const name = col(row, 'name'); if (!name) { res.skipped++; continue; }
      if (TOTAL_ROW.test(name)) continue;
      const gName = col(row, 'group'), g = gName ? group(gName, projectId) : null;
      // тёзки: сначала ученик из той же группы, потом из этой же таблицы, потом любой ещё не сопоставленный
      const all = st.students.filter((x) => same(x.name, name)), free = all.filter((x) => !used.has(x.id));
      let s = free.find((x) => g && x.groupId === g.id) || free.find((x) => x.sourceId === src.id) || free[0];
      if (!s && all.some((x) => used.has(x.id) && x.groupId === (g ? g.id : ''))) { res.skipped++; continue; } // та же строка второй раз
      const isNew = !s;
      const price = C.parseAmount(col(row, 'price')), payDay = C.parseAmount(col(row, 'payDay')), nextDue = parseDateCell(col(row, 'nextDue'), dayFirst), status = col(row, 'status');
      if (isNew) {
        const day = payDay >= 1 && payDay <= 31 ? Math.round(payDay) : nextDue ? Number(nextDue.slice(8)) : g ? g.payDay : 1;
        const startYm = nextDue ? C.ymOf(nextDue) : status && isPaidWord(status) ? C.ymAdd(cur, 1) : cur;
        s = make('students', { id: C.uid(), name, payDay: day, startYm, rates: [{ from: startYm, price: price != null ? Math.abs(price) : g ? g.price : 0 }], createdAt: t });
        st.students.push(s); res.created++;
      } else {
        res.updated++;
        if (price != null && Math.abs(price) !== Number((C.rateAt(s.rates, cur) || {}).price)) {
          // новая цена — с первого месяца, по которому ещё ничего не оплачено: оплаченный месяц не превращается в долг
          const from = C.firstUnpaidYm(C.studentLedger(s, idx.studentPays(s.id), { today: t, remindDays: 0 }), cur);
          if (Math.abs(price) !== Number((C.rateAt(s.rates, from) || {}).price)) s.rates = C.setRate(s.rates, from < s.startYm ? s.startYm : from, { price: Math.abs(price) });
        }
        if (payDay >= 1 && payDay <= 31) s.payDay = Math.round(payDay);
        // из архива возвращаем только тех, кого туда отправила эта же таблица; архив, сделанный вручную, остаётся
        if (s.archived && s.archivedBy === src.id) { keepAccrued(st, [s.groupId ? '' : s.teacherId], () => restoreStudentIn(st, s)); res.restored = (res.restored || 0) + 1; }
      }
      used.add(s.id);
      s.sourceId = src.id;
      if (g) { s.groupId = g.id; s.projectId = g.projectId; if (g.teacherId) s.teacherId = g.teacherId; if (!g.price && price) { g.price = Math.abs(price); g.payDay = s.payDay; } } else if (isNew) s.projectId = projectId;
      const tName = col(row, 'teacher');
      if (tName) { const x = teacher(tName, s.projectId); if (g && !g.teacherId) g.teacherId = x.id; if (!g || g.teacherId === x.id) s.teacherId = x.id; }
      for (const f of ['subject', 'phone', 'notes']) { const v = col(row, f); if (v) s[f] = v; }
      const tg = col(row, 'telegram'); if (tg) s.telegram = tg.replace(/^(https?:\/\/)?(t|telegram)\.me\//i, '').replace(/^@+/, '').replace(/[/?#\s].*$/, '');
      if (g && !g.subject && s.subject) g.subject = s.subject;
    }
    if (src.archiveMissing) {
      const gone = mine.filter((x) => !used.has(x.id));
      if (gone.length > 3 && gone.length * 2 > mine.length) throw new Error(`В таблице не нашлось ${gone.length} из ${mine.length} учеников — похоже, изменились колонки или лист. Ничего не изменено: проверьте подключение.`);
      for (const x of gone) { keepAccrued(st, [x.groupId ? '' : x.teacherId], () => archiveStudentIn(st, x, false, src.id)); res.archived++; }
    }
  } else if (src.type === 'teachers') {
    for (const row of body) {
      const name = col(row, 'name'); if (!name) { res.skipped++; continue; }
      if (TOTAL_ROW.test(name)) continue;
      const rate = C.parseAmount(col(row, 'rate')), per = col(row, 'perLesson'), payDay = C.parseAmount(col(row, 'payDay'));
      const day = payDay >= 1 && payDay <= 31 ? Math.round(payDay) : null;
      const type = rate > 0 ? (per && (isPaidWord(per) || /заня|lesson|ders/i.test(per)) ? 'perLesson' : 'salary') : null;
      let x = findTeacher(name);
      if (!x) {
        // новый преподаватель: схема оплаты — по таблице (со ставкой — оклад или за занятие, без ставки — за группы)
        const startYm = type === 'perLesson' ? cur : C.ymOf(C.nextDateForDay(day || 5, t));
        x = teacher(name, projectId, type ? { payType: type, payDay: day || 5, startYm, rates: [{ from: startYm, amount: Math.abs(rate) }] } : {});
        res.created++;
      } else {
        res.updated++;
        if (day) x.payDay = day;
        // у уже заведённого преподавателя схему оплаты таблица не меняет — только сумму при той же схеме
        if (type && x.payType === type && Number((C.rateAt(x.rates, cur) || {}).amount) !== Math.abs(rate)) x.rates = C.setRate(x.rates, cur, { amount: Math.abs(rate) });
      }
      x.sourceId = src.id;
      for (const f of ['subject', 'phone', 'notes']) { const v = col(row, f); if (v) x[f] = v; }
    }
  } else if (src.type === 'expenses') {
    const catCol = m.category != null ? Number(m.category) : 0;
    if (!src.baseYear) src.baseYear = Number(t.slice(0, 4));
    const monthCols = monthColumns(headers, catCol, src.baseYear);
    const add = [];
    for (const row of body) {
      const cat = String(row[catCol] ?? '').trim(); if (!cat) { res.skipped++; continue; }
      if (TOTAL_ROW.test(cat)) continue;
      for (const { i, ym } of monthCols) { const n = C.parseAmount(row[i]); if (!n) continue; add.push({ id: C.uid(), kind: 'expense', date: ym + '-01', amount: Math.abs(n), personId: '', personName: cat, category: cat, projectId, note: 'из таблицы', method: '', sourceId: src.id }); }
      if (!st.settings.categories.includes(cat)) st.settings.categories.push(cat);
    }
    if (had && !add.length) throw new Error('В таблице не нашлось ни одной суммы по месяцам — похоже, изменились колонки или лист. Прежние записи оставлены.');
    st.payments = st.payments.filter((p) => p.sourceId !== src.id).concat(add);
    res.payments = add.length; res.months = monthCols.length;
  } else if (src.type === 'payments') {
    const dayFirst = slashDayFirst(body.map((row) => col(row, 'date')));
    const add = [];
    for (const row of body) {
      const date = parseDateCell(col(row, 'date'), dayFirst), name = col(row, 'name'), amount = C.parseAmount(col(row, 'amount'));
      if (!date || !name || !amount) { if (name || amount) res.skipped++; continue; }
      const k = low(col(row, 'kind') || '');
      const s = st.students.find((x) => same(x.name, name)), x = findTeacher(name);
      let kind;
      if (/зарпл|salary|maaş|выплат/.test(k)) kind = 'salary';
      else if (/расход|expense|gider|трат/.test(k)) kind = 'expense';
      else if (/доход|income|приход|gelir|оплат/.test(k)) kind = s ? 'income' : 'otherIncome';
      else if (amount < 0) kind = x ? 'salary' : 'expense';
      else kind = s ? 'income' : x ? 'salary' : 'otherIncome';
      const g = s && kind === 'income' ? st.groups.find((y) => y.id === s.groupId) : null;
      const cat = col(row, 'category') || (kind === 'salary' ? 'Зарплаты' : kind === 'expense' ? name : g ? g.name : '');
      const p = { id: C.uid(), kind, date, amount: Math.abs(amount), personId: kind === 'income' && s ? s.id : kind === 'salary' && x ? x.id : '', personName: kind === 'income' && s ? s.name : name, category: cat, projectId: (s || x || {}).projectId || projectId, note: col(row, 'note') || '', method: '', sourceId: src.id };
      if (kind === 'income' && s) p.groupId = s.groupId || '';
      add.push(p);
    }
    if (had && !add.length) throw new Error('В таблице не нашлось ни одной строки с датой, именем и суммой — похоже, изменились колонки или лист. Прежние записи оставлены.');
    st.payments = st.payments.filter((p) => p.sourceId !== src.id).concat(add);
    res.payments = add.length;
  }
  if (!res.skipped) delete res.skipped;
  src.lastSync = new Date().toISOString(); src.lastResult = res; src.lastError = '';
  return res;
}
export function resultText(src) {
  const r = src.lastResult || {};
  const skipped = r.skipped ? `пропущено строк ${r.skipped}` : '';
  if (src.type === 'students' || src.type === 'teachers') return [`новых ${r.created || 0}`, `обновлено ${r.updated || 0}`, r.restored ? `из архива ${r.restored}` : '', r.archived ? `в архив ${r.archived}` : '', skipped].filter(Boolean).join(', ');
  return [`записей ${r.payments || 0}`, r.months != null ? `месяцев ${r.months}` : '', skipped].filter(Boolean).join(', ');
}
const saveSource = (st, src) => { const i = st.settings.sheets.findIndex((x) => x.id === src.id); if (i >= 0) st.settings.sheets[i] = src; else st.settings.sheets.push(src); };
/** Обновить данные из подключённой таблицы. Возвращает результат или null при ошибке. */
export async function syncSource(id, silent) {
  const src0 = store.state.settings.sheets.find((x) => x.id === id);
  if (!src0 || !src0.url) return null;
  // подключение, перенесённое из прежней версии: соответствие колонок нужно один раз подтвердить
  if (!Array.isArray(src0.headers)) { if (!silent) { open('sheetSource', { id }); toast('Подтвердите соответствие колонок — после этого таблица будет обновляться как обычно'); } return null; }
  try {
    const rows = parseCSV(await fetchSheetCSV(src0.url));
    if (rows.length < 2) throw new Error('В таблице нет строк с данными.');
    const mapping = resolveMapping(src0, rows[0]);
    let res;
    store.commit(`${src0.name}: обновлено из таблицы`, (st) => { const src = st.settings.sheets.find((x) => x.id === id); src.mapping = mapping; src.headers = rows[0].slice(); res = applyRows(st, src, rows); }, { silent });
    if (!silent) toast(`${src0.name}: ${resultText({ ...src0, lastResult: res })}`);
    return res;
  } catch (e) {
    store.commit('', (st) => { const src = st.settings.sheets.find((x) => x.id === id); if (src) src.lastError = (e && e.message) || String(e); }, { noUndo: true, silent: true });
    if (!silent) toast(`${src0.name}: ${(e && e.message) || 'ошибка'}`);
    return null;
  }
}
/** Обновить все таблицы (onlyAuto — только с автообновлением). При тихом запуске сообщаем лишь о заметных изменениях и ошибках. */
export async function syncAll(silent, onlyAuto) {
  const list = store.state.settings.sheets.filter((s) => s.url && s.enabled !== false && (!onlyAuto || s.autoSync));
  let ok = 0, made = 0, gone = 0, back = 0;
  for (const s of list) { const r = await syncSource(s.id, true); if (r) { ok++; made += r.created || 0; gone += r.archived || 0; back += r.restored || 0; } }
  if (!list.length) return ok;
  const parts = [made && `новых: ${made}`, back && `из архива: ${back}`, gone && `в архив: ${gone}`].filter(Boolean);
  if (ok < list.length) toast(`Таблицы: обновлено ${ok} из ${list.length} — подробности в «Настройках»`);
  else if (!silent || parts.length) toast(`Обновлено из таблиц${parts.length ? ' — ' + parts.join(', ') : `: ${ok}`}${parts.length ? '. Отменить — ⌘Z' : ''}`);
  return ok;
}

// ---------- Окна ----------
export function SheetSourceForm({ id, close, file }) {
  const st = store.state;
  const src = id ? st.settings.sheets.find((x) => x.id === id) : null;
  const [v, set] = useForm({ url: src ? src.url : '', type: src ? src.type : 'students', projectId: src ? src.projectId || '' : (st.projects[0] || {}).id || '' });
  const [busy, setBusy] = useState(false);
  const next = (rows, extra) => {
    if (!rows.length) { setBusy(false); return toast('Таблица пустая'); }
    const draft = { id: C.uid(), name: '', autoSync: true, archiveMissing: false, enabled: true, mapping: null, ...(src || {}), ...extra, type: v.type, projectId: v.projectId };
    // прежнее сопоставление оставляем, только если его уже подтверждали для этого же типа и заголовки те же
    const keep = src && src.type === v.type && Array.isArray(src.headers) && src.mapping && rows[0].length === src.headers.length && rows[0].every((h, i) => low(h) === low(src.headers[i]));
    if (!keep) draft.mapping = autoMapping(v.type, rows[0]);
    replaceSheet(SheetMappingForm, { draft, rows, isNew: !src });
  };
  const submit = async () => {
    // у каждого файла свой номер источника: второй файл дополняет первый, а повторная загрузка того же файла заменяет свои записи
    if (file) return pickFile('.csv,text/csv,text/plain', (text, name) => { const base = name.replace(/\.[^.]+$/, ''); next(parseCSV(text), { url: '', id: `csv:${v.type}:${C.norm(base)}`, name: base, autoSync: false }); });
    setBusy(true);
    try { const rows = parseCSV(await fetchSheetCSV(v.url)); next(rows, { url: v.url.trim(), ...(src ? {} : { id: sourceIdFor(v.url, v.type) }) }); }
    catch (e) { toast((e && e.message) || 'Ошибка загрузки'); setBusy(false); }
  };
  const fields = [
    !file && { k: 'url', label: 'Ссылка на лист Google Таблицы', type: 'url', req: true, span: true, ph: 'https://docs.google.com/spreadsheets/d/…/edit#gid=…', hint: 'Откройте нужный лист и скопируйте ссылку из адресной строки. Доступ: Файл → Поделиться → «Все, у кого есть ссылка» (Читатель).' },
    { k: 'type', label: 'Что в таблице', type: 'select', opts: Object.entries(SHEET_TYPES), span: !st.projects.length },
    st.projects.length ? { k: 'projectId', label: 'Проект', type: 'select', opts: [['', '— без проекта —'], ...st.projects.map((p) => [p.id, p.name])] } : null,
  ];
  return html`<${Sheet} title=${file ? 'Импорт из CSV-файла' : src ? 'Google Таблица' : 'Подключить Google Таблицу'} onClose=${close} onSubmit=${submit}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary" disabled=${busy}>${busy ? 'Загружаю…' : file ? 'Выбрать файл' : 'Загрузить'}</button>`}>
    <${Fields} fields=${fields} v=${v} set=${set} />
    ${file && html`<p class="hint" style="margin-top:12px">Подойдёт выгрузка из Numbers, Excel или Google Таблиц в формате CSV. Первая строка — заголовки колонок.</p>`}
  <//>`;
}
function SheetMappingForm({ draft, rows, isNew, close }) {
  const headers = rows[0], sample = rows.slice(1, 6), fields = FIELDS[draft.type] || [];
  const init = { name: draft.name || SHEET_TYPES[draft.type], autoSync: !!draft.autoSync, archiveMissing: !!draft.archiveMissing };
  for (const [f] of fields) init['map_' + f] = draft.mapping[f] != null ? String(draft.mapping[f]) : '';
  const [v, set] = useForm(init);
  const colOpts = [['', '— нет —'], ...headers.map((h, i) => [String(i), h || `Колонка ${i + 1}`])];
  const baseYear = draft.baseYear || Number(C.today().slice(0, 4));
  const months = draft.type === 'expenses' ? monthColumns(headers, v.map_category === '' ? -1 : Number(v.map_category), baseYear).map((x) => x.ym) : [];
  const replaced = draft.type === 'expenses' || draft.type === 'payments' ? store.state.payments.filter((p) => p.sourceId === draft.id).length : 0;
  const submit = () => {
    const mapping = {};
    for (const [f] of fields) if (v['map_' + f] !== '') mapping[f] = Number(v['map_' + f]);
    if (mapping[MUST[draft.type]] == null) return toast('Укажите обязательную колонку');
    const src = { ...draft, name: v.name.trim() || SHEET_TYPES[draft.type], mapping, headers: headers.slice(), baseYear, autoSync: !!draft.url && v.autoSync, archiveMissing: v.archiveMissing };
    let res;
    try { store.commit(`${src.name}: загружено из таблицы`, (st) => { if (src.url) saveSource(st, src); res = applyRows(st, src.url ? st.settings.sheets.find((x) => x.id === src.id) : src, rows); }, { silent: true }); }
    catch (e) { return toast((e && e.message) || 'Не удалось загрузить'); }
    close();
    const cid = store.rev;
    toast(`${src.name}: ${resultText({ ...src, lastResult: res })}`, { label: 'Отменить', fn: () => store.undo(cid) });
  };
  return html`<${Sheet} title="Какая колонка что означает" cls="wide" onClose=${close} onSubmit=${submit}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary">${draft.url ? (isNew ? 'Подключить и загрузить' : 'Сохранить и обновить') : 'Загрузить'}</button>`}>
    <p class="hint" style="margin-bottom:12px">В таблице ${headers.length} ${C.plural(headers.length, 'колонка', 'колонки', 'колонок')} и ${rows.length - 1} ${C.plural(rows.length - 1, 'строка', 'строки', 'строк')}. Поля со звёздочкой обязательны.</p>
    <${Fields} v=${v} set=${set} fields=${[{ k: 'name', label: 'Название подключения', span: true }, ...fields.map(([f, label]) => ({ k: 'map_' + f, label, type: 'select', opts: colOpts }))]} />
    ${draft.type === 'expenses' && html`<p class="hint" style="margin-top:10px">Месяцы в заголовках: ${months.length ? months.map((ym) => C.ymShort(ym, true)).join(', ') : html`<b>не найдены</b> — колонки должны называться как месяцы (June, Июнь, 06.2026)`}.</p>`}
    <div class="table-wrap" style="margin-top:12px;border:1px solid var(--line);border-radius:12px"><table class="small"><thead><tr>${headers.map((h) => html`<th>${h}</th>`)}</tr></thead><tbody>${sample.map((r) => html`<tr>${headers.map((_, i) => html`<td class="nowrap">${r[i] || ''}</td>`)}</tr>`)}</tbody></table></div>
    <div class="stack" style="gap:10px;margin-top:14px">
      ${draft.url && html`<label class="switch"><input type="checkbox" checked=${v.autoSync} onChange=${(e) => set('autoSync', e.target.checked)} /><i></i><span>Обновлять при каждом открытии дашборда</span></label>`}
      ${draft.type === 'students' && html`<label class="switch"><input type="checkbox" checked=${v.archiveMissing} onChange=${(e) => set('archiveMissing', e.target.checked)} /><i></i><span>Отправлять в архив тех, кого больше нет в таблице</span></label>`}
    </div>
    <p class="hint" style="margin-top:12px">${draft.type === 'students' ? 'Ученики сопоставляются по имени: таблица обновляет карточку (группа, цена, контакты), а оплаты ведутся в дашборде. Дата следующей оплаты и статус учитываются только для новых учеников.' : draft.type === 'teachers' ? 'Преподаватели сопоставляются по имени. Схему оплаты таблица задаёт только новым преподавателям.' : draft.type === 'payments' ? 'Расходы — с минусом или со словом «расход» в колонке «Тип»; иначе сумма считается доходом. Записи из этого источника заменяются целиком при каждой загрузке; внесённые вручную остаются.' : 'Записи из этого источника заменяются целиком при каждой загрузке; внесённые вручную остаются.'}${replaced ? ` Сейчас из него загружено ${replaced} ${C.plural(replaced, 'запись', 'записи', 'записей')} — они будут заменены.` : ''}</p>
  <//>`;
}
sheets.sheetSource = SheetSourceForm;
