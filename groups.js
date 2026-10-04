/* groups.js — разделы «Группы» и «Преподаватели»: карточки, детальные окна, ведомость выплат. */
import { html, useState, useMemo } from './vendor.js';
import { store, act } from './store.js';
import * as C from './core.js';
import { guard, money, cx, Icon, Sheet, Avatar, Pill, Empty, Meter, Seg, getDerived, open, sheets, openMenu, confirmSheet, dueText, useForm, tap } from './ui.js';
import { StudentRow, PaymentRow } from './home.js';

const S = () => store.state;
const byId = (list, id) => list.find((x) => x.id === id);
const payLabel = (pay, ym) => { const r = pay && C.rateAt(pay.rates, ym); return r && r.amount > 0 ? `${r.mode === 'percent' ? `${r.amount}% от оплат` : `${money(r.amount)} в месяц`}, ${pay.payDay}-го` : ''; };

// ---------- Группы ----------
function groupStats(g, d) {
  const members = d.activeStudents.filter((s) => s.groupId === g.id);
  const due = members.filter((s) => d.student(s.id).status !== 'ok');
  let exp = 0, got = 0;
  for (const s of members) { const c = d.student(s.id).charges.find((x) => x.key === 'm:' + d.ym); if (c) { exp += c.amount; got += c.paid; } }
  return { members, due, dueSum: C.r2(due.reduce((a, s) => a + d.student(s.id).dueNow, 0)), exp: C.r2(exp), got: C.r2(got) };
}
export function Groups() {
  const st = S(), d = getDerived();
  const [archOn, setArch] = useState(false);
  const nArch = st.groups.filter((g) => d.inProject(g) && g.archived).length;
  const arch = archOn && nArch > 0; // архив опустел — возвращаемся к действующим
  const groups = st.groups.filter((g) => d.inProject(g) && !!g.archived === arch).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const solo = d.activeStudents.filter((s) => !byId(st.groups, s.groupId));
  const order = (list) => list.slice().sort((a, b) => C.STATUS_ORDER[d.student(a.id).status] - C.STATUS_ORDER[d.student(b.id).status] || a.name.localeCompare(b.name, 'ru'));
  const person = (s) => { const L = d.student(s.id); return html`<button class=${cx('person', L.status !== 'ok' && L.status)} key=${s.id} title=${L.dueNow ? `к оплате ${money(L.dueNow)}` : 'оплачено'} onClick=${() => open('student', { id: s.id })}><span class=${cx('dot', L.status)}></span>${s.name}</button>`; };
  return html`<div class="stack">
    <div class="page-tools" style="margin-bottom:0">
      ${nArch > 0 ? html`<${Seg} value=${arch} onChange=${setArch} options=${[[false, 'Действующие'], [true, `Архив · ${nArch}`]]} />` : html`<span class="muted small">${groups.length} ${C.plural(groups.length, 'группа', 'группы', 'групп')} · ${d.activeStudents.length} ${C.plural(d.activeStudents.length, 'ученик', 'ученика', 'учеников')}</span>`}
      <button class="btn primary push" onClick=${() => open('groupForm', {})}><${Icon} name="plus" cls="s" />Группа</button>
    </div>
    ${groups.length ? html`<div class="gcards">${groups.map((g) => {
      const x = groupStats(g, d), t = byId(st.teachers, g.teacherId);
      return html`<section class=${cx('card gcard', g.archived && 'is-archived')} key=${g.id}>
        <div class="row tap" style="padding:0;border:0" ...${tap(() => open('group', { id: g.id }))}><${Avatar} group name=${g.name} color=${g.color} /><div class="row-main"><div class="row-title"><span>${g.name}</span></div><div class="row-sub">${[t && t.name, g.schedule, g.payType === 'package' ? `абонемент ${g.lessonsInPackage} зан.` : `оплата ${g.payDay}-го`].filter(Boolean).join(' · ')}</div></div><${Icon} name="right" cls="faint" /></div>
        <div class="gstats"><div><div class="label">Учеников</div><b>${x.members.length}</b></div><div><div class="label">Ждём оплату</div><b style=${x.due.length ? 'color:var(--overdue)' : ''}>${x.due.length ? money(x.dueSum) : '—'}</b></div><div><div class="label">Цена</div><b>${money(g.price)}</b></div></div>
        ${x.exp > 0 && html`<div><div class="spread small" style="margin-bottom:5px"><span class="muted">Сбор за ${C.ymName(d.ym)}</span><span class="num"><b>${money(x.got)}</b> из ${money(x.exp)}</span></div><${Meter} value=${x.got} max=${x.exp} /></div>`}
        ${x.members.length ? html`<div class="people">${order(x.members).map(person)}</div>` : html`<div class="hint">В группе пока нет учеников.</div>`}
        ${!g.archived && html`<div class="toolbar"><button class="btn sm soft" onClick=${() => open('studentForm', { groupId: g.id })}><${Icon} name="userPlus" cls="s" />Ученик</button>${x.due.length > 0 && html`<button class="btn sm good" onClick=${() => open('bulkPay', { groupId: g.id })}><${Icon} name="check" cls="s" />Отметить оплаты</button>`}</div>`}
      </section>`;
    })}</div>` : html`<div class="card"><${Empty} icon="layers" title=${arch ? 'В архиве пусто' : 'Групп пока нет'} action=${!arch && html`<button class="btn primary" onClick=${() => open('groupForm', {})}><${Icon} name="plus" cls="s" />Создать группу</button>`}>${arch ? '' : 'Группа задаёт цену, день оплаты и преподавателя для своих учеников.'}<//></div>`}
    ${!arch && solo.length > 0 && html`<section class="card gcard"><div class="spread"><div><h2>Индивидуально</h2><div class="hint">${solo.length} ${C.plural(solo.length, 'ученик', 'ученика', 'учеников')} без группы</div></div><button class="btn sm soft" onClick=${() => open('studentForm', {})}><${Icon} name="userPlus" cls="s" />Ученик</button></div><div class="people">${order(solo).map(person)}</div></section>`}
  </div>`;
}

function GroupSheetI({ id, close }) {
  const st = S(), d = getDerived();
  const g = byId(st.groups, id);
  if (!g) return null;
  const x = groupStats(g, d), t = byId(st.teachers, g.teacherId);
  const members = x.members.slice().sort((a, b) => C.STATUS_ORDER[d.student(a.id).status] - C.STATUS_ORDER[d.student(b.id).status] || a.name.localeCompare(b.name, 'ru'));
  const archived = st.students.filter((s) => s.groupId === g.id && s.archived);
  const tLine = t && t.payType === 'perGroup' ? d.teacher(t.id).lines.filter((c) => c.refId === g.id && c.rest > 0) : [];
  const more = (e) => openMenu(e, [
    g.archived ? { label: 'Вернуть из архива', icon: 'undo', onClick: () => act.archiveGroup(id, false) }
      : { label: 'В архив', icon: 'archive', onClick: () => (x.members.length ? confirmSheet({ title: `${g.name}: в архив?`, text: `В группе ${x.members.length} ${C.plural(x.members.length, 'ученик', 'ученика', 'учеников')}. Если отправить их в архив вместе с группой, начисления остановятся${x.dueSum > 0 ? `, а неоплаченные ${money(x.dueSum)} будут списаны` : ''}. Иначе ученики останутся действующими, и оплата с них будет ожидаться дальше.`, ok: 'Группу и учеников', danger: false, onOk: () => act.archiveGroup(id, true, true), alt: { label: 'Только группу', onClick: () => act.archiveGroup(id, true, false) } }) : act.archiveGroup(id, true)) },
    { label: 'Удалить группу', icon: 'trash', danger: true, onClick: () => confirmSheet({ title: `Удалить «${g.name}»?`, text: `${x.members.length ? `Ученики (${x.members.length}) останутся и станут индивидуальными. ` : ''}История оплат сохранится.`, onOk: () => { close(); act.deleteGroup(id); } }) },
  ]);
  return html`<${Sheet} title=${g.name} side onClose=${close}
    foot=${html`<div class="left"><button class="btn icon" aria-label="Ещё" onClick=${more}><${Icon} name="more" /></button><button class="btn" onClick=${() => open('groupForm', { id })}><${Icon} name="edit" cls="s" />Изменить</button></div>${!g.archived && html`<button class="btn primary" onClick=${() => open('studentForm', { groupId: id })}><${Icon} name="userPlus" cls="s" />Ученик</button>`}`}>
    <div class="stack">
      <div class="row" style="padding:0;border:0"><${Avatar} group name=${g.name} color=${g.color} size="lg" /><div class="row-main"><div class="row-title"><span>${t ? t.name : 'Преподаватель не указан'}</span>${g.archived && html`<${Pill} status="muted">архив<//>`}</div><div class="row-sub wrap">${[g.subject, g.schedule, g.payType === 'package' ? `абонемент ${g.lessonsInPackage} зан. · ${money(g.price)}` : `${money(g.price)} в месяц · оплата ${g.payDay}-го`].filter(Boolean).join(' · ')}</div></div></div>
      ${x.exp > 0 && html`<div class="balance"><div class="spread"><div><div class="small muted">Сбор за ${C.ymName(d.ym)}</div><div class="big">${money(x.got)} <span class="muted" style="font-size:16px;font-weight:500">из ${money(x.exp)}</span></div></div>${x.due.length > 0 && html`<button class="btn good" onClick=${() => open('bulkPay', { groupId: id })}><${Icon} name="check" cls="s" />Отметить оплаты</button>`}</div><${Meter} value=${x.got} max=${x.exp} />${x.due.length > 0 && html`<div class="small">Ждём ${money(x.dueSum)} от ${x.due.length} ${C.plural(x.due.length, 'ученика', 'учеников', 'учеников')}</div>`}</div>`}
      ${t && html`<div><div class="sec-title">Оплата преподавателю</div>
        ${t.payType !== 'perGroup' ? html`<div class="hint">${t.name}: ${t.payType === 'salary' ? 'оклад' : 'оплата за занятия'} — отдельно по группам не начисляется.</div>`
          : payLabel(g.pay, d.ym) ? html`<div class="card flush"><div class="row"><div class="row-main"><div class="row-title"><span>${payLabel(g.pay, d.ym)}</span></div><div class="row-sub">${tLine.length ? `к выплате ${money(tLine.reduce((a, c) => a + c.rest, 0))} · ${tLine.map((c) => C.ymName(c.ym)).join(', ')}` : 'всё выплачено'}</div></div>${tLine.length > 0 && html`<button class="btn sm good" onClick=${() => open('payout', { id: t.id })}>Выплатить</button>`}</div></div>`
          : html`<div class="banner warn"><${Icon} name="info" /><div class="grow small">Сумма за эту группу не задана — преподаватель не попадёт в список выплат.</div><button class="btn sm" onClick=${() => open('groupForm', { id })}>Задать</button></div>`}</div>`}
      <div><div class="sec-title">Ученики · ${members.length}</div>
        ${members.length ? html`<div class="card flush"><div class="rows">${members.map((s) => html`<${StudentRow} key=${s.id} s=${s} L=${d.student(s.id)} compact />`)}</div></div>` : html`<div class="hint">В группе пока нет учеников.</div>`}
        ${archived.length > 0 && html`<div class="hint" style="margin-top:8px">В архиве: ${archived.map((s) => s.name).join(', ')}</div>`}
      </div>
      ${g.notes && html`<div><div class="sec-title">Заметка</div><div class="small">${g.notes}</div></div>`}
    </div>
  <//>`;
}

