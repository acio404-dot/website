/* Финансы центра — дашборд директора учебного центра.
   Данные хранятся в localStorage браузера. Экспорт/импорт — на вкладке «Настройки». */
(() => {
  'use strict';

  const STORAGE_KEY = 'edu-finance-v1';
  const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  // ---------- Даты ----------
  const pad = (n) => String(n).padStart(2, '0');
  const fmtISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayISO = () => fmtISO(new Date());
  const daysUntil = (iso) => Math.round((parseISO(iso) - parseISO(todayISO())) / 86400000);
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  function addMonths(iso, n, keepDay) {
    const d = parseISO(iso);
    const y = d.getFullYear(), m = d.getMonth() + n;
    const target = new Date(y, m, 1);
    const day = Math.min(keepDay || d.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
    return fmtISO(new Date(target.getFullYear(), target.getMonth(), day));
  }
  function nextDateForDay(day) {
    // ближайшая дата с данным числом месяца, начиная с сегодня
    const t = new Date();
    const thisMonth = new Date(t.getFullYear(), t.getMonth(), Math.min(day, daysInMonth(t.getFullYear(), t.getMonth())));
    if (fmtISO(thisMonth) >= todayISO()) return fmtISO(thisMonth);
    const nm = new Date(t.getFullYear(), t.getMonth() + 1, 1);
    return fmtISO(new Date(nm.getFullYear(), nm.getMonth(), Math.min(day, daysInMonth(nm.getFullYear(), nm.getMonth()))));
  }
  function fmtDate(iso, withYear) {
    if (!iso) return '—';
    const d = parseISO(iso);
    const base = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
    return withYear || d.getFullYear() !== new Date().getFullYear() ? `${base} ${d.getFullYear()}` : base;
  }
  function relDays(iso) {
    const n = daysUntil(iso);
    if (n === 0) return 'сегодня';
    if (n === 1) return 'завтра';
    if (n === -1) return 'вчера';
    if (n < 0) return `${-n} ${plural(-n, 'день', 'дня', 'дней')} назад`;
    return `через ${n} ${plural(n, 'день', 'дня', 'дней')}`;
  }
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  // ---------- Состояние ----------
  const defaultState = () => ({
    settings: { currency: '₽', remindDays: 3 },
    students: [],
    teachers: [],
    payments: [],
  });
  let state = load();
  let activeTab = 'overview';
  let ui = { studentFilter: 'all', studentSearch: '', teacherFilter: 'all', calMonth: null, historyKind: 'all', chartTable: false };
  let lastDeleted = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      return Object.assign(defaultState(), s, { settings: Object.assign(defaultState().settings, s.settings || {}) });
    } catch { return defaultState(); }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { toast('Не удалось сохранить данные в браузере'); }
  }
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // ---------- Форматирование ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const money = (n) => `${nf.format(Math.round(n || 0))} ${state.settings.currency}`;
  const compact = (n) => {
    const a = Math.abs(n);
    if (a >= 1e6) return `${(n / 1e6).toFixed(1).replace('.0', '')} млн ${state.settings.currency}`;
    return money(n);
  };

  // ---------- Бизнес-логика ----------
  const teacherById = (id) => state.teachers.find((t) => t.id === id);
  const activeStudents = () => state.students.filter((s) => !s.archived);
  const activeTeachers = () => state.teachers.filter((t) => !t.archived);

  function studentStatus(s) {
    if (s.payType === 'package') {
      if (s.lessonsLeft <= 0) return 'overdue';
      if (s.lessonsLeft <= 1) return 'soon';
      return 'ok';
    }
    return dateStatus(s.nextDue);
  }
  function dateStatus(iso) {
    if (!iso) return 'ok';
    const n = daysUntil(iso);
    if (n < 0) return 'overdue';
    if (n === 0) return 'today';
    if (n <= state.settings.remindDays) return 'soon';
    return 'ok';
  }
  const teacherStatus = (t) => dateStatus(t.nextDue);
  const studentAmount = (s) => Number(s.price) || 0;
  const teacherAmount = (t) => t.payType === 'perLesson' ? (Number(t.rate) || 0) * (Number(t.lessonsDone) || 0) : Number(t.rate) || 0;
  const STATUS_LABEL = { overdue: 'Просрочено', today: 'Сегодня', soon: 'Скоро', ok: 'В порядке' };
  const STATUS_ORDER = { overdue: 0, today: 1, soon: 2, ok: 3 };
  const needsAction = (st) => st !== 'ok';

  function studentDueText(s) {
    if (s.payType === 'package') {
      const left = Number(s.lessonsLeft) || 0;
      if (left <= 0) return 'Абонемент закончился';
      return `Осталось ${left} ${plural(left, 'занятие', 'занятия', 'занятий')} из ${s.lessonsInPackage}`;
    }
    return `Оплата ${fmtDate(s.nextDue)} · ${relDays(s.nextDue)}`;
  }
  function teacherDueText(t) {
    const base = `Выплата ${fmtDate(t.nextDue)} · ${relDays(t.nextDue)}`;
    if (t.payType === 'perLesson') return `${base} · ${t.lessonsDone || 0} ${plural(t.lessonsDone || 0, 'занятие', 'занятия', 'занятий')} × ${money(t.rate)}`;
    return base;
  }

  function monthKey(iso) { return iso.slice(0, 7); }
  function sumPayments(kind, ym) {
    return state.payments.filter((p) => p.kind === kind && (!ym || monthKey(p.date) === ym)).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  }

  // ---------- Действия ----------
  function markStudentPaid(id, amount, date, note) {
    const s = state.students.find((x) => x.id === id); if (!s) return;
    state.payments.unshift({ id: uid(), kind: 'income', date, amount: Number(amount) || 0, personId: s.id, personName: s.name, note: note || '' });
    if (s.payType === 'package') s.lessonsLeft = (Number(s.lessonsLeft) || 0) + (Number(s.lessonsInPackage) || 0);
    else s.nextDue = addMonths(s.nextDue, 1, Number(s.payDay) || undefined);
    s.lastPaid = date; s.remindedAt = null;
    save(); render(); toast(`Оплата от ${s.name} записана`);
  }
  function markTeacherPaid(id, amount, date, note) {
    const t = state.teachers.find((x) => x.id === id); if (!t) return;
    state.payments.unshift({ id: uid(), kind: 'salary', date, amount: Number(amount) || 0, personId: t.id, personName: t.name, note: note || '' });
    t.nextDue = addMonths(t.nextDue, 1, Number(t.payDay) || undefined);
    if (t.payType === 'perLesson') t.lessonsDone = 0;
    t.lastPaid = date;
    save(); render(); toast(`Выплата ${t.name} записана`);
  }
  function remindStudent(id) {
    const s = state.students.find((x) => x.id === id); if (!s) return;
    s.remindedAt = todayISO(); save(); render(); toast(`Отмечено: напомнили ${s.name}`);
  }
  function lessonDone(studentId) {
    const s = state.students.find((x) => x.id === studentId); if (!s) return;
    s.lessonsLeft = Math.max(0, (Number(s.lessonsLeft) || 0) - 1);
    save(); render();
  }
  function teacherLesson(id, delta) {
    const t = state.teachers.find((x) => x.id === id); if (!t) return;
    t.lessonsDone = Math.max(0, (Number(t.lessonsDone) || 0) + delta);
    save(); render();
  }
  function deletePayment(id) {
    const i = state.payments.findIndex((p) => p.id === id); if (i < 0) return;
    lastDeleted = { payment: state.payments[i], index: i };
    state.payments.splice(i, 1); save(); render();
    toast('Запись удалена', { label: 'Вернуть', fn: () => { if (!lastDeleted) return; state.payments.splice(lastDeleted.index, 0, lastDeleted.payment); lastDeleted = null; save(); render(); } });
  }

  // ---------- Модальные окна ----------
  const modal = document.getElementById('modal');
  const modalForm = document.getElementById('modal-form');
  const modalTitle = document.getElementById('modal-title');
  let modalSubmit = null;
  function openModal(title, bodyHTML, onSubmit) {
    modalTitle.textContent = title;
    modalForm.innerHTML = bodyHTML + `<div class="form-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn primary">Сохранить</button></div>`;
    modalSubmit = onSubmit;
    modal.hidden = false;
    const first = modalForm.querySelector('input, select, textarea'); if (first) first.focus();
  }
  function closeModal() { modal.hidden = true; modalForm.innerHTML = ''; modalSubmit = null; }
  modalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(modalForm).entries());
    if (modalSubmit) modalSubmit(data);
  });
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]') || e.target.id === 'modal-close') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  const field = (label, inner, span, cls = '') => `<div class="field ${span ? 'span-2' : ''} ${cls}"><label>${label}</label>${inner}</div>`;
  const inp = (name, value, type = 'text', extra = '') => `<input class="input" name="${name}" type="${type}" value="${esc(value ?? '')}" ${extra}>`;

  function studentForm(s) {
    const isNew = !s; s = s || { payType: 'monthly', payDay: 1, lessonsInPackage: 8, lessonsLeft: 8, price: '' };
    const teachersOpts = ['<option value="">— не указан —</option>'].concat(activeTeachers().map((t) => `<option value="${t.id}" ${t.id === s.teacherId ? 'selected' : ''}>${esc(t.name)}</option>`)).join('');
    const html = `
      <div class="form-grid">
        ${field('Имя ученика', inp('name', s.name, 'text', 'required placeholder="Иван Петров"'), true)}
        ${field('Предмет / группа', inp('subject', s.subject, 'text', 'placeholder="Английский, группа A1"'))}
        ${field('Преподаватель', `<select name="teacherId">${teachersOpts}</select>`)}
        ${field('Схема оплаты', `<select name="payType" id="f-payType"><option value="monthly" ${s.payType === 'monthly' ? 'selected' : ''}>Ежемесячно</option><option value="package" ${s.payType === 'package' ? 'selected' : ''}>Абонемент на N занятий</option></select>`)}
        ${field('Сумма оплаты', inp('price', s.price, 'number', 'required min="0" step="1" placeholder="5000"'))}
        ${field('День оплаты (число месяца)', inp('payDay', s.payDay, 'number', 'min="1" max="31"'), false, 'only-monthly')}
        ${field('Следующая оплата', inp('nextDue', s.nextDue || nextDateForDay(Number(s.payDay) || 1), 'date'), false, 'only-monthly')}
        ${field('Занятий в абонементе', inp('lessonsInPackage', s.lessonsInPackage, 'number', 'min="1"'), false, 'only-package')}
        ${field('Осталось занятий', inp('lessonsLeft', s.lessonsLeft, 'number', 'min="0"'), false, 'only-package')}
        ${field('Телефон родителя / ученика', inp('phone', s.phone, 'tel', 'placeholder="+7 ..."'))}
        ${field('Заметка', inp('notes', s.notes, 'text', 'placeholder="скидка 10%, брат Миша"'))}
      </div>`;
    openModal(isNew ? 'Новый ученик' : 'Ученик', html, (d) => {
      const obj = {
        id: s.id || uid(), name: d.name.trim(), subject: d.subject.trim(), teacherId: d.teacherId || '', payType: d.payType,
        price: Number(d.price) || 0, payDay: Math.min(31, Math.max(1, Number(d.payDay) || 1)),
        nextDue: d.payType === 'monthly' ? (d.nextDue || nextDateForDay(Number(d.payDay) || 1)) : null,
        lessonsInPackage: Number(d.lessonsInPackage) || 1, lessonsLeft: Number(d.lessonsLeft) || 0,
        phone: d.phone.trim(), notes: d.notes.trim(), lastPaid: s.lastPaid || null, remindedAt: s.remindedAt || null, archived: !!s.archived,
      };
      if (isNew) state.students.push(obj); else Object.assign(s, obj);
      save(); closeModal(); render(); toast(isNew ? 'Ученик добавлен' : 'Сохранено');
    });
    const sync = () => { const v = modalForm.querySelector('#f-payType').value; modalForm.querySelectorAll('.only-monthly').forEach((el) => el.style.display = v === 'monthly' ? '' : 'none'); modalForm.querySelectorAll('.only-package').forEach((el) => el.style.display = v === 'package' ? '' : 'none'); };
    modalForm.querySelector('#f-payType').addEventListener('change', sync); sync();
    const payDayEl = modalForm.querySelector('[name=payDay]'), nextDueEl = modalForm.querySelector('[name=nextDue]');
    payDayEl.addEventListener('change', () => { const v = Number(payDayEl.value); if (v >= 1 && v <= 31) nextDueEl.value = nextDateForDay(v); });
  }

  function teacherForm(t) {
    const isNew = !t; t = t || { payType: 'monthly', payDay: 5, rate: '', lessonsDone: 0 };
    const html = `
      <div class="form-grid">
        ${field('Имя преподавателя', inp('name', t.name, 'text', 'required placeholder="Мария Ивановна"'), true)}
        ${field('Предмет', inp('subject', t.subject, 'text', 'placeholder="Математика"'))}
        ${field('Схема оплаты', `<select name="payType" id="f-tpayType"><option value="monthly" ${t.payType === 'monthly' ? 'selected' : ''}>Оклад (фикс. в месяц)</option><option value="perLesson" ${t.payType === 'perLesson' ? 'selected' : ''}>За проведённое занятие</option></select>`)}
        ${field('<span id="f-rate-label">Сумма</span>', inp('rate', t.rate, 'number', 'required min="0" step="1" placeholder="40000"'))}
        ${field('День выплаты (число месяца)', inp('payDay', t.payDay, 'number', 'min="1" max="31"'))}
        ${field('Следующая выплата', inp('nextDue', t.nextDue || nextDateForDay(Number(t.payDay) || 5), 'date'))}
        ${field('Проведено занятий (не оплачено)', inp('lessonsDone', t.lessonsDone, 'number', 'min="0"'), false, 'only-per')}
        ${field('Телефон', inp('phone', t.phone, 'tel'))}
        ${field('Заметка', inp('notes', t.notes, 'text'), true)}
      </div>`;
    openModal(isNew ? 'Новый преподаватель' : 'Преподаватель', html, (d) => {
      const obj = {
        id: t.id || uid(), name: d.name.trim(), subject: d.subject.trim(), payType: d.payType, rate: Number(d.rate) || 0,
        payDay: Math.min(31, Math.max(1, Number(d.payDay) || 1)), nextDue: d.nextDue || nextDateForDay(Number(d.payDay) || 1),
        lessonsDone: Number(d.lessonsDone) || 0, phone: d.phone.trim(), notes: d.notes.trim(), lastPaid: t.lastPaid || null, archived: !!t.archived,
      };
      if (isNew) state.teachers.push(obj); else Object.assign(t, obj);
      save(); closeModal(); render(); toast(isNew ? 'Преподаватель добавлен' : 'Сохранено');
    });
    const sync = () => { const v = modalForm.querySelector('#f-tpayType').value; modalForm.querySelectorAll('.only-per').forEach((el) => el.style.display = v === 'perLesson' ? '' : 'none'); modalForm.querySelector('#f-rate-label').textContent = v === 'perLesson' ? 'Ставка за занятие' : 'Оклад в месяц'; };
    modalForm.querySelector('#f-tpayType').addEventListener('change', sync); sync();
    const payDayEl = modalForm.querySelector('[name=payDay]'), nextDueEl = modalForm.querySelector('[name=nextDue]');
    payDayEl.addEventListener('change', () => { const v = Number(payDayEl.value); if (v >= 1 && v <= 31) nextDueEl.value = nextDateForDay(v); });
  }

  function payForm(kind, id) {
    const isIncome = kind === 'income';
    const p = isIncome ? state.students.find((x) => x.id === id) : state.teachers.find((x) => x.id === id);
    if (!p) return;
    const amount = isIncome ? studentAmount(p) : teacherAmount(p);
    const note = isIncome
      ? (p.payType === 'package' ? `После оплаты добавится ${p.lessonsInPackage} ${plural(p.lessonsInPackage, 'занятие', 'занятия', 'занятий')}.` : `Следующая оплата сдвинется на ${fmtDate(addMonths(p.nextDue, 1, p.payDay))}.`)
      : `Следующая выплата сдвинется на ${fmtDate(addMonths(p.nextDue, 1, p.payDay))}.${p.payType === 'perLesson' ? ' Счётчик занятий обнулится.' : ''}`;
    const html = `
      <div class="form-grid">
        ${field('Сумма', inp('amount', amount, 'number', 'required min="0" step="1"'))}
        ${field('Дата', inp('date', todayISO(), 'date', 'required'))}
        ${field('Комментарий', inp('note', '', 'text', 'placeholder="перевод на карту, наличные…"'), true)}
      </div><p class="form-note">${note}</p>`;
    openModal(isIncome ? `Оплата: ${p.name}` : `Выплата: ${p.name}`, html, (d) => {
      closeModal();
      if (isIncome) markStudentPaid(id, d.amount, d.date, d.note); else markTeacherPaid(id, d.amount, d.date, d.note);
    });
  }

  function manualPaymentForm() {
    const opts = (arr) => arr.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
    const html = `
      <div class="form-grid">
        ${field('Тип', `<select name="kind" id="f-kind"><option value="income">Поступление от ученика</option><option value="salary">Выплата преподавателю</option><option value="other">Другой расход</option><option value="otherIncome">Другой доход</option></select>`)}
        ${field('Кто / что', `<select name="personId" id="f-person"><option value="">—</option>${opts(activeStudents())}</select>`)}
        ${field('Сумма', inp('amount', '', 'number', 'required min="0"'))}
        ${field('Дата', inp('date', todayISO(), 'date', 'required'))}
        ${field('Комментарий', inp('note', '', 'text', 'placeholder="аренда, учебники…"'), true)}
      </div><p class="form-note">Ручная запись не меняет даты следующих оплат — для этого используйте кнопки «Оплатил» / «Выплатить».</p>`;
    openModal('Запись в историю', html, (d) => {
      const list = d.kind === 'income' ? state.students : d.kind === 'salary' ? state.teachers : [];
      const person = list.find((x) => x.id === d.personId);
      state.payments.unshift({ id: uid(), kind: d.kind, date: d.date, amount: Number(d.amount) || 0, personId: person ? person.id : '', personName: person ? person.name : (d.note || (d.kind === 'other' ? 'Расход' : 'Доход')), note: d.note || '' });
      save(); closeModal(); render(); toast('Запись добавлена');
    });
    const kindEl = modalForm.querySelector('#f-kind'), personEl = modalForm.querySelector('#f-person');
    kindEl.addEventListener('change', () => {
      const k = kindEl.value;
      personEl.innerHTML = `<option value="">—</option>` + (k === 'income' ? opts(activeStudents()) : k === 'salary' ? opts(activeTeachers()) : '');
      personEl.disabled = k === 'other' || k === 'otherIncome';
    });
  }

  // ---------- Тосты ----------
  let toastTimer = null;
  function toast(msg, action) {
    const el = document.getElementById('toast');
    el.innerHTML = esc(msg) + (action ? ` <button type="button">${esc(action.label)}</button>` : '');
    if (action) el.querySelector('button').onclick = () => { action.fn(); el.hidden = true; };
    el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2500);
  }

  // ---------- Рендер ----------
  const view = document.getElementById('view');
  function render() {
    document.getElementById('today-label').textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === activeTab));
    const fn = { overview: renderOverview, students: renderStudents, teachers: renderTeachers, calendar: renderCalendar, history: renderHistory, settings: renderSettings }[activeTab];
    view.innerHTML = fn();
    if (activeTab === 'overview') mountChart();
  }

  const badge = (st) => `<span class="badge ${st}">${STATUS_LABEL[st]}</span>`;

  function studentRow(s) {
    const st = studentStatus(s);
    const t = teacherById(s.teacherId);
    const sub = [s.subject, t ? t.name : null].filter(Boolean).join(' · ');
    return `<div class="row is-${st}">
      <div class="row-main">
        <div class="row-title">${esc(s.name)} ${badge(st)} ${s.remindedAt ? `<span class="badge muted">напомнили ${fmtDate(s.remindedAt)}</span>` : ''}</div>
        <div class="row-sub">${esc(studentDueText(s))}${sub ? ' · ' + esc(sub) : ''}</div>
      </div>
      <div class="row-actions">
        <span class="row-amount">${money(studentAmount(s))}</span>
        ${s.phone ? `<a class="btn sm" href="tel:${esc(s.phone)}" title="${esc(s.phone)}">☎</a>` : ''}
        ${s.remindedAt ? '' : `<button class="btn sm" data-act="remind" data-id="${s.id}">Напомнил</button>`}
        <button class="btn sm good" data-act="pay-student" data-id="${s.id}">Оплатил</button>
      </div></div>`;
  }
  function teacherRow(t) {
    const st = teacherStatus(t);
    return `<div class="row is-${st}">
      <div class="row-main">
        <div class="row-title">${esc(t.name)} ${badge(st)}</div>
        <div class="row-sub">${esc(teacherDueText(t))}${t.subject ? ' · ' + esc(t.subject) : ''}</div>
      </div>
      <div class="row-actions">
        <span class="row-amount">${money(teacherAmount(t))}</span>
        <button class="btn sm good" data-act="pay-teacher" data-id="${t.id}">Выплатить</button>
      </div></div>`;
  }

  function renderOverview() {
    const students = activeStudents(), teachers = activeTeachers();
    if (!students.length && !teachers.length) {
      return `<div class="card"><div class="empty">
        <h2>Начнём с данных</h2>
        <p>Добавьте учеников и преподавателей — и дашборд покажет, кому и когда напомнить об оплате, а кому выплатить зарплату.</p>
        <div class="toolbar" style="justify-content:center">
          <button class="btn primary" data-act="add-student">+ Ученик</button>
          <button class="btn" data-act="add-teacher">+ Преподаватель</button>
          <button class="btn" data-act="demo">Загрузить пример</button>
        </div></div></div>`;
    }
    const dueStudents = students.filter((s) => needsAction(studentStatus(s))).sort((a, b) => STATUS_ORDER[studentStatus(a)] - STATUS_ORDER[studentStatus(b)] || (a.nextDue || '').localeCompare(b.nextDue || ''));
    const dueTeachers = teachers.filter((t) => needsAction(teacherStatus(t))).sort((a, b) => STATUS_ORDER[teacherStatus(a)] - STATUS_ORDER[teacherStatus(b)] || a.nextDue.localeCompare(b.nextDue));
    const collect = dueStudents.reduce((a, s) => a + studentAmount(s), 0);
    const payout = dueTeachers.reduce((a, t) => a + teacherAmount(t), 0);
    const ym = todayISO().slice(0, 7);
    const incomeM = sumPayments('income', ym) + sumPayments('otherIncome', ym);
    const salaryM = sumPayments('salary', ym) + sumPayments('other', ym);
    const overdueStudents = dueStudents.filter((s) => studentStatus(s) === 'overdue').length;
    const overdueTeachers = dueTeachers.filter((t) => teacherStatus(t) === 'overdue').length;
    const balance = incomeM - salaryM;

    // ближайшие 7 дней
    const upcoming = [];
    for (let i = 0; i <= 7; i++) {
      const iso = fmtISO(new Date(Date.now() + i * 86400000));
      students.filter((s) => s.payType === 'monthly' && s.nextDue === iso).forEach((s) => upcoming.push({ iso, kind: 'in', name: s.name, amount: studentAmount(s) }));
      teachers.filter((t) => t.nextDue === iso).forEach((t) => upcoming.push({ iso, kind: 'out', name: t.name, amount: teacherAmount(t) }));
    }

    return `
      <div class="tiles">
        <div class="tile is-hero"><div class="label">Собрать с учеников сейчас</div><div class="value">${compact(collect)}</div><div class="delta">${dueStudents.length} ${plural(dueStudents.length, 'ученик', 'ученика', 'учеников')}${overdueStudents ? `, просрочено ${overdueStudents}` : ''}</div></div>
        <div class="tile"><div class="label">Выплатить преподавателям</div><div class="value">${compact(payout)}</div><div class="delta">${dueTeachers.length} ${plural(dueTeachers.length, 'человек', 'человека', 'человек')}${overdueTeachers ? `, просрочено ${overdueTeachers}` : ''}</div></div>
        <div class="tile"><div class="label">Получено в ${MONTHS_IN[new Date().getMonth()]}</div><div class="value">${compact(incomeM)}</div><div class="delta">выплачено ${compact(salaryM)}</div></div>
        <div class="tile"><div class="label">Баланс месяца</div><div class="value ${balance < 0 ? 'neg' : ''}">${balance < 0 ? '−' : ''}${compact(Math.abs(balance))}</div><div class="delta">доходы − расходы за месяц</div></div>
      </div>
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>Напомнить об оплате</h2><span class="hint">просрочено → сегодня → скоро</span></div>
          ${dueStudents.length ? `<div class="list">${dueStudents.map(studentRow).join('')}</div>` : `<div class="empty">Все ученики оплатили. Следующие напоминания появятся за ${state.settings.remindDays} ${plural(state.settings.remindDays, 'день', 'дня', 'дней')} до срока.</div>`}
        </section>
        <section class="card">
          <div class="card-head"><h2>Выплатить зарплату</h2><span class="hint">${teachers.length} ${plural(teachers.length, 'преподаватель', 'преподавателя', 'преподавателей')}</span></div>
          ${dueTeachers.length ? `<div class="list">${dueTeachers.map(teacherRow).join('')}</div>` : `<div class="empty">Ближайших выплат нет.</div>`}
        </section>
      </div>
      <div class="grid-2" style="margin-top:16px">
        <section class="card">
          <div class="card-head"><h2>Ближайшие 7 дней</h2><button class="btn sm" data-tab-go="calendar">Календарь →</button></div>
          ${upcoming.length ? `<div class="table-wrap"><table><thead><tr><th>Дата</th><th>Кто</th><th class="num">Сумма</th></tr></thead><tbody>
            ${upcoming.map((u) => `<tr><td>${fmtDate(u.iso)} <span class="sub">${relDays(u.iso)}</span></td><td><span class="cal-chip ${u.kind}" style="display:inline-flex">${esc(u.name)}</span></td><td class="num">${u.kind === 'in' ? '+' : '−'}${money(u.amount)}</td></tr>`).join('')}
          </tbody></table></div>` : `<div class="empty">На неделю вперёд оплат по графику нет.</div>`}
        </section>
        <section class="card">
          <div class="card-head"><h2>Доходы и зарплаты по месяцам</h2><button class="btn sm" data-act="chart-toggle">${ui.chartTable ? 'График' : 'Таблица'}</button></div>
          <div id="chart"></div>
        </section>
      </div>`;
  }

  function mountChart() {
    const el = document.getElementById('chart'); if (!el) return;
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      months.push({ ym, label: MONTHS_SHORT[d.getMonth()], income: sumPayments('income', ym) + sumPayments('otherIncome', ym), salary: sumPayments('salary', ym) + sumPayments('other', ym) });
    }
    const legend = `<div class="legend mt"><span><i style="background:var(--series-1)"></i>Доходы</span><span><i style="background:var(--series-2)"></i>Расходы (зарплаты и прочее)</span></div>`;
    if (ui.chartTable) {
      el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Месяц</th><th class="num">Доходы</th><th class="num">Расходы</th><th class="num">Баланс</th></tr></thead><tbody>${months.map((m) => `<tr><td>${m.label} ${m.ym.slice(0, 4)}</td><td class="num">${money(m.income)}</td><td class="num">${money(m.salary)}</td><td class="num">${money(m.income - m.salary)}</td></tr>`).join('')}</tbody></table></div>`;
      return;
    }
    const W = 520, H = 220, padL = 44, padR = 8, padT = 10, padB = 28;
    const max = Math.max(1, ...months.flatMap((m) => [m.income, m.salary]));
    const niceMax = niceCeil(max);
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const y = (v) => padT + plotH - (v / niceMax) * plotH;
    const band = plotW / months.length, barW = Math.min(24, band * 0.3), gap = 2;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Доходы и расходы за 6 месяцев">`;
    svg += `<g class="grid">${ticks.map((t) => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>`;
    svg += `<g class="axis">${ticks.map((t) => `<text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${shortNum(t)}</text>`).join('')}`;
    svg += months.map((m, i) => `<text x="${padL + band * i + band / 2}" y="${H - 8}" text-anchor="middle">${m.label}</text>`).join('') + '</g>';
    months.forEach((m, i) => {
      const cx = padL + band * i + band / 2;
      const x1 = cx - barW - gap / 2, x2 = cx + gap / 2;
      svg += bar(x1, y(m.income), barW, padT + plotH - y(m.income), 's1');
      svg += bar(x2, y(m.salary), barW, padT + plotH - y(m.salary), 's2');
      svg += `<rect class="hit" data-i="${i}" x="${padL + band * i}" y="${padT}" width="${band}" height="${plotH}"/>`;
    });
    svg += '</svg>';
    el.innerHTML = `<div class="chart-wrap">${svg}</div>${legend}`;
    const wrap = el.querySelector('.chart-wrap');
    let tip = null;
    wrap.addEventListener('mousemove', (e) => {
      const hit = e.target.closest('.hit'); if (!hit) { if (tip) { tip.remove(); tip = null; } return; }
      const m = months[Number(hit.dataset.i)];
      if (!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; wrap.appendChild(tip); }
      tip.innerHTML = `<strong>${m.label} ${m.ym.slice(0, 4)}</strong><div class="t-row"><span><i style="background:var(--series-1)"></i>Доходы</span><b>${money(m.income)}</b></div><div class="t-row"><span><i style="background:var(--series-2)"></i>Расходы</span><b>${money(m.salary)}</b></div><div class="t-row"><span>Баланс</span><b>${money(m.income - m.salary)}</b></div>`;
      const r = wrap.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(e.clientX - r.left, 90), r.width - 90)}px`; tip.style.top = `${Math.max(e.clientY - r.top - 12, 70)}px`;
    });
    wrap.addEventListener('mouseleave', () => { if (tip) { tip.remove(); tip = null; } });
  }
  function bar(x, y, w, h, cls) {
    if (h <= 0.5) return '';
    const r = Math.min(4, h, w / 2);
    // скруглён только верх, у основания прямой угол
    return `<path class="bar ${cls}" d="M${x} ${y + h} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h} Z"/>`;
  }
  function niceCeil(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10; return step * p; }
  function shortNum(v) { if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.0', '')}М`; if (v >= 1e3) return `${Math.round(v / 1e3)}К`; return String(Math.round(v)); }

  function renderStudents() {
    const q = ui.studentSearch.trim().toLowerCase();
    let list = state.students.filter((s) => ui.studentFilter === 'archived' ? s.archived : !s.archived);
    if (ui.studentFilter !== 'all' && ui.studentFilter !== 'archived') list = list.filter((s) => studentStatus(s) === ui.studentFilter || (ui.studentFilter === 'due' && needsAction(studentStatus(s))));
    if (q) list = list.filter((s) => [s.name, s.subject, (teacherById(s.teacherId) || {}).name, s.notes].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => STATUS_ORDER[studentStatus(a)] - STATUS_ORDER[studentStatus(b)] || a.name.localeCompare(b.name, 'ru'));
    const counts = { all: activeStudents().length, due: activeStudents().filter((s) => needsAction(studentStatus(s))).length, archived: state.students.filter((s) => s.archived).length };
    const seg = (k, label) => `<button class="${ui.studentFilter === k ? 'is-active' : ''}" data-sfilter="${k}">${label}</button>`;
    const monthlyTotal = activeStudents().filter((s) => s.payType === 'monthly').reduce((a, s) => a + studentAmount(s), 0);
    return `
      <div class="page-head"><h1>Ученики <span class="muted small">${counts.all}</span></h1>
        <div class="toolbar"><input class="input sm" placeholder="Поиск…" value="${esc(ui.studentSearch)}" data-ssearch><button class="btn primary" data-act="add-student">+ Ученик</button></div></div>
      <div class="filters"><div class="seg">${seg('all', 'Все')}${seg('due', `Требуют внимания (${counts.due})`)}${seg('ok', 'В порядке')}${seg('archived', `Архив (${counts.archived})`)}</div>
        <span class="muted small" style="align-self:center">Ежемесячных платежей по графику: ${money(monthlyTotal)} / мес</span></div>
      <div class="card">${list.length ? `<div class="table-wrap"><table class="responsive"><thead><tr><th>Ученик</th><th>Статус</th><th>Оплата</th><th>Преподаватель</th><th class="num">Сумма</th><th></th></tr></thead><tbody>
        ${list.map((s) => { const st = studentStatus(s); const t = teacherById(s.teacherId); return `<tr>
          <td data-l="Ученик"><div><strong>${esc(s.name)}</strong></div><div class="sub">${esc(s.subject || '')}${s.notes ? ' · ' + esc(s.notes) : ''}</div></td>
          <td data-l="Статус"><div>${badge(st)}</div>${s.remindedAt ? `<div class="sub">напомнили ${fmtDate(s.remindedAt)}</div>` : ''}</td>
          <td data-l="Оплата"><div>${esc(studentDueText(s))}</div><div class="sub">${s.payType === 'package' ? 'абонемент' : `ежемесячно, ${s.payDay}-го`}${s.lastPaid ? ` · последняя ${fmtDate(s.lastPaid)}` : ''}</div></td>
          <td data-l="Преподаватель">${t ? esc(t.name) : '<span class="muted">—</span>'}</td>
          <td class="num" data-l="Сумма">${money(studentAmount(s))}</td>
          <td class="actions"><div class="row-actions">
            ${s.payType === 'package' && !s.archived ? `<button class="btn sm" data-act="lesson-done" data-id="${s.id}" title="Отметить проведённое занятие">−1 занятие</button>` : ''}
            ${!s.archived && !s.remindedAt && needsAction(st) ? `<button class="btn sm" data-act="remind" data-id="${s.id}">Напомнил</button>` : ''}
            ${!s.archived ? `<button class="btn sm good" data-act="pay-student" data-id="${s.id}">Оплатил</button>` : ''}
            <button class="btn sm" data-act="edit-student" data-id="${s.id}">✎</button>
            <button class="btn sm" data-act="archive-student" data-id="${s.id}" title="${s.archived ? 'Вернуть из архива' : 'В архив'}">${s.archived ? '↩' : '🗄'}</button>
          </div></td></tr>`; }).join('')}
        </tbody></table></div>` : `<div class="empty"><p>${q ? 'Ничего не найдено.' : 'Пока нет учеников.'}</p>${!q && ui.studentFilter === 'all' ? `<button class="btn primary" data-act="add-student">+ Добавить ученика</button>` : ''}</div>`}</div>`;
  }

  function renderTeachers() {
    let list = state.teachers.filter((t) => ui.teacherFilter === 'archived' ? t.archived : !t.archived);
    if (ui.teacherFilter === 'due') list = list.filter((t) => needsAction(teacherStatus(t)));
    list.sort((a, b) => STATUS_ORDER[teacherStatus(a)] - STATUS_ORDER[teacherStatus(b)] || a.name.localeCompare(b.name, 'ru'));
    const seg = (k, label) => `<button class="${ui.teacherFilter === k ? 'is-active' : ''}" data-tfilter="${k}">${label}</button>`;
    const fund = activeTeachers().reduce((a, t) => a + teacherAmount(t), 0);
    return `
      <div class="page-head"><h1>Преподаватели <span class="muted small">${activeTeachers().length}</span></h1>
        <div class="toolbar"><button class="btn primary" data-act="add-teacher">+ Преподаватель</button></div></div>
      <div class="filters"><div class="seg">${seg('all', 'Все')}${seg('due', `К выплате (${activeTeachers().filter((t) => needsAction(teacherStatus(t))).length})`)}${seg('archived', `Архив (${state.teachers.filter((t) => t.archived).length})`)}</div>
        <span class="muted small" style="align-self:center">Начислено к ближайшей выплате: ${money(fund)}</span></div>
      <div class="card">${list.length ? `<div class="table-wrap"><table class="responsive"><thead><tr><th>Преподаватель</th><th>Статус</th><th>Выплата</th><th>Ученики</th><th class="num">К выплате</th><th></th></tr></thead><tbody>
        ${list.map((t) => { const st = teacherStatus(t); const n = activeStudents().filter((s) => s.teacherId === t.id).length; return `<tr>
          <td data-l="Преподаватель"><div><strong>${esc(t.name)}</strong></div><div class="sub">${esc(t.subject || '')}${t.notes ? ' · ' + esc(t.notes) : ''}</div></td>
          <td data-l="Статус">${badge(st)}</td>
          <td data-l="Выплата"><div>${fmtDate(t.nextDue)} <span class="sub">${relDays(t.nextDue)}</span></div><div class="sub">${t.payType === 'perLesson' ? `${money(t.rate)} за занятие, выплата ${t.payDay}-го` : `оклад ${money(t.rate)}, ${t.payDay}-го`}${t.lastPaid ? ` · последняя ${fmtDate(t.lastPaid)}` : ''}</div></td>
          <td data-l="Ученики">${n}</td>
          <td class="num" data-l="К выплате"><div>${money(teacherAmount(t))}</div>${t.payType === 'perLesson' ? `<div class="sub">${t.lessonsDone || 0} ${plural(t.lessonsDone || 0, 'занятие', 'занятия', 'занятий')}</div>` : ''}</td>
          <td class="actions"><div class="row-actions">
            ${t.payType === 'perLesson' && !t.archived ? `<button class="btn sm" data-act="teacher-lesson-minus" data-id="${t.id}">−</button><button class="btn sm" data-act="teacher-lesson-plus" data-id="${t.id}" title="Проведено занятие">+1 занятие</button>` : ''}
            ${!t.archived ? `<button class="btn sm good" data-act="pay-teacher" data-id="${t.id}">Выплатить</button>` : ''}
            <button class="btn sm" data-act="edit-teacher" data-id="${t.id}">✎</button>
            <button class="btn sm" data-act="archive-teacher" data-id="${t.id}" title="${t.archived ? 'Вернуть из архива' : 'В архив'}">${t.archived ? '↩' : '🗄'}</button>
          </div></td></tr>`; }).join('')}
        </tbody></table></div>` : `<div class="empty"><p>Пока нет преподавателей.</p>${ui.teacherFilter === 'all' ? `<button class="btn primary" data-act="add-teacher">+ Добавить преподавателя</button>` : ''}</div>`}</div>`;
  }

  function renderCalendar() {
    const base = ui.calMonth ? parseISO(ui.calMonth + '-01') : new Date();
    const y = base.getFullYear(), m = base.getMonth();
    const first = new Date(y, m, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const dim = daysInMonth(y, m);
    const today = todayISO();
    const events = {};
    const push = (iso, ev) => { (events[iso] = events[iso] || []).push(ev); };
    activeStudents().forEach((s) => { if (s.payType === 'monthly' && s.nextDue) push(s.nextDue, { kind: 'in', name: s.name, amount: studentAmount(s), late: s.nextDue < today, id: s.id }); });
    activeTeachers().forEach((t) => { if (t.nextDue) push(t.nextDue, { kind: 'out', name: t.name, amount: teacherAmount(t), late: t.nextDue < today, id: t.id }); });
    // просроченные с прошлых месяцев показываем в шапке
    const monthPrefix = `${y}-${pad(m + 1)}`;
    const lateOutside = Object.entries(events).filter(([iso]) => iso < today && !iso.startsWith(monthPrefix)).flatMap(([iso, evs]) => evs.map((e) => ({ ...e, iso })));
    let totalIn = 0, totalOut = 0;
    Object.entries(events).forEach(([iso, evs]) => { if (iso.startsWith(monthPrefix)) evs.forEach((e) => { if (e.kind === 'in') totalIn += e.amount; else totalOut += e.amount; }); });
    let cells = '';
    const totalCells = Math.ceil((startOffset + dim) / 7) * 7;
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startOffset + 1;
      const d = new Date(y, m, dayNum);
      const iso = fmtISO(d);
      const other = dayNum < 1 || dayNum > dim;
      const evs = events[iso] || [];
      const chips = evs.slice(0, 3).map((e) => `<span class="cal-chip ${e.kind} ${e.late ? 'late' : ''}" title="${esc(e.name)} — ${money(e.amount)}">${esc(e.name)}</span>`).join('');
      const more = evs.length > 3 ? `<span class="cal-more">ещё ${evs.length - 3}</span>` : '';
      const dots = `<span class="dots">${evs.slice(0, 6).map((e) => `<i class="${e.kind}"></i>`).join('')}</span>`;
      cells += `<button class="cal-day ${other ? 'other' : ''} ${iso === today ? 'today' : ''}" data-day="${iso}"><span class="d">${d.getDate()}</span>${chips}${more}${dots}</button>`;
    }
    const sel = ui.calSelected && events[ui.calSelected] ? ui.calSelected : null;
    const dayList = sel ? `<section class="card mt"><div class="card-head"><h2>${fmtDate(sel, true)}</h2><span class="hint">${relDays(sel)}</span></div><div class="list">
      ${events[sel].map((e) => `<div class="row ${e.late ? 'is-overdue' : ''}"><div class="row-main"><div class="row-title">${esc(e.name)} <span class="badge muted">${e.kind === 'in' ? 'оплата от ученика' : 'зарплата'}</span></div></div>
        <div class="row-actions"><span class="row-amount">${e.kind === 'in' ? '+' : '−'}${money(e.amount)}</span><button class="btn sm good" data-act="${e.kind === 'in' ? 'pay-student' : 'pay-teacher'}" data-id="${e.id}">${e.kind === 'in' ? 'Оплатил' : 'Выплатить'}</button></div></div>`).join('')}
      </div></section>` : '';
    return `
      <div class="page-head"><h1>Календарь</h1>
        <div class="legend"><span><i style="background:var(--series-1)"></i>Оплата от ученика</span><span><i style="background:var(--series-2)"></i>Зарплата</span><span style="text-decoration:underline wavy var(--overdue)">Просрочено</span></div></div>
      <div class="card">
        <div class="cal-head"><button class="btn sm" data-cal="-1">‹</button><h2>${MONTHS[m]} ${y}</h2><div class="toolbar"><button class="btn sm" data-cal="0">Сегодня</button><button class="btn sm" data-cal="1">›</button></div></div>
        <div class="muted small" style="margin-bottom:10px">По графику в этом месяце: поступления ${money(totalIn)}, выплаты ${money(totalOut)}${lateOutside.length ? ` · <span class="badge overdue">просрочено из прошлых месяцев: ${lateOutside.length}</span>` : ''}</div>
        <div class="cal-grid">${WEEKDAYS.map((w) => `<div class="cal-dow">${w}</div>`).join('')}${cells}</div>
      </div>
      ${dayList}
      ${lateOutside.length ? `<section class="card mt"><div class="card-head"><h2>Просрочено ранее</h2></div><div class="list">${lateOutside.map((e) => `<div class="row is-overdue"><div class="row-main"><div class="row-title">${esc(e.name)} ${badge('overdue')}</div><div class="row-sub">${e.kind === 'in' ? 'оплата' : 'зарплата'} · ${fmtDate(e.iso)} · ${relDays(e.iso)}</div></div><div class="row-actions"><span class="row-amount">${money(e.amount)}</span><button class="btn sm good" data-act="${e.kind === 'in' ? 'pay-student' : 'pay-teacher'}" data-id="${e.id}">${e.kind === 'in' ? 'Оплатил' : 'Выплатить'}</button></div></div>`).join('')}</div></section>` : ''}
      <p class="muted small mt">Ученики на абонементе в календаре не показываются — их статус считается по оставшимся занятиям (вкладка «Ученики»).</p>`;
  }

  function renderHistory() {
    const KIND = { income: 'Оплата ученика', salary: 'Зарплата', other: 'Расход', otherIncome: 'Доход' };
    let list = state.payments.slice().sort((a, b) => b.date.localeCompare(a.date));
    if (ui.historyKind !== 'all') list = list.filter((p) => ui.historyKind === 'in' ? (p.kind === 'income' || p.kind === 'otherIncome') : (p.kind === 'salary' || p.kind === 'other'));
    const seg = (k, label) => `<button class="${ui.historyKind === k ? 'is-active' : ''}" data-hfilter="${k}">${label}</button>`;
    const totalIn = list.filter((p) => p.kind === 'income' || p.kind === 'otherIncome').reduce((a, p) => a + p.amount, 0);
    const totalOut = list.filter((p) => p.kind === 'salary' || p.kind === 'other').reduce((a, p) => a + p.amount, 0);
    let lastMonth = '';
    const rows = list.map((p) => {
      const ym = monthKey(p.date);
      let head = '';
      if (ym !== lastMonth) { lastMonth = ym; const d = parseISO(p.date); head = `<tr><td colspan="5" style="background:var(--surface-2);font-weight:600">${MONTHS[d.getMonth()]} ${d.getFullYear()}</td></tr>`; }
      const isIn = p.kind === 'income' || p.kind === 'otherIncome';
      return head + `<tr><td data-l="Дата">${fmtDate(p.date)}</td><td data-l="Кто"><div><strong>${esc(p.personName)}</strong></div>${p.note ? `<div class="sub">${esc(p.note)}</div>` : ''}</td><td data-l="Тип"><div><span class="badge muted">${KIND[p.kind] || p.kind}</span></div></td><td class="num" data-l="Сумма" style="color:${isIn ? 'var(--ok)' : 'inherit'}">${isIn ? '+' : '−'}${money(p.amount)}</td><td class="actions"><button class="btn sm danger" data-act="del-payment" data-id="${p.id}" title="Удалить запись">✕</button></td></tr>`;
    }).join('');
    return `
      <div class="page-head"><h1>История</h1><div class="toolbar"><button class="btn" data-act="export-csv">Скачать CSV</button><button class="btn primary" data-act="manual-payment">+ Запись</button></div></div>
      <div class="filters"><div class="seg">${seg('all', 'Всё')}${seg('in', 'Поступления')}${seg('out', 'Выплаты')}</div><span class="muted small" style="align-self:center">Поступления ${money(totalIn)} · выплаты ${money(totalOut)} · итог ${money(totalIn - totalOut)}</span></div>
      <div class="card">${list.length ? `<div class="table-wrap"><table class="responsive"><thead><tr><th>Дата</th><th>Кто</th><th>Тип</th><th class="num">Сумма</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">Записей пока нет. Нажимайте «Оплатил» и «Выплатить» на обзоре — записи появятся здесь.</div>`}</div>
      <p class="muted small mt">Удаление записи не возвращает дату следующей оплаты назад — при ошибке поправьте её в карточке ученика или преподавателя.</p>`;
  }

  function renderSettings() {
    const s = state.settings;
    const size = new Blob([JSON.stringify(state)]).size;
    return `
      <div class="page-head"><h1>Настройки</h1></div>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h2>Общие</h2></div>
          <div class="form-grid">
            ${field('Валюта (символ)', inp('currency', s.currency, 'text', 'data-setting="currency" maxlength="4"'))}
            ${field('Напоминать за N дней до оплаты', inp('remindDays', s.remindDays, 'number', 'data-setting="remindDays" min="0" max="30"'))}
            ${field('Тема', `<select data-setting="theme"><option value="auto" ${!s.theme || s.theme === 'auto' ? 'selected' : ''}>Как в системе</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Светлая</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Тёмная</option></select>`)}
          </div>
          <p class="form-note mt">Изменения сохраняются сразу.</p>
        </section>
        <section class="card"><div class="card-head"><h2>Резервная копия</h2></div>
          <p class="small muted">Данные хранятся только в этом браузере (${(size / 1024).toFixed(1)} КБ). Чтобы перенести на другой компьютер или не потерять при очистке браузера — скачайте копию.</p>
          <div class="toolbar mt"><button class="btn primary" data-act="export">Скачать копию (JSON)</button><label class="btn">Загрузить копию<input type="file" accept="application/json" data-import hidden></label></div>
          <dl class="kv mt"><dt>Учеников</dt><dd>${state.students.length}</dd><dt>Преподавателей</dt><dd>${state.teachers.length}</dd><dt>Записей в истории</dt><dd>${state.payments.length}</dd></dl>
        </section>
      </div>
      <section class="card mt danger-zone"><div class="card-head"><h2>Опасная зона</h2></div>
        <div class="toolbar"><button class="btn" data-act="demo">Загрузить пример данных</button><button class="btn danger" data-act="wipe">Удалить все данные</button></div>
        <p class="form-note mt">Пример данных заменит текущие. Перед этим скачайте копию.</p>
      </section>`;
  }

  // ---------- Экспорт / импорт ----------
  function download(name, content, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportJSON() { download(`finansy-centra-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json'); }
  function exportCSV() {
    const KIND = { income: 'Оплата ученика', salary: 'Зарплата', other: 'Расход', otherIncome: 'Доход' };
    const rows = [['Дата', 'Тип', 'Кто', 'Сумма', 'Комментарий']].concat(state.payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map((p) => [p.date, KIND[p.kind] || p.kind, p.personName, p.amount, p.note]));
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    download(`istoriya-${todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
  }
  function importJSON(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data || !Array.isArray(data.students) || !Array.isArray(data.teachers)) throw new Error('bad');
        if (!confirm('Заменить текущие данные загруженной копией?')) return;
        state = Object.assign(defaultState(), data, { settings: Object.assign(defaultState().settings, data.settings || {}) });
        save(); applyTheme(); render(); toast('Копия загружена');
      } catch { toast('Файл не похож на копию данных'); }
    };
    r.readAsText(file);
  }

  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  }

  // ---------- Демо ----------
  function loadDemo() {
    const t = todayISO();
    const d = (n) => fmtISO(new Date(Date.now() + n * 86400000));
    const T = [
      { id: 't1', name: 'Мария Ивановна', subject: 'Математика', payType: 'monthly', rate: 45000, payDay: 5, nextDue: nextDateForDay(5), lessonsDone: 0, phone: '', notes: '' },
      { id: 't2', name: 'Олег Смирнов', subject: 'Английский', payType: 'perLesson', rate: 1200, payDay: 10, nextDue: d(2), lessonsDone: 14, phone: '', notes: '' },
      { id: 't3', name: 'Анна Ковалёва', subject: 'Подготовка к школе', payType: 'monthly', rate: 32000, payDay: 1, nextDue: d(-3), lessonsDone: 0, phone: '', notes: '' },
    ];
    const S = [
      { id: 's1', name: 'Иван Петров', subject: 'Математика', teacherId: 't1', payType: 'monthly', price: 6000, payDay: 1, nextDue: d(-5), lessonsInPackage: 8, lessonsLeft: 0, phone: '+79990000001', notes: '' },
      { id: 's2', name: 'Соня Егорова', subject: 'Английский A2', teacherId: 't2', payType: 'monthly', price: 7500, payDay: 3, nextDue: t, lessonsInPackage: 8, lessonsLeft: 0, phone: '+79990000002', notes: '' },
      { id: 's3', name: 'Артём Волков', subject: 'Английский B1', teacherId: 't2', payType: 'package', price: 9600, payDay: 1, nextDue: null, lessonsInPackage: 8, lessonsLeft: 1, phone: '', notes: 'скидка 10%' },
      { id: 's4', name: 'Лиза Новикова', subject: 'Подготовка к школе', teacherId: 't3', payType: 'monthly', price: 5500, payDay: 15, nextDue: d(2), lessonsInPackage: 8, lessonsLeft: 0, phone: '', notes: '' },
      { id: 's5', name: 'Кирилл Орлов', subject: 'Математика', teacherId: 't1', payType: 'monthly', price: 6000, payDay: 20, nextDue: d(12), lessonsInPackage: 8, lessonsLeft: 0, phone: '', notes: '' },
      { id: 's6', name: 'Дарья Миронова', subject: 'Английский A1', teacherId: 't2', payType: 'package', price: 9600, payDay: 1, nextDue: null, lessonsInPackage: 8, lessonsLeft: 6, phone: '', notes: '' },
      { id: 's7', name: 'Максим Белов', subject: 'Математика', teacherId: 't1', payType: 'monthly', price: 6000, payDay: 25, nextDue: d(18), lessonsInPackage: 8, lessonsLeft: 0, phone: '', notes: 'брат Миши' },
    ].map((s) => ({ ...s, lastPaid: null, remindedAt: null, archived: false }));
    const P = [];
    for (let mo = 1; mo <= 5; mo++) {
      const base = new Date(); base.setMonth(base.getMonth() - mo);
      const ym = `${base.getFullYear()}-${pad(base.getMonth() + 1)}`;
      S.forEach((s, i) => { if (i % 7 !== mo % 3) P.push({ id: uid(), kind: 'income', date: `${ym}-${pad(Math.min(28, s.payDay))}`, amount: s.price, personId: s.id, personName: s.name, note: '' }); });
      T.forEach((tt) => P.push({ id: uid(), kind: 'salary', date: `${ym}-${pad(tt.payDay)}`, amount: tt.payType === 'perLesson' ? tt.rate * (10 + mo) : tt.rate, personId: tt.id, personName: tt.name, note: '' }));
    }
    P.push({ id: uid(), kind: 'income', date: d(-1), amount: 6000, personId: 's5', personName: 'Кирилл Орлов', note: 'перевод' });
    P.push({ id: uid(), kind: 'other', date: d(-2), amount: 15000, personId: '', personName: 'Аренда', note: 'октябрь' });
    state = { settings: Object.assign({}, state.settings), students: S, teachers: T.map((x) => ({ ...x, lastPaid: null, archived: false })), payments: P };
    save(); render(); toast('Пример данных загружен');
  }

  // ---------- События ----------
  document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (!b) return; activeTab = b.dataset.tab; render(); window.scrollTo(0, 0); });
  view.addEventListener('click', (e) => {
    const go = e.target.closest('[data-tab-go]'); if (go) { activeTab = go.dataset.tabGo; render(); return; }
    const sf = e.target.closest('[data-sfilter]'); if (sf) { ui.studentFilter = sf.dataset.sfilter; render(); return; }
    const tf = e.target.closest('[data-tfilter]'); if (tf) { ui.teacherFilter = tf.dataset.tfilter; render(); return; }
    const hf = e.target.closest('[data-hfilter]'); if (hf) { ui.historyKind = hf.dataset.hfilter; render(); return; }
    const cal = e.target.closest('[data-cal]'); if (cal) {
      const n = Number(cal.dataset.cal);
      if (n === 0) ui.calMonth = null; else { const base = ui.calMonth ? parseISO(ui.calMonth + '-01') : new Date(); const d = new Date(base.getFullYear(), base.getMonth() + n, 1); ui.calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
      render(); return;
    }
    const day = e.target.closest('[data-day]'); if (day) { ui.calSelected = ui.calSelected === day.dataset.day ? null : day.dataset.day; render(); return; }
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const { act, id } = btn.dataset;
    switch (act) {
      case 'add-student': studentForm(null); break;
      case 'edit-student': studentForm(state.students.find((s) => s.id === id)); break;
      case 'archive-student': { const s = state.students.find((x) => x.id === id); s.archived = !s.archived; save(); render(); toast(s.archived ? 'Ученик в архиве' : 'Ученик возвращён'); break; }
      case 'add-teacher': teacherForm(null); break;
      case 'edit-teacher': teacherForm(state.teachers.find((t) => t.id === id)); break;
      case 'archive-teacher': { const t = state.teachers.find((x) => x.id === id); t.archived = !t.archived; save(); render(); toast(t.archived ? 'Преподаватель в архиве' : 'Преподаватель возвращён'); break; }
      case 'pay-student': payForm('income', id); break;
      case 'pay-teacher': payForm('salary', id); break;
      case 'remind': remindStudent(id); break;
      case 'lesson-done': lessonDone(id); break;
      case 'teacher-lesson-plus': teacherLesson(id, 1); break;
      case 'teacher-lesson-minus': teacherLesson(id, -1); break;
      case 'del-payment': deletePayment(id); break;
      case 'manual-payment': manualPaymentForm(); break;
      case 'chart-toggle': ui.chartTable = !ui.chartTable; render(); break;
      case 'export': exportJSON(); break;
      case 'export-csv': exportCSV(); break;
      case 'demo': if (!state.students.length && !state.teachers.length || confirm('Заменить текущие данные примером?')) loadDemo(); break;
      case 'wipe': if (confirm('Удалить все данные без возможности восстановления?')) { state = defaultState(); save(); render(); toast('Данные удалены'); } break;
    }
  });
  view.addEventListener('input', (e) => {
    if (e.target.matches('[data-ssearch]')) { ui.studentSearch = e.target.value; const pos = e.target.selectionStart; render(); const el = view.querySelector('[data-ssearch]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }
  });
  view.addEventListener('change', (e) => {
    if (e.target.matches('[data-setting]')) {
      const k = e.target.dataset.setting; let v = e.target.value;
      if (k === 'remindDays') v = Math.max(0, Math.min(30, Number(v) || 0));
      if (k === 'currency') v = v.trim() || '₽';
      state.settings[k] = v; save(); applyTheme(); render(); toast('Сохранено');
    }
    if (e.target.matches('[data-import]') && e.target.files[0]) importJSON(e.target.files[0]);
  });

  applyTheme();
  render();
})();
