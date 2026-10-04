/* quick.js — быстрый ввод: оплата в одно касание, окно оплаты, выплаты, «+ Запись», напоминания, поиск и команды. */
import { html, useState, useEffect, useRef, useMemo } from './vendor.js';
import { store, act, allCategories } from './store.js';
import * as C from './core.js';
import { guard, money, cx, Icon, Sheet, Avatar, Pill, Seg, Fields, useForm, openSheet, replaceSheet, closeSheet, toast, copyText, getDerived, sheets, open, go, dueText, studentInfo, SearchInput, download } from './ui.js';

const S = () => store.state;
const byId = (list, id) => list.find((x) => x.id === id);
const groupOf = (s) => byId(S().groups, s.groupId);
const colorOf = (s) => { const g = groupOf(s); return g ? g.color : null; };
const monthsText = (yms) => { const u = [...new Set(yms)].sort().map(C.ymName); return u.length <= 1 ? u.join('') : u.slice(0, -1).join(', ') + ' и ' + u[u.length - 1]; };
/** Сумма из поля ввода: только положительная (возвраты и минусы не записываем как оплату). */
const pos = (v) => { const n = C.parseAmount(v); return n > 0 ? C.r2(n) : 0; };
/** Защита от двойного нажатия: после оплаты в одно касание список перестраивается, и второй клик попал бы в соседа. */
let lastQuick = 0;
const tooSoon = () => { const now = Date.now(); if (now - lastQuick < 700) return true; lastQuick = now; return false; };

