/* forms.js — окна создания и правки: ученик, группа, преподаватель, подписка, проект, доп. начисление. */
import { html } from './vendor.js';
import { store, act, allCategories, defaultStartYm } from './store.js';
import * as C from './core.js';
import { guard, money, Sheet, Fields, useForm, monthOptions, sheets, confirmSheet, getDerived, toast } from './ui.js';

const S = () => store.state;
const byId = (list, id) => list.find((x) => x.id === id);
const num = (v) => C.parseAmount(v) || 0;
/** Проверка числовых полей перед сохранением: непустое поле должно читаться как неотрицательное число. */
function bad(v, fields) {
  for (const [k, label, max] of fields) {
    const t = String(v[k] ?? '').trim();
    if (!t) continue;
    const n = C.parseAmount(t);
    if (n == null || n < 0 || (max && n > max)) { toast(`Проверьте поле «${label}»: ${max ? `нужно число от 1 до ${max}` : 'нужно число'}`); return true; }
  }
  return false;
}
const projectField = (label = 'Проект') => S().projects.length ? { k: 'projectId', label, type: 'select', opts: [['', '— без проекта —'], ...S().projects.map((p) => [p.id, p.name])] } : null;
const teacherOpts = () => [['', '— не указан —'], ...S().teachers.filter((t) => !t.archived).map((t) => [t.id, t.name])];
const curRate = (rates, key) => { const r = C.rateAt(rates, C.ymOf(C.today())); return r ? r[key] : ''; };
const payInit = (pay, fallbackDay) => { const r = pay && C.rateAt(pay.rates, C.ymAdd(C.ymOf(C.today()), 1)); return { pay_mode: r ? r.mode : 'fixed', pay_amount: r && r.amount ? String(r.amount) : '', pay_day: String((pay && pay.payDay) || fallbackDay || 1) }; };
const payOut = (v, init) => ({ mode: v.pay_mode, amount: num(v.pay_amount), payDay: v.pay_day, from: v.pay_from, changed: v.pay_mode !== init.pay_mode || num(v.pay_amount) !== num(init.pay_amount) });
/** Месяцы для списков «действует с»: от полугода назад (или с первого месяца записи) до двух месяцев вперёд; last расширяет список. */
const fromOptions = (first, last) => { const cur = C.ymOf(C.today()), to = C.ymAdd(cur, 2); return monthOptions(first && first < C.ymAdd(cur, -6) ? first : C.ymAdd(cur, -6), last && last > to ? last : to, cur); };
/** Поля «оплата преподавателю» для группы или индивидуального ученика. */
const payFields = (title, hint, init, show) => [
  { sec: title, hint, show },
  { k: 'pay_mode', label: 'Как считать', type: 'select', opts: [['fixed', 'Сумма в месяц'], ['percent', 'Процент от оплат']], show },
  { k: 'pay_amount', label: 'Сумма или процент', type: 'money', ph: '0', show },
  { k: 'pay_day', label: 'День выплаты (число месяца)', type: 'number', show },
  { k: 'pay_from', label: 'Действует с', type: 'select', opts: fromOptions(), show: (v) => (!show || show(v)) && (v.pay_mode !== init.pay_mode || num(v.pay_amount) !== num(init.pay_amount)), hint: 'Прошлые месяцы не пересчитываются.' },
];