/** Отметить оплаты сразу нескольким ученикам группы. */
export function BulkPay({ groupId, close }) {
  const st = S(), d = getDerived();
  const g = byId(st.groups, groupId);
  const list = d.activeStudents.filter((s) => (groupId ? s.groupId === groupId : true) && d.student(s.id).dueNow > 0).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const [sel, setSel] = useState(() => Object.fromEntries(list.map((s) => [s.id, true])));
  const [v, set] = useForm({ date: C.today() });
  const chosen = list.filter((s) => sel[s.id]);
  const sum = C.r2(chosen.reduce((a, s) => a + d.student(s.id).dueNow, 0));
  const submit = () => { if (!chosen.length) return; close(); act.payMany(chosen.map((s) => ({ id: s.id, amount: d.student(s.id).dueNow })), { date: v.date }); };
  return html`<${Sheet} title=${`Оплаты · ${g ? g.name : 'все ученики'}`} onClose=${close} onSubmit=${submit}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary" disabled=${!chosen.length}>Записать ${chosen.length ? `${chosen.length} · ${money(sum)}` : ''}</button>`}>
    <div class="stack" style="gap:12px">
      <div class="hint">Отметьте тех, кто оплатил полностью. Частичную оплату удобнее записать из карточки ученика.</div>
      <div class="pick" style="max-height:none">${list.map((s) => { const L = d.student(s.id); return html`<label class="row tap"><input type="checkbox" checked=${!!sel[s.id]} onChange=${(e) => setSel({ ...sel, [s.id]: e.target.checked })} style="width:18px;height:18px;accent-color:var(--accent)" /><div class="row-main"><div class="row-title"><span>${s.name}</span></div><div class="row-sub"><${Pill} status=${L.status}>${dueText(L.due[0] ? L.due[0].due : d.today)}<//> ${C.ymList(L.due.map((c) => c.ym))}</div></div><span class="row-amount">${money(L.dueNow)}</span></label>`; })}</div>
      <div class="field"><label for="bp-date">Дата оплаты</label><input id="bp-date" class="input" type="date" min="2000-01-01" value=${v.date} onInput=${(e) => C.isSaneDate(e.target.value) && set('date', e.target.value)} /></div>
    </div>
  <//>`;
}

