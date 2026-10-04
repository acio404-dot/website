/* students.js — раздел «Ученики»: список, таблица оплат по месяцам, карточка ученика. */
import { html, useState, useMemo, useRef, useLayoutEffect } from './vendor.js';
import { store, act } from './store.js';
import * as C from './core.js';
import { guard, money, cx, Icon, Sheet, Avatar, Pill, Empty, Seg, SearchInput, getDerived, open, sheets, openMenu, confirmSheet, dueText, studentInfo, toast, tap } from './ui.js';
import { quickPay } from './quick.js';
import { StudentRow, PaymentRow } from './home.js';

const S = () => store.state;
const byId = (list, id) => list.find((x) => x.id === id);
const groupOf = (s) => byId(S().groups, s.groupId);

/** Меню ячейки месяца: оплата, своя сумма, пауза. Используется в таблице и в карточке ученика. */
export function chargeMenu(e, s, L, c, inCard) {
  const upTo = L.charges.filter((x) => x.rest > 0 && x.due <= c.due);
  const cum = C.r2(upTo.reduce((a, x) => a + x.rest, 0));
  const months = C.ymList(upTo.filter((x) => x.kind === 'month').map((x) => x.ym));
  openMenu(e, [
    { title: `${C.ymLong(c.ym)} · ${c.amount ? money(c.amount) : 'без начисления'}${c.paid > 0 && c.rest > 0 ? ` · оплачено ${money(c.paid)}` : ''}` },
    c.rest > 0 && { label: `Записать оплату ${money(cum)}`, icon: 'check', hint: upTo.length > 1 ? months : '', onClick: () => act.payStudent(s.id, { amount: cum }) },
    c.rest > 0 && { label: 'Другая сумма или дата…', icon: 'edit', onClick: () => open('pay', { id: s.id, amount: cum }) },
    c.rest > 0 && 'sep',
    { label: 'Изменить начисление…', icon: 'cash', onClick: () => open('chargeForm', { id: s.id, ym: c.ym }) },
    c.amount > 0 && c.paid === 0 && { label: 'Не начислять за этот месяц', icon: 'pause', onClick: () => act.setOverride(s.id, c.ym, 0) },
    c.custom && { label: `Вернуть обычную цену ${money(c.base)}`, icon: 'undo', onClick: () => act.setOverride(s.id, c.ym, null) },
    !inCard && 'sep',
    !inCard && { label: 'Открыть ученика', icon: 'users', onClick: () => open('student', { id: s.id }) },
  ]);
}
const short = (n) => (Number.isInteger(n) ? String(n) : String(C.r2(n)).replace('.', ','));
function Cell({ s, L, ym }) {
  const c = L.charges.find((x) => x.key === 'm:' + ym);
  if (!c) return html`<td class="cell"><span class="cellbtn" style="justify-content:center">·</span></td>`;
  if (c.status === 'skip') return html`<td class="cell"><button class="cellbtn" title="Без начисления" onClick=${(e) => chargeMenu(e, s, L, c)}>—</button></td>`;
  const part = c.paid > 0 && c.rest > 0;
  const title = c.status === 'paid' ? `Оплачено ${money(c.amount)}` : `${part ? `Оплачено ${money(c.paid)} из ${money(c.amount)}` : `Не оплачено ${money(c.amount)}`} · срок ${C.fmtDate(c.due)}`;
  return html`<td class="cell"><button class=${cx('cellbtn', part ? 'part' : c.status, part && c.status === 'later' && 'soft')} style=${part ? `--p:${Math.round((c.paid / c.amount) * 100)}%` : ''} title=${title} onClick=${(e) => chargeMenu(e, s, L, c)}>
    ${c.status === 'paid' && html`<${Icon} name="check" />`}${c.status === 'overdue' && !part && html`<${Icon} name="alert" />`}${part ? `${short(c.paid)}/${short(c.amount)}` : money(c.amount)}
  </button></td>`;
}
function Matrix({ list, d }) {
  const st = S(), ui = store.ui;
  const base = C.ymAdd(d.ym, 1), end = ui.matrixEnd || base;
  const months = C.ymRange(C.ymAdd(end, -6), end);
  const wrap = useRef(null);
  useLayoutEffect(() => { if (wrap.current) wrap.current.scrollLeft = wrap.current.scrollWidth; }, [end]);
  const led = useMemo(() => new Map(list.map((s) => [s.id, end > d.student(s.id).toYm ? C.studentLedger(s, d.idx.studentPays(s.id), { today: d.today, remindDays: d.remindDays, toYm: end }) : d.student(s.id)])), [list, end, d]);
  const sections = [];
  for (const g of st.groups.filter((x) => d.inProject(x)).sort((a, b) => a.name.localeCompare(b.name, 'ru'))) { const m = list.filter((s) => s.groupId === g.id); if (m.length) sections.push({ g, m }); }
  const solo = list.filter((s) => !byId(st.groups, s.groupId));
  if (solo.length) sections.push({ g: null, m: solo });
  const tot = months.map((ym) => { let exp = 0, got = 0; for (const s of list) { const c = led.get(s.id).charges.find((x) => x.key === 'm:' + ym); if (c) { exp += c.amount; got += c.paid; } } return { exp: C.r2(exp), got: C.r2(got) }; });
  const shift = (n) => { const to = n === 0 ? base : C.ymAdd(end, n); store.setUI({ matrixEnd: to === base ? null : to }); };
  return html`<section class="card flush">
    <div class="card-head"><div class="legend"><span><i style="background:var(--ok-bg);outline:1px solid var(--ok)"></i>оплачено</span><span><i style="background:var(--overdue-bg);outline:1px solid var(--overdue)"></i>просрочено</span><span><i style="background:var(--soon-bg);outline:1px solid var(--soon)"></i>скоро срок</span></div>
      <div class="toolbar"><button class="btn sm icon ghost" aria-label="Раньше" onClick=${() => shift(-1)}><${Icon} name="left" /></button><button class="btn sm ghost" onClick=${() => shift(0)}>Сегодня</button><button class="btn sm icon ghost" aria-label="Позже" onClick=${() => shift(1)}><${Icon} name="right" /></button></div></div>
    <div class="table-wrap" ref=${wrap}><table class="matrix">
      <thead><tr><th>Ученик</th>${months.map((ym) => html`<th class=${cx('num', ym === d.ym && 'cur')}>${C.ymShort(ym, true)}</th>`)}</tr></thead>
      <tbody>${sections.map(({ g, m }) => html`
        <tr class="sec"><td colspan=${months.length + 1}><span class="stick">${g ? g.name : 'Индивидуально'}<span class="faint" style="font-weight:500">${g ? ` · ${g.payDay}-го числа${byId(st.teachers, g.teacherId) ? ' · ' + byId(st.teachers, g.teacherId).name : ''}` : ''}</span></span></td></tr>
        ${m.map((s) => html`<tr key=${s.id}><td><a href="#" onClick=${(e) => { e.preventDefault(); open('student', { id: s.id }); }} style="color:inherit;font-weight:600">${s.name}</a></td>${months.map((ym) => html`<${Cell} s=${s} L=${led.get(s.id)} ym=${ym} />`)}</tr>`)}`)}</tbody>
      <tfoot><tr><td>Собрано / начислено</td>${tot.map((x) => html`<td class="num"><div>${money(x.got)}</div><div class="sub" style="font-weight:500">из ${money(x.exp)}</div></td>`)}</tr></tfoot>
    </table></div>
    <div class="card-foot" style="justify-content:flex-start"><span class="hint">Нажмите на ячейку, чтобы записать оплату, изменить сумму месяца или поставить паузу. Оплата всегда гасит самый старый долг.</span></div>
  </section>`;
}