export function StudentForm({ id, groupId, close }) {
  const st = S();
  const s = id ? byId(st.students, id) : null;
  const g0 = byId(st.groups, s ? s.groupId : groupId);
  const cur = C.ymOf(C.today());
  const L = s ? getDerived().student(s.id) : null;
  const init = s ? {
    name: s.name, groupId: s.groupId, projectId: s.projectId, teacherId: s.teacherId, subject: s.subject, payType: s.payType,
    price: String(curRate(s.rates, 'price') ?? ''), payDay: String(s.payDay), startYm: s.startYm, rateFrom: L && !L.package ? C.firstUnpaidYm(L, cur) : cur,
    pkgSize: String((s.pkg && s.pkg.size) || 8), lessonsLeft: L && L.package ? String(L.lessonsLeft) : '', phone: s.phone, telegram: s.telegram, notes: s.notes, ...payInit(s.pay, s.payDay),
  } : {
    name: '', groupId: g0 ? g0.id : '', projectId: g0 ? g0.projectId : store.ui.project !== 'all' ? store.ui.project : (st.projects[0] || {}).id || '', teacherId: g0 ? g0.teacherId : '', subject: g0 ? g0.subject : '',
    payType: g0 ? g0.payType : 'monthly', price: g0 && g0.price ? String(g0.price) : '', payDay: String(g0 ? g0.payDay : Math.min(28, Number(C.today().slice(8, 10)))), startYm: cur, rateFrom: cur,
    pkgSize: String(g0 ? g0.lessonsInPackage : 8), lessonsLeft: '', phone: '', telegram: '', notes: '', ...payInit(null, 1),
  };
  init.pay_from = defaultStartYm(init.pay_day);
  const [v, set] = useForm(init);
  const onGroup = (gid, setF) => { const g = byId(st.groups, gid); if (!g) return; setF({ projectId: g.projectId, teacherId: g.teacherId || v.teacherId, subject: g.subject || v.subject, ...(s ? {} : { payType: g.payType, price: g.price ? String(g.price) : v.price, payDay: String(g.payDay), pkgSize: String(g.lessonsInPackage) }) }); };
  const groupTeacher = (x) => (byId(st.groups, x.groupId) || {}).teacherId || '';
  const monthly = (x) => x.payType !== 'package';
  const soloPerGroup = (x) => !x.groupId && (byId(st.teachers, x.teacherId) || {}).payType === 'perGroup';
  const priceChanged = (x) => !!s && monthly(x) && num(x.price) !== num(init.price);
  const fields = [
    { k: 'name', label: 'Имя ученика', req: true, span: true, ph: 'Иван Петров' },
    { k: 'groupId', label: 'Группа', type: 'select', opts: [['', '— индивидуально —'], ...st.groups.filter((g) => !g.archived || g.id === v.groupId).map((g) => [g.id, g.name])], onChange: onGroup },
    { k: 'teacherId', label: 'Преподаватель', type: 'select', opts: teacherOpts(), show: (x) => !groupTeacher(x) },
    { k: 'teacherOfGroup', type: 'custom', label: 'Преподаватель', show: (x) => !!groupTeacher(x), render: (x) => html`<div class="input" style="display:flex;align-items:center;background:var(--surface-2);color:var(--text-2)">${(byId(st.teachers, groupTeacher(x)) || {}).name || '—'}</div>`, hint: 'как у группы' },
    { k: 'payType', label: 'Как платит', type: 'seg', span: true, opts: [['monthly', 'Каждый месяц'], ['package', 'Абонемент на N занятий']] },
    { k: 'price', label: v.payType === 'package' ? 'Цена абонемента' : 'Цена в месяц', type: 'money', ph: '0', req: true },
    { k: 'payDay', label: 'День оплаты (число месяца)', type: 'number', show: monthly },
    { k: 'rateFrom', label: 'Новая цена действует с', type: 'select', span: true, opts: fromOptions(s && s.startYm, init.rateFrom), show: priceChanged, hint: 'Уже оплаченные месяцы останутся по старой цене. Чтобы исправить цену с самого начала, выберите первый месяц.' },
    { k: 'startYm', label: s ? 'Начисления идут с' : 'Первый месяц оплаты', type: 'select', opts: fromOptions(s && s.startYm, s && s.startYm), show: monthly, hint: s ? null : 'С этого месяца дашборд начнёт ждать оплату.' },
    { k: 'pkgSize', label: 'Занятий в абонементе', type: 'number', show: (x) => !monthly(x) },
    { k: 'lessonsLeft', label: 'Осталось занятий сейчас', type: 'number', show: (x) => !monthly(x), ph: s ? '' : '0', hint: s ? null : 'Если абонемент уже оплачен — впишите остаток. Пусто — ждём оплату.' },
    { k: 'phone', label: 'Телефон (WhatsApp)', type: 'tel', ph: '+90 …' },
    { k: 'telegram', label: 'Telegram', ph: '@username' },
    { k: 'subject', label: 'Предмет', ph: 'TR-YOS' },
    !v.groupId ? projectField() : null,
    { k: 'notes', label: 'Заметка', span: true, ph: 'скидка, договорённости…' },
    ...payFields('Оплата преподавателю за индивидуальные занятия', 'Схема преподавателя — «за группу / индивидуально».', init, soloPerGroup),
  ];
  const submit = () => {
    if (!v.name.trim()) return;
    if (bad(v, [['price', 'Цена'], ['payDay', 'День оплаты', 31], ['pkgSize', 'Занятий в абонементе', 500], ['lessonsLeft', 'Осталось занятий'], ['pay_amount', 'Сумма или процент'], ['pay_day', 'День выплаты', 31]])) return;
    close();
    act.saveStudent({ ...v, price: num(v.price), priceWas: s ? num(init.price) : null, lessonsLeft: String(v.lessonsLeft).trim() === '' ? '' : num(v.lessonsLeft), pay: soloPerGroup(v) ? payOut(v, init) : null }, id);
  };
  return html`<${Sheet} title=${s ? 'Ученик' : 'Новый ученик'} onClose=${close} onSubmit=${submit}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary">${s ? 'Сохранить' : 'Добавить'}</button>`}>
    <${Fields} fields=${fields} v=${v} set=${set} />
  <//>`;
}