// ---------- Оплата ученика ----------
/** Одно касание: если к оплате ровно одно начисление — записываем сразу (с «Отменить»), иначе открываем окно. */
export function quickPay(id) {
  const s = byId(S().students, id); if (!s) return;
  const L = getDerived().student(id);
  if (tooSoon()) return;
  if (S().settings.quickPay && !L.package && L.due.length === 1) act.payStudent(id, { amount: L.due[0].rest });
  else openSheet(PaySheet, { id });
}
function DateChips({ value, onChange }) {
  const t = C.today(), y = C.addDays(t, -1);
  return html`<div class="quick">
    <button type="button" class=${cx('chip sm', value === t && 'is-active')} onClick=${() => onChange(t)}>Сегодня</button>
    <button type="button" class=${cx('chip sm', value === y && 'is-active')} onClick=${() => onChange(y)}>Вчера</button>
    <input class="input sm" type="date" style="width:auto;flex:1;min-width:140px" value=${value} min="2000-01-01" max=${C.addDays(t, 366)} onInput=${(e) => C.isSaneDate(e.target.value) && onChange(e.target.value)} aria-label="Дата" />
  </div>`;
}
function MethodChips({ value, onChange }) {
  const m = S().settings.methods;
  if (!m.length) return null;
  return html`<div class="field span-2"><label>Способ оплаты</label><div class="quick">${m.map((x) => html`<button type="button" class=${cx('chip sm', value === x && 'is-active')} onClick=${() => onChange(value === x ? '' : x)}>${x}</button>`)}</div></div>`;
}
function PaySheetI({ id, close, amount: preset }) {
  const s = byId(S().students, id);
  const d = getDerived();
  if (!s) return null;
  const L = d.student(id);
  const open0 = L.charges.filter((c) => c.rest > 0);
  const options = [];
  let acc = 0;
  for (const c of open0.slice(0, 4)) { acc = C.r2(acc + c.rest); options.push({ amount: acc, label: options.length === 0 ? (c.kind === 'extra' ? c.label : C.ymName(c.ym)) : `${options.length + 1} ${C.plural(options.length + 1, 'начисление', 'начисления', 'начислений')}` }); }
  const def = preset != null ? preset : L.package ? L.price : L.dueNow || (L.next ? L.next.rest : 0);
  const [v, set] = useForm({ amount: def ? String(def) : '', date: C.today(), method: S().settings.defaultMethod || '', note: '' });
  const amount = pos(v.amount);
  const after = useMemo(() => (L.package || !amount ? null : C.studentLedger(s, [...d.idx.studentPays(id), { amount, date: v.date }], { today: d.today, remindDays: d.remindDays })), [amount, v.date, S().meta.rev]);
  const covered = after ? after.charges.filter((c) => { const b = L.charges.find((x) => x.key === c.key); return c.paid > (b ? b.paid : 0); }) : [];
  const submit = () => { if (!amount) return; close(); act.payStudent(id, { amount, date: v.date, method: v.method, note: v.note }); };
  const info = studentInfo(s, L);
  return html`<${Sheet} title=${`Оплата · ${s.name}`} cls="narrow" onClose=${close} onSubmit=${submit}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary" disabled=${!amount}>Записать${amount ? ' ' + money(amount) : ''}</button>`}>
    <div class="stack" style="gap:14px">
      <div class="row" style="padding:0;border:0"><${Avatar} name=${s.name} color=${colorOf(s)} /><div class="row-main"><div class="row-title"><span>${(groupOf(s) || {}).name || 'Индивидуально'}</span>${L.status !== 'ok' && html`<${Pill} status=${L.status}>${info.when}<//>`}</div><div class="row-sub">${info.amount ? `К оплате ${money(info.amount)} ${info.main}` : info.main}${info.next ? ` · ${money(info.next)}` : ''}</div></div></div>
      <div class="field"><label for="pay-amount">Сумма</label><input id="pay-amount" class="input big" inputmode="decimal" autocomplete="off" value=${v.amount} onInput=${(e) => set('amount', e.target.value)} placeholder="0" /></div>
      ${options.length > 1 && html`<div class="quick">${options.map((o) => html`<button type="button" class=${cx('chip sm', amount === o.amount && 'is-active')} onClick=${() => set('amount', String(o.amount))}>${o.label} · ${money(o.amount)}</button>`)}</div>`}
      <div class="field"><label>Дата</label><${DateChips} value=${v.date} onChange=${(x) => set('date', x)} /></div>
      <${MethodChips} value=${v.method} onChange=${(x) => set('method', x)} />
      <div class="field"><label for="pay-note">Комментарий</label><input id="pay-note" class="input" value=${v.note} onInput=${(e) => set('note', e.target.value)} placeholder="необязательно" /></div>
      ${L.package ? html`<div class="preview"><span>После оплаты добавится <b>${L.size} ${C.plural(L.size, 'занятие', 'занятия', 'занятий')}</b>.</span></div>`
        : after && html`<div class="preview">
          ${covered.length ? html`<span>Покроет: <b>${covered.map((c) => (c.kind === 'extra' ? c.label : C.ymName(c.ym)) + (c.rest > 0 ? ' (частично)' : '')).join(', ')}</b></span>` : html`<span>Все начисления уже оплачены — сумма пойдёт в предоплату.</span>`}
          <span>${after.debt > 0 ? html`Останется долг: <b>${money(after.debt)}</b>` : after.next ? html`Следующая оплата: <b>${C.fmtDate(after.next.due)}</b> · ${money(after.next.rest)}` : 'Долга не останется.'}</span>
        </div>`}
    </div>
  <//>`;
}