const FILTERS = [['all', 'Все'], ['due', 'Ждём оплату'], ['ok', 'Оплатили'], ['archived', 'Архив']];
const SORTS = [['status', 'Сначала должники'], ['name', 'По имени'], ['amount', 'По сумме долга'], ['group', 'По группам']];
export function Students() {
  const st = S(), ui = store.ui, d = getDerived();
  const [q, setQ] = useState('');
  const inP = st.students.filter((s) => d.inProject(s));
  const active = inP.filter((s) => !s.archived);
  const counts = { all: active.length, due: active.filter((s) => d.student(s.id).status !== 'ok').length, archived: inP.length - active.length };
  counts.ok = counts.all - counts.due;
  const nq = C.norm(q);
  const filter = ui.studentsView === 'matrix' && ui.studentsFilter === 'archived' ? 'all' : ui.studentsFilter;
  let list = filter === 'archived' ? inP.filter((s) => s.archived) : active;
  if (filter === 'due') list = list.filter((s) => d.student(s.id).status !== 'ok');
  if (filter === 'ok') list = list.filter((s) => d.student(s.id).status === 'ok');
  if (ui.studentsGroup !== 'all') list = list.filter((s) => (ui.studentsGroup === 'solo' ? !byId(st.groups, s.groupId) : s.groupId === ui.studentsGroup));
  if (nq) list = list.filter((s) => C.norm([s.name, s.subject, s.notes, s.phone, (groupOf(s) || {}).name, (byId(st.teachers, s.teacherId) || {}).name].join(' ')).includes(nq));
  const byName = (a, b) => a.name.localeCompare(b.name, 'ru');
  const cmp = {
    status: (a, b) => C.STATUS_ORDER[d.student(a.id).status] - C.STATUS_ORDER[d.student(b.id).status] || ((d.student(a.id).due[0] || {}).due || '9').localeCompare((d.student(b.id).due[0] || {}).due || '9') || byName(a, b),
    name: byName, amount: (a, b) => d.student(b.id).dueNow - d.student(a.id).dueNow || byName(a, b),
    group: (a, b) => ((groupOf(a) || {}).name || 'яяя').localeCompare((groupOf(b) || {}).name || 'яяя', 'ru') || byName(a, b),
  };
  list = list.slice().sort(cmp[ui.studentsSort] || cmp.status);
  const groupLabel = ui.studentsGroup === 'all' ? 'Все группы' : ui.studentsGroup === 'solo' ? 'Индивидуально' : (byId(st.groups, ui.studentsGroup) || {}).name || 'Все группы';
  const groupMenu = (e) => openMenu(e, [{ label: 'Все группы', on: ui.studentsGroup === 'all', onClick: () => store.setUI({ studentsGroup: 'all' }) }, ...d.activeGroups.map((g) => ({ label: g.name, on: ui.studentsGroup === g.id, onClick: () => store.setUI({ studentsGroup: g.id }) })), { label: 'Индивидуально', on: ui.studentsGroup === 'solo', onClick: () => store.setUI({ studentsGroup: 'solo' }) }]);
  const sortMenu = (e) => openMenu(e, SORTS.map(([k, label]) => ({ label, on: (ui.studentsSort || 'status') === k, onClick: () => store.setUI({ studentsSort: k }) })));
  const total = C.r2(list.reduce((a, s) => a + d.student(s.id).dueNow, 0));
  let lastGroup = null;
  return html`<div class="stack">
    <div class="page-tools" style="margin-bottom:0">
      <${SearchInput} value=${q} onInput=${setQ} placeholder="Имя, группа, телефон…" />
      <${Seg} value=${ui.studentsView} onChange=${(x) => store.setUI({ studentsView: x })} options=${[['list', 'Список', 'list'], ['matrix', 'По месяцам', 'table']]} />
      <button class="btn primary push" onClick=${() => open('studentForm', { groupId: ui.studentsGroup !== 'all' && ui.studentsGroup !== 'solo' ? ui.studentsGroup : null })}><${Icon} name="plus" cls="s" />Ученик</button>
    </div>
    <div class="chips scroll">
      ${FILTERS.filter(([k]) => ui.studentsView !== 'matrix' || k !== 'archived').map(([k, label]) => html`<button class=${cx('chip', filter === k && 'is-active')} onClick=${() => store.setUI({ studentsFilter: k })}>${label} <b>${counts[k]}</b></button>`)}
      <button class=${cx('chip', ui.studentsGroup !== 'all' && 'is-active')} onClick=${groupMenu}>${groupLabel}<${Icon} name="down" cls="s" /></button>
      ${ui.studentsView === 'list' && html`<button class="chip" onClick=${sortMenu}><${Icon} name="sort" cls="s" />${(SORTS.find(([k]) => k === (ui.studentsSort || 'status')) || SORTS[0])[1]}</button>`}
    </div>
    ${!list.length ? html`<div class="card"><${Empty} icon="users" title=${q ? 'Никого не нашлось' : filter === 'due' ? 'Долгов нет' : filter === 'archived' ? 'Архив пуст' : 'Учеников пока нет'} action=${!q && filter === 'all' && html`<button class="btn primary" onClick=${() => open('studentForm', {})}><${Icon} name="plus" cls="s" />Добавить ученика</button>`}>${q ? 'Попробуйте другое имя или снимите фильтры.' : filter === 'due' ? 'Все ученики из этого списка оплатили.' : ''}<//></div>`
      : ui.studentsView === 'matrix' ? html`<${Matrix} list=${list} d=${d} />`
      : html`<section class="card flush"><div class="rows">${list.map((s) => {
          const g = groupOf(s), head = ui.studentsSort === 'group' && (g ? g.id : '') !== lastGroup;
          if (head) lastGroup = g ? g.id : '';
          return html`${head && html`<div class="row" style="background:var(--surface-2);padding-top:7px;padding-bottom:7px"><b class="small">${g ? g.name : 'Индивидуально'}</b></div>`}<${StudentRow} key=${s.id} s=${s} L=${d.student(s.id)} compact=${ui.studentsSort === 'group'} />`;
        })}</div>
        <div class="card-foot" style="justify-content:space-between"><span class="hint">${list.length} ${C.plural(list.length, 'ученик', 'ученика', 'учеников')}</span>${total > 0 && html`<span class="small">к оплате <b>${money(total)}</b></span>`}</div>
      </section>`}
  </div>`;
}

// ---------- Карточка ученика ----------
function StudentSheetI({ id, close }) {
  const st = S(), d = getDerived();
  const s = byId(st.students, id);
  const [allPays, setAllPays] = useState(false);
  if (!s) return null;
  const L = d.student(id), g = groupOf(s), t = byId(st.teachers, (g && g.teacherId) || s.teacherId);
  const i = studentInfo(s, L);
  const pays = d.idx.studentPays(id).slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
  const monthsAll = L.charges.filter((c) => c.kind === 'month');
  const firstOpen = monthsAll.findIndex((c) => c.rest > 0);
  const from = Math.max(0, (firstOpen < 0 ? monthsAll.length : firstOpen) - 5);
  const months = monthsAll.slice(from, from + 12);
  const extras = L.charges.filter((c) => c.kind === 'extra');
  const strip = useRef(null);
  useLayoutEffect(() => { const el = strip.current; if (el) { const cur = el.querySelector('[data-cur]'); if (cur) el.scrollLeft = Math.max(0, cur.offsetLeft - el.clientWidth / 2); } }, [id]);
  const phone = String(s.phone || '').replace(/\D/g, '');
  const price = Number((C.rateAt(s.rates, d.ym) || {}).price) || 0;
  const payRate = !s.groupId && s.pay && C.rateAt(s.pay.rates, d.ym);
  const more = (e) => openMenu(e, [
    !L.package && { label: 'Доп. начисление…', icon: 'plus', onClick: () => open('extraForm', { id }) },
    s.archived ? { label: 'Вернуть из архива', icon: 'undo', onClick: () => act.restoreStudent(id) }
      : { label: 'В архив', icon: 'archive', onClick: () => (L.dueNow > 0 ? confirmSheet({ title: `${s.name}: в архив?`, text: `Неоплаченные ${money(L.dueNow)} будут списаны, новые месяцы начисляться перестанут. История оплат сохранится.`, ok: 'В архив', onOk: () => act.archiveStudent(id) }) : act.archiveStudent(id)) },
    'sep',
    { label: 'Удалить ученика', icon: 'trash', danger: true, onClick: () => confirmSheet({ title: `Удалить «${s.name}»?`, text: 'Карточка исчезнет, а записи об оплатах останутся в журнале. Если ученик просто ушёл — лучше отправить его в архив.', onOk: () => { close(); act.deleteStudent(id); } }) },
  ]);
  return html`<${Sheet} title=${s.name} side onClose=${close}
    foot=${html`<div class="left"><button class="btn icon" aria-label="Ещё" onClick=${more}><${Icon} name="more" /></button><button class="btn" onClick=${() => open('studentForm', { id })}><${Icon} name="edit" cls="s" />Изменить</button></div>
      ${!s.archived && html`<button class="btn primary" onClick=${() => open('pay', { id })}><${Icon} name="check" cls="s" />Записать оплату</button>`}`}>
    <div class="stack">
      <div class="row" style="padding:0;border:0"><${Avatar} name=${s.name} color=${g ? g.color : null} size="lg" />
        <div class="row-main"><div class="row-title"><span>${g ? g.name : 'Индивидуально'}</span>${s.archived && html`<${Pill} status="muted">архив<//>`}</div><div class="row-sub">${[t && t.name, s.subject].filter(Boolean).join(' · ') || ' '}</div></div>
        <div class="row-actions">${s.phone && html`<a class="btn icon soft" href=${`tel:${s.phone}`} title=${s.phone} aria-label="Позвонить"><${Icon} name="phone" /></a>`}${phone && html`<a class="btn icon soft" href=${`https://wa.me/${phone}`} target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp"><${Icon} name="message" /></a>`}${s.telegram && html`<a class="btn icon soft" href=${`https://t.me/${s.telegram}`} target="_blank" rel="noopener" title="Telegram" aria-label="Telegram"><${Icon} name="send" /></a>`}</div>
      </div>
      <div class=${cx('balance', s.archived ? '' : L.status)}>
        <div><div class="small muted">${L.dueNow > 0 ? (L.debt > 0 && L.debt >= L.dueNow ? 'Долг' : 'К оплате') : L.package ? 'Абонемент' : 'Оплаты'}</div>
          <div class="big">${L.dueNow > 0 ? money(L.dueNow) : L.package ? `${Math.max(0, L.lessonsLeft)} из ${L.size}` : L.paidThrough ? `оплачено по ${C.ymName(L.paidThrough)}` : 'долгов нет'}</div>
          <div class="small">${L.dueNow > 0 ? `${i.main} · ${i.when}${L.debt > 0 && L.debt < L.dueNow ? ` · из них просрочено ${money(L.debt)}` : ''}` : L.package ? i.main : i.next ? `${i.main} · ${money(i.next)}` : i.main}${s.remindedAt && L.status !== 'ok' ? ` · напомнили ${C.fmtDate(s.remindedAt)}` : ''}</div></div>
        ${!s.archived && html`<div class="toolbar">
          ${L.dueNow > 0 && html`<button class="btn good" onClick=${() => quickPay(id)}><${Icon} name="check" cls="s" />Оплатил ${L.due.length === 1 ? money(L.dueNow) : ''}</button>`}
          ${L.status !== 'ok' && html`<button class="btn" onClick=${() => open('remind', { id })}><${Icon} name="bell" cls="s" />Напомнить</button>`}
          ${L.package && html`<button class="btn" onClick=${() => act.lessonUsed(id, 1)}>−1 занятие</button><button class="btn ghost" onClick=${() => act.lessonUsed(id, -1)}>вернуть</button>`}
        </div>`}
      </div>
      ${months.length > 0 && html`<div><div class="sec-title">По месяцам</div><div class="months" ref=${strip}>${months.map((c) => html`<button class=${cx('mon', c.status)} data-cur=${c.ym === d.ym ? '1' : null} title=${`${C.ymLong(c.ym)}: срок ${C.fmtDate(c.due)}`} onClick=${(e) => chargeMenu(e, s, L, c, true)}><small>${C.ymShort(c.ym)}</small><b>${c.status === 'skip' ? '—' : c.paid > 0 && c.rest > 0 ? `${short(c.paid)}/${short(c.amount)}` : money(c.amount)}</b>${c.status === 'paid' ? html`<${Icon} name="check" />` : c.status === 'overdue' ? html`<${Icon} name="alert" />` : c.status === 'skip' ? html`<${Icon} name="pause" />` : html`<${Icon} name="clock" />`}</button>`)}</div></div>`}
      ${extras.length > 0 && html`<div><div class="sec-title">Доп. начисления</div><div class="card flush"><div class="rows">${extras.map((c) => html`<div class="row"><div class="row-main"><div class="row-title"><span>${c.label}</span><${Pill} status=${c.status}>${c.status === 'paid' ? 'оплачено' : dueText(c.due)}<//></div><div class="row-sub">${C.fmtDate(c.due)}</div></div><span class="row-amount">${money(c.amount)}</span><button class="btn sm ghost icon" aria-label="Удалить" onClick=${() => act.removeExtra(id, c.id)}><${Icon} name="x" /></button></div>`)}</div></div></div>`}
      <div><div class="sec-title">Оплаты · ${pays.length}${pays.length ? ` · всего ${money(L.paid)}` : ''}</div>
        ${pays.length ? html`<div class="card flush"><div class="rows">${(allPays ? pays : pays.slice(0, 5)).map((p) => html`<${PaymentRow} key=${p.id} p=${p} own />`)}</div>${pays.length > 5 && html`<div class="card-foot"><button class="btn sm ghost" onClick=${() => setAllPays(!allPays)}>${allPays ? 'Свернуть' : `Показать все · ${pays.length}`}</button></div>`}</div>` : html`<div class="hint">Оплат пока не было.</div>`}
      </div>
      <div><div class="sec-title">Данные</div>
        <dl class="kv">
          <dt>${s.payType === 'package' ? 'Абонемент' : 'Цена в месяц'}</dt><dd>${money(price)}${s.payType === 'package' ? ` за ${L.size} ${C.plural(L.size, 'занятие', 'занятия', 'занятий')}` : ''}${s.rates.length > 1 ? html` <span class="faint">(менялась ${s.rates.length - 1} ${C.plural(s.rates.length - 1, 'раз', 'раза', 'раз')})</span>` : ''}</dd>
          ${s.payType !== 'package' && html`<dt>День оплаты</dt><dd>${s.payDay}-го числа</dd><dt>Начисления</dt><dd>с ${C.ymGen(s.startYm)} ${s.startYm.slice(0, 4)}${s.endYm ? ` по ${C.ymName(s.endYm)} ${s.endYm.slice(0, 4)}` : ''}</dd>`}
          ${s.phone && html`<dt>Телефон</dt><dd>${s.phone}</dd>`}${s.telegram && html`<dt>Telegram</dt><dd>@${s.telegram}</dd>`}
          ${payRate && payRate.amount > 0 && html`<dt>Преподавателю</dt><dd>${payRate.mode === 'percent' ? `${payRate.amount}% от оплат` : `${money(payRate.amount)} в месяц`}, ${s.pay.payDay}-го</dd>`}
          ${st.projects.length > 1 && s.projectId && html`<dt>Проект</dt><dd>${(byId(st.projects, s.projectId) || {}).name}</dd>`}
          ${s.notes && html`<dt>Заметка</dt><dd>${s.notes}</dd>`}
        </dl>
      </div>
    </div>
  <//>`;
}
export const StudentSheet = guard('students', StudentSheetI);
sheets.student = StudentSheet;