export function GroupForm({ id, close }) {
  const st = S();
  const g = id ? byId(st.groups, id) : null;
  const cur = C.ymOf(C.today());
  const init = g ? { name: g.name, projectId: g.projectId, teacherId: g.teacherId, subject: g.subject, schedule: g.schedule, payType: g.payType, price: g.price ? String(g.price) : '', payDay: String(g.payDay), lessonsInPackage: String(g.lessonsInPackage), notes: g.notes, applyFrom: '', ...payInit(g.pay, g.payDay) }
    : { name: '', projectId: store.ui.project !== 'all' ? store.ui.project : (st.projects[0] || {}).id || '', teacherId: '', subject: '', schedule: '', payType: 'monthly', price: '', payDay: '1', lessonsInPackage: '8', notes: '', applyFrom: '', ...payInit(null, 1) };
  init.pay_from = defaultStartYm(init.pay_day);
  const [v, set] = useForm(init);
  const members = g ? st.students.filter((s) => s.groupId === g.id && !s.archived).length : 0;
  const teacher = byId(st.teachers, v.teacherId);
  const fields = [
    { k: 'name', label: 'Название группы', req: true, span: true, ph: 'Group A1, вечерняя' },
    { k: 'teacherId', label: 'Преподаватель', type: 'select', opts: teacherOpts() },
    { k: 'schedule', label: 'Расписание', ph: 'Пн, Ср 18:00' },
    { k: 'payType', label: 'Как платят ученики', type: 'seg', span: true, opts: [['monthly', 'Каждый месяц'], ['package', 'Абонемент на N занятий']] },
    { k: 'price', label: 'Цена для ученика', type: 'money', ph: '0' },
    { k: 'payDay', label: 'День оплаты (число месяца)', type: 'number', show: (x) => x.payType !== 'package' },
    { k: 'lessonsInPackage', label: 'Занятий в абонементе', type: 'number', show: (x) => x.payType === 'package' },
    { k: 'applyFrom', label: `Обновить цену у учеников группы (${members})`, type: 'select', span: true, opts: [['', 'Не менять — только для новых учеников'], ...fromOptions().map(([ym, l]) => [ym, 'С месяца: ' + l])], show: (x) => !!g && members > 0 && num(x.price) !== num(init.price), hint: 'Изменится только у тех, кто платит обычную цену группы.' },
    { k: 'subject', label: 'Предмет', ph: 'TR-YOS' },
    projectField(),
    { k: 'notes', label: 'Заметка', span: true },
    ...payFields('Оплата преподавателю за эту группу', teacher && teacher.payType !== 'perGroup' ? `У ${teacher.name} другая схема оплаты — эти поля начнут работать, если выбрать схему «за группу / индивидуально».` : 'Каждый месяц начисляется преподавателю и появляется в списке «Выплатить».', init, (x) => !!x.teacherId),
  ];
  const submit = () => {
    if (!v.name.trim()) return;
    if (bad(v, [['price', 'Цена для ученика'], ['payDay', 'День оплаты', 31], ['lessonsInPackage', 'Занятий в абонементе', 500], ['pay_amount', 'Сумма или процент'], ['pay_day', 'День выплаты', 31]])) return;
    close();
    act.saveGroup({ ...v, price: num(v.price), pay: payOut(v, init) }, id);
  };
  return html`<${Sheet} title=${g ? 'Группа' : 'Новая группа'} onClose=${close} onSubmit=${submit}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary">${g ? 'Сохранить' : 'Добавить'}</button>`}>
    <${Fields} fields=${fields} v=${v} set=${set} />
    ${!g && html`<p class="hint" style="margin-top:12px">Цена, день оплаты и преподаватель подставляются новым ученикам группы; у каждого ученика их можно изменить.</p>`}
  <//>`;
}