// ---------- Выплата преподавателю ----------
function PayoutSheetI({ id, close }) {
  const t = byId(S().teachers, id);
  const d = getDerived();
  if (!t) return null;
  const L = d.teacher(id);
  const openLines = L.lines.filter((c) => c.rest > 0);
  const def = L.dueNow || (L.next ? L.next.rest : 0);
  const [v, set] = useForm({ amount: def ? String(def) : '', date: C.today(), method: S().settings.defaultMethod || '', note: '' });
  const amount = pos(v.amount);
  const submit = () => { if (!amount) return; close(); act.payTeacher(id, { amount, date: v.date, method: v.method, note: v.note }); };
  return html`<${Sheet} title=${`Выплата · ${t.name}`} cls="narrow" onClose=${close} onSubmit=${submit}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary" disabled=${!amount}>Выплатить${amount ? ' ' + money(amount) : ''}</button>`}>
    <div class="stack" style="gap:14px">
      ${openLines.length ? html`<div class="pick">${openLines.slice(0, 8).map((c) => html`<div class="row"><div class="row-main"><div class="row-title"><span>${c.label}</span><${Pill} status=${c.status}>${c.status === 'later' ? C.fmtDate(c.due) : dueText(c.due)}<//></div><div class="row-sub">${c.pct != null ? `${c.pct}% от ${money(c.base)} · оплаты ${C.fmtDate(c.win[0])} – ${C.fmtDate(c.win[1])}` : `за ${C.ymName(c.ym)}`}${c.paid > 0 ? ` · выплачено ${money(c.paid)}` : ''}</div></div><span class="row-amount">${money(c.rest)}</span></div>`)}</div>`
        : html`<div class="preview"><span>Начислений к выплате нет — сумма запишется как аванс.</span></div>`}
      <div class="field"><label for="po-amount">Сумма</label><input id="po-amount" class="input big" inputmode="decimal" autocomplete="off" value=${v.amount} onInput=${(e) => set('amount', e.target.value)} placeholder="0" /></div>
      ${openLines.length > 1 && L.dueNow > 0 && html`<div class="quick"><button type="button" class=${cx('chip sm', amount === L.dueNow && 'is-active')} onClick=${() => set('amount', String(L.dueNow))}>К выплате сейчас · ${money(L.dueNow)}</button><button type="button" class=${cx('chip sm', amount === C.r2(openLines.reduce((a, c) => a + c.rest, 0)) && 'is-active')} onClick=${() => set('amount', String(C.r2(openLines.reduce((a, c) => a + c.rest, 0))))}>Всё начисленное · ${money(openLines.reduce((a, c) => a + c.rest, 0))}</button></div>`}
      <div class="field"><label>Дата</label><${DateChips} value=${v.date} onChange=${(x) => set('date', x)} /></div>
      <${MethodChips} value=${v.method} onChange=${(x) => set('method', x)} />
      <div class="field"><label for="po-note">Комментарий</label><input id="po-note" class="input" value=${v.note} onInput=${(e) => set('note', e.target.value)} placeholder="необязательно" /></div>
    </div>
  <//>`;
}

// ---------- Подписка ----------
export function quickRecurring(id, ym) {
  const r = byId(S().recurring, id); if (!r) return;
  if (tooSoon()) return;
  if (S().settings.quickPay && r.amount > 0) act.payRecurring(id, ym, { amount: r.amount });
  else openSheet(RecurringPaySheet, { id, ym });
}
function RecurringPaySheetI({ id, ym, close }) {
  const r = byId(S().recurring, id);
  if (!r) return null;
  const [v, set] = useForm({ amount: String(r.amount || ''), date: C.today(), note: '' });
  const amount = pos(v.amount);
  return html`<${Sheet} title=${`${r.name} · ${C.ymName(ym)}`} cls="narrow" onClose=${close} onSubmit=${() => { if (!amount) return; close(); act.payRecurring(id, ym, { amount, date: v.date, note: v.note }); }}
    foot=${html`<div class="left"><button type="button" class="btn ghost" onClick=${() => { close(); act.skipRecurring(id, ym, true); }}>Пропустить месяц</button></div><button type="submit" class="btn primary" disabled=${!amount}>Оплачено</button>`}>
    <div class="stack" style="gap:14px">
      <div class="field"><label for="rp-amount">Сумма</label><input id="rp-amount" class="input big" inputmode="decimal" autocomplete="off" value=${v.amount} onInput=${(e) => set('amount', e.target.value)} /></div>
      <div class="field"><label>Дата</label><${DateChips} value=${v.date} onChange=${(x) => set('date', x)} /></div>
      <div class="field"><label for="rp-note">Комментарий</label><input id="rp-note" class="input" value=${v.note} onInput=${(e) => set('note', e.target.value)} placeholder="необязательно" /></div>
    </div>
  <//>`;
}

