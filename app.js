/* Финансы центра — дашборд директора учебного центра.
   Данные хранятся в localStorage браузера. Экспорт/импорт — на вкладке «Настройки». */
(() => {
  'use strict';

  const STORAGE_KEY = 'edu-finance-v1';
  const SEED_VERSION = 2; // версия данных из таблицы Finances
  const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const KIND_LABEL = { income: 'Оплата ученика', salary: 'Зарплата', expense: 'Расход', otherIncome: 'Доход' };
  const isIn = (p) => p.kind === 'income' || p.kind === 'otherIncome';

  // ---------- Даты ----------
  const pad = (n) => String(n).padStart(2, '0');
  const fmtISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); };
  const todayISO = () => fmtISO(new Date());
  const daysUntil = (iso) => Math.round((parseISO(iso) - parseISO(todayISO())) / 86400000);
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const ymOf = (iso) => iso.slice(0, 7);
  const ymLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`; };
  const ymShift = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  function addMonths(iso, n, keepDay) {
    const d = parseISO(iso);
    const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const day = Math.min(keepDay || d.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
    return fmtISO(new Date(target.getFullYear(), target.getMonth(), day));
  }
  function nextDateForDay(day) {
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
    settings: { currency: '$', remindDays: 3, theme: 'auto', sheets: [] },
    projects: [],
    groups: [],
    students: [],
    teachers: [],
    recurring: [],
    payments: [],
  });
  let state = load();
  let activeTab = 'overview';
  const ui = { project: 'all', studentFilter: 'all', studentGroup: 'all', studentSearch: '', teacherFilter: 'all', calMonth: null, calSelected: null, historyKind: 'all', chartTable: false, expEnd: null };
  let lastDeleted = null;

  function normalize(raw) {
    const s = Object.assign(defaultState(), raw || {});
    s.settings = Object.assign(defaultState().settings, raw && raw.settings || {});
    ['projects', 'groups', 'students', 'teachers', 'recurring', 'payments'].forEach((k) => { if (!Array.isArray(s[k])) s[k] = []; });
    s.payments.forEach((p) => { if (p.kind === 'other') p.kind = 'expense'; if (!('projectId' in p)) p.projectId = ''; if (!('category' in p)) p.category = ''; });
    s.students.forEach((x) => { if (!('groupId' in x)) x.groupId = ''; if (!('projectId' in x)) x.projectId = ''; });
    s.teachers.forEach((x) => { if (!('projectId' in x)) x.projectId = ''; });
    if (!Array.isArray(s.settings.sheets)) s.settings.sheets = [];
    if (s.seedVersion === 2 && s.teachers.length && s.teachers.every((t) => t.payType === 'monthly' && !t.rate && t.notes === 'ставка не указана в таблице')) {
      s.teachers.forEach((t) => { t.payType = 'perGroup'; t.notes = 'суммы за группы не указаны в таблице — заполните в карточках групп'; });
    }
    return s;
  }
  function load() {
    try { const raw = localStorage.getItem(STORAGE_KEY); return normalize(raw ? JSON.parse(raw) : null); }
    catch { return defaultState(); }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { toast('Не удалось сохранить данные в браузере'); }
  }
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // ---------- Форматирование ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const PREFIX_CUR = ['$', '€', '£', '₺'];
  function money(n) {
    n = Number(n) || 0;
    const cur = state.settings.currency;
    const neg = n < 0; const abs = nf.format(Math.abs(n));
    const s = PREFIX_CUR.includes(cur) ? `${cur}${abs}` : `${abs} ${cur}`;
    return neg ? `−${s}` : s;
  }

  // ---------- Справочники ----------
  const byId = (arr, id) => arr.find((x) => x.id === id);
  const teacherById = (id) => byId(state.teachers, id);
  const groupById = (id) => byId(state.groups, id);
  const projectById = (id) => byId(state.projects, id);
  const projectName = (id) => (projectById(id) || {}).name || '';
  const inProject = (x) => ui.project === 'all' || (x.projectId || '') === ui.project;
  const activeStudents = () => state.students.filter((s) => !s.archived && inProject(s));
  const activeTeachers = () => state.teachers.filter((t) => !t.archived && (ui.project === 'all' || !t.projectId || t.projectId === ui.project));
  const activeGroups = () => state.groups.filter((g) => !g.archived && inProject(g));
  const activeRecurring = () => state.recurring.filter((r) => !r.archived && inProject(r));
  const paymentsFiltered = () => state.payments.filter(inProject);

  // ---------- Статусы ----------
  function dateStatus(iso) {
    if (!iso) return 'ok';
    const n = daysUntil(iso);
    if (n < 0) return 'overdue';
    if (n === 0) return 'today';
    if (n <= state.settings.remindDays) return 'soon';
    return 'ok';
  }
  function studentStatus(s) {
    if (s.payType === 'package') {
      if (s.lessonsLeft <= 0) return 'overdue';
      if (s.lessonsLeft <= 1) return 'soon';
      return 'ok';
    }
    return dateStatus(s.nextDue);
  }
  const teacherStatus = (t) => t.payType === 'perGroup'
    ? (payoutItems().filter((i) => i.teacher.id === t.id && i.amount > 0).map((i) => i.status).sort((a, b) => STATUS_ORDER[a] - STATUS_ORDER[b])[0] || 'ok')
    : dateStatus(t.nextDue);
  const recurringStatus = (r) => dateStatus(r.nextDue);
  const studentAmount = (s) => Number(s.price) || 0;
  const teacherAmount = (t) => t.payType === 'perGroup' ? payoutItems().filter((i) => i.teacher.id === t.id).reduce((a, i) => a + i.amount, 0) : t.payType === 'perLesson' ? (Number(t.rate) || 0) * (Number(t.lessonsDone) || 0) : Number(t.rate) || 0;
  const TEACHER_PAY_LABEL = { monthly: 'оклад', perLesson: 'за занятие', perGroup: 'за группу / индивидуалку' };
  // Оплата преподавателю за конкретную группу или индивидуального ученика (схема «за группу»)
  const getPay = (x, defaultDay) => { if (!x.pay) x.pay = { mode: 'fixed', amount: 0, payDay: defaultDay || 1, nextDue: nextDateForDay(defaultDay || 1), lastPaid: null }; return x.pay; };
  function payoutAmount(pay, studentIds) {
    if (pay.mode !== 'percent') return Number(pay.amount) || 0;
    const since = pay.lastPaid || fmtISO(new Date(Date.now() - 31 * 86400000));
    const sum = state.payments.filter((p) => p.kind === 'income' && studentIds.includes(p.personId) && p.date > since && p.date <= todayISO()).reduce((a, p) => a + p.amount, 0);
    return Math.round(sum * (Number(pay.amount) || 0)) / 100;
  }
  function payoutItems() {
    const items = [];
    const perGroupTeacher = (id) => { const t = teacherById(id); return t && !t.archived && t.payType === 'perGroup' ? t : null; };
    state.groups.filter((g) => !g.archived && inProject(g)).forEach((g) => {
      const t = perGroupTeacher(g.teacherId); if (!t) return;
      const pay = getPay(g, g.payDay);
      const ids = state.students.filter((x) => x.groupId === g.id && !x.archived).map((x) => x.id);
      items.push({ id: 'g:' + g.id, kind: 'group', ref: g, pay, teacher: t, name: g.name, amount: payoutAmount(pay, ids), nextDue: pay.nextDue, status: dateStatus(pay.nextDue) });
    });
    state.students.filter((x) => !x.archived && !x.groupId && inProject(x)).forEach((x) => {
      const t = perGroupTeacher(x.teacherId); if (!t) return;
      const pay = getPay(x, x.payDay);
      items.push({ id: 's:' + x.id, kind: 'student', ref: x, pay, teacher: t, name: x.name, amount: payoutAmount(pay, [x.id]), nextDue: pay.nextDue, status: dateStatus(pay.nextDue) });
    });
    return items.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.nextDue.localeCompare(b.nextDue));
  }
  const payoutById = (id) => payoutItems().find((i) => i.id === id);
  const payoutText = (it) => `${it.pay.mode === 'percent' ? `${it.pay.amount}% от оплат${it.pay.lastPaid ? ' с ' + fmtDate(it.pay.lastPaid) : ' за 31 день'}` : `${money(it.pay.amount)} в месяц`}, ${it.pay.payDay}-го`;
  const STATUS_LABEL = { overdue: 'Просрочено', today: 'Сегодня', soon: 'Скоро', ok: 'В порядке' };
  const STATUS_ORDER = { overdue: 0, today: 1, soon: 2, ok: 3 };
  const needsAction = (st) => st !== 'ok';
  const badge = (st) => `<span class="badge ${st}">${STATUS_LABEL[st]}</span>`;

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
  function sumPayments(pred, ym) {
    return paymentsFiltered().filter((p) => pred(p) && (!ym || ymOf(p.date) === ym)).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  }
  const sumIn = (ym) => sumPayments(isIn, ym);
  const sumOut = (ym) => sumPayments((p) => !isIn(p), ym);

  // ---------- Действия ----------
  function addPayment(p) { state.payments.unshift(Object.assign({ id: uid(), category: '', projectId: '', note: '' }, p, { amount: Number(p.amount) || 0 })); }
  function markStudentPaid(id, amount, date, note) {
    const s = byId(state.students, id); if (!s) return;
    addPayment({ kind: 'income', date, amount, personId: s.id, personName: s.name, projectId: s.projectId, category: (groupById(s.groupId) || {}).name || '', note });
    if (s.payType === 'package') s.lessonsLeft = (Number(s.lessonsLeft) || 0) + (Number(s.lessonsInPackage) || 0);
    else s.nextDue = addMonths(s.nextDue, 1, Number(s.payDay) || undefined);
    s.lastPaid = date; s.remindedAt = null;
    save(); render(); toast(`Оплата от ${s.name} записана`);
  }
  function markTeacherPaid(id, amount, date, note) {
    const t = byId(state.teachers, id); if (!t) return;
    addPayment({ kind: 'salary', date, amount, personId: t.id, personName: t.name, projectId: t.projectId, category: 'Зарплаты', note });
    t.nextDue = addMonths(t.nextDue, 1, Number(t.payDay) || undefined);
    if (t.payType === 'perLesson') t.lessonsDone = 0;
    t.lastPaid = date;
    save(); render(); toast(`Выплата ${t.name} записана`);
  }
  function markPayoutPaid(id, amount, date, note) {
    const it = payoutById(id); if (!it) return;
    addPayment({ kind: 'salary', date, amount, personId: it.teacher.id, personName: it.teacher.name, projectId: it.teacher.projectId || it.ref.projectId || '', category: 'Зарплаты', note: [it.kind === 'group' ? `группа ${it.name}` : `индивидуально: ${it.name}`, note].filter(Boolean).join(' · ') });
    it.pay.nextDue = addMonths(it.pay.nextDue, 1, Number(it.pay.payDay) || undefined); it.pay.lastPaid = date;
    it.teacher.lastPaid = date;
    save(); render(); toast(`Выплата ${it.teacher.name} за ${it.name} записана`);
  }
  function markRecurringPaid(id, amount, date, note) {
    const r = byId(state.recurring, id); if (!r) return;
    addPayment({ kind: 'expense', date, amount, personId: r.id, personName: r.name, projectId: r.projectId, category: r.name, note });
    r.nextDue = addMonths(r.nextDue, 1, Number(r.payDay) || undefined);
    r.lastPaid = date;
    save(); render(); toast(`${r.name}: оплата записана`);
  }
  function remindStudent(id) { const s = byId(state.students, id); if (!s) return; s.remindedAt = todayISO(); save(); render(); toast(`Отмечено: напомнили ${s.name}`); }
  function lessonDone(id) { const s = byId(state.students, id); if (!s) return; s.lessonsLeft = Math.max(0, (Number(s.lessonsLeft) || 0) - 1); save(); render(); }
  function teacherLesson(id, delta) { const t = byId(state.teachers, id); if (!t) return; t.lessonsDone = Math.max(0, (Number(t.lessonsDone) || 0) + delta); save(); render(); }
  function deletePayment(id) {
    const i = state.payments.findIndex((p) => p.id === id); if (i < 0) return;
    lastDeleted = { payment: state.payments[i], index: i };
    state.payments.splice(i, 1); save(); render();
    toast('Запись удалена', { label: 'Вернуть', fn: () => { if (!lastDeleted) return; state.payments.splice(lastDeleted.index, 0, lastDeleted.payment); lastDeleted = null; save(); render(); } });
  }
  function toggleArchive(arr, id, labelOn, labelOff) { const x = byId(arr, id); if (!x) return; x.archived = !x.archived; save(); render(); toast(x.archived ? labelOn : labelOff); }

  // ---------- Модальные окна ----------
  const modal = document.getElementById('modal');
  const modalForm = document.getElementById('modal-form');
  const modalTitle = document.getElementById('modal-title');
  let modalSubmit = null;
  function openModal(title, bodyHTML, onSubmit, submitLabel) {
    modalTitle.textContent = title;
    modalForm.innerHTML = bodyHTML + `<div class="form-actions"><button type="button" class="btn" data-close>Отмена</button><button type="submit" class="btn primary">${submitLabel || 'Сохранить'}</button></div>`;
    modalSubmit = onSubmit;
    modal.hidden = false;
    const first = modalForm.querySelector('input:not([type=hidden]), select, textarea'); if (first) first.focus();
  }
  function closeModal() { modal.hidden = true; modalForm.innerHTML = ''; modalSubmit = null; }
  modalForm.addEventListener('submit', (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(modalForm).entries()); if (modalSubmit) modalSubmit(data); });
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]') || e.target.id === 'modal-close') closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  const field = (label, inner, span, cls = '') => `<div class="field ${span ? 'span-2' : ''} ${cls}"><label>${label}</label>${inner}</div>`;
  const inp = (name, value, type = 'text', extra = '') => `<input class="input" name="${name}" type="${type}" value="${esc(value ?? '')}" ${extra}>`;
  const options = (arr, selected, empty) => (empty ? `<option value="">${empty}</option>` : '') + arr.map((x) => `<option value="${x.id}" ${x.id === selected ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const projectSelect = (name, selected) => `<select name="${name}">${options(state.projects, selected || (ui.project !== 'all' ? ui.project : ''), state.projects.length ? '— без проекта —' : 'Проекты не созданы')}</select>`;
  const bindPayDay = () => {
    const payDayEl = modalForm.querySelector('[name=payDay]'), nextDueEl = modalForm.querySelector('[name=nextDue]');
    if (payDayEl && nextDueEl) payDayEl.addEventListener('change', () => { const v = Number(payDayEl.value); if (v >= 1 && v <= 31) nextDueEl.value = nextDateForDay(v); });
  };

  const payFields = (pay, cls, title) => `
        <div class="field span-2 ${cls}"><label><strong>${title}</strong></label><div class="small muted">Действует для преподавателей со схемой «за группу / индивидуалку».</div></div>
        ${field('Как считать', `<select name="pay_mode"><option value="fixed" ${pay.mode !== 'percent' ? 'selected' : ''}>Фиксированная сумма в месяц</option><option value="percent" ${pay.mode === 'percent' ? 'selected' : ''}>Процент от оплат учеников</option></select>`, false, cls)}
        ${field('Сумма или процент', inp('pay_amount', pay.amount, 'number', 'min="0" step="0.01"'), false, cls)}
        ${field('День выплаты (число месяца)', inp('pay_payDay', pay.payDay, 'number', 'min="1" max="31"'), false, cls)}
        ${field('Следующая выплата', inp('pay_nextDue', pay.nextDue, 'date'), false, cls)}`;
  const readPay = (d, old) => ({ mode: d.pay_mode === 'percent' ? 'percent' : 'fixed', amount: Number(d.pay_amount) || 0, payDay: Math.min(31, Math.max(1, Number(d.pay_payDay) || 1)), nextDue: d.pay_nextDue || nextDateForDay(Number(d.pay_payDay) || 1), lastPaid: (old && old.lastPaid) || null });
  const bindPayFields = () => {
    const d = modalForm.querySelector('[name=pay_payDay]'), n = modalForm.querySelector('[name=pay_nextDue]');
    if (d && n) d.addEventListener('change', () => { const v = Number(d.value); if (v >= 1 && v <= 31) n.value = nextDateForDay(v); });
  };

  function projectForm(p) {
    const isNew = !p; p = p || {};
    openModal(isNew ? 'Новый проект' : 'Проект', `<div class="form-grid">${field('Название', inp('name', p.name, 'text', 'required placeholder="TR-YOS Zone"'), true)}${field('Заметка', inp('notes', p.notes, 'text'), true)}</div>`, (d) => {
      const obj = { id: p.id || uid(), name: d.name.trim(), notes: d.notes.trim() };
      if (isNew) state.projects.push(obj); else Object.assign(p, obj);
      save(); closeModal(); render(); toast(isNew ? 'Проект добавлен' : 'Сохранено');
    });
  }

  function groupForm(g) {
    const isNew = !g; g = g || { payType: 'monthly', payDay: 1, lessonsInPackage: 8, price: '' };
    const html = `
      <div class="form-grid">
        ${field('Название группы', inp('name', g.name, 'text', 'required placeholder="YÖS Математика, вечерняя"'), true)}
        ${field('Проект', projectSelect('projectId', g.projectId))}
        ${field('Преподаватель', `<select name="teacherId">${options(state.teachers.filter((t) => !t.archived), g.teacherId, '— не указан —')}</select>`)}
        ${field('Предмет', inp('subject', g.subject, 'text', 'placeholder="Математика"'))}
        ${field('Расписание', inp('schedule', g.schedule, 'text', 'placeholder="Пн, Ср 18:00"'))}
        ${field('Схема оплаты (по умолчанию)', `<select name="payType" id="f-gpayType"><option value="monthly" ${g.payType === 'monthly' ? 'selected' : ''}>Ежемесячно</option><option value="package" ${g.payType === 'package' ? 'selected' : ''}>Абонемент на N занятий</option></select>`)}
        ${field('Цена для ученика', inp('price', g.price, 'number', 'required min="0" step="0.01"'))}
        ${field('День оплаты', inp('payDay', g.payDay, 'number', 'min="1" max="31"'), false, 'only-monthly')}
        ${field('Занятий в абонементе', inp('lessonsInPackage', g.lessonsInPackage, 'number', 'min="1"'), false, 'only-package')}
        ${field('Заметка', inp('notes', g.notes, 'text'), true)}
        ${payFields(g.pay || { mode: 'fixed', amount: '', payDay: g.payDay || 1, nextDue: nextDateForDay(Number(g.payDay) || 1) }, '', 'Оплата преподавателю за эту группу')}
      </div><p class="form-note">Цена, схема и преподаватель подставляются новым ученикам этой группы; у каждого ученика их можно изменить.</p>`;
    openModal(isNew ? 'Новая группа' : 'Группа', html, (d) => {
      const obj = { id: g.id || uid(), name: d.name.trim(), projectId: d.projectId || '', teacherId: d.teacherId || '', subject: d.subject.trim(), schedule: d.schedule.trim(), payType: d.payType, price: Number(d.price) || 0, payDay: Math.min(31, Math.max(1, Number(d.payDay) || 1)), lessonsInPackage: Number(d.lessonsInPackage) || 1, notes: d.notes.trim(), archived: !!g.archived, pay: readPay(d, g.pay) };
      if (isNew) state.groups.push(obj); else { Object.assign(g, obj); state.students.forEach((s) => { if (s.groupId === g.id) s.projectId = g.projectId; }); }
      save(); closeModal(); render(); toast(isNew ? 'Группа добавлена' : 'Сохранено');
    });
    const sync = () => { const v = modalForm.querySelector('#f-gpayType').value; modalForm.querySelectorAll('.only-monthly').forEach((el) => el.style.display = v === 'monthly' ? '' : 'none'); modalForm.querySelectorAll('.only-package').forEach((el) => el.style.display = v === 'package' ? '' : 'none'); };
    modalForm.querySelector('#f-gpayType').addEventListener('change', sync); sync();
    bindPayFields();
  }

  function studentForm(s, presetGroupId) {
    const isNew = !s;
    const preset = presetGroupId ? groupById(presetGroupId) : null;
    s = s || Object.assign({ payType: 'monthly', payDay: 1, lessonsInPackage: 8, lessonsLeft: 8, price: '', groupId: presetGroupId || '' }, preset ? { payType: preset.payType, payDay: preset.payDay, lessonsInPackage: preset.lessonsInPackage, lessonsLeft: preset.lessonsInPackage, price: preset.price, teacherId: preset.teacherId, subject: preset.subject, projectId: preset.projectId } : {});
    const groupsAll = state.groups.filter((g) => !g.archived);
    const html = `
      <div class="form-grid">
        ${field('Имя ученика', inp('name', s.name, 'text', 'required placeholder="Иван Петров"'), true)}
        ${field('Группа', `<select name="groupId" id="f-group">${options(groupsAll, s.groupId, '— индивидуально —')}</select>`)}
        ${field('Проект', projectSelect('projectId', s.projectId))}
        ${field('Преподаватель', `<select name="teacherId">${options(state.teachers.filter((t) => !t.archived), s.teacherId, '— не указан —')}</select>`)}
        ${field('Предмет', inp('subject', s.subject, 'text', 'placeholder="Математика"'))}
        ${field('Схема оплаты', `<select name="payType" id="f-payType"><option value="monthly" ${s.payType === 'monthly' ? 'selected' : ''}>Ежемесячно</option><option value="package" ${s.payType === 'package' ? 'selected' : ''}>Абонемент на N занятий</option></select>`)}
        ${field('Сумма оплаты', inp('price', s.price, 'number', 'required min="0" step="0.01" placeholder="100"'))}
        ${field('День оплаты (число месяца)', inp('payDay', s.payDay, 'number', 'min="1" max="31"'), false, 'only-monthly')}
        ${field('Следующая оплата', inp('nextDue', s.nextDue || nextDateForDay(Number(s.payDay) || 1), 'date'), false, 'only-monthly')}
        ${field('Занятий в абонементе', inp('lessonsInPackage', s.lessonsInPackage, 'number', 'min="1"'), false, 'only-package')}
        ${field('Осталось занятий', inp('lessonsLeft', s.lessonsLeft, 'number', 'min="0"'), false, 'only-package')}
        ${field('Телефон родителя / ученика', inp('phone', s.phone, 'tel', 'placeholder="+90 ..."'))}
        ${field('Заметка', inp('notes', s.notes, 'text', 'placeholder="скидка 10%"'))}
        ${payFields(s.pay || { mode: 'fixed', amount: '', payDay: s.payDay || 1, nextDue: nextDateForDay(Number(s.payDay) || 1) }, 'only-solo', 'Оплата преподавателю за индивидуальные занятия')}
      </div>`;
    openModal(isNew ? 'Новый ученик' : 'Ученик', html, (d) => {
      const g = groupById(d.groupId);
      const obj = {
        pay: readPay(d, s.pay),
        id: s.id || uid(), name: d.name.trim(), groupId: d.groupId || '', projectId: g ? g.projectId : (d.projectId || ''), subject: d.subject.trim(), teacherId: d.teacherId || '', payType: d.payType,
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
    const syncSolo = () => { const solo = !modalForm.querySelector('#f-group').value; modalForm.querySelectorAll('.only-solo').forEach((el) => el.style.display = solo ? '' : 'none'); };
    syncSolo(); bindPayFields();
    modalForm.querySelector('#f-group').addEventListener('change', (e) => {
      syncSolo();
      const g = groupById(e.target.value); if (!g) return;
      const set = (n, v) => { const el = modalForm.querySelector(`[name=${n}]`); if (el) el.value = v ?? ''; };
      set('projectId', g.projectId); set('teacherId', g.teacherId); set('subject', g.subject); set('payType', g.payType); set('price', g.price); set('payDay', g.payDay); set('nextDue', nextDateForDay(g.payDay)); set('lessonsInPackage', g.lessonsInPackage); if (isNew) set('lessonsLeft', g.lessonsInPackage);
      sync();
    });
    bindPayDay();
  }

  function teacherForm(t) {
    const isNew = !t; t = t || { payType: 'monthly', payDay: 5, rate: '', lessonsDone: 0 };
    const html = `
      <div class="form-grid">
        ${field('Имя преподавателя', inp('name', t.name, 'text', 'required placeholder="Мария Ивановна"'), true)}
        ${field('Проект', `<select name="projectId">${options(state.projects, t.projectId, '— все проекты —')}</select>`)}
        ${field('Предмет', inp('subject', t.subject, 'text', 'placeholder="Математика"'))}
        ${field('Схема оплаты', `<select name="payType" id="f-tpayType"><option value="monthly" ${t.payType === 'monthly' ? 'selected' : ''}>Оклад (фикс. в месяц)</option><option value="perLesson" ${t.payType === 'perLesson' ? 'selected' : ''}>За проведённое занятие</option><option value="perGroup" ${t.payType === 'perGroup' ? 'selected' : ''}>За каждую группу / индивидуалку</option></select>`)}
        ${field('<span id="f-rate-label">Сумма</span>', inp('rate', t.rate, 'number', 'min="0" step="0.01"'), false, 'only-fixed')}
        ${field('День выплаты (число месяца)', inp('payDay', t.payDay, 'number', 'min="1" max="31"'), false, 'only-fixed')}
        ${field('Следующая выплата', inp('nextDue', t.nextDue || nextDateForDay(Number(t.payDay) || 5), 'date'), false, 'only-fixed')}
        ${field('Проведено занятий (не оплачено)', inp('lessonsDone', t.lessonsDone, 'number', 'min="0"'), false, 'only-per')}
        <div class="field span-2 only-group"><div class="form-note">Сумма (или процент от оплат учеников) и день выплаты задаются отдельно в карточке каждой группы и у каждого индивидуального ученика этого преподавателя. Каждая группа станет отдельной строкой в списке «Выплатить».</div></div>
        ${field('Телефон', inp('phone', t.phone, 'tel'))}
        ${field('Заметка', inp('notes', t.notes, 'text'), true)}
      </div>`;
    openModal(isNew ? 'Новый преподаватель' : 'Преподаватель', html, (d) => {
      const obj = { id: t.id || uid(), name: d.name.trim(), projectId: d.projectId || '', subject: d.subject.trim(), payType: d.payType, rate: Number(d.rate) || 0, payDay: Math.min(31, Math.max(1, Number(d.payDay) || 1)), nextDue: d.nextDue || nextDateForDay(Number(d.payDay) || 1), lessonsDone: Number(d.lessonsDone) || 0, phone: d.phone.trim(), notes: d.notes.trim(), lastPaid: t.lastPaid || null, archived: !!t.archived };
      if (isNew) state.teachers.push(obj); else Object.assign(t, obj);
      save(); closeModal(); render(); toast(isNew ? 'Преподаватель добавлен' : 'Сохранено');
    });
    const sync = () => { const v = modalForm.querySelector('#f-tpayType').value; modalForm.querySelectorAll('.only-per').forEach((el) => el.style.display = v === 'perLesson' ? '' : 'none'); modalForm.querySelectorAll('.only-fixed').forEach((el) => el.style.display = v === 'perGroup' ? 'none' : ''); modalForm.querySelectorAll('.only-group').forEach((el) => el.style.display = v === 'perGroup' ? '' : 'none'); modalForm.querySelector('#f-rate-label').textContent = v === 'perLesson' ? 'Ставка за занятие' : 'Оклад в месяц'; };
    modalForm.querySelector('#f-tpayType').addEventListener('change', sync); sync();
    bindPayDay();
  }

  function recurringForm(r) {
    const isNew = !r; r = r || { payDay: 1, amount: '' };
    const html = `
      <div class="form-grid">
        ${field('Название (категория)', inp('name', r.name, 'text', 'required list="categories" placeholder="Zoom - sub"'), true)}
        ${field('Проект', projectSelect('projectId', r.projectId))}
        ${field('Сумма в месяц', inp('amount', r.amount, 'number', 'required min="0" step="0.01"'))}
        ${field('День списания', inp('payDay', r.payDay, 'number', 'min="1" max="31"'))}
        ${field('Следующая оплата', inp('nextDue', r.nextDue || nextDateForDay(Number(r.payDay) || 1), 'date'))}
        ${field('Заметка', inp('notes', r.notes, 'text'), true)}
      </div>${categoriesDatalist()}<p class="form-note">Регулярный расход попадает в список «Выплатить» на обзоре; кнопка «Оплачено» запишет его в таблицу расходов и сдвинет дату на месяц.</p>`;
    openModal(isNew ? 'Новый регулярный расход' : 'Регулярный расход', html, (d) => {
      const obj = { id: r.id || uid(), name: d.name.trim(), projectId: d.projectId || '', amount: Number(d.amount) || 0, payDay: Math.min(31, Math.max(1, Number(d.payDay) || 1)), nextDue: d.nextDue || nextDateForDay(Number(d.payDay) || 1), notes: d.notes.trim(), lastPaid: r.lastPaid || null, archived: !!r.archived };
      if (isNew) state.recurring.push(obj); else Object.assign(r, obj);
      save(); closeModal(); render(); toast(isNew ? 'Регулярный расход добавлен' : 'Сохранено');
    });
    bindPayDay();
  }

  function allCategories() {
    const set = new Set();
    state.payments.filter((p) => p.kind === 'expense' && p.category).forEach((p) => set.add(p.category));
    state.recurring.forEach((r) => set.add(r.name));
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
  }
  const categoriesDatalist = () => `<datalist id="categories">${allCategories().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>`;

  function payForm(kind, id) {
    const it = kind === 'payout' ? payoutById(id) : null;
    const p = kind === 'income' ? byId(state.students, id) : kind === 'salary' ? byId(state.teachers, id) : kind === 'payout' ? (it && it.teacher) : byId(state.recurring, id);
    if (!p) return;
    const amount = kind === 'income' ? studentAmount(p) : kind === 'salary' ? teacherAmount(p) : kind === 'payout' ? it.amount : p.amount;
    let note;
    if (kind === 'income') note = p.payType === 'package' ? `После оплаты добавится ${p.lessonsInPackage} ${plural(p.lessonsInPackage, 'занятие', 'занятия', 'занятий')}.` : `Следующая оплата сдвинется на ${fmtDate(addMonths(p.nextDue, 1, p.payDay))}.`;
    else if (kind === 'payout') note = `${it.kind === 'group' ? 'Группа' : 'Индивидуально'}: ${esc(it.name)} · ${payoutText(it)}. Следующая выплата сдвинется на ${fmtDate(addMonths(it.nextDue, 1, it.pay.payDay))}.`;
    else note = `Следующая выплата сдвинется на ${fmtDate(addMonths(p.nextDue, 1, p.payDay))}.${p.payType === 'perLesson' ? ' Счётчик занятий обнулится.' : ''}`;
    const remember = kind === 'payout' && it.pay.mode !== 'percent' ? `<div class="field span-2"><label class="small"><input type="checkbox" name="remember" checked> Запомнить введённую сумму как оплату преподавателю за ${it.kind === 'group' ? 'эту группу' : 'этого ученика'} на будущее</label></div>` : '';
    const html = `<div class="form-grid">${field('Сумма', inp('amount', amount, 'number', 'required min="0" step="0.01"'))}${field('Дата', inp('date', todayISO(), 'date', 'required'))}${field('Комментарий', inp('note', '', 'text', 'placeholder="перевод на карту, наличные…"'), true)}${remember}</div><p class="form-note">${note}</p>`;
    const title = kind === 'income' ? `Оплата: ${p.name}` : kind === 'salary' ? `Выплата: ${p.name}` : kind === 'payout' ? `Выплата: ${p.name} за ${it.name}` : `Оплата: ${p.name}`;
    openModal(title, html, (d) => {
      closeModal();
      if (kind === 'payout' && d.remember && it.pay.mode !== 'percent' && Number(d.amount) !== Number(it.pay.amount)) it.pay.amount = Number(d.amount) || 0;
      if (kind === 'income') markStudentPaid(id, d.amount, d.date, d.note); else if (kind === 'salary') markTeacherPaid(id, d.amount, d.date, d.note); else if (kind === 'payout') markPayoutPaid(id, d.amount, d.date, d.note); else markRecurringPaid(id, d.amount, d.date, d.note);
    }, 'Записать');
  }

  function manualPaymentForm(preset) {
    preset = preset || {};
    const kind = preset.kind || 'expense';
    const opts = (arr) => options(arr, '', '—');
    const html = `
      <div class="form-grid">
        ${field('Тип', `<select name="kind" id="f-kind"><option value="expense" ${kind === 'expense' ? 'selected' : ''}>Расход</option><option value="otherIncome">Другой доход</option><option value="income">Поступление от ученика</option><option value="salary">Выплата преподавателю</option></select>`)}
        ${field('Проект', projectSelect('projectId', preset.projectId))}
        ${field('Категория', inp('category', preset.category, 'text', 'list="categories" placeholder="Ads - Telegram"'), false, 'only-cat')}
        ${field('Кто', `<select name="personId" id="f-person">${opts([])}</select>`, false, 'only-person')}
        ${field('Сумма', inp('amount', '', 'number', 'required min="0" step="0.01"'))}
        ${field('Дата', inp('date', preset.date || todayISO(), 'date', 'required'))}
        ${field('Комментарий', inp('note', '', 'text'), true)}
      </div>${categoriesDatalist()}<p class="form-note">Ручная запись не меняет даты следующих оплат — для этого используйте кнопки «Оплатил» / «Выплатить» / «Оплачено».</p>`;
    openModal('Запись в историю', html, (d) => {
      const list = d.kind === 'income' ? state.students : d.kind === 'salary' ? state.teachers : [];
      const person = byId(list, d.personId);
      const cat = d.kind === 'salary' ? 'Зарплаты' : (d.category || '').trim();
      addPayment({ kind: d.kind, date: d.date, amount: d.amount, personId: person ? person.id : '', personName: person ? person.name : (cat || (d.kind === 'expense' ? 'Расход' : 'Доход')), category: cat, projectId: d.projectId || (person ? person.projectId : ''), note: d.note || '' });
      save(); closeModal(); render(); toast('Запись добавлена');
    }, 'Записать');
    const kindEl = modalForm.querySelector('#f-kind'), personEl = modalForm.querySelector('#f-person');
    const sync = () => {
      const k = kindEl.value;
      personEl.innerHTML = opts(k === 'income' ? state.students.filter((s) => !s.archived) : k === 'salary' ? state.teachers.filter((t) => !t.archived) : []);
      modalForm.querySelector('.only-person').style.display = k === 'income' || k === 'salary' ? '' : 'none';
      modalForm.querySelector('.only-cat').style.display = k === 'expense' || k === 'otherIncome' ? '' : 'none';
    };
    kindEl.addEventListener('change', sync); sync();
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
    const sel = document.getElementById('project-filter');
    if (ui.project !== 'all' && !projectById(ui.project)) ui.project = 'all';
    sel.innerHTML = `<option value="all">Все проекты</option>` + state.projects.map((p) => `<option value="${p.id}" ${p.id === ui.project ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    sel.hidden = state.projects.length < 2;
    const fn = { overview: renderOverview, groups: renderGroups, students: renderStudents, teachers: renderTeachers, expenses: renderExpenses, calendar: renderCalendar, history: renderHistory, settings: renderSettings }[activeTab];
    view.innerHTML = fn();
    if (activeTab === 'overview') mountChart();
    updateSyncButton();
  }

  const multiProject = () => state.projects.length > 1 && ui.project === 'all';
  const projTag = (id) => id && multiProject() ? `<span class="badge muted">${esc(projectName(id))}</span>` : '';

  function studentRow(s) {
    const st = studentStatus(s);
    const g = groupById(s.groupId), t = teacherById(s.teacherId);
    const sub = [g ? g.name : s.subject, t ? t.name : null].filter(Boolean).join(' · ');
    return `<div class="row is-${st}">
      <div class="row-main">
        <div class="row-title">${esc(s.name)} ${badge(st)} ${projTag(s.projectId)} ${s.remindedAt ? `<span class="badge muted">напомнили ${fmtDate(s.remindedAt)}</span>` : ''}</div>
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
        <div class="row-title">${esc(t.name)} ${badge(st)} ${projTag(t.projectId)}</div>
        <div class="row-sub">${esc(teacherDueText(t))}${t.subject ? ' · ' + esc(t.subject) : ''}</div>
      </div>
      <div class="row-actions"><span class="row-amount">${money(teacherAmount(t))}</span><button class="btn sm good" data-act="pay-teacher" data-id="${t.id}">Выплатить</button></div></div>`;
  }
  function recurringRow(r) {
    const st = recurringStatus(r);
    return `<div class="row is-${st}">
      <div class="row-main">
        <div class="row-title">${esc(r.name)} ${badge(st)} <span class="badge muted">подписка</span> ${projTag(r.projectId)}</div>
        <div class="row-sub">Списание ${fmtDate(r.nextDue)} · ${relDays(r.nextDue)}${r.notes ? ' · ' + esc(r.notes) : ''}</div>
      </div>
      <div class="row-actions"><span class="row-amount">${money(r.amount)}</span><button class="btn sm good" data-act="pay-recurring" data-id="${r.id}">Оплачено</button></div></div>`;
  }

  function payoutRow(it) {
    return `<div class="row is-${it.status}">
      <div class="row-main">
        <div class="row-title">${esc(it.teacher.name)} <span class="badge muted">${it.kind === 'group' ? 'группа' : 'индивидуально'}: ${esc(it.name)}</span> ${badge(it.status)}</div>
        <div class="row-sub">Выплата ${fmtDate(it.nextDue)} · ${relDays(it.nextDue)} · ${payoutText(it)}</div>
      </div>
      <div class="row-actions"><span class="row-amount">${money(it.amount)}</span><button class="btn sm good" data-act="pay-payout" data-id="${it.id}">Выплатить</button></div></div>`;
  }
  function renderOverview() {
    const students = activeStudents(), teachers = activeTeachers(), recurring = activeRecurring(), groups = activeGroups();
    if (!state.projects.length && !students.length && !teachers.length) {
      return `<div class="card"><div class="empty">
        <h2>Начнём с данных</h2>
        <p>Создайте проекты и группы, добавьте учеников и преподавателей — и дашборд покажет, кому и когда напомнить об оплате, кому выплатить зарплату и какие подписки пора оплатить.</p>
        <div class="toolbar" style="justify-content:center">
          <button class="btn primary" data-act="seed-mine">Загрузить TR-YOS Zone из таблицы</button>
          <button class="btn" data-act="add-sheet">Подключить Google Таблицу</button>
        </div>
        <p class="small muted mt">Первая кнопка переносит данные из файла Finances: 6 групп, учеников с оплатами за июнь–октябрь, преподавателей, расходы по категориям и подписки.</p>
        </div></div>`;
    }
    const banner = state.seedVersion !== SEED_VERSION && !(state.settings.sheets || []).length ? `<div class="card banner"><div><strong>Есть новые данные из таблицы Finances</strong><div class="small muted">6 групп, ученики с оплатами за июнь–октябрь, преподаватели, расходы по категориям. Загрузка заменит текущие данные на сайте.</div></div><div class="toolbar"><button class="btn primary" data-act="seed-mine">Загрузить</button><button class="btn" data-act="dismiss-banner">Скрыть</button></div></div>` : '';
    const dueStudents = students.filter((s) => needsAction(studentStatus(s))).sort((a, b) => STATUS_ORDER[studentStatus(a)] - STATUS_ORDER[studentStatus(b)] || (a.nextDue || '').localeCompare(b.nextDue || ''));
    const outs = [
      ...teachers.filter((t) => t.payType !== 'perGroup' && teacherAmount(t) > 0 && needsAction(teacherStatus(t))).map((t) => ({ kind: 'salary', st: teacherStatus(t), due: t.nextDue, amount: teacherAmount(t), html: teacherRow(t) })),
      ...payoutItems().filter((it) => it.amount > 0 && needsAction(it.status)).map((it) => ({ kind: 'salary', st: it.status, due: it.nextDue, amount: it.amount, html: payoutRow(it) })),
      ...recurring.filter((r) => needsAction(recurringStatus(r))).map((r) => ({ kind: 'expense', st: recurringStatus(r), due: r.nextDue, amount: r.amount, html: recurringRow(r) })),
    ].sort((a, b) => STATUS_ORDER[a.st] - STATUS_ORDER[b.st] || a.due.localeCompare(b.due));
    const collect = dueStudents.reduce((a, s) => a + studentAmount(s), 0);
    const payout = outs.reduce((a, o) => a + o.amount, 0);
    const ym = todayISO().slice(0, 7);
    const incomeM = sumIn(ym), outM = sumOut(ym);
    const overdueStudents = dueStudents.filter((s) => studentStatus(s) === 'overdue').length;
    const overdueOuts = outs.filter((o) => o.st === 'overdue').length;
    const balance = incomeM - outM;

    const upcoming = [];
    for (let i = 0; i <= 7; i++) {
      const iso = fmtISO(new Date(Date.now() + i * 86400000));
      students.filter((s) => s.payType === 'monthly' && s.nextDue === iso).forEach((s) => upcoming.push({ iso, kind: 'in', name: s.name, amount: studentAmount(s) }));
      teachers.filter((t) => t.payType !== 'perGroup' && t.nextDue === iso && teacherAmount(t) > 0).forEach((t) => upcoming.push({ iso, kind: 'out', name: t.name, amount: teacherAmount(t) }));
      payoutItems().filter((it) => it.nextDue === iso && it.amount > 0).forEach((it) => upcoming.push({ iso, kind: 'out', name: `${it.teacher.name} · ${it.name}`, amount: it.amount }));
      recurring.filter((r) => r.nextDue === iso).forEach((r) => upcoming.push({ iso, kind: 'out', name: r.name, amount: r.amount }));
    }
    const groupRows = groups.map((g) => {
      const gs = students.filter((s) => s.groupId === g.id);
      const due = gs.filter((s) => needsAction(studentStatus(s)));
      return { g, n: gs.length, due: due.length, overdue: due.filter((s) => studentStatus(s) === 'overdue').length, sum: due.reduce((a, s) => a + studentAmount(s), 0), expected: gs.reduce((a, s) => a + studentAmount(s), 0) };
    }).sort((a, b) => b.overdue - a.overdue || b.due - a.due);

    return `${banner}
      <div class="tiles">
        <div class="tile is-hero"><div class="label">Собрать с учеников сейчас</div><div class="value">${money(collect)}</div><div class="delta">${dueStudents.length} ${plural(dueStudents.length, 'ученик', 'ученика', 'учеников')}${overdueStudents ? `, просрочено ${overdueStudents}` : ''}</div></div>
        <div class="tile"><div class="label">Выплатить и оплатить</div><div class="value">${money(payout)}</div><div class="delta">${outs.length} ${plural(outs.length, 'платёж', 'платежа', 'платежей')}${overdueOuts ? `, просрочено ${overdueOuts}` : ''}</div></div>
        <div class="tile"><div class="label">Получено в ${MONTHS_IN[new Date().getMonth()]}</div><div class="value">${money(incomeM)}</div><div class="delta">потрачено ${money(outM)}</div></div>
        <div class="tile"><div class="label">Баланс месяца</div><div class="value ${balance < 0 ? 'neg' : ''}">${money(balance)}</div><div class="delta">доходы − расходы за месяц</div></div>
      </div>
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h2>Напомнить об оплате</h2><span class="hint">просрочено → сегодня → скоро</span></div>
          ${dueStudents.length ? `<div class="list">${dueStudents.map(studentRow).join('')}</div>` : `<div class="empty">Все ученики оплатили. Напоминания появятся за ${state.settings.remindDays} ${plural(state.settings.remindDays, 'день', 'дня', 'дней')} до срока.</div>`}
        </section>
        <section class="card">
          <div class="card-head"><h2>Выплатить и оплатить</h2><span class="hint">зарплаты и подписки</span></div>
          ${outs.length ? `<div class="list">${outs.map((o) => o.html).join('')}</div>` : `<div class="empty">Ближайших выплат нет.</div>`}
        </section>
      </div>
      <div class="grid-2" style="margin-top:16px">
        <section class="card">
          <div class="card-head"><h2>По группам</h2><button class="btn sm" data-tab-go="groups">Группы →</button></div>
          ${groupRows.length ? `<div class="table-wrap"><table><thead><tr><th>Группа</th><th class="num">Учеников</th><th class="num">Ждём оплату</th><th class="num">К сбору</th></tr></thead><tbody>
            ${groupRows.map((r) => `<tr><td><strong>${esc(r.g.name)}</strong>${multiProject() && r.g.projectId ? `<div class="sub">${esc(projectName(r.g.projectId))}</div>` : ''}</td><td class="num">${r.n}</td><td class="num">${r.due ? `<span class="badge ${r.overdue ? 'overdue' : 'soon'}">${r.due}${r.overdue ? ` / ${r.overdue} проср.` : ''}</span>` : '<span class="badge ok">0</span>'}</td><td class="num">${money(r.sum)}<div class="sub">из ${money(r.expected)}</div></td></tr>`).join('')}
          </tbody></table></div>` : `<div class="empty">Групп пока нет. <button class="btn sm" data-act="add-group">+ Группа</button></div>`}
        </section>
        <section class="card">
          <div class="card-head"><h2>Ближайшие 7 дней</h2><button class="btn sm" data-tab-go="calendar">Календарь →</button></div>
          ${upcoming.length ? `<div class="table-wrap"><table><thead><tr><th>Дата</th><th>Кто</th><th class="num">Сумма</th></tr></thead><tbody>
            ${upcoming.map((u) => `<tr><td>${fmtDate(u.iso)} <span class="sub">${relDays(u.iso)}</span></td><td><span class="cal-chip ${u.kind}" style="display:inline-flex">${esc(u.name)}</span></td><td class="num">${u.kind === 'in' ? '+' : '−'}${money(u.amount)}</td></tr>`).join('')}
          </tbody></table></div>` : `<div class="empty">На неделю вперёд платежей по графику нет.</div>`}
        </section>
      </div>
      <section class="card mt">
        <div class="card-head"><h2>Доходы и расходы по месяцам</h2><div class="toolbar"><button class="btn sm" data-tab-go="expenses">Таблица помесячно →</button><button class="btn sm" data-act="chart-toggle">${ui.chartTable ? 'График' : 'Таблица'}</button></div></div>
        <div id="chart"></div>
      </section>`;
  }

  function mountChart() {
    const el = document.getElementById('chart'); if (!el) return;
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      months.push({ ym, label: MONTHS_SHORT[d.getMonth()], income: sumIn(ym), out: sumOut(ym) });
    }
    const legend = `<div class="legend mt"><span><i style="background:var(--series-1)"></i>Доходы</span><span><i style="background:var(--series-2)"></i>Расходы (зарплаты, подписки, прочее)</span></div>`;
    if (ui.chartTable) {
      el.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Месяц</th><th class="num">Доходы</th><th class="num">Расходы</th><th class="num">Баланс</th></tr></thead><tbody>${months.map((m) => `<tr><td>${m.label} ${m.ym.slice(0, 4)}</td><td class="num">${money(m.income)}</td><td class="num">${money(m.out)}</td><td class="num">${money(m.income - m.out)}</td></tr>`).join('')}</tbody></table></div>`;
      return;
    }
    const W = 760, H = 220, padL = 52, padR = 8, padT = 10, padB = 28;
    const max = Math.max(1, ...months.flatMap((m) => [m.income, m.out]));
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
      svg += bar(cx - barW - gap / 2, y(m.income), barW, padT + plotH - y(m.income), 's1');
      svg += bar(cx + gap / 2, y(m.out), barW, padT + plotH - y(m.out), 's2');
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
      tip.innerHTML = `<strong>${m.label} ${m.ym.slice(0, 4)}</strong><div class="t-row"><span><i style="background:var(--series-1)"></i>Доходы</span><b>${money(m.income)}</b></div><div class="t-row"><span><i style="background:var(--series-2)"></i>Расходы</span><b>${money(m.out)}</b></div><div class="t-row"><span>Баланс</span><b>${money(m.income - m.out)}</b></div>`;
      const r = wrap.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(e.clientX - r.left, 90), r.width - 90)}px`; tip.style.top = `${Math.max(e.clientY - r.top - 12, 70)}px`;
    });
    wrap.addEventListener('mouseleave', () => { if (tip) { tip.remove(); tip = null; } });
  }
  function bar(x, y, w, h, cls) {
    if (h <= 0.5) return '';
    const r = Math.min(4, h, w / 2);
    return `<path class="bar ${cls}" d="M${x} ${y + h} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h} Z"/>`;
  }
  function niceCeil(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10; return step * p; }
  function shortNum(v) { const f = (x) => String(Math.round(x * 10) / 10).replace('.', ','); if (v >= 1e6) return `${f(v / 1e6)}М`; if (v >= 1e3) return `${f(v / 1e3)}К`; return String(Math.round(v)); }

  function renderPaymentsTable() {
    const cur = todayISO().slice(0, 7);
    const months = []; for (let i = 5; i >= 0; i--) months.push(ymShift(cur, -i));
    const endOfMonth = `${cur}-${pad(daysInMonth(Number(cur.slice(0, 4)), Number(cur.slice(5, 7)) - 1))}`;
    const paid = {};
    paymentsFiltered().forEach((p) => { if (p.kind === 'income' && p.personId) { const k = p.personId + '|' + ymOf(p.date); paid[k] = (paid[k] || 0) + p.amount; } });
    const cell = (s, ym) => {
      const v = paid[s.id + '|' + ym];
      if (v) return `<td class="num pcell paid" title="Оплачено ${money(v)}">${money(v)}</td>`;
      if (ym === cur && s.payType === 'monthly' && s.nextDue && s.nextDue <= endOfMonth) return `<td class="num pcell due" data-act="pay-student" data-id="${s.id}" title="Ожидается ${s.price ? money(s.price) : ''} к ${fmtDate(s.nextDue)} — нажмите, чтобы записать оплату">${s.price ? money(s.price) : '?'}</td>`;
      if (ym === cur && s.payType === 'package' && s.lessonsLeft <= 1) return `<td class="num pcell due" data-act="pay-student" data-id="${s.id}" title="Абонемент заканчивается">${money(s.price)}</td>`;
      return `<td class="num pcell zero">·</td>`;
    };
    const studentRowHtml = (s) => `<tr><td><span class="name">${esc(s.name)}</span>${s.notes ? `<div class="sub">${esc(s.notes)}</div>` : ''}</td>${months.map((ym) => cell(s, ym)).join('')}</tr>`;
    const sections = [];
    activeGroups().forEach((g) => {
      const gs = activeStudents().filter((s) => s.groupId === g.id).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      const t = teacherById(g.teacherId);
      sections.push(`<tr class="month-head"><td colspan="${months.length + 1}">${esc(g.name)} <span class="sub">· ${g.payDay}-го числа${t ? ' · ' + esc(t.name) : ''}${g.schedule ? ' · ' + esc(g.schedule) : ''}</span></td></tr>` + (gs.length ? gs.map(studentRowHtml).join('') : `<tr><td colspan="${months.length + 1}" class="muted small">нет учеников</td></tr>`));
    });
    const solo = activeStudents().filter((s) => !s.groupId).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    if (solo.length) sections.push(`<tr class="month-head"><td colspan="${months.length + 1}">Индивидуально</td></tr>` + solo.map(studentRowHtml).join(''));
    const totals = months.map((ym) => Object.entries(paid).reduce((a, [k, v]) => a + (k.endsWith('|' + ym) ? v : 0), 0));
    const expected = activeStudents().filter((s) => s.payType === 'monthly' && s.nextDue && s.nextDue <= endOfMonth && !paid[s.id + '|' + cur]);
    return `<div class="card"><div class="table-wrap"><table class="matrix pay-table"><thead><tr><th>Ученик</th>${months.map((ym) => `<th class="num ${ym === cur ? 'cur' : ''}">${ymLabel(ym)}</th>`).join('')}</tr></thead>
      <tbody>${sections.join('') || `<tr><td colspan="${months.length + 1}" class="muted">Учеников пока нет.</td></tr>`}</tbody>
      <tfoot><tr><td><strong>${activeStudents().length} ${plural(activeStudents().length, 'ученик', 'ученика', 'учеников')}</strong></td>${totals.map((v, i) => `<td class="num"><strong>${money(v)}</strong>${months[i] === cur && expected.length ? `<div class="sub">ждём ${money(expected.reduce((a, s) => a + s.price, 0))} (${expected.length})</div>` : ''}</td>`).join('')}</tr></tfoot></table></div>
      <p class="small muted mt">Зелёное — оплачено в этом месяце, красное — ожидается в текущем месяце (нажмите, чтобы записать оплату).</p></div>`;
  }
  function renderGroups() {
    const groups = state.groups.filter((g) => inProject(g)).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'ru'));
    const viewSeg = `<div class="seg"><button class="${ui.groupsView !== 'table' ? 'is-active' : ''}" data-gview="cards">Карточки</button><button class="${ui.groupsView === 'table' ? 'is-active' : ''}" data-gview="table">Таблица оплат</button></div>`;
    if (ui.groupsView === 'table') {
      return `<div class="page-head"><h1>Группы <span class="muted small">${groups.filter((g) => !g.archived).length}</span></h1>
        <div class="toolbar">${viewSeg}<button class="btn primary" data-act="add-group">+ Группа</button></div></div>${renderPaymentsTable()}`;
    }
    const cards = groups.map((g) => {
      const gs = state.students.filter((s) => s.groupId === g.id && !s.archived).sort((a, b) => STATUS_ORDER[studentStatus(a)] - STATUS_ORDER[studentStatus(b)] || a.name.localeCompare(b.name, 'ru'));
      const t = teacherById(g.teacherId);
      const due = gs.filter((s) => needsAction(studentStatus(s)));
      const expected = gs.reduce((a, s) => a + studentAmount(s), 0);
      return `<section class="card group-card ${g.archived ? 'is-archived' : ''}">
        <div class="card-head">
          <div><h2>${esc(g.name)} ${g.archived ? '<span class="badge muted">архив</span>' : ''}</h2>
            <div class="small muted">${[multiProject() && g.projectId ? projectName(g.projectId) : null, g.subject, t ? t.name : null, g.schedule].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div></div>
          <div class="row-actions">
            ${!g.archived ? `<button class="btn sm" data-act="add-student-to" data-id="${g.id}">+ Ученик</button>` : ''}
            <button class="btn sm" data-act="edit-group" data-id="${g.id}">✎</button>
            <button class="btn sm" data-act="archive-group" data-id="${g.id}" title="${g.archived ? 'Вернуть' : 'В архив'}">${g.archived ? '↩' : '🗄'}</button>
          </div>
        </div>
        <div class="group-stats">
          <div><div class="label">Учеников</div><div class="v">${gs.length}</div></div>
          <div><div class="label">Ждём оплату</div><div class="v ${due.length ? 'warn' : ''}">${due.length}</div></div>
          <div><div class="label">Цена</div><div class="v">${money(g.price)}<span class="small muted"> / ${g.payType === 'package' ? `${g.lessonsInPackage} зан.` : 'мес'}</span></div></div>
          <div><div class="label">Ожидаемый доход</div><div class="v">${money(expected)}</div></div>
        </div>
        ${t && t.payType === 'perGroup' ? (() => { const it = payoutItems().find((x) => x.id === 'g:' + g.id); return it ? (it.amount > 0 ? `<div class="teacher-pay">Преподавателю: <strong>${money(it.amount)}</strong> · ${payoutText(it)} · ${fmtDate(it.nextDue)} ${badge(it.status)} <button class="btn sm good" data-act="pay-payout" data-id="${it.id}">Выплатить</button></div>` : `<div class="teacher-pay">Преподавателю: <span class="muted">сумма не задана</span> <button class="btn sm" data-act="edit-group" data-id="${g.id}">✎ задать</button></div>`) : ''; })() : ''}
        ${gs.length ? `<div class="chips">${gs.map((s) => { const st = studentStatus(s); return `<button class="chip ${st}" data-act="pay-student" data-id="${s.id}" title="${esc(studentDueText(s))} — нажмите, чтобы записать оплату">${esc(s.name)}<span class="chip-st">${st === 'ok' ? '✓' : st === 'overdue' ? '!' : '•'}</span></button>`; }).join('')}</div>` : `<div class="small muted">В группе пока нет учеников.</div>`}
      </section>`;
    }).join('');
    const solo = activeStudents().filter((s) => !s.groupId);
    return `
      <div class="page-head"><h1>Группы <span class="muted small">${groups.filter((g) => !g.archived).length}</span></h1>
        <div class="toolbar"><div class="legend"><span><i style="background:var(--ok)"></i>оплачено</span><span><i style="background:var(--soon)"></i>скоро / сегодня</span><span><i style="background:var(--overdue)"></i>просрочено</span></div>${viewSeg}<button class="btn primary" data-act="add-group">+ Группа</button></div></div>
      ${groups.length ? `<div class="groups-grid">${cards}</div>` : `<div class="card"><div class="empty"><p>Групп пока нет. Группа задаёт цену, схему оплаты и преподавателя для своих учеников.</p><button class="btn primary" data-act="add-group">+ Создать группу</button></div></div>`}
      ${solo.length ? `<section class="card mt"><div class="card-head"><h2>Индивидуально <span class="muted small">${solo.length}</span></h2></div><div class="chips">${solo.map((s) => { const st = studentStatus(s); return `<button class="chip ${st}" data-act="pay-student" data-id="${s.id}" title="${esc(studentDueText(s))}">${esc(s.name)}<span class="chip-st">${st === 'ok' ? '✓' : st === 'overdue' ? '!' : '•'}</span></button>`; }).join('')}</div></section>` : ''}`;
  }

  function renderStudents() {
    const q = ui.studentSearch.trim().toLowerCase();
    let list = state.students.filter((s) => inProject(s) && (ui.studentFilter === 'archived' ? s.archived : !s.archived));
    if (ui.studentFilter === 'due') list = list.filter((s) => needsAction(studentStatus(s)));
    if (ui.studentFilter === 'ok') list = list.filter((s) => studentStatus(s) === 'ok');
    if (ui.studentGroup !== 'all') list = list.filter((s) => (s.groupId || '') === (ui.studentGroup === 'solo' ? '' : ui.studentGroup));
    if (q) list = list.filter((s) => [s.name, s.subject, (teacherById(s.teacherId) || {}).name, (groupById(s.groupId) || {}).name, s.notes].join(' ').toLowerCase().includes(q));
    list.sort((a, b) => STATUS_ORDER[studentStatus(a)] - STATUS_ORDER[studentStatus(b)] || a.name.localeCompare(b.name, 'ru'));
    const all = activeStudents();
    const counts = { all: all.length, due: all.filter((s) => needsAction(studentStatus(s))).length, archived: state.students.filter((s) => s.archived && inProject(s)).length };
    const seg = (k, label) => `<button class="${ui.studentFilter === k ? 'is-active' : ''}" data-sfilter="${k}">${label}</button>`;
    const monthlyTotal = all.filter((s) => s.payType === 'monthly').reduce((a, s) => a + studentAmount(s), 0);
    const groupOpts = `<option value="all">Все группы</option><option value="solo" ${ui.studentGroup === 'solo' ? 'selected' : ''}>Индивидуально</option>` + activeGroups().map((g) => `<option value="${g.id}" ${ui.studentGroup === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
    return `
      <div class="page-head"><h1>Ученики <span class="muted small">${counts.all}</span></h1>
        <div class="toolbar"><input class="input sm" placeholder="Поиск…" value="${esc(ui.studentSearch)}" data-ssearch><button class="btn primary" data-act="add-student">+ Ученик</button></div></div>
      <div class="filters"><div class="seg">${seg('all', 'Все')}${seg('due', `Требуют внимания (${counts.due})`)}${seg('ok', 'В порядке')}${seg('archived', `Архив (${counts.archived})`)}</div>
        <select class="input sm" data-sgroup>${groupOpts}</select>
        <span class="muted small" style="align-self:center">Ежемесячно по графику: ${money(monthlyTotal)}</span></div>
      <div class="card">${list.length ? `<div class="table-wrap"><table class="responsive"><thead><tr><th>Ученик</th><th>Статус</th><th>Оплата</th><th>Группа</th><th class="num">Сумма</th><th></th></tr></thead><tbody>
        ${list.map((s) => { const st = studentStatus(s); const t = teacherById(s.teacherId); const g = groupById(s.groupId); return `<tr>
          <td data-l="Ученик"><div><strong>${esc(s.name)}</strong></div><div class="sub">${[s.subject, s.notes].filter(Boolean).map(esc).join(' · ')}</div></td>
          <td data-l="Статус"><div>${badge(st)}</div>${s.remindedAt ? `<div class="sub">напомнили ${fmtDate(s.remindedAt)}</div>` : ''}</td>
          <td data-l="Оплата"><div>${esc(studentDueText(s))}</div><div class="sub">${s.payType === 'package' ? 'абонемент' : `ежемесячно, ${s.payDay}-го`}${s.lastPaid ? ` · последняя ${fmtDate(s.lastPaid)}` : ''}</div></td>
          <td data-l="Группа"><div>${g ? esc(g.name) : '<span class="muted">индивидуально</span>'}</div><div class="sub">${[t ? t.name : null, multiProject() && s.projectId ? projectName(s.projectId) : null].filter(Boolean).map(esc).join(' · ')}</div></td>
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
    let list = state.teachers.filter((t) => (ui.project === 'all' || !t.projectId || t.projectId === ui.project) && (ui.teacherFilter === 'archived' ? t.archived : !t.archived));
    if (ui.teacherFilter === 'due') list = list.filter((t) => needsAction(teacherStatus(t)));
    list.sort((a, b) => STATUS_ORDER[teacherStatus(a)] - STATUS_ORDER[teacherStatus(b)] || a.name.localeCompare(b.name, 'ru'));
    const seg = (k, label) => `<button class="${ui.teacherFilter === k ? 'is-active' : ''}" data-tfilter="${k}">${label}</button>`;
    const fund = activeTeachers().reduce((a, t) => a + teacherAmount(t), 0);
    return `
      <div class="page-head"><h1>Преподаватели <span class="muted small">${activeTeachers().length}</span></h1><div class="toolbar"><button class="btn primary" data-act="add-teacher">+ Преподаватель</button></div></div>
      <div class="filters"><div class="seg">${seg('all', 'Все')}${seg('due', `К выплате (${activeTeachers().filter((t) => needsAction(teacherStatus(t))).length})`)}${seg('archived', `Архив (${state.teachers.filter((t) => t.archived).length})`)}</div>
        <span class="muted small" style="align-self:center">Начислено к ближайшей выплате: ${money(fund)}</span></div>
      <div class="card">${list.length ? `<div class="table-wrap"><table class="responsive"><thead><tr><th>Преподаватель</th><th>Статус</th><th>Выплата</th><th>Группы</th><th class="num">К выплате</th><th></th></tr></thead><tbody>
        ${list.map((t) => { const st = teacherStatus(t); const gs = state.groups.filter((g) => g.teacherId === t.id && !g.archived); const n = state.students.filter((s) => s.teacherId === t.id && !s.archived).length; return `<tr>
          <td data-l="Преподаватель"><div><strong>${esc(t.name)}</strong></div><div class="sub">${[t.subject, multiProject() && t.projectId ? projectName(t.projectId) : null, t.notes].filter(Boolean).map(esc).join(' · ')}</div></td>
          <td data-l="Статус"><div>${badge(st)}</div></td>
          <td data-l="Выплата">${t.payType === 'perGroup' ? (() => { const its = payoutItems().filter((x) => x.teacher.id === t.id); return its.length ? `<div class="payout-list">${its.map((it) => `<div class="payout-item ${it.status}"><span class="badge ${it.status}">${fmtDate(it.nextDue)}</span> <span>${esc(it.name)}</span> <span class="sub">${it.amount > 0 ? money(it.amount) : 'сумма не задана'}</span> ${it.amount > 0 && !t.archived ? `<button class="btn sm good" data-act="pay-payout" data-id="${it.id}">Выплатить</button>` : `<button class="btn sm" data-act="${it.kind === 'group' ? 'edit-group' : 'edit-student'}" data-id="${it.ref.id}" title="Задать сумму">✎ сумма</button>`}</div>`).join('')}</div>` : '<div class="muted">нет групп и индивидуальных учеников</div>'; })() + `<div class="sub">за каждую группу / индивидуалку${t.lastPaid ? ` · последняя ${fmtDate(t.lastPaid)}` : ''}</div>` : `<div>${fmtDate(t.nextDue)} <span class="sub">${relDays(t.nextDue)}</span></div><div class="sub">${t.payType === 'perLesson' ? `${money(t.rate)} за занятие, выплата ${t.payDay}-го` : `оклад ${money(t.rate)}, ${t.payDay}-го`}${t.lastPaid ? ` · последняя ${fmtDate(t.lastPaid)}` : ''}</div>`}</td>
          <td data-l="Группы"><div>${gs.length ? gs.map((g) => esc(g.name)).join(', ') : '<span class="muted">—</span>'}</div><div class="sub">${n} ${plural(n, 'ученик', 'ученика', 'учеников')}</div></td>
          <td class="num" data-l="К выплате"><div>${money(teacherAmount(t))}</div>${t.payType === 'perLesson' ? `<div class="sub">${t.lessonsDone || 0} ${plural(t.lessonsDone || 0, 'занятие', 'занятия', 'занятий')}</div>` : t.payType === 'perGroup' ? `<div class="sub">${payoutItems().filter((x) => x.teacher.id === t.id).length} ${plural(payoutItems().filter((x) => x.teacher.id === t.id).length, 'выплата', 'выплаты', 'выплат')} в месяц</div>` : ''}</td>
          <td class="actions"><div class="row-actions">
            ${t.payType === 'perLesson' && !t.archived ? `<button class="btn sm" data-act="teacher-lesson-minus" data-id="${t.id}">−</button><button class="btn sm" data-act="teacher-lesson-plus" data-id="${t.id}" title="Проведено занятие">+1 занятие</button>` : ''}
            ${!t.archived && t.payType !== 'perGroup' ? `<button class="btn sm good" data-act="pay-teacher" data-id="${t.id}">Выплатить</button>` : ''}
            <button class="btn sm" data-act="edit-teacher" data-id="${t.id}">✎</button>
            <button class="btn sm" data-act="archive-teacher" data-id="${t.id}" title="${t.archived ? 'Вернуть из архива' : 'В архив'}">${t.archived ? '↩' : '🗄'}</button>
          </div></td></tr>`; }).join('')}
        </tbody></table></div>` : `<div class="empty"><p>Пока нет преподавателей.</p>${ui.teacherFilter === 'all' ? `<button class="btn primary" data-act="add-teacher">+ Добавить преподавателя</button>` : ''}</div>`}</div>`;
  }

  // Таблица «Категория \ Месяц» — как в вашем Numbers
  function expenseMatrix(projectId, months) {
    const pays = state.payments.filter((p) => !isIn(p) && (p.projectId || '') === projectId);
    const cats = new Map();
    pays.forEach((p) => { const c = p.kind === 'salary' ? 'Зарплаты' : (p.category || 'Без категории'); if (!cats.has(c)) cats.set(c, {}); const row = cats.get(c); const ym = ymOf(p.date); row[ym] = (row[ym] || 0) + p.amount; });
    state.recurring.filter((r) => !r.archived && (r.projectId || '') === projectId).forEach((r) => { if (!cats.has(r.name)) cats.set(r.name, {}); });
    const rows = [...cats.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));
    const totals = {}; months.forEach((ym) => { totals[ym] = rows.reduce((a, [, row]) => a + (row[ym] || 0), 0); });
    return { rows, totals };
  }
  function incomeMatrix(projectId, months) {
    const pays = state.payments.filter((p) => isIn(p) && (p.projectId || '') === projectId);
    const rows = new Map();
    pays.forEach((p) => {
      const st = p.personId ? byId(state.students, p.personId) : null;
      const g = st && st.groupId ? groupById(st.groupId) : (p.category ? state.groups.find((x) => x.name === p.category) : null);
      let key, label, sub, section;
      if (g) { key = 'g:' + g.id; label = g.name; sub = (teacherById(g.teacherId) || {}).name || ''; section = 0; }
      else if (st) { key = 's:' + st.id; label = st.name; sub = (teacherById(st.teacherId) || {}).name || ''; section = 1; }
      else { key = 'o:' + (p.category || p.personName); label = p.category || p.personName; sub = ''; section = 2; }
      if (!rows.has(key)) rows.set(key, { label, sub, section, cells: {} });
      const r = rows.get(key); const ym = ymOf(p.date); r.cells[ym] = (r.cells[ym] || 0) + p.amount;
    });
    const list = [...rows.values()].sort((a, b) => a.section - b.section || a.label.localeCompare(b.label, 'ru'));
    const totals = {}; months.forEach((ym) => { totals[ym] = list.reduce((a, r) => a + (r.cells[ym] || 0), 0); });
    return { rows: list, totals };
  }
  function renderExpenses() {
    const end = ui.expEnd || todayISO().slice(0, 7);
    const months = []; for (let i = 5; i >= 0; i--) months.push(ymShift(end, -i));
    const projects = (ui.project === 'all' ? state.projects.map((p) => p.id).concat(state.payments.some((p) => !isIn(p) && !p.projectId) || state.recurring.some((r) => !r.projectId) ? [''] : []) : [ui.project]);
    const SECTION = ['Группы', 'Индивидуально', 'Прочие доходы'];
    const sections = projects.map((pid) => {
      const { rows, totals } = expenseMatrix(pid, months);
      const inc = incomeMatrix(pid, months);
      const name = pid ? projectName(pid) : 'Без проекта';
      const grand = months.reduce((a, ym) => a + totals[ym], 0);
      const grandIn = months.reduce((a, ym) => a + inc.totals[ym], 0);
      const rec = state.recurring.filter((r) => !r.archived && (r.projectId || '') === pid);
      let lastSection = -1;
      const incRows = inc.rows.map((r) => { let head = ''; if (r.section !== lastSection) { lastSection = r.section; head = `<tr class="month-head"><td colspan="${months.length + 2}">${SECTION[r.section]}</td></tr>`; } return head + `<tr><td>${esc(r.label)}${r.sub ? ` <span class="sub">· ${esc(r.sub)}</span>` : ''}</td>${months.map((ym) => `<td class="num ${r.cells[ym] ? '' : 'zero'}">${r.cells[ym] ? money(r.cells[ym]) : '·'}</td>`).join('')}<td class="num"><strong>${money(months.reduce((a, ym) => a + (r.cells[ym] || 0), 0))}</strong></td></tr>`; }).join('');
      const incomeTable = `<section class="card mt">
        <div class="card-head"><div><h2>${esc(name)} · доходы</h2><div class="small muted">оплаты учеников по группам · итого за период ${money(grandIn)}</div></div><button class="btn sm" data-tab-go="groups">Оплаты по ученикам →</button></div>
        <div class="table-wrap"><table class="matrix"><thead><tr><th>Группа \\ Месяц</th>${months.map((ym) => `<th class="num ${ym === todayISO().slice(0, 7) ? 'cur' : ''}">${ymLabel(ym)}</th>`).join('')}<th class="num">Итого</th></tr></thead><tbody>
          ${incRows || `<tr><td colspan="${months.length + 2}" class="muted">Поступлений за период нет.</td></tr>`}
        </tbody><tfoot>
          <tr><td><strong>Доходы</strong></td>${months.map((ym) => `<td class="num"><strong>${money(inc.totals[ym])}</strong></td>`).join('')}<td class="num"><strong>${money(grandIn)}</strong></td></tr>
          <tr><td><strong>Расходы</strong></td>${months.map((ym) => `<td class="num"><strong>${money(-totals[ym])}</strong></td>`).join('')}<td class="num"><strong>${money(-grand)}</strong></td></tr>
          <tr class="net"><td><strong>Итог</strong></td>${months.map((ym) => `<td class="num"><strong class="${inc.totals[ym] - totals[ym] < 0 ? 'neg' : ''}">${money(inc.totals[ym] - totals[ym])}</strong></td>`).join('')}<td class="num"><strong class="${grandIn - grand < 0 ? 'neg' : ''}">${money(grandIn - grand)}</strong></td></tr>
        </tfoot></table></div></section>`;
      return incomeTable + `<section class="card mt">
        <div class="card-head"><div><h2>${esc(name)} · расходы</h2><div class="small muted">по категориям · итого за период ${money(grand)}</div></div>
          <div class="toolbar"><button class="btn sm" data-act="add-expense" data-project="${pid}">+ Расход</button><button class="btn sm" data-act="add-recurring" data-project="${pid}">+ Подписка</button></div></div>
        <div class="table-wrap"><table class="matrix"><thead><tr><th>Категория \\ Месяц</th>${months.map((ym) => `<th class="num ${ym === todayISO().slice(0, 7) ? 'cur' : ''}">${ymLabel(ym)}</th>`).join('')}<th class="num">Итого</th></tr></thead><tbody>
          ${rows.length ? rows.map(([cat, row]) => `<tr><td>${esc(cat)}${rec.some((r) => r.name === cat) ? ' <span class="badge muted">подписка</span>' : ''}</td>${months.map((ym) => `<td class="num cell ${row[ym] ? '' : 'zero'}" data-act="add-expense" data-project="${pid}" data-cat="${esc(cat)}" data-ym="${ym}" title="Добавить расход «${esc(cat)}» за ${ymLabel(ym)}">${row[ym] ? money(-row[ym]) : '·'}</td>`).join('')}<td class="num"><strong>${money(-months.reduce((a, ym) => a + (row[ym] || 0), 0))}</strong></td></tr>`).join('') : `<tr><td colspan="${months.length + 2}" class="muted">Расходов пока нет — нажмите «+ Расход» или на ячейку таблицы.</td></tr>`}
        </tbody><tfoot><tr><td><strong>Итого</strong></td>${months.map((ym) => `<td class="num"><strong>${money(-totals[ym])}</strong></td>`).join('')}<td class="num"><strong>${money(-grand)}</strong></td></tr></tfoot></table></div>
        ${rec.length ? `<div class="mt small muted">Регулярные: ${rec.map((r) => `<button class="btn sm" data-act="edit-recurring" data-id="${r.id}">${esc(r.name)} · ${money(r.amount)} · ${r.payDay}-го${r.archived ? ' (архив)' : ''}</button>`).join(' ')}</div>` : ''}
      </section>`;
    }).join('');
    return `
      <div class="page-head"><h1>Помесячно</h1>
        <div class="toolbar"><div class="seg"><button data-exp="-1">‹</button><button data-exp="0">Сегодня</button><button data-exp="1">›</button></div><button class="btn" data-act="export-expenses">Скачать CSV</button><button class="btn primary" data-act="add-expense" data-project="${ui.project === 'all' ? '' : ui.project}">+ Расход</button></div></div>
      <p class="small muted">Как в вашей таблице «monthly»: доходы по группам и расходы по категориям за месяц, внизу итог. Клик по ячейке расходов добавляет расход в эту категорию и месяц. Зарплаты попадают в расходы автоматически.</p>
      ${sections || `<div class="card"><div class="empty"><p>Проектов пока нет.</p><button class="btn primary" data-act="add-project">+ Проект</button></div></div>`}`;
  }

  function renderCalendar() {
    const base = ui.calMonth ? parseISO(ui.calMonth + '-01') : new Date();
    const y = base.getFullYear(), m = base.getMonth();
    const startOffset = (new Date(y, m, 1).getDay() + 6) % 7;
    const dim = daysInMonth(y, m);
    const today = todayISO();
    const events = {};
    const push = (iso, ev) => { (events[iso] = events[iso] || []).push(ev); };
    activeStudents().forEach((s) => { if (s.payType === 'monthly' && s.nextDue) push(s.nextDue, { kind: 'in', act: 'pay-student', name: s.name, amount: studentAmount(s), late: s.nextDue < today, id: s.id, label: 'оплата от ученика' }); });
    activeTeachers().forEach((t) => { if (t.payType !== 'perGroup' && t.nextDue && teacherAmount(t) > 0) push(t.nextDue, { kind: 'out', act: 'pay-teacher', name: t.name, amount: teacherAmount(t), late: t.nextDue < today, id: t.id, label: 'зарплата' }); });
    payoutItems().forEach((it) => { if (it.amount > 0) push(it.nextDue, { kind: 'out', act: 'pay-payout', name: `${it.teacher.name} · ${it.name}`, amount: it.amount, late: it.nextDue < today, id: it.id, label: it.kind === 'group' ? 'зарплата за группу' : 'зарплата за индивидуалку' }); });
    activeRecurring().forEach((r) => { if (r.nextDue) push(r.nextDue, { kind: 'out', act: 'pay-recurring', name: r.name, amount: r.amount, late: r.nextDue < today, id: r.id, label: 'подписка' }); });
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
      cells += `<button class="cal-day ${other ? 'other' : ''} ${iso === today ? 'today' : ''} ${ui.calSelected === iso ? 'selected' : ''}" data-day="${iso}"><span class="d">${d.getDate()}</span>${chips}${more}${dots}</button>`;
    }
    const evRow = (e, iso) => `<div class="row ${e.late ? 'is-overdue' : ''}"><div class="row-main"><div class="row-title">${esc(e.name)} <span class="badge muted">${e.label}</span>${e.late ? ' ' + badge('overdue') : ''}</div>${iso ? `<div class="row-sub">${fmtDate(iso)} · ${relDays(iso)}</div>` : ''}</div>
      <div class="row-actions"><span class="row-amount">${e.kind === 'in' ? '+' : '−'}${money(e.amount)}</span><button class="btn sm good" data-act="${e.act}" data-id="${e.id}">${e.kind === 'in' ? 'Оплатил' : e.act === 'pay-teacher' || e.act === 'pay-payout' ? 'Выплатить' : 'Оплачено'}</button></div></div>`;
    const sel = ui.calSelected && events[ui.calSelected] ? ui.calSelected : null;
    return `
      <div class="page-head"><h1>Календарь</h1>
        <div class="legend"><span><i style="background:var(--series-1)"></i>Оплата от ученика</span><span><i style="background:var(--series-2)"></i>Зарплата / подписка</span><span style="text-decoration:underline wavy var(--overdue)">Просрочено</span></div></div>
      <div class="card">
        <div class="cal-head"><button class="btn sm" data-cal="-1">‹</button><h2>${MONTHS[m]} ${y}</h2><div class="toolbar"><button class="btn sm" data-cal="0">Сегодня</button><button class="btn sm" data-cal="1">›</button></div></div>
        <div class="muted small" style="margin-bottom:10px">По графику в этом месяце: поступления ${money(totalIn)}, выплаты ${money(totalOut)}${lateOutside.length ? ` · <span class="badge overdue">просрочено из прошлых месяцев: ${lateOutside.length}</span>` : ''}</div>
        <div class="cal-grid">${WEEKDAYS.map((w) => `<div class="cal-dow">${w}</div>`).join('')}${cells}</div>
      </div>
      ${sel ? `<section class="card mt"><div class="card-head"><h2>${fmtDate(sel, true)}</h2><span class="hint">${relDays(sel)}</span></div><div class="list">${events[sel].map((e) => evRow(e)).join('')}</div></section>` : ''}
      ${lateOutside.length ? `<section class="card mt"><div class="card-head"><h2>Просрочено ранее</h2></div><div class="list">${lateOutside.map((e) => evRow(e, e.iso)).join('')}</div></section>` : ''}
      <p class="muted small mt">Ученики на абонементе в календаре не показываются — их статус считается по оставшимся занятиям (вкладка «Ученики»).</p>`;
  }

  function renderHistory() {
    let list = paymentsFiltered().slice().sort((a, b) => b.date.localeCompare(a.date));
    if (ui.historyKind !== 'all') list = list.filter((p) => ui.historyKind === 'in' ? isIn(p) : !isIn(p));
    const seg = (k, label) => `<button class="${ui.historyKind === k ? 'is-active' : ''}" data-hfilter="${k}">${label}</button>`;
    const totalIn = list.filter(isIn).reduce((a, p) => a + p.amount, 0);
    const totalOut = list.filter((p) => !isIn(p)).reduce((a, p) => a + p.amount, 0);
    let lastMonth = '';
    const rows = list.map((p) => {
      const ym = ymOf(p.date);
      let head = '';
      if (ym !== lastMonth) { lastMonth = ym; const d = parseISO(p.date); head = `<tr class="month-head"><td colspan="5">${MONTHS[d.getMonth()]} ${d.getFullYear()}</td></tr>`; }
      return head + `<tr><td data-l="Дата">${fmtDate(p.date)}</td><td data-l="Кто"><div><strong>${esc(p.personName)}</strong></div><div class="sub">${[p.kind === 'expense' || p.kind === 'otherIncome' ? null : p.category, multiProject() && p.projectId ? projectName(p.projectId) : null, p.note].filter(Boolean).map(esc).join(' · ')}</div></td><td data-l="Тип"><div><span class="badge muted">${KIND_LABEL[p.kind] || p.kind}</span></div></td><td class="num" data-l="Сумма" style="color:${isIn(p) ? 'var(--ok)' : 'inherit'}">${isIn(p) ? '+' : '−'}${money(p.amount)}</td><td class="actions"><button class="btn sm danger" data-act="del-payment" data-id="${p.id}" title="Удалить запись">✕</button></td></tr>`;
    }).join('');
    return `
      <div class="page-head"><h1>История</h1><div class="toolbar"><button class="btn" data-act="export-csv">Скачать CSV</button><button class="btn primary" data-act="manual-payment">+ Запись</button></div></div>
      <div class="filters"><div class="seg">${seg('all', 'Всё')}${seg('in', 'Поступления')}${seg('out', 'Выплаты и расходы')}</div><span class="muted small" style="align-self:center">Поступления ${money(totalIn)} · расходы ${money(totalOut)} · итог ${money(totalIn - totalOut)}</span></div>
      <div class="card">${list.length ? `<div class="table-wrap"><table class="responsive"><thead><tr><th>Дата</th><th>Кто</th><th>Тип</th><th class="num">Сумма</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">Записей пока нет. Нажимайте «Оплатил», «Выплатить» и «Оплачено» на обзоре — записи появятся здесь.</div>`}</div>
      <p class="muted small mt">Удаление записи не возвращает дату следующей оплаты назад — при ошибке поправьте её в карточке ученика, преподавателя или подписки.</p>`;
  }

  function renderSettings() {
    const s = state.settings;
    const size = new Blob([JSON.stringify(state)]).size;
    return `
      <div class="page-head"><h1>Настройки</h1></div>
      ${renderSheetsSection()}
      <div class="grid-2 mt">
        <section class="card"><div class="card-head"><h2>Проекты</h2><button class="btn sm" data-act="add-project">+ Проект</button></div>
          ${state.projects.length ? `<div class="list">${state.projects.map((p) => { const n = state.students.filter((x) => x.projectId === p.id && !x.archived).length, g = state.groups.filter((x) => x.projectId === p.id && !x.archived).length; return `<div class="row"><div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-sub">${g} ${plural(g, 'группа', 'группы', 'групп')} · ${n} ${plural(n, 'ученик', 'ученика', 'учеников')}${p.notes ? ' · ' + esc(p.notes) : ''}</div></div><div class="row-actions"><button class="btn sm" data-act="edit-project" data-id="${p.id}">✎</button><button class="btn sm danger" data-act="del-project" data-id="${p.id}">✕</button></div></div>`; }).join('')}</div>` : `<p class="small muted">Проекты — это направления центра (например, TR-YOS Zone). Если проектов несколько, фильтр вверху страницы переключает весь дашборд.</p>`}
        </section>
        <section class="card"><div class="card-head"><h2>Общие</h2></div>
          <div class="form-grid">
            ${field('Валюта (символ)', inp('currency', s.currency, 'text', 'data-setting="currency" maxlength="4"'))}
            ${field('Напоминать за N дней', inp('remindDays', s.remindDays, 'number', 'data-setting="remindDays" min="0" max="30"'))}
            ${field('Тема', `<select data-setting="theme"><option value="auto" ${!s.theme || s.theme === 'auto' ? 'selected' : ''}>Как в системе</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Светлая</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Тёмная</option></select>`)}
          </div>
          <p class="form-note mt">Изменения сохраняются сразу.</p>
        </section>
      </div>
      <div class="grid-2 mt">
        <section class="card"><div class="card-head"><h2>Резервная копия</h2></div>
          <p class="small muted">Данные хранятся только в этом браузере (${(size / 1024).toFixed(1)} КБ). Чтобы перенести на другой компьютер или не потерять при очистке браузера — скачайте копию.</p>
          <div class="toolbar mt"><button class="btn primary" data-act="export">Скачать копию (JSON)</button><label class="btn">Загрузить копию<input type="file" accept="application/json" data-import hidden></label></div>
          <dl class="kv mt"><dt>Проектов</dt><dd>${state.projects.length}</dd><dt>Групп</dt><dd>${state.groups.length}</dd><dt>Учеников</dt><dd>${state.students.length}</dd><dt>Преподавателей</dt><dd>${state.teachers.length}</dd><dt>Подписок</dt><dd>${state.recurring.length}</dd><dt>Записей в истории</dt><dd>${state.payments.length}</dd></dl>
        </section>
        <section class="card danger-zone"><div class="card-head"><h2>Опасная зона</h2></div>
          <div class="toolbar"><button class="btn" data-act="seed-mine">TR-YOS Zone из таблицы Finances</button><button class="btn danger" data-act="wipe">Удалить все данные</button></div>
          <p class="form-note mt">Загрузка из таблицы заменит текущие данные. Перед этим скачайте копию.</p>
        </section>
      </div>`;
  }

  // ---------- Экспорт / импорт ----------
  function download(name, content, type) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const csv = (rows) => '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  function exportJSON() { download(`finansy-centra-${todayISO()}.json`, JSON.stringify(state, null, 2), 'application/json'); }
  function exportCSV() {
    const rows = [['Дата', 'Тип', 'Проект', 'Кто', 'Категория', 'Сумма', 'Комментарий']].concat(state.payments.slice().sort((a, b) => b.date.localeCompare(a.date)).map((p) => [p.date, KIND_LABEL[p.kind] || p.kind, projectName(p.projectId), p.personName, p.category, isIn(p) ? p.amount : -p.amount, p.note]));
    download(`istoriya-${todayISO()}.csv`, csv(rows), 'text/csv;charset=utf-8');
  }
  function exportExpenses() {
    const end = ui.expEnd || todayISO().slice(0, 7);
    const months = []; for (let i = 11; i >= 0; i--) months.push(ymShift(end, -i));
    const rows = [];
    const projects = ui.project === 'all' ? state.projects.map((p) => p.id).concat(['']) : [ui.project];
    projects.forEach((pid) => {
      const { rows: r, totals } = expenseMatrix(pid, months);
      if (!r.length) return;
      rows.push([pid ? projectName(pid) : 'Без проекта']);
      rows.push(['Category \\ Month', ...months.map(ymLabel), 'Total']);
      r.forEach(([cat, row]) => rows.push([cat, ...months.map((ym) => row[ym] ? -row[ym] : ''), -months.reduce((a, ym) => a + (row[ym] || 0), 0)]));
      rows.push(['Total', ...months.map((ym) => -totals[ym]), -months.reduce((a, ym) => a + totals[ym], 0)]);
      rows.push([]);
    });
    download(`rashody-${todayISO()}.csv`, csv(rows), 'text/csv;charset=utf-8');
  }
  function importJSON(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data || !Array.isArray(data.students) || !Array.isArray(data.teachers)) throw new Error('bad');
        if (!confirm('Заменить текущие данные загруженной копией?')) return;
        state = normalize(data); save(); applyTheme(); render(); toast('Копия загружена');
      } catch { toast('Файл не похож на копию данных'); }
    };
    r.readAsText(file);
  }
  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  }

  // ---------- Данные из файла Finances.pdf (Numbers): TR-YOS Zone, июнь–октябрь 2026, суммы в $ ----------
  function seedMine() {
    const Y = '2026';
    const theme = state.settings.theme;
    const projects = [{ id: 'p-tr', name: 'TR-YOS Zone', notes: '' }];
    const T = (id, name) => ({ id, name, projectId: 'p-tr', subject: 'TR-YOS', payType: 'perGroup', rate: 0, payDay: 1, nextDue: `${Y}-11-01`, lessonsDone: 0, phone: '', notes: 'суммы за группы не указаны в таблице — заполните в карточках групп', lastPaid: null, archived: false });
    const teachers = [T('t-asilbek', 'Asilbek'), T('t-elvira', 'Elvira'), T('t-regina', 'Regina'), T('t-diyora', 'Diyora')];
    const G = (id, name, payDay, teacherId, price) => ({ id, name, projectId: 'p-tr', teacherId, subject: 'TR-YOS', schedule: '', payType: 'monthly', price, payDay, lessonsInPackage: 8, notes: `оплата ${payDay}-го числа`, archived: false, pay: { mode: 'fixed', amount: 0, payDay, nextDue: nextDateForDay(payDay), lastPaid: null } });
    const groups = [G('g-1', 'Group #1', 15, 't-asilbek', 104), G('g-j1', 'Group J1', 7, 't-elvira', 150), G('g-j2', 'Group J2', 15, 't-regina', 150), G('g-s1', 'Group S1', 8, 't-elvira', 150), G('g-o1', 'Group O1', 1, 't-regina', 240), G('g-o2', 'Group O2', 18, '', 0)];
    // [имя, группа|null, преподаватель, цена, оплаты {месяц: сумма}, следующая оплата, заметка, архив]
    const S = [
      ['Виталина', 'g-1', 't-asilbek', 118, { 6: 118, 7: 118, 8: 236 }, '10-15'],
      ['Петимат', 'g-1', 't-asilbek', 104, { 6: 104, 7: 104, 8: 214 }, '10-15'],
      ['Сакина', 'g-1', 't-asilbek', 100, { 6: 100, 7: 100, 8: 100, 9: 100 }, '10-15'],
      ['Мария', 'g-1', 't-asilbek', 104, { 6: 104, 7: 104, 8: 214 }, '10-15'],
      ['Ахмад', 'g-j1', 't-elvira', 104, { 7: 104 }, '08-07', 'нет оплат с июля (по таблице)', true],
      ['Батырхан', 'g-j1', 't-elvira', 150, { 7: 150, 8: 150, 9: 150 }, '10-07'],
      ['Лиза', 'g-j1', 't-elvira', 150, { 7: 150, 8: 150 }, '09-07'],
      ['Тетя шляпа', 'g-j2', 't-regina', 150, { 7: 150, 8: 150, 9: 150 }, '10-15'],
      ['Рамиль', 'g-j2', 't-regina', 150, { 7: 107, 8: 107, 9: 150 }, '10-15'],
      ['Mariia', null, 't-regina', 100, { 7: [50, 'g-j2'], 8: 100 }, '09-01', 'в июле группа J2, с августа индивидуально'],
      ['Энже', 'g-s1', 't-elvira', 150, { 9: 150 }, '10-08'],
      ['Малика', 'g-s1', 't-elvira', 150, { 9: 150 }, '10-08'],
      ['Милана', 'g-s1', 't-elvira', 240, { 9: 240 }, '10-08'],
      ['Камиль', 'g-o1', 't-regina', 245, { 10: 245 }, '11-01'],
      ['Анна', 'g-o1', 't-regina', 240, { 10: 240 }, '11-01'],
      ['Айша', 'g-o1', 't-regina', 150, {}, '10-01'],
      ['Ясмина', null, 't-regina', 320, { 8: 320, 9: 320, 10: 320 }, '11-01'],
      ['Gulnoza', null, 't-diyora', 400, { 10: 400 }, '11-01'],
      ['Диана', null, 't-diyora', 0, {}, '10-01', 'сумма не указана в таблице'],
      ['Даяна', null, 't-diyora', 0, {}, '10-01', 'сумма не указана в таблице'],
      ['Firdaus', null, '', 0, {}, '11-01', 'TOEFL + Английский · условия не указаны в таблице'],
    ];
    const students = []; const payments = [];
    S.forEach(([name, groupId, teacherId, price, pays, next, notes, archived], i) => {
      const g = groups.find((x) => x.id === groupId);
      const payDay = g ? g.payDay : 1;
      const id = `s-${i + 1}`;
      const dates = Object.keys(pays).map(Number).sort((a, b) => a - b);
      const last = dates.length ? dates[dates.length - 1] : null;
      students.push({ id, name, groupId: groupId || '', projectId: 'p-tr', teacherId, subject: name === 'Firdaus' ? 'TOEFL + Английский' : 'TR-YOS', payType: 'monthly', price, payDay, nextDue: `${Y}-${next}`, lessonsInPackage: 8, lessonsLeft: 0, phone: '', notes: notes || '', lastPaid: last ? `${Y}-${pad(last)}-${pad(payDay)}` : null, remindedAt: null, archived: !!archived, pay: groupId ? undefined : { mode: 'fixed', amount: 0, payDay: 1, nextDue: nextDateForDay(1), lastPaid: null } });
      dates.forEach((mo) => {
        const v = pays[mo]; const amount = Array.isArray(v) ? v[0] : v; const gid = Array.isArray(v) ? v[1] : groupId;
        const gg = groups.find((x) => x.id === gid);
        payments.push({ id: uid(), kind: 'income', date: `${Y}-${pad(mo)}-${pad(gg ? gg.payDay : 1)}`, amount, personId: id, personName: name, category: gg ? gg.name : '', projectId: 'p-tr', note: 'из таблицы Student Payments' });
      });
    });
    // Расходы: категория → [июнь, июль, август, сентябрь, октябрь]
    const E = {
      'Instagram target': [80, 60, 35, 80, 40], 'Instagram subscription': [8, 8, 8, 8, 8], 'Telegram premium': [4, 4, 4, 4, 4],
      'Ads - Telegram': [24.84, 68.36, 23, 23, 0], 'Zoom - sub': [23.14, 23.14, 23.14, 23.14, 23.14], 'Ai': [0, 0, 0, 35.4, 115], 'Inventory': [0, 450, 115, 115, 0], 'Other': [0, 0, 1, 31, 0],
    };
    Object.entries(E).forEach(([cat, arr]) => arr.forEach((amount, i) => { if (amount) payments.push({ id: uid(), kind: 'expense', date: `${Y}-${pad(6 + i)}-01`, amount, personId: '', personName: cat, category: cat, projectId: 'p-tr', note: 'из таблицы monthly' }); }));
    const R = (id, name, amount) => ({ id, name, projectId: 'p-tr', amount, payDay: 1, nextDue: `${Y}-11-01`, notes: '', lastPaid: `${Y}-10-01`, archived: false });
    const recurring = [R('r-ig', 'Instagram subscription', 8), R('r-tg', 'Telegram premium', 4), R('r-zoom', 'Zoom - sub', 23.14)];
    payments.sort((a, b) => b.date.localeCompare(a.date));
    state = Object.assign(defaultState(), { settings: Object.assign(defaultState().settings, { currency: '$', remindDays: 7, theme }), projects, groups, students, teachers, recurring, payments, seedVersion: SEED_VERSION });
    ui.project = 'all';
    save(); render(); toast('Данные TR-YOS Zone из таблицы загружены');
  }

  // ---------- Google Таблицы ----------
  const SHEET_TYPES = { students: 'Ученики', teachers: 'Преподаватели', expenses: 'Расходы (категория × месяц)', payments: 'Журнал платежей' };
  const SHEET_FIELDS = {
    students: [
      ['name', 'Имя ученика *', /имя|фио|ученик|student|name|isim|öğrenci|^ad$/i],
      ['group', 'Группа', /групп|group|grup|sınıf/i],
      ['teacher', 'Преподаватель', /преподав|учител|teacher|öğretmen|hoca/i],
      ['subject', 'Предмет', /предмет|subject|ders|курс|course/i],
      ['price', 'Сумма оплаты', /цена|сумма|стоим|price|amount|fee|ücret|tutar/i],
      ['payDay', 'День оплаты (число месяца)', /день оплаты|число|pay ?day/i],
      ['nextDue', 'Дата следующей оплаты', /следующ|срок|дата оплаты|due|next|son ödeme/i],
      ['lastPaid', 'Дата последней оплаты', /последн|last paid|ödeme tarihi/i],
      ['status', 'Статус (оплачено / нет)', /статус|status|durum|оплатил|оплачено|ödendi/i],
      ['lessonsInPackage', 'Занятий в абонементе', /абонемент|package|занятий в/i],
      ['lessonsLeft', 'Осталось занятий', /остал|left|kalan/i],
      ['phone', 'Телефон', /тел|phone|telefon|whatsapp/i],
      ['notes', 'Заметка', /замет|коммент|примеч|note|comment|^not$/i],
    ],
    teachers: [
      ['name', 'Имя *', /имя|фио|преподав|учител|teacher|name|öğretmen|hoca/i],
      ['subject', 'Предмет', /предмет|subject|ders|курс/i],
      ['rate', 'Оклад или ставка', /оклад|ставк|сумма|зарпл|rate|salary|maaş|ücret/i],
      ['perLesson', 'За занятие? (да/нет)', /за заняти|per lesson|ders başı/i],
      ['payDay', 'День выплаты', /день выплат|число|pay ?day/i],
      ['nextDue', 'Дата следующей выплаты', /следующ|дата выплат|due|next/i],
      ['lessonsDone', 'Проведено занятий', /провед|занятий|lessons|ders sayısı/i],
      ['phone', 'Телефон', /тел|phone|telefon/i],
      ['notes', 'Заметка', /замет|коммент|примеч|note|comment/i],
    ],
    expenses: [['category', 'Категория *', /категор|category|статья|расход|kategori|month/i]],
    payments: [
      ['date', 'Дата *', /дата|date|tarih/i],
      ['name', 'Кто / что *', /кто|имя|ученик|name|назван|student|isim/i],
      ['amount', 'Сумма *', /сумма|amount|tutar|price/i],
      ['kind', 'Тип (доход / расход)', /тип|вид|kind|type|tür/i],
      ['category', 'Категория / группа', /категор|групп|category|group/i],
      ['note', 'Комментарий', /коммент|замет|примеч|note|comment/i],
    ],
  };
  const MONTH_NAMES = {
    1: ['янв', 'jan', 'oca'], 2: ['фев', 'feb', 'şub', 'sub'], 3: ['мар', 'mar'], 4: ['апр', 'apr', 'nis'], 5: ['май', 'мая', 'may'], 6: ['июн', 'jun', 'haz'],
    7: ['июл', 'jul', 'tem'], 8: ['авг', 'aug', 'ağu', 'agu'], 9: ['сен', 'sep', 'eyl'], 10: ['окт', 'oct', 'eki'], 11: ['ноя', 'nov', 'kas'], 12: ['дек', 'dec', 'ara'],
  };
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delim = [',', ';', '\t'].map((d) => [d, (firstLine.match(new RegExp(d === '\t' ? '\t' : '\\' + d, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim() !== ''));
  }
  function parseNum(v) {
    if (v == null) return null;
    let s = String(v).trim().replace(/[^\d,.\-−]/g, '').replace('−', '-');
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (s.includes(',')) s = /,\d{3}$/.test(s) && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    const n = Number(s); return isNaN(n) ? null : n;
  }
  function parseDateCell(v) {
    const s = String(v || '').trim(); if (!s) return null;
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/))) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) { let a = +m[1], b = +m[2]; const y = m[3].length === 2 ? '20' + m[3] : m[3]; const [mo, d] = a > 12 ? [b, a] : [a, b]; return `${y}-${pad(mo)}-${pad(d)}`; }
    if ((m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/))) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    const d = new Date(s); if (!isNaN(d)) return fmtISO(d);
    return null;
  }
  function parseMonthHeader(v) {
    const s = norm(v); if (!s) return null;
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})/))) return `${m[1]}-${pad(m[2])}`;
    if ((m = s.match(/^(\d{1,2})[./](\d{4})$/))) return `${m[2]}-${pad(m[1])}`;
    const iso = parseDateCell(s); if (iso && /\d{4}/.test(s)) return iso.slice(0, 7);
    for (const [num, names] of Object.entries(MONTH_NAMES)) {
      if (names.some((n) => s.startsWith(n))) { const y = (s.match(/(\d{2,4})\s*$/) || [])[1]; const year = y ? (y.length === 2 ? '20' + y : y) : String(new Date().getFullYear()); return `${year}-${pad(num)}`; }
    }
    return null;
  }
  function toCsvUrl(url) {
    url = String(url || '').trim();
    let m;
    if ((m = url.match(/docs\.google\.com\/spreadsheets\/d\/e\/([^/]+)\/pub/))) { const gid = (url.match(/[?&#]gid=(\d+)/) || [])[1]; return `https://docs.google.com/spreadsheets/d/e/${m[1]}/pub?output=csv${gid ? '&gid=' + gid : ''}`; }
    if ((m = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/))) { const gid = (url.match(/[?&#]gid=(\d+)/) || [])[1]; return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv${gid ? '&gid=' + gid : ''}`; }
    return url;
  }
  async function fetchSheetCSV(url) {
    const csvUrl = toCsvUrl(url);
    const check = (t) => { if (/<html|<!doctype/i.test(t.slice(0, 300))) throw new Error('html'); return t; };
    try { const r = await fetch(csvUrl, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return check(await r.text()); }
    catch (e1) {
      let r;
      try { r = await fetch('/api/sheet?url=' + encodeURIComponent(csvUrl), { cache: 'no-store' }); } catch { throw new Error('Не удалось загрузить таблицу. Проверьте доступ: Файл → Поделиться → «Все, у кого есть ссылка» (Читатель).'); }
      if (!r.ok) { let msg = ''; try { msg = (await r.json()).error; } catch { /* ignore */ } throw new Error(msg || 'Не удалось загрузить таблицу. Проверьте ссылку и доступ: Файл → Поделиться → «Все, у кого есть ссылка» (Читатель).'); }
      return check(await r.text());
    }
  }
  function autoMapping(type, headers) {
    const map = {}; const used = new Set();
    (SHEET_FIELDS[type] || []).forEach(([f, , re]) => { const i = headers.findIndex((h, idx) => !used.has(idx) && re.test(norm(h))); if (i >= 0) { map[f] = i; used.add(i); } });
    const must = { students: 'name', teachers: 'name', expenses: 'category', payments: 'name' }[type];
    if (must && map[must] == null) map[must] = 0;
    return map;
  }
  const defaultProjectId = () => ui.project !== 'all' ? ui.project : (state.projects[0] || {}).id || '';
  function ensureGroup(name, projectId) {
    let g = state.groups.find((x) => norm(x.name) === norm(name));
    if (!g) { g = { id: uid(), name: name.trim(), projectId, teacherId: '', subject: '', schedule: '', payType: 'monthly', price: 0, payDay: 1, lessonsInPackage: 8, notes: '', archived: false }; state.groups.push(g); }
    return g;
  }
  function ensureTeacher(name, projectId) {
    let t = state.teachers.find((x) => norm(x.name) === norm(name));
    if (!t) { t = { id: uid(), name: name.trim(), projectId, subject: '', payType: 'monthly', rate: 0, payDay: 5, nextDue: nextDateForDay(5), lessonsDone: 0, phone: '', notes: '', lastPaid: null, archived: false }; state.teachers.push(t); }
    return t;
  }
  const isPaidWord = (v) => /оплач|paid|ödendi|^да$|^yes$|^\+$|✓|✔|^ok$|^1$|true/i.test(norm(v));

  function applySheet(src, rows) {
    const headers = rows[0] || []; const body = rows.slice(1);
    const m = src.mapping || {};
    const col = (row, f) => (m[f] != null && m[f] !== '' ? String(row[m[f]] ?? '').trim() : null);
    const projectId = src.projectId || defaultProjectId();
    const res = { created: 0, updated: 0, archived: 0, payments: 0 };
    if (src.type === 'students') {
      const seen = new Set();
      body.forEach((row) => {
        const name = col(row, 'name'); if (!name || /^(итого|total|всего)$/i.test(name)) return;
        seen.add(norm(name));
        let s = state.students.find((x) => norm(x.name) === norm(name));
        const isNew = !s;
        if (isNew) { s = { id: uid(), name, groupId: '', projectId, teacherId: '', subject: '', payType: 'monthly', price: 0, payDay: 1, nextDue: null, lessonsInPackage: 8, lessonsLeft: 0, phone: '', notes: '', lastPaid: null, remindedAt: null, archived: false }; state.students.push(s); res.created++; } else { res.updated++; if (s.archived) res.archived--; }
        s.sourceId = src.id; s.archived = false;
        const gName = col(row, 'group');
        if (gName) { const g = ensureGroup(gName, s.projectId || projectId); s.groupId = g.id; if (isNew) { s.payType = g.payType; s.price = g.price; s.payDay = g.payDay; s.lessonsInPackage = g.lessonsInPackage; s.lessonsLeft = g.lessonsInPackage; if (!s.subject) s.subject = g.subject; if (!s.teacherId) s.teacherId = g.teacherId; } }
        const tName = col(row, 'teacher'); if (tName) s.teacherId = ensureTeacher(tName, s.projectId || projectId).id;
        const subject = col(row, 'subject'); if (subject) s.subject = subject;
        const price = parseNum(col(row, 'price')); if (price != null) s.price = Math.abs(price);
        const payDay = parseNum(col(row, 'payDay')); if (payDay != null && payDay >= 1 && payDay <= 31) s.payDay = Math.round(payDay);
        const lip = parseNum(col(row, 'lessonsInPackage')); if (lip != null && lip > 0) { s.lessonsInPackage = Math.round(lip); s.payType = 'package'; }
        const left = parseNum(col(row, 'lessonsLeft')); if (left != null) { s.lessonsLeft = Math.max(0, Math.round(left)); if (m.lessonsInPackage == null) s.payType = 'package'; }
        const phone = col(row, 'phone'); if (phone) s.phone = phone;
        const notes = col(row, 'notes'); if (notes != null && (notes || isNew)) s.notes = notes;
        const lastPaid = parseDateCell(col(row, 'lastPaid')); if (lastPaid) s.lastPaid = lastPaid;
        const nextDue = parseDateCell(col(row, 'nextDue'));
        const status = col(row, 'status');
        if (s.payType === 'monthly') {
          if (nextDue) s.nextDue = nextDue;
          else if (status != null && status !== '') {
            const thisMonth = fmtISO(new Date(new Date().getFullYear(), new Date().getMonth(), Math.min(s.payDay, daysInMonth(new Date().getFullYear(), new Date().getMonth()))));
            s.nextDue = isPaidWord(status) ? addMonths(thisMonth, 1, s.payDay) : thisMonth;
            if (isPaidWord(status)) s.remindedAt = null;
          } else if (lastPaid && (isNew || !s.nextDue)) s.nextDue = addMonths(lastPaid, 1, s.payDay);
          else if (!s.nextDue) s.nextDue = nextDateForDay(s.payDay);
        }
        const g = groupById(s.groupId);
        if (g && !g.price && s.price) { g.price = s.price; g.payType = s.payType; g.payDay = s.payDay; g.lessonsInPackage = s.lessonsInPackage; }
        if (g && !g.teacherId && s.teacherId) g.teacherId = s.teacherId;
        if (g && !g.subject && s.subject) g.subject = s.subject;
      });
      if (src.archiveMissing) state.students.forEach((x) => { if (x.sourceId === src.id && !x.archived && !seen.has(norm(x.name))) { x.archived = true; res.archived++; } });
    } else if (src.type === 'teachers') {
      const seen = new Set();
      body.forEach((row) => {
        const name = col(row, 'name'); if (!name) return;
        seen.add(norm(name));
        let t = state.teachers.find((x) => norm(x.name) === norm(name));
        if (!t) { t = ensureTeacher(name, projectId); res.created++; } else res.updated++;
        t.sourceId = src.id; t.archived = false;
        const subject = col(row, 'subject'); if (subject) t.subject = subject;
        const rate = parseNum(col(row, 'rate')); if (rate != null) t.rate = Math.abs(rate);
        const per = col(row, 'perLesson'); if (per != null && per !== '') t.payType = isPaidWord(per) || /заня|lesson|ders/i.test(per) ? 'perLesson' : 'monthly';
        const payDay = parseNum(col(row, 'payDay')); if (payDay != null && payDay >= 1 && payDay <= 31) { t.payDay = Math.round(payDay); if (m.nextDue == null) t.nextDue = nextDateForDay(t.payDay); }
        const nextDue = parseDateCell(col(row, 'nextDue')); if (nextDue) t.nextDue = nextDue;
        const done = parseNum(col(row, 'lessonsDone')); if (done != null) t.lessonsDone = Math.max(0, Math.round(done));
        const phone = col(row, 'phone'); if (phone) t.phone = phone;
        const notes = col(row, 'notes'); if (notes) t.notes = notes;
      });
      if (src.archiveMissing) state.teachers.forEach((x) => { if (x.sourceId === src.id && !x.archived && !seen.has(norm(x.name))) { x.archived = true; res.archived++; } });
    } else if (src.type === 'expenses') {
      state.payments = state.payments.filter((p) => p.sourceId !== src.id);
      const catCol = m.category != null ? Number(m.category) : 0;
      const monthCols = headers.map((h, i) => (i === catCol ? null : parseMonthHeader(h))).map((ym, i) => (ym ? { i, ym } : null)).filter(Boolean);
      body.forEach((row) => {
        const cat = String(row[catCol] ?? '').trim(); if (!cat || /^(итого|total|всего|sum|toplam)/i.test(cat)) return;
        monthCols.forEach(({ i, ym }) => {
          const n = parseNum(row[i]); if (!n) return;
          addPayment({ kind: 'expense', date: ym + '-01', amount: Math.abs(n), personId: '', personName: cat, category: cat, projectId, note: 'из Google Таблицы', sourceId: src.id });
          res.payments++;
        });
      });
      res.months = monthCols.length;
    } else if (src.type === 'payments') {
      state.payments = state.payments.filter((p) => p.sourceId !== src.id);
      body.forEach((row) => {
        const date = parseDateCell(col(row, 'date')); const name = col(row, 'name'); const amount = parseNum(col(row, 'amount'));
        if (!date || !name || amount == null || amount === 0) return;
        const kindCell = norm(col(row, 'kind') || '');
        const student = state.students.find((x) => norm(x.name) === norm(name));
        const teacher = state.teachers.find((x) => norm(x.name) === norm(name));
        let kind;
        if (/зарпл|salary|maaş|выплат/.test(kindCell)) kind = 'salary';
        else if (/расход|expense|gider|трат/.test(kindCell)) kind = 'expense';
        else if (/доход|income|приход|gelir|оплат/.test(kindCell)) kind = student ? 'income' : 'otherIncome';
        else if (amount < 0) kind = teacher ? 'salary' : 'expense';
        else kind = student ? 'income' : teacher ? 'salary' : 'otherIncome';
        const cat = col(row, 'category') || (kind === 'salary' ? 'Зарплаты' : kind === 'expense' ? name : (student && groupById(student.groupId) || {}).name || '');
        addPayment({ kind, date, amount: Math.abs(amount), personId: student ? student.id : teacher ? teacher.id : '', personName: name, category: cat, projectId: (student || teacher || {}).projectId || projectId, note: col(row, 'note') || '', sourceId: src.id });
        res.payments++;
      });
      state.payments.sort((a, b) => b.date.localeCompare(a.date));
    }
    src.lastSync = new Date().toISOString(); src.lastResult = res; src.lastError = '';
    return res;
  }
  function resultText(src) {
    const r = src.lastResult || {}; const parts = [];
    if (src.type === 'students' || src.type === 'teachers') { parts.push(`новых ${r.created || 0}`, `обновлено ${r.updated || 0}`); if (r.archived) parts.push(`в архив ${r.archived}`); }
    else { parts.push(`записей ${r.payments || 0}`); if (r.months != null) parts.push(`месяцев ${r.months}`); }
    return parts.join(', ');
  }
  async function syncSheet(src, silent) {
    try {
      const rows = parseCSV(await fetchSheetCSV(src.url));
      if (rows.length < 2) throw new Error('В таблице нет строк с данными.');
      applySheet(src, rows); save(); render();
      if (!silent) toast(`${src.name}: ${resultText(src)}`);
      return true;
    } catch (e) {
      src.lastError = e.message || String(e); save(); render();
      if (!silent) toast(`${src.name}: ${src.lastError}`);
      return false;
    }
  }
  async function syncAll(silent) {
    const list = (state.settings.sheets || []).filter((s) => s.enabled !== false);
    if (!list.length) return;
    const btn = document.getElementById('sync-btn'); if (btn) btn.disabled = true;
    let ok = 0; for (const src of list) { if (await syncSheet(src, true)) ok++; }
    if (btn) btn.disabled = false;
    if (!silent) toast(ok === list.length ? `Обновлено из ${ok} ${plural(ok, 'таблицы', 'таблиц', 'таблиц')}` : `Обновлено ${ok} из ${list.length}: ${list.filter((s) => s.lastError).map((s) => s.name + ' — ' + s.lastError).join('; ')}`);
  }
  function sheetSourceForm(src) {
    const isNew = !src;
    src = src || { url: '', type: 'students', autoSync: true, archiveMissing: true, mapping: null };
    const html = `
      <div class="form-grid">
        ${field('Ссылка на Google Таблицу', inp('url', src.url, 'url', 'required placeholder="https://docs.google.com/spreadsheets/d/…/edit#gid=…"'), true)}
        ${field('Что в этом листе', `<select name="type">${Object.entries(SHEET_TYPES).map(([k, v]) => `<option value="${k}" ${src.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
        ${field('Проект', projectSelect('projectId', src.projectId))}
      </div>
      <p class="form-note">Скопируйте ссылку из адресной строки, открыв нужный лист — в ней будет <code>gid</code> листа. Доступ: Файл → Поделиться → «Все, у кого есть ссылка» (Читатель), либо Файл → Опубликовать в интернете.</p>`;
    openModal(isNew ? 'Подключить Google Таблицу' : 'Google Таблица', html, async (d) => {
      const btn = modalForm.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Загружаю…';
      try {
        const rows = parseCSV(await fetchSheetCSV(d.url));
        if (rows.length < 1) throw new Error('Таблица пустая.');
        const draft = Object.assign({ id: uid(), name: '', autoSync: true, archiveMissing: true, enabled: true }, src, { url: d.url.trim(), type: d.type, projectId: d.projectId || '' });
        if (!draft.mapping || draft.type !== src.type) draft.mapping = autoMapping(draft.type, rows[0]);
        sheetMappingForm(draft, rows, isNew);
      } catch (e) { btn.disabled = false; btn.textContent = 'Загрузить'; toast(e.message || 'Ошибка загрузки'); }
    }, 'Загрузить');
  }
  function sheetMappingForm(draft, rows, isNew) {
    const headers = rows[0]; const sample = rows.slice(1, 6);
    const colOpts = (sel) => `<option value="">— нет —</option>` + headers.map((h, i) => `<option value="${i}" ${String(sel) === String(i) ? 'selected' : ''}>${esc(h || `Колонка ${i + 1}`)}</option>`).join('');
    const fields = SHEET_FIELDS[draft.type] || [];
    let extra = '';
    if (draft.type === 'expenses') {
      const months = headers.map((h) => parseMonthHeader(h)).filter(Boolean);
      extra = `<p class="form-note">Месяцы распознаны в заголовках: ${months.length ? months.map(ymLabel).join(', ') : '<b>ни одного</b> — заголовки колонок должны быть датами или названиями месяцев (June, Июнь, 06.2026)'}.</p>`;
    }
    const html = `
      <p class="small muted">Лист: ${headers.length} ${plural(headers.length, 'колонка', 'колонки', 'колонок')}, ${rows.length - 1} ${plural(rows.length - 1, 'строка', 'строки', 'строк')} с данными. Укажите, какая колонка что означает (поля со * обязательны).</p>
      <div class="form-grid">
        ${field('Название подключения', inp('name', draft.name || SHEET_TYPES[draft.type], 'text', 'required'), true)}
        ${fields.map(([f, label]) => field(label, `<select name="map_${f}">${colOpts(draft.mapping[f])}</select>`)).join('')}
      </div>${extra}
      <div class="table-wrap mt"><table class="small"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${sample.map((r) => `<tr>${headers.map((_, i) => `<td>${esc(r[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="mt"><label class="small"><input type="checkbox" name="autoSync" ${draft.autoSync ? 'checked' : ''}> Обновлять при каждом открытии сайта</label></div>
      ${draft.type === 'students' || draft.type === 'teachers' ? `<div><label class="small"><input type="checkbox" name="archiveMissing" ${draft.archiveMissing ? 'checked' : ''}> Отправлять в архив тех, кого больше нет в таблице</label></div>` : ''}
      <p class="form-note mt">${draft.type === 'students' ? 'Ученики сопоставляются по имени. Данные из таблицы обновляют карточку, а история оплат остаётся на сайте. Если в таблице есть колонка «Статус» (оплачено/нет) — дата следующей оплаты выставится по ней.' : draft.type === 'expenses' ? 'Расходы из этого листа заменяются целиком при каждом обновлении; записи, добавленные вручную на сайте, остаются.' : draft.type === 'payments' ? 'Записи из этого листа заменяются при каждом обновлении. Если имя совпадает с учеником — это его оплата, с преподавателем — зарплата.' : 'Преподаватели сопоставляются по имени.'}</p>`;
    openModal('Соответствие колонок', html, (d) => {
      const mapping = {}; fields.forEach(([f]) => { if (d[`map_${f}`] !== '' && d[`map_${f}`] != null) mapping[f] = Number(d[`map_${f}`]); });
      const must = { students: 'name', teachers: 'name', expenses: 'category', payments: 'name' }[draft.type];
      if (mapping[must] == null) { toast('Укажите обязательную колонку'); return; }
      Object.assign(draft, { name: d.name.trim(), mapping, autoSync: !!d.autoSync, archiveMissing: !!d.archiveMissing });
      state.settings.sheets = state.settings.sheets || [];
      const i = state.settings.sheets.findIndex((s) => s.id === draft.id);
      if (i >= 0) state.settings.sheets[i] = draft; else state.settings.sheets.push(draft);
      closeModal();
      try { applySheet(draft, rows); save(); render(); toast(`${draft.name}: ${resultText(draft)}`); }
      catch (e) { draft.lastError = e.message; save(); render(); toast('Ошибка: ' + e.message); }
    }, isNew ? 'Подключить и загрузить' : 'Сохранить и обновить');
  }
  function renderSheetsSection() {
    const list = state.settings.sheets || [];
    return `<section class="card"><div class="card-head"><h2>Google Таблицы</h2><button class="btn sm primary" data-act="add-sheet">+ Подключить</button></div>
      ${list.length ? `<div class="list">${list.map((s) => `<div class="row ${s.lastError ? 'is-overdue' : ''}"><div class="row-main"><div class="row-title">${esc(s.name)} <span class="badge muted">${SHEET_TYPES[s.type] || s.type}</span>${s.autoSync ? '<span class="badge muted">авто</span>' : ''}</div>
        <div class="row-sub">${s.lastError ? `<span style="color:var(--overdue)">${esc(s.lastError)}</span>` : s.lastSync ? `Обновлено ${new Date(s.lastSync).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${resultText(s)}` : 'Ещё не обновлялось'} · <a href="${esc(s.url)}" target="_blank" rel="noopener">открыть таблицу</a></div></div>
        <div class="row-actions"><button class="btn sm good" data-act="sync-sheet" data-id="${s.id}">Обновить</button><button class="btn sm" data-act="edit-sheet" data-id="${s.id}">✎</button><button class="btn sm danger" data-act="del-sheet" data-id="${s.id}">✕</button></div></div>`).join('')}</div>`
      : `<p class="small muted">Подключите лист Google Таблицы — сайт будет брать из него учеников, преподавателей, расходы или журнал платежей. Нужен доступ по ссылке на чтение. Колонки сопоставляются автоматически по заголовкам (Имя, Группа, Цена, Дата оплаты, Статус…) и их можно поправить вручную.</p>`}
    </section>`;
  }
  function updateSyncButton() {
    const btn = document.getElementById('sync-btn'); if (!btn) return;
    const list = (state.settings.sheets || []).filter((s) => s.enabled !== false);
    btn.hidden = !list.length;
    const last = list.map((s) => s.lastSync).filter(Boolean).sort().pop();
    btn.title = last ? `Последнее обновление: ${new Date(last).toLocaleString('ru-RU')}` : 'Обновить данные из Google Таблиц';
    btn.classList.toggle('has-error', list.some((s) => s.lastError));
  }

  // ---------- События ----------
  document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (!b) return; activeTab = b.dataset.tab; render(); window.scrollTo(0, 0); });
  document.getElementById('project-filter').addEventListener('change', (e) => { ui.project = e.target.value; ui.studentGroup = 'all'; render(); });
  view.addEventListener('click', (e) => {
    const go = e.target.closest('[data-tab-go]'); if (go) { activeTab = go.dataset.tabGo; render(); return; }
    const sf = e.target.closest('[data-sfilter]'); if (sf) { ui.studentFilter = sf.dataset.sfilter; render(); return; }
    const tf = e.target.closest('[data-tfilter]'); if (tf) { ui.teacherFilter = tf.dataset.tfilter; render(); return; }
    const hf = e.target.closest('[data-hfilter]'); if (hf) { ui.historyKind = hf.dataset.hfilter; render(); return; }
    const gv = e.target.closest('[data-gview]'); if (gv) { ui.groupsView = gv.dataset.gview; render(); return; }
    const ex = e.target.closest('[data-exp]'); if (ex) { const n = Number(ex.dataset.exp); ui.expEnd = n === 0 ? null : ymShift(ui.expEnd || todayISO().slice(0, 7), n); render(); return; }
    const cal = e.target.closest('[data-cal]'); if (cal) {
      const n = Number(cal.dataset.cal);
      if (n === 0) ui.calMonth = null; else { const base = ui.calMonth ? parseISO(ui.calMonth + '-01') : new Date(); const d = new Date(base.getFullYear(), base.getMonth() + n, 1); ui.calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
      render(); return;
    }
    const day = e.target.closest('[data-day]'); if (day) { ui.calSelected = ui.calSelected === day.dataset.day ? null : day.dataset.day; render(); return; }
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const { act, id } = btn.dataset;
    switch (act) {
      case 'add-sheet': sheetSourceForm(null); break;
      case 'edit-sheet': sheetSourceForm((state.settings.sheets || []).find((x) => x.id === id)); break;
      case 'sync-sheet': { const src = (state.settings.sheets || []).find((x) => x.id === id); if (src) syncSheet(src, false); break; }
      case 'del-sheet': { const src = (state.settings.sheets || []).find((x) => x.id === id); if (!src) break; if (!confirm(`Отключить «${src.name}»? Загруженные данные останутся на сайте, но обновляться не будут.`)) break; state.settings.sheets = state.settings.sheets.filter((x) => x.id !== id); save(); render(); toast('Таблица отключена'); break; }
      case 'add-project': projectForm(null); break;
      case 'edit-project': projectForm(byId(state.projects, id)); break;
      case 'del-project': {
        const p = byId(state.projects, id); if (!p) break;
        if (!confirm(`Удалить проект «${p.name}»? Группы, ученики и записи останутся, но будут «без проекта».`)) break;
        state.projects = state.projects.filter((x) => x.id !== id);
        [state.groups, state.students, state.teachers, state.recurring, state.payments].forEach((arr) => arr.forEach((x) => { if (x.projectId === id) x.projectId = ''; }));
        if (ui.project === id) ui.project = 'all';
        save(); render(); toast('Проект удалён'); break;
      }
      case 'add-group': groupForm(null); break;
      case 'edit-group': groupForm(groupById(id)); break;
      case 'archive-group': toggleArchive(state.groups, id, 'Группа в архиве', 'Группа возвращена'); break;
      case 'add-student': studentForm(null, ui.studentGroup !== 'all' && ui.studentGroup !== 'solo' ? ui.studentGroup : null); break;
      case 'add-student-to': studentForm(null, id); break;
      case 'edit-student': studentForm(byId(state.students, id)); break;
      case 'archive-student': toggleArchive(state.students, id, 'Ученик в архиве', 'Ученик возвращён'); break;
      case 'add-teacher': teacherForm(null); break;
      case 'edit-teacher': teacherForm(byId(state.teachers, id)); break;
      case 'archive-teacher': toggleArchive(state.teachers, id, 'Преподаватель в архиве', 'Преподаватель возвращён'); break;
      case 'add-recurring': recurringForm(btn.dataset.project ? { projectId: btn.dataset.project, payDay: 1, amount: '' } : null); break;
      case 'edit-recurring': recurringForm(byId(state.recurring, id)); break;
      case 'add-expense': manualPaymentForm({ kind: 'expense', projectId: btn.dataset.project || '', category: btn.dataset.cat || '', date: btn.dataset.ym ? (btn.dataset.ym === todayISO().slice(0, 7) ? todayISO() : `${btn.dataset.ym}-01`) : todayISO() }); break;
      case 'pay-student': payForm('income', id); break;
      case 'pay-teacher': payForm('salary', id); break;
      case 'pay-payout': payForm('payout', id); break;
      case 'pay-recurring': payForm('expense', id); break;
      case 'remind': remindStudent(id); break;
      case 'lesson-done': lessonDone(id); break;
      case 'teacher-lesson-plus': teacherLesson(id, 1); break;
      case 'teacher-lesson-minus': teacherLesson(id, -1); break;
      case 'del-payment': deletePayment(id); break;
      case 'manual-payment': manualPaymentForm(); break;
      case 'chart-toggle': ui.chartTable = !ui.chartTable; render(); break;
      case 'export': exportJSON(); break;
      case 'export-csv': exportCSV(); break;
      case 'export-expenses': exportExpenses(); break;
      case 'seed-mine': if ((!state.students.length && !state.payments.length) || confirm('Заменить текущие данные данными TR-YOS Zone из таблицы Finances?')) seedMine(); break;
      case 'dismiss-banner': state.seedVersion = SEED_VERSION; save(); render(); break;
      case 'wipe': if (confirm('Удалить все данные без возможности восстановления?')) { state = defaultState(); ui.project = 'all'; save(); render(); toast('Данные удалены'); } break;
    }
  });
  view.addEventListener('input', (e) => {
    if (e.target.matches('[data-ssearch]')) { ui.studentSearch = e.target.value; const pos = e.target.selectionStart; render(); const el = view.querySelector('[data-ssearch]'); if (el) { el.focus(); el.setSelectionRange(pos, pos); } }
  });
  view.addEventListener('change', (e) => {
    if (e.target.matches('[data-sgroup]')) { ui.studentGroup = e.target.value; render(); }
    if (e.target.matches('[data-setting]')) {
      const k = e.target.dataset.setting; let v = e.target.value;
      if (k === 'remindDays') v = Math.max(0, Math.min(30, Number(v) || 0));
      if (k === 'currency') v = v.trim() || '$';
      state.settings[k] = v; save(); applyTheme(); render(); toast('Сохранено');
    }
    if (e.target.matches('[data-import]') && e.target.files[0]) importJSON(e.target.files[0]);
  });

  document.getElementById('sync-btn').addEventListener('click', () => syncAll(false));

  // Старый набор данных (только расходы за июнь из Numbers) заменяем новым автоматически
  const oldSeedOnly = !state.students.length && !state.groups.length && !state.teachers.length && state.payments.length > 0 && state.payments.every((p) => p.note === 'из таблицы Numbers');
  applyTheme();
  if (oldSeedOnly) seedMine(); else render();
  if ((state.settings.sheets || []).some((x) => x.autoSync && x.enabled !== false)) syncAll(true);
})();