export function TeacherForm({ id, close }) {
  const st = S();
  const t = id ? byId(st.teachers, id) : null;
  const cur = C.ymOf(C.today());
  const init = t ? { name: t.name, projectId: t.projectId, subject: t.subject, payType: t.payType, rate: String(curRate(t.rates, 'amount') || ''), payDay: String(t.payDay), rateFrom: cur, phone: t.phone, telegram: t.telegram, notes: t.notes }
    : { name: '', projectId: '', subject: '', payType: 'perGroup', rate: '', payDay: '5', rateFrom: '', phone: '', telegram: '', notes: '' };
  const [v, set] = useForm(init);
  const fixed = (x) => x.payType !== 'perGroup';
  const fields = [
    { k: 'name', label: 'Имя преподавателя', req: true, span: true, ph: 'Мария Ивановна' },
    { k: 'payType', label: 'Как считается оплата', type: 'select', span: true, opts: [['perGroup', 'За каждую группу и индивидуального ученика'], ['salary', 'Оклад — фиксированная сумма в месяц'], ['perLesson', 'За каждое проведённое занятие']],
      hint: (x) => x.payType === 'perGroup' ? 'Сумма (или процент от оплат учеников) и день выплаты задаются в карточке каждой группы и у индивидуальных учеников.' : x.payType === 'perLesson' ? 'Занятия отмечаются кнопкой «+1 занятие»; месяц оплачивается в день выплаты следующего месяца.' : 'Каждый месяц начисляется оклад, срок — день выплаты.' },
    { k: 'rate', label: v.payType === 'perLesson' ? 'Ставка за занятие' : 'Оклад в месяц', type: 'money', ph: '0', show: fixed },
    { k: 'payDay', label: 'День выплаты (число месяца)', type: 'number', show: fixed },
    { k: 'rateFrom', label: 'Новая сумма действует с', type: 'select', span: true, opts: fromOptions(t && t.startYm), show: (x) => !!t && fixed(x) && x.payType === init.payType && num(x.rate) !== num(init.rate) },
    { k: 'phone', label: 'Телефон', type: 'tel' },
    { k: 'telegram', label: 'Telegram', ph: '@username' },
    { k: 'subject', label: 'Предмет', ph: 'TR-YOS' },
    S().projects.length > 1 ? { k: 'projectId', label: 'Проект', type: 'select', opts: [['', '— все проекты —'], ...st.projects.map((p) => [p.id, p.name])] } : null,
    { k: 'notes', label: 'Заметка', span: true },
  ];
  const submit = () => {
    if (!v.name.trim()) return;
    if (bad(v, [['rate', 'Сумма'], ['payDay', 'День выплаты', 31]])) return;
    close();
    // «действует с» учитывается, только когда это поле было на экране (та же схема, другая сумма)
    const sameType = !!t && t.payType === v.payType;
    act.saveTeacher({ ...v, rate: num(v.rate), rateWas: sameType ? num(init.rate) : null, rateFrom: sameType ? v.rateFrom : '' }, id);
  };
  return html`<${Sheet} title=${t ? 'Преподаватель' : 'Новый преподаватель'} onClose=${close} onSubmit=${submit}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary">${t ? 'Сохранить' : 'Добавить'}</button>`}>
    <${Fields} fields=${fields} v=${v} set=${set} />
  <//>`;
}