// ---------- «+ Запись» ----------
const KINDS = [['income', 'Оплата ученика', 'in'], ['expense', 'Расход', 'out'], ['salary', 'Выплата', 'cash'], ['otherIncome', 'Другой доход', 'wallet']];
export function QuickAdd({ close, kind: k0, preset = {} }) {
  const [kind, setKind] = useState(k0 || 'income');
  const [q, setQ] = useState('');
  const d = getDerived();
  const st = S();
  const [v, set] = useForm({ category: preset.category || '', amount: '', date: preset.date || C.today(), note: '', method: '', projectId: preset.projectId != null ? preset.projectId : store.ui.project !== 'all' ? store.ui.project : (st.projects[0] || {}).id || '' });
  const amount = pos(v.amount);
  const nq = C.norm(q);
  const students = useMemo(() => d.activeStudents.filter((s) => !nq || C.matchScore(s.name, nq) || C.matchScore((groupOf(s) || {}).name || '', nq)).sort((a, b) => C.STATUS_ORDER[d.student(a.id).status] - C.STATUS_ORDER[d.student(b.id).status] || a.name.localeCompare(b.name, 'ru')), [nq, st.meta.rev]);
  const cats = allCategories();
  const top = useMemo(() => { const n = {}; for (const p of st.payments) if (p.kind === 'expense' && p.category) n[p.category] = (n[p.category] || 0) + 1; return Object.keys(n).sort((a, b) => n[b] - n[a]).slice(0, 6); }, [st.meta.rev]);
  const simple = kind === 'expense' || kind === 'otherIncome';
  const submit = () => { if (!simple || !amount) return; close(); act.addPayment({ kind, amount, category: v.category, date: v.date, note: v.note, method: v.method, projectId: v.projectId }); };
  return html`<${Sheet} title="Новая запись" onClose=${close} onSubmit=${submit}
    foot=${simple && html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary" disabled=${!amount}>Записать${amount ? ' ' + money(amount) : ''}</button>`}>
    <div class="stack" style="gap:14px">
      <div class="kinds">${KINDS.map(([k, label, icon]) => html`<button type="button" class=${cx('kind', kind === k && 'is-active')} onClick=${() => setKind(k)}><${Icon} name=${icon} />${label}</button>`)}</div>
      ${kind === 'income' && html`
        <${SearchInput} value=${q} onInput=${setQ} placeholder="Имя ученика или группа" auto=${!('ontouchstart' in window)} />
        ${students.length ? html`<div class="pick" style="max-height:340px">${students.map((s) => { const L = d.student(s.id), i = studentInfo(s, L); return html`<button type="button" class="row tap" onClick=${() => replaceSheet(PaySheet, { id: s.id })}><${Avatar} name=${s.name} color=${colorOf(s)} size="sm" /><div class="row-main"><div class="row-title"><span>${s.name}</span></div><div class="row-sub">${(groupOf(s) || {}).name || 'индивидуально'} · ${i.amount ? i.main : i.main.toLowerCase()}</div></div>${i.amount ? html`<div class="row-end"><span class="row-amount">${money(i.amount)}</span><${Pill} status=${L.status}>${i.when}<//></div>` : html`<span class="faint small">${i.next ? money(i.next) : ''}</span>`}</button>`; })}</div>`
          : html`<div class="preview"><span>${st.students.length ? 'Никого не нашлось.' : 'Учеников пока нет — добавьте первого в разделе «Ученики».'}</span></div>`}`}
      ${kind === 'salary' && (d.activeTeachers.length ? html`<div class="pick">${d.activeTeachers.map((t) => { const L = d.teacher(t.id); return html`<button type="button" class="row tap" onClick=${() => replaceSheet(PayoutSheet, { id: t.id })}><${Avatar} name=${t.name} size="sm" /><div class="row-main"><div class="row-title"><span>${t.name}</span></div><div class="row-sub">${L.dueNow > 0 ? `к выплате, ${dueText(L.due[0].due)}` : L.next ? `следующая ${C.fmtDate(L.next.due)}` : 'начислений нет'}</div></div><span class="row-amount">${L.dueNow > 0 ? money(L.dueNow) : L.next ? money(L.next.rest) : ''}</span></button>`; })}</div>`
        : html`<div class="preview"><span>Преподавателей пока нет.</span></div>`)}
      ${simple && html`
        <div class="field"><label for="qa-amount">Сумма</label><input id="qa-amount" class="input big" inputmode="decimal" autocomplete="off" value=${v.amount} onInput=${(e) => set('amount', e.target.value)} placeholder="0" /></div>
        <div class="field"><label for="qa-cat">${kind === 'expense' ? 'Категория' : 'Что за доход'}</label><input id="qa-cat" class="input" list="qa-cats" value=${v.category} onInput=${(e) => set('category', e.target.value)} placeholder=${kind === 'expense' ? 'Реклама, аренда, Zoom…' : 'Продажа учебников…'} /><datalist id="qa-cats">${(kind === 'expense' ? cats : []).map((c) => html`<option value=${c}></option>`)}</datalist></div>
        ${kind === 'expense' && top.length > 0 && html`<div class="quick">${top.map((c) => html`<button type="button" class=${cx('chip sm', v.category === c && 'is-active')} onClick=${() => set('category', c)}>${c}</button>`)}</div>`}
        <div class="field"><label>Дата</label><${DateChips} value=${v.date} onChange=${(x) => set('date', x)} /></div>
        ${st.projects.length > 1 && html`<div class="field"><label>Проект</label><select class="input" value=${v.projectId} onChange=${(e) => set('projectId', e.target.value)}><option value="">— без проекта —</option>${st.projects.map((p) => html`<option value=${p.id} selected=${p.id === v.projectId}>${p.name}</option>`)}</select></div>`}
        <div class="field"><label for="qa-note">Комментарий</label><input id="qa-note" class="input" value=${v.note} onInput=${(e) => set('note', e.target.value)} placeholder="необязательно" /></div>`}
    </div>
  <//>`;
}

// ---------- Правка записи ----------
function PaymentSheetI({ id, close }) {
  const p = byId(S().payments, id);
  if (!p) return null;
  const st = S();
  const [v, set] = useForm({ amount: String(p.amount), date: p.date, note: p.note || '', method: p.method || '', category: p.category || '', projectId: p.projectId || '', lessons: p.lessons != null ? String(p.lessons) : '' });
  const amount = pos(v.amount);
  const editCat = (p.kind === 'expense' && !p.recurringId) || p.kind === 'otherIncome';
  const save = () => { if (!amount) return; close(); act.updatePayment(id, { amount, date: v.date, note: v.note, method: v.method, projectId: v.projectId, ...(editCat ? { category: v.category } : {}), ...(p.lessons != null ? { lessons: C.parseAmount(v.lessons) || 0 } : {}) }); };
  return html`<${Sheet} title=${`${C.KIND_LABEL[p.kind]} · ${p.personName}`} cls="narrow" onClose=${close} onSubmit=${save}
    foot=${html`<div class="left"><button type="button" class="btn danger" onClick=${() => { close(); act.deletePayment(id); }}><${Icon} name="trash" cls="s" />Удалить</button></div><button type="submit" class="btn primary" disabled=${!amount}>Сохранить</button>`}>
    <div class="stack" style="gap:14px">
      <div class="field"><label for="pe-amount">Сумма</label><input id="pe-amount" class="input big" inputmode="decimal" autocomplete="off" value=${v.amount} onInput=${(e) => set('amount', e.target.value)} /></div>
      <div class="field"><label>Дата</label><${DateChips} value=${v.date} onChange=${(x) => set('date', x)} /></div>
      ${editCat && html`<div class="field"><label for="pe-cat">${p.kind === 'expense' ? 'Категория' : 'Что за доход'}</label><input id="pe-cat" class="input" list="pe-cats" value=${v.category} onInput=${(e) => set('category', e.target.value)} /><datalist id="pe-cats">${allCategories().map((c) => html`<option value=${c}></option>`)}</datalist></div>`}
      ${p.lessons != null && html`<div class="field"><label for="pe-lessons">Занятий добавлено в абонемент</label><input id="pe-lessons" class="input" inputmode="numeric" value=${v.lessons} onInput=${(e) => set('lessons', e.target.value)} /></div>`}
      <${MethodChips} value=${v.method} onChange=${(x) => set('method', x)} />
      ${st.projects.length > 1 && html`<div class="field"><label>Проект</label><select class="input" value=${v.projectId} onChange=${(e) => set('projectId', e.target.value)}><option value="">— без проекта —</option>${st.projects.map((x) => html`<option value=${x.id} selected=${x.id === v.projectId}>${x.name}</option>`)}</select></div>`}
      <div class="field"><label for="pe-note">Комментарий</label><input id="pe-note" class="input" value=${v.note} onInput=${(e) => set('note', e.target.value)} /></div>
      ${p.auto && html`<div class="hint">Запись создана автосписанием подписки.</div>`}
      ${p.legacy && html`<div class="hint">Выплата записана в прежней версии дашборда: она учтена в расходах, но не засчитывается в начисления преподавателю, которые считаются с момента переноса.</div>`}
    </div>
  <//>`;
}

// ---------- Напоминания ----------
const digits = (s) => String(s || '').replace(/\D/g, '');
export function reminderText(s, L) {
  const st = S();
  const dueAll = L.due.length ? L.due : L.next ? [L.next] : [];
  // в напоминании о просрочке называем только то, чей срок уже прошёл
  const due = L.status === 'overdue' ? dueAll.filter((c) => c.status === 'overdue') : dueAll;
  const months = L.package ? 'новый абонемент' : monthsText(due.filter((c) => c.kind === 'month').map((c) => c.ym)) || (due[0] && due[0].label) || C.ymName(C.ymOf(C.today()));
  const total = L.package ? L.price : due.reduce((a, c) => a + c.rest, 0);
  const first = L.package ? { due: C.today() } : due[0];
  const tpl = L.status === 'overdue' ? st.settings.templates.overdue : st.settings.templates.soon;
  return C.fillTemplate(tpl, { 'имя': s.name, 'сумма': money(total), 'месяц': months, 'срок': first ? C.fmtDateLong(first.due).replace(/ \d{4}$/, '') : '', 'группа': (groupOf(s) || {}).name || '', 'центр': st.settings.orgName, 'долг': money(L.debt) });
}
function RemindSheetI({ id, close }) {
  const s = byId(S().students, id);
  if (!s) return null;
  const L = getDerived().student(id);
  const [text, setText] = useState(() => reminderText(s, L));
  const phone = digits(s.phone), tg = s.telegram;
  const sent = (url) => { if (url) window.open(url, '_blank', 'noopener'); close(); act.remindStudent(id); };
  const enc = encodeURIComponent(text);
  // основной мессенджер (из настроек) — справа и выделен
  const preferTg = S().settings.messenger === 'telegram' || !phone;
  const tgBtn = (tg || phone) && html`<button class=${cx('btn', preferTg && 'primary')} onClick=${() => { copyText(text); sent(tg ? `https://t.me/${encodeURIComponent(tg)}?text=${enc}` : `https://t.me/+${phone}?text=${enc}`); }}><${Icon} name="send" cls="s" />Telegram</button>`;
  const waBtn = phone && html`<button class=${cx('btn', !preferTg && 'primary')} onClick=${() => sent(`https://wa.me/${phone}?text=${enc}`)}><${Icon} name="message" cls="s" />WhatsApp</button>`;
  const any = !!(tgBtn || waBtn);
  return html`<${Sheet} title=${`Напомнить · ${s.name}`} onClose=${close}
    foot=${html`<button class=${cx('btn', !any && 'primary')} onClick=${async () => { if (await copyText(text)) { close(); act.remindStudent(id, `Текст скопирован, напоминание отмечено — ${s.name}`); } else toast('Не удалось скопировать — выделите текст и скопируйте вручную'); }}><${Icon} name="copy" cls="s" />Скопировать</button>
      ${preferTg ? waBtn : tgBtn}${preferTg ? tgBtn : waBtn}`}>
    <div class="stack" style="gap:12px">
      <textarea class="input" rows="6" value=${text} onInput=${(e) => setText(e.target.value)} aria-label="Текст напоминания"></textarea>
      <div class="hint">${!any ? html`У ученика не указан телефон или Telegram — добавьте их в карточке, и сообщение будет открываться сразу в мессенджере. ` : ''}Шаблон сообщения меняется в «Настройках». ${s.remindedAt ? `Последнее напоминание: ${C.fmtDate(s.remindedAt)}${s.remindCount > 1 ? ` (всего ${s.remindCount})` : ''}.` : ''}</div>
      <div><button type="button" class="btn sm ghost" style="margin-left:-10px" onClick=${() => sent(null)}><${Icon} name="check" cls="s" />Уже напомнили — только отметить</button></div>
    </div>
  <//>`;
}
export function debtorsText() {
  const d = getDerived();
  const lines = d.debtors.map((s) => { const L = d.student(s.id), i = studentInfo(s, L); return `• ${s.name}${groupOf(s) ? ` (${groupOf(s).name})` : ''} — ${money(i.amount)} ${i.main}, ${i.when}`; });
  return `Ожидают оплату на ${C.fmtDateLong(d.today).replace(/ \d{4}$/, '')}:\n${lines.join('\n')}\nИтого: ${money(d.kpi.toCollect)}${d.kpi.overdue ? `, из них просрочено ${money(d.kpi.overdue)}` : ''}`;
}

// ---------- Поиск и команды (⌘K) ----------
const PAGES = [['', 'Обзор', 'home'], ['students', 'Ученики', 'users'], ['groups', 'Группы', 'layers'], ['teachers', 'Преподаватели', 'cap'], ['finance', 'Финансы', 'chart'], ['calendar', 'Календарь', 'calendar'], ['settings', 'Настройки', 'settings']];
export function Palette({ close, text: t0 }) {
  const [text, setText] = useState(t0 || '');
  const [sel, setSel] = useState(0);
  const inp = useRef(null), listRef = useRef(null), born = useRef(Date.now());
  useEffect(() => { const prev = document.activeElement; if (inp.current) inp.current.focus(); return () => { if (prev && prev.focus && document.contains(prev)) prev.focus({ preventScroll: true }); }; }, []);
  const st = S(), d = getDerived();
  const items = useMemo(() => {
    const { query, amount, words } = C.parseQuick(text);
    const dark = st.settings.theme === 'dark' || (st.settings.theme !== 'light' && !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
    const out = [];
    const sc = (name) => C.matchScore(name, query);
    const run = (fn) => () => { close(); setTimeout(fn, 30); };
    if (query || amount) {
      for (const s of st.students) {
        const score = sc(s.name); if (!score) continue;
        const L = d.student(s.id), i = studentInfo(s, L);
        out.push({ score: score + (s.archived ? -30 : 10) + (amount ? 5 : 0), avatar: html`<${Avatar} name=${s.name} color=${colorOf(s)} size="sm" />`, title: amount ? `Записать оплату: ${s.name} — ${money(amount)}` : s.name, sub: `${(groupOf(s) || {}).name || 'индивидуально'} · ${i.amount ? `к оплате ${money(i.amount)} ${i.main}` : i.main.toLowerCase()}${s.archived ? ' · архив' : ''}`, hint: amount ? 'оплата' : 'ученик', run: amount ? run(() => act.payStudent(s.id, { amount })) : run(() => open('student', { id: s.id })) });
      }
      for (const t of st.teachers) { const score = sc(t.name); if (score) out.push({ score: score + (amount ? 2 : 0), avatar: html`<${Avatar} name=${t.name} size="sm" />`, title: amount ? `Выплата: ${t.name} — ${money(amount)}` : t.name, sub: 'преподаватель', hint: amount ? 'выплата' : 'преподаватель', run: amount ? run(() => act.payTeacher(t.id, { amount })) : run(() => open('teacher', { id: t.id })) }); }
      for (const g of st.groups) { const score = sc(g.name); if (score && !amount) out.push({ score: score - 5, avatar: html`<${Avatar} group name=${g.name} color=${g.color} size="sm" />`, title: g.name, sub: [(byId(st.teachers, g.teacherId) || {}).name, `${st.students.filter((s) => s.groupId === g.id && !s.archived).length} уч.`].filter(Boolean).join(' · '), hint: 'группа', run: run(() => open('group', { id: g.id })) }); }
      if (amount) {
        for (const c of allCategories()) { const score = sc(c); if (score && query) out.push({ score: score + 1, avatar: html`<${Avatar} icon="out" size="sm" />`, title: `Расход: ${c} — ${money(amount)}`, sub: 'категория расходов', hint: 'расход', run: run(() => act.addPayment({ kind: 'expense', category: c, amount, projectId: store.ui.project !== 'all' ? store.ui.project : (st.projects[0] || {}).id || '' })) }); }
        if (query && !out.some((x) => x.score > 60)) out.push({ score: 20, avatar: html`<${Avatar} icon="out" size="sm" />`, title: `Новый расход «${words}» — ${money(amount)}`, sub: 'создать категорию и записать', hint: 'расход', run: run(() => act.addPayment({ kind: 'expense', category: words, amount, projectId: store.ui.project !== 'all' ? store.ui.project : (st.projects[0] || {}).id || '' })) });
      }
    }
    const cmds = [
      ['Новая запись', 'plus', () => openSheet(QuickAdd, {})], ['Новый ученик', 'userPlus', () => open('studentForm', {})], ['Новый расход', 'out', () => openSheet(QuickAdd, { kind: 'expense' })],
      ['Скачать резервную копию', 'download', () => { download(`tryos-finance-${C.today()}.json`, store.exportJSON()); store.markBackup(); }],
      ['Скопировать список должников', 'copy', async () => { toast((await copyText(debtorsText())) ? 'Список скопирован' : 'Не удалось скопировать'); }],
      [`Тема: ${dark ? 'светлая' : 'тёмная'}`, dark ? 'sun' : 'moon', () => act.setSettings({ theme: dark ? 'light' : 'dark' })],
      ...(store.undoStack.length ? [[`Отменить: ${store.undoStack[store.undoStack.length - 1].label}`, 'undo', () => store.undo()]] : []),
    ];
    for (const [label, icon, fn] of cmds) { const score = query ? sc(label) : 12; if (score && !amount) out.push({ score: score - 20, avatar: html`<${Avatar} icon=${icon} size="sm" />`, title: label, sub: '', hint: 'действие', run: run(fn) }); }
    for (const [path, label, icon] of PAGES) { const score = query ? sc(label) : 10; if (score && !amount) out.push({ score: score - 25, avatar: html`<${Avatar} icon=${icon} size="sm" />`, title: label, sub: '', hint: 'раздел', run: run(() => go(path)) }); }
    return out.sort((a, b) => b.score - a.score).slice(0, 30);
  }, [text, st.meta.rev]);
  useEffect(() => { setSel(0); }, [text]);
  useEffect(() => { const el = listRef.current && listRef.current.children[sel]; if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(items.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) items[sel].run(); }
    else if (e.key === 'Tab') e.preventDefault(); // фокус остаётся в строке поиска, выбор — стрелками
  };
  return html`<div class="palette-wrap" onMouseDown=${(e) => { if (e.target === e.currentTarget && Date.now() - born.current > 350) close(); }}>
    <div class="palette" role="dialog" aria-label="Поиск и быстрый ввод">
      <div class="palette-input"><${Icon} name="search" /><input ref=${inp} value=${text} onInput=${(e) => setText(e.target.value)} onKeyDown=${onKey} placeholder="Имя, раздел или «лиза 150»" aria-label="Поиск" autocomplete="off" /><button class="btn ghost icon sm" onClick=${close} aria-label="Закрыть"><${Icon} name="x" /></button></div>
      <div class="palette-list" ref=${listRef}>
        ${items.map((it, i) => html`<button type="button" class=${cx('palette-item', i === sel && 'is-on')} onMouseMove=${() => sel !== i && setSel(i)} onClick=${it.run}>${it.avatar}<div class="row-main"><div class="row-title"><span>${it.title}</span></div>${it.sub && html`<div class="row-sub">${it.sub}</div>`}</div><span class="faint xs">${it.hint}</span></button>`)}
        ${!items.length && html`<div class="empty"><p>Ничего не нашлось. Попробуйте имя ученика, например «лиза», или сразу сумму: «лиза 150».</p></div>`}
      </div>
      <div class="palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> выбрать</span><span><kbd>Enter</kbd> выполнить</span><span>«имя сумма» — записать оплату, «категория сумма» — расход</span></div>
    </div>
  </div>`;
}

export const PaySheet = guard('students', PaySheetI), PayoutSheet = guard('teachers', PayoutSheetI), RecurringPaySheet = guard('recurring', RecurringPaySheetI), PaymentSheet = guard('payments', PaymentSheetI), RemindSheet = guard('students', RemindSheetI);
sheets.pay = PaySheet; sheets.payout = PayoutSheet; sheets.recurringPay = RecurringPaySheet; sheets.quickAdd = QuickAdd; sheets.payment = PaymentSheet; sheets.remind = RemindSheet; sheets.palette = Palette;
export { closeSheet };