// ---------- Преподаватели ----------
const SCHEME = { salary: 'оклад', perLesson: 'за занятие', perGroup: 'за группу / индивидуально' };
export function Teachers() {
  const st = S(), d = getDerived();
  const [archOn, setArch] = useState(false);
  const nArch = st.teachers.filter((t) => d.inProjectT(t) && t.archived).length;
  const arch = archOn && nArch > 0;
  const list = st.teachers.filter((t) => d.inProjectT(t) && !!t.archived === arch).sort((a, b) => C.STATUS_ORDER[d.teacher(a.id).status] - C.STATUS_ORDER[d.teacher(b.id).status] || a.name.localeCompare(b.name, 'ru'));
  const total = C.r2(d.teachersDue.reduce((a, t) => a + d.teacher(t.id).dueNow, 0));
  return html`<div class="stack">
    <div class="page-tools" style="margin-bottom:0">
      ${nArch > 0 ? html`<${Seg} value=${arch} onChange=${setArch} options=${[[false, 'Работают'], [true, `Архив · ${nArch}`]]} />` : html`<span class="muted small">${total > 0 ? html`К выплате сейчас: <b style="color:var(--text)">${money(total)}</b>` : 'Сейчас выплат не ждёт'}</span>`}
      <button class="btn primary push" onClick=${() => open('teacherForm', {})}><${Icon} name="plus" cls="s" />Преподаватель</button>
    </div>
    ${list.length ? html`<section class="card flush"><div class="rows">${list.map((t) => {
      const L = d.teacher(t.id), unset = C.teacherUnset(t, st);
      const gs = st.groups.filter((g) => g.teacherId === t.id && !g.archived), solo = st.students.filter((s) => !s.groupId && s.teacherId === t.id && !s.archived).length;
      const cur = Number((C.rateAt(t.rates, d.ym) || {}).amount) || 0;
      return html`<div class="row tap srow" key=${t.id} ...${tap(() => open('teacher', { id: t.id }))}><${Avatar} name=${t.name} />
        <div class="row-main"><div class="row-title"><span>${t.name}</span>${t.archived && html`<${Pill} status="muted">архив<//>`}</div>
          <div class="row-sub">${L.dueNow > 0 && html`<${Pill} status=${L.status}>${dueText(L.due[0].due)}<//> `}${t.payType === 'perGroup' ? [gs.length && `${gs.length} ${C.plural(gs.length, 'группа', 'группы', 'групп')}`, solo && `${solo} индивид.`].filter(Boolean).join(' · ') || 'нет групп' : `${SCHEME[t.payType]} ${money(cur)}${t.payType === 'perLesson' ? ` · ${t.lessons[d.ym] || 0} зан. в ${C.ymPrep(d.ym)}` : ''}`}${unset.length ? html` · <span style="color:var(--soon)">не задана сумма: ${unset.length}</span>` : ''}</div></div>
        ${L.dueNow > 0 ? html`<span class="row-amount">${money(L.dueNow)}</span>` : L.next ? html`<span class="faint small num">${money(L.next.rest)} · ${C.fmtDate(L.next.due)}</span>` : null}
        ${!t.archived && html`<div class="row-actions" onClick=${(e) => e.stopPropagation()}>
          ${t.payType === 'perLesson' && html`<button class="btn sm soft" title="Отметить проведённое занятие" onClick=${() => act.teacherLesson(t.id, 1)}>+1<span class="only-wide"> занятие</span></button>`}
          ${L.dueNow > 0 && html`<button class="btn sm good" onClick=${() => open('payout', { id: t.id })}><${Icon} name="cash" cls="s" /><span class="only-wide">Выплатить</span></button>`}
        </div>`}
      </div>`;
    })}</div></section>` : html`<div class="card"><${Empty} icon="cap" title=${arch ? 'В архиве пусто' : 'Преподавателей пока нет'} action=${!arch && html`<button class="btn primary" onClick=${() => open('teacherForm', {})}><${Icon} name="plus" cls="s" />Добавить преподавателя</button>`}>${arch ? '' : 'Укажите схему оплаты — дашборд сам посчитает, сколько и когда выплатить.'}<//></div>`}
  </div>`;
}

function TeacherSheetI({ id, close }) {
  const st = S(), d = getDerived();
  const t = byId(st.teachers, id);
  const [allPays, setAllPays] = useState(false);
  if (!t) return null;
  const L = d.teacher(id), unset = C.teacherUnset(t, st);
  const pays = st.payments.filter((p) => p.kind === 'salary' && p.personId === id).sort((a, b) => b.date.localeCompare(a.date));
  const mm = new Map(); for (const c of L.lines) { if (!mm.has(c.ym)) mm.set(c.ym, []); mm.get(c.ym).push(c); }
  const byMonth = [...mm.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  const gs = st.groups.filter((g) => g.teacherId === id && !g.archived);
  const cur = Number((C.rateAt(t.rates, d.ym) || {}).amount) || 0;
  const more = (e) => openMenu(e, [
    { label: t.archived ? 'Вернуть из архива' : 'В архив', icon: t.archived ? 'undo' : 'archive', onClick: () => act.archiveTeacher(id, !t.archived) },
    { label: 'Удалить преподавателя', icon: 'trash', danger: true, onClick: () => confirmSheet({ title: `Удалить «${t.name}»?`, text: 'Группы и ученики останутся без преподавателя, история выплат сохранится в журнале.', onOk: () => { close(); act.deleteTeacher(id); } }) },
  ]);
  const phone = String(t.phone || '').replace(/\D/g, '');
  return html`<${Sheet} title=${t.name} side onClose=${close}
    foot=${html`<div class="left"><button class="btn icon" aria-label="Ещё" onClick=${more}><${Icon} name="more" /></button><button class="btn" onClick=${() => open('teacherForm', { id })}><${Icon} name="edit" cls="s" />Изменить</button></div>${!t.archived && html`<button class="btn primary" onClick=${() => open('payout', { id })}><${Icon} name="cash" cls="s" />Выплатить</button>`}`}>
    <div class="stack">
      <div class="row" style="padding:0;border:0"><${Avatar} name=${t.name} size="lg" /><div class="row-main"><div class="row-title"><span>${SCHEME[t.payType][0].toUpperCase() + SCHEME[t.payType].slice(1)}</span>${t.archived && html`<${Pill} status="muted">архив<//>`}</div><div class="row-sub wrap">${[t.subject, t.payType !== 'perGroup' && `${money(cur)}${t.payType === 'perLesson' ? ' за занятие' : ' в месяц'} · выплата ${t.payDay}-го`].filter(Boolean).join(' · ') || ' '}</div></div>
        <div class="row-actions">${t.phone && html`<a class="btn icon soft" href=${`tel:${t.phone}`} aria-label="Позвонить"><${Icon} name="phone" /></a>`}${phone && html`<a class="btn icon soft" href=${`https://wa.me/${phone}`} target="_blank" rel="noopener" aria-label="WhatsApp"><${Icon} name="message" /></a>`}${t.telegram && html`<a class="btn icon soft" href=${`https://t.me/${t.telegram}`} target="_blank" rel="noopener" aria-label="Telegram"><${Icon} name="send" /></a>`}</div></div>
      <div class=${cx('balance', L.status)}>
        <div><div class="small muted">${L.dueNow > 0 ? 'К выплате' : 'Выплаты'}</div><div class="big">${L.dueNow > 0 ? money(L.dueNow) : L.next ? `${money(L.next.rest)} · ${C.fmtDate(L.next.due)}` : 'всё выплачено'}</div>
          <div class="small">${L.dueNow > 0 ? `${[...new Set(L.due.map((c) => c.label))].join(', ')} · ${dueText(L.due[0].due)}` : L.next ? `следующая выплата ${C.relDays(L.next.due)}` : `начислено ${money(L.accrued)}, выплачено ${money(L.paid)}`}${L.credit > 0 ? ` · выплачено вперёд (аванс): ${money(L.credit)}` : ''}</div></div>
        ${t.payType === 'perLesson' && !t.archived && html`<div class="toolbar"><button class="btn" onClick=${() => act.teacherLesson(id, 1)}><${Icon} name="plus" cls="s" />1 занятие</button><button class="btn ghost" onClick=${() => act.teacherLesson(id, -1)}>−1</button><span class="small">в ${C.ymPrep(d.ym)}: <b>${t.lessons[d.ym] || 0}</b></span></div>`}
      </div>
      ${unset.length > 0 && html`<div class="banner warn"><${Icon} name="info" /><div class="grow small"><b>Не задана сумма:</b> ${unset.map((u) => u.name).join(', ')}. Пока суммы нет, выплата не начисляется.</div><button class="btn sm" onClick=${() => open(unset[0].kind === 'group' ? 'groupForm' : 'studentForm', { id: unset[0].id })}>Задать</button></div>`}
      ${byMonth.length > 0 && html`<div><div class="sec-title">Начисления</div><div class="card flush"><div class="rows">${byMonth.map(([ym, lines]) => html`
        <div class="row" style="background:var(--surface-2);padding-top:7px;padding-bottom:7px"><b class="small grow">${C.ymLong(ym)}</b><b class="small num">${money(lines.reduce((a, c) => a + c.amount, 0))}</b></div>
        ${lines.map((c) => html`<div class="row"><div class="row-main"><div class="row-title"><span>${c.label}</span><${Pill} status=${c.status}>${c.status === 'paid' ? 'выплачено' : c.status === 'later' ? C.fmtDate(c.due) : dueText(c.due)}<//></div>${(c.pct != null || c.frozenId || (c.paid > 0 && c.rest > 0)) && html`<div class="row-sub wrap">${[c.pct != null && `${c.pct}% от ${money(c.base)} · оплаты ${C.fmtDate(c.win[0])} – ${C.fmtDate(c.win[1])}`, c.frozenId && 'начислено ранее', c.paid > 0 && c.rest > 0 && `выплачено ${money(c.paid)}`].filter(Boolean).join(' · ')}</div>`}</div><span class="row-amount">${money(c.amount)}</span>${c.frozenId && c.paid === 0 && html`<button class="btn sm ghost icon" title="Убрать это начисление" aria-label="Убрать начисление" onClick=${() => confirmSheet({ title: 'Убрать начисление?', text: `${c.label}, ${C.ymLong(c.ym)} — ${money(c.amount)}. Это начисление сохранилось с прежних настроек (группу передали, удалили или поменяли схему оплаты). Уберите его, если платить за него не нужно.`, ok: 'Убрать', onOk: () => act.removeFrozen(id, c.frozenId) })}><${Icon} name="x" /></button>`}</div>`)}`)}</div></div></div>`}
      ${t.payType === 'perGroup' && gs.length > 0 && html`<div><div class="sec-title">Группы</div><div class="card flush"><div class="rows">${gs.map((g) => html`<div class="row tap" ...${tap(() => open('group', { id: g.id }))}><${Avatar} group name=${g.name} color=${g.color} size="sm" /><div class="row-main"><div class="row-title"><span>${g.name}</span></div><div class="row-sub">${payLabel(g.pay, d.ym) || 'сумма не задана'}</div></div><${Icon} name="right" cls="faint" /></div>`)}</div></div></div>`}
      <div><div class="sec-title">Выплаты · ${pays.length}</div>${pays.length ? html`<div class="card flush"><div class="rows">${(allPays ? pays : pays.slice(0, 5)).map((p) => html`<${PaymentRow} key=${p.id} p=${p} own />`)}</div>${pays.length > 5 && html`<div class="card-foot"><button class="btn sm ghost" onClick=${() => setAllPays(!allPays)}>${allPays ? 'Свернуть' : `Показать все · ${pays.length}`}</button></div>`}</div>` : html`<div class="hint">Выплат пока не было.</div>`}</div>
      ${t.notes && html`<div><div class="sec-title">Заметка</div><div class="small">${t.notes}</div></div>`}
    </div>
  <//>`;
}
export const GroupSheet = guard('groups', GroupSheetI), TeacherSheet = guard('teachers', TeacherSheetI);
Object.assign(sheets, { group: GroupSheet, teacher: TeacherSheet, bulkPay: BulkPay });