export function RecurringForm({ id, close, preset = {} }) {
  const st = S();
  const r = id ? byId(st.recurring, id) : null;
  const init = r ? { name: r.name, projectId: r.projectId, amount: String(r.amount || ''), payDay: String(r.payDay), startYm: r.startYm, auto: r.auto, notes: r.notes }
    : { name: preset.name || '', projectId: preset.projectId != null ? preset.projectId : store.ui.project !== 'all' ? store.ui.project : (st.projects[0] || {}).id || '', amount: '', payDay: '1', startYm: defaultStartYm(1), auto: false, notes: '' };
  const [v, set] = useForm(init);
  const fields = [
    { k: 'name', label: 'Название (оно же категория расходов)', req: true, span: true, ph: 'Zoom, аренда, Instagram…', list: 'rec-cats' },
    { k: 'amount', label: 'Сумма в месяц', type: 'money', req: true, ph: '0' },
    { k: 'payDay', label: 'День списания', type: 'number', onChange: (x, setF) => { if (!r && Number(x) >= 1) setF('startYm', defaultStartYm(x)); } },
    { k: 'startYm', label: r ? 'Ждём списания с' : 'Первое списание', type: 'select', opts: fromOptions(r && r.startYm, r && r.startYm) },
    projectField(),
    { k: 'auto', type: 'switch', span: true, text: 'Списывается автоматически', hint: 'Дашборд сам запишет расход в день списания — без напоминаний и кнопок. Прошлые неоплаченные месяцы останутся в списке «оплатить».' },
    { k: 'notes', label: 'Заметка', span: true },
  ];
  const submit = () => { if (!v.name.trim()) return; if (bad(v, [['amount', 'Сумма в месяц'], ['payDay', 'День списания', 31]])) return; close(); act.saveRecurring({ ...v, amount: num(v.amount) }, id); };
  return html`<${Sheet} title=${r ? 'Подписка' : 'Новая подписка'} cls="narrow" onClose=${close} onSubmit=${submit}
    foot=${html`${r && html`<div class="left"><button type="button" class="btn danger" onClick=${() => { close(); confirmSheet({ title: 'Удалить подписку?', text: `«${r.name}» исчезнет из списка. Уже записанные расходы останутся в журнале.`, onOk: () => act.deleteRecurring(id) }); }}>Удалить</button></div>`}<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary">${r ? 'Сохранить' : 'Добавить'}</button>`}>
    <${Fields} fields=${fields} v=${v} set=${set} cls="stack-narrow" />
    <datalist id="rec-cats">${allCategories().map((c) => html`<option value=${c}></option>`)}</datalist>
  <//>`;
}

export function ProjectForm({ id, close }) {
  const p = id ? byId(S().projects, id) : null;
  const [v, set] = useForm({ name: p ? p.name : '', notes: p ? p.notes : '' });
  return html`<${Sheet} title=${p ? 'Проект' : 'Новый проект'} cls="narrow" onClose=${close} onSubmit=${() => { if (!v.name.trim()) return; close(); act.saveProject(v, id); }}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary">${p ? 'Сохранить' : 'Добавить'}</button>`}>
    <${Fields} fields=${[{ k: 'name', label: 'Название', req: true, span: true, ph: 'TR-YOS Zone' }, { k: 'notes', label: 'Заметка', span: true }]} v=${v} set=${set} />
  <//>`;
}

function ExtraFormI({ id, close }) {
  const s = byId(S().students, id);
  const [v, set] = useForm({ label: '', amount: '', date: C.today() });
  if (!s) return null;
  return html`<${Sheet} title=${`Доп. начисление · ${s.name}`} cls="narrow" onClose=${close} onSubmit=${() => { if (!(num(v.amount) > 0)) return toast('Укажите сумму начисления'); if (!C.isSaneDate(v.date)) return toast('Проверьте дату'); close(); act.addExtra(id, { ...v, amount: num(v.amount) }); }}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary">Добавить</button>`}>
    <${Fields} fields=${[{ k: 'label', label: 'За что', span: true, ph: 'Учебник, пробный экзамен, регистрация…' }, { k: 'amount', label: 'Сумма', type: 'money', req: true, ph: '0' }, { k: 'date', label: 'Оплатить до', type: 'date' }]} v=${v} set=${set} />
    <p class="hint" style="margin-top:12px">Разовая сумма сверх ежемесячной оплаты. Она попадёт в долг ученика и закроется следующей оплатой.</p>
  <//>`;
}

/** Своя сумма начисления за конкретный месяц. */
function ChargeFormI({ id, ym, close }) {
  const s = byId(S().students, id);
  const d = getDerived();
  // месяц может быть дальше обычного горизонта расчёта (ячейка будущего месяца в таблице)
  const L = C.studentLedger(s, d.idx.studentPays(id), { today: d.today, remindDays: d.remindDays, toYm: ym });
  const c = L.charges.find((x) => x.key === 'm:' + ym);
  const base = c ? c.base : Number((C.rateAt(s.rates, ym) || {}).price) || 0;
  const [v, set] = useForm({ amount: c ? String(c.amount) : String(base) });
  const n = C.parseAmount(v.amount), ok = String(v.amount).trim() !== '' && n != null && n >= 0;
  return html`<${Sheet} title=${`${s.name} · ${C.ymLong(ym)}`} cls="narrow" onClose=${close} onSubmit=${() => { if (!ok) return; close(); act.setOverride(id, ym, n); }}
    foot=${html`${c && c.custom && html`<div class="left"><button type="button" class="btn ghost" onClick=${() => { close(); act.setOverride(id, ym, null); }}>Вернуть ${money(base)}</button></div>`}<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary" disabled=${!ok}>Сохранить</button>`}>
    <div class="field"><label for="ch-amount">Начислить за ${C.ymName(ym)}</label><input id="ch-amount" class="input big" inputmode="decimal" autocomplete="off" value=${v.amount} onInput=${(e) => set('amount', e.target.value)} /></div>
    <p class="hint" style="margin-top:12px">Скидка, неполный месяц или другая договорённость. Обычная цена — ${money(base)}; 0 означает, что за этот месяц платить не нужно.</p>
  <//>`;
}

export const ExtraForm = guard('students', ExtraFormI), ChargeForm = guard('students', ChargeFormI);
Object.assign(sheets, { studentForm: StudentForm, groupForm: GroupForm, teacherForm: TeacherForm, recurringForm: RecurringForm, projectForm: ProjectForm, extraForm: ExtraForm, chargeForm: ChargeForm });
