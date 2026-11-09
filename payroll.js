/* payroll.js — раздел «Зарплаты»: что и когда выплатить, ведомость по месяцам, ставки преподавателей,
   окна выплаты по строкам, своей суммы за месяц и разовой выплаты. */
import { html, useState, useMemo, useRef, useLayoutEffect } from './vendor.js';
import { store, act } from './store.js';
import * as C from './core.js';
import { guard, money, moneyBig, cx, Icon, Sheet, Avatar, Pill, Empty, Seg, getDerived, open, sheets, openMenu, confirmSheet, dueText, tap, monthOptions } from './ui.js';
import { DateChips, MethodChips } from './quick.js';
import { TeacherList } from './groups.js';

const S = () => store.state;
const byId = (list, id) => list.find((x) => x.id === id);
const pos = (v) => { const n = C.parseAmount(v); return n > 0 ? C.r2(n) : 0; };
const SCHEME = { perGroup: 'за каждую группу и индивидуального ученика', salary: 'оклад', perLesson: 'за проведённое занятие' };
const WHEN = [['end', 'В конце месяца'], ['next', 'Числа след. месяца'], ['same', 'Числа этого месяца']];
const whenText = (pay) => (pay.when === 'end' ? 'в конце месяца' : pay.when === 'next' ? `${pay.payDay}-го след. месяца` : `${pay.payDay}-го`);
const lineName = (c) => (c.src === 'lessons' ? 'Занятия' : c.label);
const forMonth = (c) => (c.src === 'extra' ? c.label : `${lineName(c)} · за ${C.ymName(c.ym)}`);

/** Расчёт по всем действующим преподавателям до месяца toYm. */
function ledgers(d, toYm) {
  const st = S();
  return d.activeTeachers.map((t) => ({ t, L: C.teacherLedger(t, st, d.idx, { today: d.today, remindDays: d.remindDays, toYm, noAhead: true }) }));
}

// ---------- Меню строки начисления ----------
export function lineMenu(e, t, c) {
  const pays = (c.pays || []).map((x) => byId(S().payments, x.payId)).filter(Boolean);
  const cfg = c.src === 'group' ? { label: 'Ставка за группу…', onClick: () => open('groupForm', { id: c.refId }) }
    : c.src === 'student' ? { label: 'Ставка за ученика…', onClick: () => open('studentForm', { id: c.refId }) }
    : c.src === 'salary' || c.src === 'lessons' ? { label: 'Изменить ставку…', onClick: () => open('teacherForm', { id: t.id }) } : null;
  openMenu(e, [
    { title: `${t.name} · ${forMonth(c)} · ${c.amount > 0 ? money(c.amount) : 'не платим'}` },
    c.rest > 0 && { label: `Выплатить ${money(c.rest)}`, icon: 'cash', hint: `срок ${C.fmtDate(c.due)}`, onClick: () => open('payout', { id: t.id, keys: [c.key] }) },
    c.src !== 'extra' && { label: 'Другая сумма за этот месяц…', icon: 'edit', onClick: () => open('payAdj', { id: t.id, lineKey: c.key }) },
    c.src !== 'extra' && c.amount > 0 && c.paid === 0 && { label: 'Не платить за этот месяц', icon: 'pause', onClick: () => act.setTeacherAdj(t.id, c.key, 0, forMonth(c)) },
    c.custom && { label: `Вернуть обычную сумму ${money(c.base)}`, icon: 'undo', onClick: () => act.setTeacherAdj(t.id, c.key, null, forMonth(c)) },
    c.src === 'extra' && c.paid === 0 && { label: 'Убрать разовую выплату', icon: 'x', danger: true, onClick: () => act.removeTeacherExtra(t.id, c.extraId) },
    pays.length > 0 && 'sep',
    ...pays.map((p) => ({ label: `Отменить выплату ${C.fmtDate(p.date)} · ${money(p.amount)}`, icon: 'undo', danger: true, onClick: () => cancelPayout(p) })),
    'sep',
    cfg && { ...cfg, icon: 'settings' },
    { label: 'Открыть преподавателя', icon: 'cap', onClick: () => open('teacher', { id: t.id }) },
  ]);
}
export function cancelPayout(p) {
  confirmSheet({ title: 'Отменить выплату?', text: `${p.personName}, ${C.fmtDateLong(p.date)} — ${money(p.amount)}. Запись исчезнет из журнала, а начисления, которые она закрывала, снова станут «к выплате». Это действие тоже можно отменить.`, ok: 'Отменить выплату', onOk: () => act.deletePayment(p.id) });
}

// ---------- Вкладка «К выплате» ----------
const BUCKETS = [['overdue', 'Просрочено'], ['today', 'Сегодня'], ['week', 'Ближайшие 7 дней'], ['month', 'Позже в этом месяце'], ['next', 'В следующем месяце']];
function bucketOf(due, d) {
  if (due < d.today) return 'overdue';
  if (due === d.today) return 'today';
  if (due <= C.addDays(d.today, 7)) return 'week';
  return C.ymOf(due) <= d.ym ? 'month' : 'next';
}
function Schedule({ d }) {
  const st = S();
  const all = useMemo(() => ledgers(d, C.ymAdd(d.ym, 1)), [d]);
  const items = all.flatMap(({ t, L }) => L.lines.filter((c) => c.rest > 0).map((c) => ({ t, c, b: bucketOf(c.due, d) })));
  items.sort((a, b) => (a.c.due < b.c.due ? -1 : a.c.due > b.c.due ? 1 : a.t.name.localeCompare(b.t.name, 'ru')));
  const sum = (f) => C.r2(items.filter(f).reduce((a, x) => a + x.c.rest, 0));
  const overdue = sum((x) => x.b === 'overdue');
  const thisMonth = sum((x) => C.ymOf(x.c.due) <= d.ym);
  const nextMonth = sum((x) => x.b === 'next');
  const paidMonth = C.r2(d.payments.filter((p) => p.kind === 'salary' && C.ymOf(p.date) === d.ym).reduce((a, p) => a + p.amount, 0));
  const unset = d.activeTeachers.flatMap((t) => C.teacherUnset(t, st).map((u) => ({ ...u, t })));
  const byTeacher = all.map(({ t, L }) => ({ t, L, now: C.r2(L.lines.filter((c) => c.rest > 0 && c.due <= d.today).reduce((a, c) => a + c.rest, 0)), month: C.r2(L.lines.filter((c) => c.rest > 0 && C.ymOf(c.due) <= d.ym).reduce((a, c) => a + c.rest, 0)) })).filter((x) => x.month > 0);
  return html`<div class="stack">
    <div class="kpis k4">
      <div class="kpi"><span class="kpi-label">Просрочено</span><span class=${cx('kpi-value', overdue > 0 && 'neg')}>${moneyBig(overdue)}</span><span class="kpi-sub">срок уже прошёл</span></div>
      <div class="kpi"><span class="kpi-label">Выплатить до конца ${C.ymGen(d.ym)}</span><span class="kpi-value">${moneyBig(thisMonth)}</span><span class="kpi-sub">вместе с просроченным</span></div>
      <div class="kpi"><span class="kpi-label">Уже выплачено в ${C.ymPrep(d.ym)}</span><span class="kpi-value">${moneyBig(paidMonth)}</span><span class="kpi-sub">по журналу</span></div>
      <div class="kpi"><span class="kpi-label">В ${C.ymPrep(C.ymAdd(d.ym, 1))}</span><span class="kpi-value">${moneyBig(nextMonth)}</span><span class="kpi-sub">по текущим ставкам</span></div>
    </div>
    ${unset.length > 0 && html`<div class="banner warn"><${Icon} name="info" /><div class="grow small"><b>Не задана сумма:</b> ${unset.map((u) => `${u.name} (${u.t.name})`).join(', ')}. Пока суммы нет, за это ничего не начисляется.</div><button class="btn sm" onClick=${() => store.setUI({ payrollTab: 'rates' })}>Задать</button></div>`}
    ${byTeacher.length > 0 && html`<section class="card flush"><div class="card-head"><div><h2>По преподавателям</h2><div class="hint">сколько выплатить до конца ${C.ymGen(d.ym)}</div></div></div><div class="rows">${byTeacher.map(({ t, now, month }) => html`<div class="row tap srow" key=${t.id} ...${tap(() => open('teacher', { id: t.id }))}><${Avatar} name=${t.name} />
      <div class="row-main"><div class="row-title"><span>${t.name}</span></div><div class="row-sub">${now > 0 ? html`<span style="color:var(--overdue)">к сегодняшнему дню ${money(now)}</span>` : 'по сроку пока ничего'}${month > now ? ` · до конца месяца ещё ${money(C.r2(month - now))}` : ''}</div></div>
      <span class="row-amount">${money(month)}</span>
      <div class="row-actions" onClick=${(e) => e.stopPropagation()}><button class="btn sm good" onClick=${() => open('payout', { id: t.id, upTo: now > 0 ? d.today : `${d.ym}-31` })}><${Icon} name="cash" cls="s" /><span class="only-wide">Выплатить</span></button></div></div>`)}</div></section>`}
    ${items.length ? BUCKETS.map(([k, title]) => { const list = items.filter((x) => x.b === k); if (!list.length) return null; return html`<section class="card flush" key=${k}>
      <div class="card-head"><div><h2 style=${k === 'overdue' ? 'color:var(--overdue)' : ''}>${title}</h2></div><span class="small num"><b>${money(list.reduce((a, x) => a + x.c.rest, 0))}</b></span></div>
      <div class="rows">${list.map(({ t, c }) => html`<div class="row tap srow" key=${t.id + c.key} ...${tap((e) => lineMenu(e, t, c))}>
        <div class="datebox"><b>${Number(c.due.slice(8))}</b><small>${C.MONTHS_SHORT[Number(c.due.slice(5, 7)) - 1]}</small></div>
        <div class="row-main"><div class="row-title"><span>${t.name}</span>${c.custom && html`<${Pill} status="muted">своя сумма<//>`}</div><div class="row-sub wrap">${forMonth(c)}${c.paid > 0 ? ` · выплачено ${money(c.paid)} из ${money(c.amount)}` : ''}${k !== 'overdue' && k !== 'today' ? '' : ` · ${dueText(c.due)}`}</div></div>
        <span class="row-amount">${money(c.rest)}</span>
        <div class="row-actions" onClick=${(e) => e.stopPropagation()}><button class="btn sm good" onClick=${() => open('payout', { id: t.id, keys: [c.key] })}><${Icon} name="cash" cls="s" /><span class="only-wide">Выплатить</span></button><button class="btn sm ghost icon" aria-label="Ещё" onClick=${(e) => lineMenu(e, t, c)}><${Icon} name="more" /></button></div>
      </div>`)}</div></section>`; })
      : html`<div class="card"><${Empty} icon="check" title="Выплачивать нечего">${d.activeTeachers.length ? 'Всё начисленное выплачено. Ближайшие выплаты появятся здесь, когда подойдёт месяц.' : 'Добавьте преподавателей и задайте ставки во вкладке «Ставки».'}<//></div>`}
  </div>`;
}

// ---------- Вкладка «Ведомость» ----------
const worst = (list) => list.reduce((w, c) => (C.STATUS_ORDER[c.status] < C.STATUS_ORDER[w] ? c.status : w), 'skip');
function Cell({ t, lines, ym }) {
  if (!lines.length) return html`<td class="cell"><button class="cellbtn" style="justify-content:center" title="Разовая выплата за этот месяц" onClick=${() => open('payExtra', { id: t.id, ym })}>·</button></td>`;
  const amount = C.r2(lines.reduce((a, c) => a + c.amount, 0)), paid = C.r2(lines.reduce((a, c) => a + c.paid, 0));
  const status = worst(lines), part = paid > 0 && paid < amount;
  const click = (e) => (lines.length === 1 ? lineMenu(e, t, lines[0]) : openMenu(e, [{ title: `${t.name} · ${C.ymLong(ym)}` }, ...lines.map((c) => ({ label: `${c.label} · ${money(c.amount)}`, hint: c.status === 'paid' ? 'выплачено' : C.fmtDate(c.due), onClick: (ev) => setTimeout(() => lineMenu(ev, t, c), 0) }))]));
  const title = lines.map((c) => `${c.label}: ${c.amount > 0 ? money(c.amount) : 'не платим'}${c.custom ? ` (обычно ${money(c.base)})` : ''} · ${c.status === 'paid' ? `выплачено ${c.pays && c.pays.length ? C.fmtDate(c.pays[c.pays.length - 1].date) : ''}` : `срок ${C.fmtDate(c.due)}`}`).join('\n');
  return html`<td class="cell"><button class=${cx('cellbtn', part ? 'part' : status === 'skip' ? '' : status, part && status === 'later' && 'soft', lines.some((c) => c.custom) && 'custom')} style=${part ? `--p:${Math.round((paid / amount) * 100)}%` : ''} title=${title} onClick=${click}>
    ${status === 'paid' && html`<${Icon} name="check" />`}${status === 'overdue' && !part && html`<${Icon} name="alert" />`}${status === 'skip' ? '—' : part ? `${money(paid)}/${money(amount)}` : money(amount)}
  </button></td>`;
}
function Sheet2({ d }) {
  const ui = store.ui, st = S();
  const base = C.ymAdd(d.ym, 1), end = ui.payrollEnd || base;
  const months = C.ymRange(C.ymAdd(end, -5), end);
  const wrap = useRef(null);
  useLayoutEffect(() => { if (wrap.current) wrap.current.scrollLeft = wrap.current.scrollWidth; }, [end]);
  const all = useMemo(() => ledgers(d, end), [d, end]);
  const set = new Set(months);
  const shift = (n) => { const to = n === 0 ? base : C.ymAdd(end, n); store.setUI({ payrollEnd: to === base ? null : to }); };
  const tot = months.map((ym) => { let a = 0, p = 0; for (const { L } of all) for (const c of L.lines) if (c.ym === ym) { a += c.amount; p += c.paid; } return { a: C.r2(a), p: C.r2(p) }; });
  const blocks = all.map(({ t, L }) => {
    const rows = new Map();
    for (const c of L.lines) { if (!set.has(c.ym)) continue; const k = C.lineSource(c); if (!rows.has(k)) rows.set(k, { k, label: c.src === 'extra' ? 'Разовые выплаты' : c.src === 'frozen' ? 'Начислено ранее' : lineName(c), src: c.src, refId: c.refId, lines: [] }); rows.get(k).lines.push(c); }
    // группы и ученики без начислений в этом окне тоже показываем — чтобы было видно, где не задана сумма
    if (t.payType === 'perGroup') {
      for (const g of st.groups) if (g.teacherId === t.id && !g.archived && !rows.has('g:' + g.id)) rows.set('g:' + g.id, { k: 'g:' + g.id, label: g.name, src: 'group', refId: g.id, lines: [] });
      for (const s of st.students) if (!s.groupId && s.teacherId === t.id && !s.archived && !rows.has('s:' + s.id)) rows.set('s:' + s.id, { k: 's:' + s.id, label: s.name, src: 'student', refId: s.id, lines: [] });
    }
    const list = [...rows.values()].sort((a, b) => (a.src === 'extra' || a.src === 'frozen' ? 1 : 0) - (b.src === 'extra' || b.src === 'frozen' ? 1 : 0) || a.label.localeCompare(b.label, 'ru'));
    const sums = months.map((ym) => C.r2(L.lines.filter((c) => c.ym === ym).reduce((a, c) => a + c.amount, 0)));
    return { t, L, list, sums };
  });
  const rowMenu = (e, t, r) => openMenu(e, [{ title: `${t.name} · ${r.label}` },
    r.src === 'group' && { label: 'Ставка за группу…', icon: 'settings', onClick: () => open('groupForm', { id: r.refId }) },
    r.src === 'student' && { label: 'Ставка за ученика…', icon: 'settings', onClick: () => open('studentForm', { id: r.refId }) },
    (r.src === 'salary' || r.src === 'lessons') && { label: 'Изменить ставку…', icon: 'settings', onClick: () => open('teacherForm', { id: t.id }) },
    r.src === 'group' && { label: 'Открыть группу', icon: 'layers', onClick: () => open('group', { id: r.refId }) },
    { label: 'Разовая выплата…', icon: 'plus', onClick: () => open('payExtra', { id: t.id }) },
  ]);
  return html`<section class="card flush">
    <div class="card-head"><div class="legend"><span><i style="background:var(--ok-bg);outline:1px solid var(--ok)"></i>выплачено</span><span><i style="background:var(--overdue-bg);outline:1px solid var(--overdue)"></i>просрочено</span><span><i style="background:var(--soon-bg);outline:1px solid var(--soon)"></i>скоро срок</span><span><i style="outline:1px solid var(--line-2)"></i>по графику</span></div>
      <div class="toolbar"><button class="btn sm icon ghost" aria-label="Раньше" onClick=${() => shift(-1)}><${Icon} name="left" /></button><button class="btn sm ghost" onClick=${() => shift(0)}>Сейчас</button><button class="btn sm icon ghost" aria-label="Позже" onClick=${() => shift(1)}><${Icon} name="right" /></button></div></div>
    ${blocks.length ? html`<div class="table-wrap" ref=${wrap}><table class="matrix">
      <thead><tr><th>За что</th>${months.map((ym) => html`<th class=${cx('num', ym === d.ym && 'cur')}>${C.ymShort(ym, true)}</th>`)}</tr></thead>
      <tbody>${blocks.map(({ t, list, sums }) => html`
        <tr class="sec"><td colspan=${months.length + 1}><span class="stick"><a href="#" style="color:inherit" onClick=${(e) => { e.preventDefault(); open('teacher', { id: t.id }); }}>${t.name}</a><span class="faint" style="font-weight:500"> · ${SCHEME[t.payType]}</span></span></td></tr>
        ${list.map((r) => html`<tr key=${t.id + r.k}><td><button class="linkbtn" title=${r.label} onClick=${(e) => rowMenu(e, t, r)}>${r.label}</button></td>${months.map((ym) => html`<${Cell} t=${t} ym=${ym} lines=${r.lines.filter((c) => c.ym === ym)} />`)}</tr>`)}
        ${list.length > 1 && html`<tr class="subtot"><td>Итого ${t.name}</td>${sums.map((v) => html`<td class="num">${v ? money(v) : '·'}</td>`)}</tr>`}
        ${!list.length && html`<tr><td colspan=${months.length + 1} class="hint">Нет групп и ставок — задайте во вкладке «Ставки».</td></tr>`}`)}</tbody>
      <tfoot><tr><td>Выплачено / начислено</td>${tot.map((x) => html`<td class="num"><div>${money(x.p)}</div><div class="sub" style="font-weight:500">из ${money(x.a)}</div></td>`)}</tr></tfoot>
    </table></div>` : html`<${Empty} icon="cap" title="Преподавателей пока нет">Добавьте преподавателя во вкладке «Преподаватели».<//>`}
    <div class="card-foot" style="justify-content:flex-start"><span class="hint">Каждая ячейка — начисление за месяц занятий. Нажмите, чтобы выплатить, поставить другую сумму, не платить за месяц или отменить выплату. Пустая ячейка — добавить разовую выплату.</span></div>
  </section>`;
}

// ---------- Вкладка «Ставки» ----------
const fromOpts = (cur, pick) => monthOptions(C.ymAdd(cur, -6), pick && pick > C.ymAdd(cur, 3) ? pick : C.ymAdd(cur, 3), cur);
/** С какого месяца по умолчанию менять сумму: первый месяц этого источника, за который ещё ничего не выплачено. */
function firstUnpaid(L, src, d) {
  const mine = L.lines.filter((c) => C.lineSource(c) === src && c.ym >= C.ymAdd(d.ym, -1)).sort((a, b) => (a.ym < b.ym ? -1 : 1));
  const open = mine.find((c) => !(c.paid > 0));
  if (open) return open.ym;
  return mine.length ? C.ymAdd(mine[mine.length - 1].ym, 1) : d.ym;
}
function RateRow({ kind, x, t, d }) {
  const pay = kind === 'group' || kind === 'student' ? x.pay || { payDay: 1, when: 'end', rates: [] } : null;
  const r = pay ? C.rateAt(pay.rates, d.ym) : C.rateAt(t.rates, d.ym);
  const pct = !!(r && r.mode === 'percent');
  const src = kind === 'group' ? 'g:' + x.id : kind === 'student' ? 's:' + x.id : t.payType === 'perLesson' ? 'les' : 'sal';
  const init = { amount: r && r.amount && !pct ? String(r.amount) : '', when: pay ? pay.when || 'same' : 'same', payDay: String(pay ? pay.payDay : t.payDay), from: firstUnpaid(d.teacher(t.id), src, d) };
  const [v, setV] = useState(init);
  const set = (k, val) => setV({ ...v, [k]: val });
  const changed = pos(v.amount) !== pos(init.amount) || v.when !== init.when || v.payDay !== init.payDay;
  const amountChanged = pos(v.amount) !== pos(init.amount);
  const save = () => {
    const day = C.clampDay(v.payDay);
    if (pay) act.setSourcePay(kind, x.id, { amount: pos(v.amount), when: v.when, payDay: day, from: v.from });
    else act.setTeacherRate(t.id, { amount: pos(v.amount), payDay: day, from: v.from });
  };
  const first = pay && pay.rates.length ? pay.rates.reduce((a, b) => (a.from <= b.from ? a : b)).from : null;
  const nextPay = pay && r && r.amount > 0 ? C.payDue(d.ym, pay) : null;
  const name = kind === 'group' ? x.name : kind === 'student' ? x.name : t.payType === 'perLesson' ? 'Ставка за занятие' : 'Оклад в месяц';
  const members = kind === 'group' ? S().students.filter((s) => s.groupId === x.id && !s.archived).length : null;
  return html`<div class="raterow">
    <div class="rr-name"><b>${name}</b><div class="hint">${kind === 'group' ? `${members} ${C.plural(members, 'ученик', 'ученика', 'учеников')}` : kind === 'student' ? 'индивидуально' : ''}${pct ? html` · <span style="color:var(--soon)">сейчас ${r.amount}% от оплат учеников — впишите сумму, чтобы платить фиксированно</span>` : r && r.amount > 0 ? `${kind === 'group' || kind === 'student' ? ' · ' : ''}сейчас ${money(r.amount)}${pay ? ', ' + whenText(pay) : `, ${t.payDay}-го`}` : html`${kind === 'group' || kind === 'student' ? ' · ' : ''}<span style="color:var(--soon)">сумма не задана</span>`}${nextPay ? ` · за ${C.ymName(d.ym)} — ${C.fmtDate(nextPay)}` : ''}${first ? ` · начисляется с ${C.ymGen(first)}` : ''}</div></div>
    <label class="rr-f"><span>${pay ? 'Сумма за месяц' : 'Сумма'}</span><input class="input sm" inputmode="decimal" placeholder="0" value=${v.amount} onInput=${(e) => set('amount', e.target.value)} /></label>
    ${pay && html`<label class="rr-f"><span>Когда платить</span><select class="input sm" value=${v.when} onChange=${(e) => set('when', e.target.value)}>${WHEN.map(([k, l]) => html`<option value=${k} selected=${v.when === k}>${l}</option>`)}</select></label>`}
    ${(!pay || v.when !== 'end') && html`<label class="rr-f narrow"><span>Число</span><input class="input sm" inputmode="numeric" value=${v.payDay} onInput=${(e) => set('payDay', e.target.value)} /></label>`}
    ${amountChanged && html`<label class="rr-f"><span>Новая сумма с</span><select class="input sm" value=${v.from} onChange=${(e) => set('from', e.target.value)}>${fromOpts(d.ym, v.from).map(([ym, l]) => html`<option value=${ym} selected=${v.from === ym}>${l}</option>`)}</select></label>`}
    <div class="rr-act">${changed ? html`<button class="btn sm primary" onClick=${save}>Сохранить</button><button class="btn sm ghost" onClick=${() => setV(init)}>Сброс</button>` : kind === 'group' ? html`<button class="btn sm ghost icon" aria-label="Открыть группу" title="Открыть группу" onClick=${() => open('group', { id: x.id })}><${Icon} name="right" /></button>` : kind === 'student' ? html`<button class="btn sm ghost icon" aria-label="Открыть ученика" title="Открыть ученика" onClick=${() => open('student', { id: x.id })}><${Icon} name="right" /></button>` : null}</div>
  </div>`;
}
function Rates({ d }) {
  const st = S();
  const teachers = d.activeTeachers.slice().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const orphan = st.groups.filter((g) => !g.archived && d.inProject(g) && !byId(st.teachers.filter((t) => !t.archived), g.teacherId));
  const scheme = (t, type) => {
    if (type === t.payType) return;
    confirmSheet({ title: `${t.name}: другая схема оплаты?`, text: `Сейчас — ${SCHEME[t.payType]}, новая — ${SCHEME[type]}. Уже заработанное по прежней схеме сохранится, новая начнёт начисляться с ближайшего срока.`, ok: 'Сменить', danger: false,
      onOk: () => act.saveTeacher({ name: t.name, projectId: t.projectId, subject: t.subject, phone: t.phone, telegram: t.telegram, notes: t.notes, payType: type, payDay: t.payDay, rate: 0 }, t.id) });
  };
  const assign = (g, tid) => act.saveGroup({ name: g.name, projectId: g.projectId, teacherId: tid, subject: g.subject, schedule: g.schedule, payType: g.payType, price: g.price, payDay: g.payDay, every: g.every, lessonsInPackage: g.lessonsInPackage, notes: g.notes }, g.id);
  return html`<div class="stack">
    <div class="hint">Здесь все ставки в одном месте. Поменяйте сумму — появится выбор, с какого месяца она действует; прошлые месяцы не пересчитываются. Сумму только за один месяц удобнее менять в «Ведомости».</div>
    ${teachers.map((t) => {
      const gs = st.groups.filter((g) => g.teacherId === t.id && !g.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      const solo = st.students.filter((s) => !s.groupId && s.teacherId === t.id && !s.archived).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      const extras = (t.extras || []).filter((x) => x.due >= C.addDays(d.today, -60)).sort((a, b) => b.due.localeCompare(a.due));
      return html`<section class="card" key=${t.id}>
        <div class="spread" style="flex-wrap:wrap;gap:10px"><div class="row" style="padding:0;border:0"><${Avatar} name=${t.name} /><div class="row-main"><div class="row-title"><span>${t.name}</span></div><div class="row-sub">${t.subject || ' '}</div></div></div>
          <div class="toolbar"><select class="input sm" style="width:auto" aria-label="Схема оплаты" value=${t.payType} onChange=${(e) => scheme(t, e.target.value)}>${Object.entries(SCHEME).map(([k, l]) => html`<option value=${k} selected=${t.payType === k}>${l[0].toUpperCase() + l.slice(1)}</option>`)}</select>
            <button class="btn sm" onClick=${() => open('payExtra', { id: t.id })}><${Icon} name="plus" cls="s" />Разовая выплата</button></div></div>
        <div class="raterows">
          ${t.payType === 'perGroup' ? html`${gs.map((g) => html`<${RateRow} key=${g.id + JSON.stringify(g.pay)} kind="group" x=${g} t=${t} d=${d} />`)}${solo.map((s) => html`<${RateRow} key=${s.id + JSON.stringify(s.pay)} kind="student" x=${s} t=${t} d=${d} />`)}
            ${!gs.length && !solo.length && html`<div class="hint">У ${t.name} пока нет групп и индивидуальных учеников. Назначьте преподавателя в карточке группы или ниже, в «Группах без преподавателя».</div>`}`
            : html`<${RateRow} key=${t.id + JSON.stringify(t.rates) + t.payDay} kind="teacher" t=${t} d=${d} />`}
        </div>
        ${extras.length > 0 && html`<div class="small" style="margin-top:10px"><span class="muted">Разовые выплаты: </span>${extras.map((x) => html`<span class="tag" key=${x.id}>${x.label} ${money(x.amount)} · ${C.fmtDate(x.due)}<button class="linkbtn" aria-label="Убрать" title="Убрать" onClick=${() => act.removeTeacherExtra(t.id, x.id)}>×</button></span>`)}</div>`}
      </section>`;
    })}
    ${!teachers.length && html`<div class="card"><${Empty} icon="cap" title="Преподавателей пока нет" action=${html`<button class="btn primary" onClick=${() => open('teacherForm', {})}><${Icon} name="plus" cls="s" />Добавить преподавателя</button>`}>Добавьте преподавателя и выберите, как ему платить.<//></div>`}
    ${orphan.length > 0 && teachers.length > 0 && html`<section class="card"><h2>Группы без преподавателя</h2><div class="hint" style="margin:2px 0 8px">За них сейчас никому не начисляется.</div><div class="raterows">${orphan.map((g) => html`<div class="raterow" key=${g.id}><div class="rr-name"><b>${g.name}</b></div><label class="rr-f"><span>Преподаватель</span><select class="input sm" onChange=${(e) => e.target.value && assign(g, e.target.value)}><option value="">— выбрать —</option>${teachers.map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select></label></div>`)}</div></section>`}
  </div>`;
}

// ---------- Раздел ----------
export function Payroll() {
  const d = getDerived(), tab = store.ui.payrollTab || 'due';
  const nDue = d.teachersDue.length;
  return html`<div class="stack">
    <div class="page-tools" style="margin-bottom:0">
      <${Seg} value=${tab} onChange=${(x) => store.setUI({ payrollTab: x })} options=${[['due', nDue ? `К выплате · ${nDue}` : 'К выплате', 'cash'], ['sheet', 'Ведомость', 'table'], ['rates', 'Ставки', 'settings'], ['list', 'Преподаватели', 'cap']]} />
      <button class="btn primary push" onClick=${() => open('teacherForm', {})}><${Icon} name="plus" cls="s" /><span class="only-wide">Преподаватель</span></button>
    </div>
    ${tab === 'sheet' ? html`<${Sheet2} d=${d} />` : tab === 'rates' ? html`<${Rates} d=${d} />` : tab === 'list' ? html`<${TeacherList} />` : html`<${Schedule} d=${d} />`}
  </div>`;
}

// ---------- Окно выплаты: выбрать, за что ----------
function PayLinesI({ id, keys, upTo, close }) {
  const st = S(), d = getDerived();
  const t = byId(st.teachers, id);
  const L = useMemo(() => C.teacherLedger(t, st, d.idx, { today: d.today, remindDays: d.remindDays, toYm: C.ymAdd(d.ym, 2), noAhead: true }), [d, id]);
  const lines = L.lines.filter((c) => c.rest > 0);
  const limit = upTo || C.addDays(d.today, d.remindDays);
  const [sel, setSel] = useState(() => Object.fromEntries(lines.map((c) => [c.key, keys ? keys.includes(c.key) : c.due <= limit])));
  const [amt, setAmt] = useState(null);
  const [v, setV] = useState({ date: C.today(), method: st.settings.defaultMethod || '', note: '' });
  const chosen = lines.filter((c) => sel[c.key]);
  const sum = C.r2(chosen.reduce((a, c) => a + c.rest, 0));
  const amount = amt == null ? sum : pos(amt);
  const toggle = (k, on) => { setSel({ ...sel, [k]: on }); setAmt(null); };
  const submit = () => { if (!amount) return; close(); act.payTeacherLines(id, chosen.map((c) => ({ key: c.key, label: c.label, ym: c.ym, amount: c.rest })), { amount, date: v.date, method: v.method, note: v.note }); };
  let lastYm = '';
  return html`<${Sheet} title=${`Выплата · ${t.name}`} onClose=${close} onSubmit=${submit}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary" disabled=${!amount}>Выплатить${amount ? ' ' + money(amount) : ''}</button>`}>
    <div class="stack" style="gap:14px">
      ${lines.length ? html`<div>
        <div class="spread" style="margin-bottom:6px"><span class="small muted">Отметьте, за что платите</span><span class="toolbar"><button type="button" class="btn sm ghost" onClick=${() => { setSel(Object.fromEntries(lines.map((c) => [c.key, c.due <= C.addDays(d.today, d.remindDays)]))); setAmt(null); }}>К сроку</button><button type="button" class="btn sm ghost" onClick=${() => { setSel(Object.fromEntries(lines.map((c) => [c.key, true]))); setAmt(null); }}>Всё</button></span></div>
        <div class="pick" style="max-height:none">${lines.map((c) => { const head = c.ym !== lastYm; lastYm = c.ym; return html`${head && html`<div class="row" style="background:var(--surface-2);padding-top:5px;padding-bottom:5px"><b class="small">${C.ymLong(c.ym)}</b></div>`}<label class="row tap" key=${c.key}><input type="checkbox" checked=${!!sel[c.key]} onChange=${(e) => toggle(c.key, e.target.checked)} style="width:18px;height:18px;accent-color:var(--accent)" /><div class="row-main"><div class="row-title"><span>${lineName(c)}</span><${Pill} status=${c.status}>${c.status === 'later' ? C.fmtDate(c.due) : dueText(c.due)}<//></div><div class="row-sub">${c.custom ? `своя сумма (обычно ${money(c.base)})` : c.src === 'extra' ? 'разовая выплата' : `за ${C.ymName(c.ym)}`}${c.paid > 0 ? ` · уже выплачено ${money(c.paid)}` : ''}</div></div><span class="row-amount">${money(c.rest)}</span></label>`; })}</div>
      </div>` : html`<div class="preview"><span>Начислений к выплате нет — сумма запишется как аванс и закроет следующие начисления.</span></div>`}
      <div class="field"><label for="pl-amount">Сумма</label><input id="pl-amount" class="input big" inputmode="decimal" autocomplete="off" value=${amt == null ? (sum ? String(sum) : '') : amt} onInput=${(e) => setAmt(e.target.value)} placeholder="0" /></div>
      ${amount > 0 && amount < sum && html`<div class="hint">Меньше выбранного на ${money(C.r2(sum - amount))}: закроются отмеченные строки по порядку, остаток останется к выплате.</div>`}
      ${amount > sum && html`<div class="hint">Больше выбранного на ${money(C.r2(amount - sum))}: остаток пойдёт в счёт следующих начислений.</div>`}
      <div class="field"><label>Дата</label><${DateChips} value=${v.date} onChange=${(x) => setV({ ...v, date: x })} /></div>
      <${MethodChips} value=${v.method} onChange=${(x) => setV({ ...v, method: x })} />
      <div class="field"><label for="pl-note">Комментарий</label><input id="pl-note" class="input" value=${v.note} onInput=${(e) => setV({ ...v, note: e.target.value })} placeholder="необязательно" /></div>
    </div>
  <//>`;
}

/** Своя сумма за один месяц по одной строке. */
function PayAdjI({ id, lineKey: key, close }) {
  const st = S(), d = getDerived();
  const t = byId(st.teachers, id);
  const ym = key.slice(-7);
  const L = C.teacherLedger(t, st, d.idx, { today: d.today, remindDays: d.remindDays, toYm: C.isYm(ym) && ym > d.ym ? ym : d.ym, noAhead: true });
  const c = L.lines.find((x) => x.key === key);
  const [v, set] = useState(c ? String(c.amount) : '');
  if (!c) return html`<${Sheet} title="Начисление" cls="narrow" onClose=${close}><p class="muted">Это начисление больше не найдено.</p><//>`;
  const base = c.custom ? c.base : c.amount;
  const n = C.parseAmount(v), ok = String(v).trim() !== '' && n != null && n >= 0;
  return html`<${Sheet} title=${`${t.name} · ${forMonth(c)}`} cls="narrow" onClose=${close} onSubmit=${() => { if (!ok) return; close(); act.setTeacherAdj(id, key, n === base ? null : n, forMonth(c)); }}
    foot=${html`${c.custom && html`<div class="left"><button type="button" class="btn ghost" onClick=${() => { close(); act.setTeacherAdj(id, key, null, forMonth(c)); }}>Вернуть ${money(base)}</button></div>`}<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary" disabled=${!ok}>Сохранить</button>`}>
    <div class="field"><label for="pa-amount">Сумма за ${C.ymName(c.ym)}</label><input id="pa-amount" class="input big" inputmode="decimal" autocomplete="off" value=${v} onInput=${(e) => set(e.target.value)} /></div>
    <p class="hint" style="margin-top:12px">Только для этого месяца: обычная сумма — ${money(base)}, она останется для остальных месяцев. 0 — за этот месяц не платим. Чтобы поменять сумму насовсем, используйте вкладку «Ставки».${c.paid > 0 ? ` Уже выплачено ${money(c.paid)}.` : ''}</p>
  <//>`;
}

/** Разовая выплата или премия. */
function PayExtraI({ id, ym, close }) {
  const t = byId(S().teachers, id), d = getDerived();
  const [v, setV] = useState({ label: '', amount: '', due: ym && ym !== d.ym ? `${ym}-${String(C.daysInYm(ym)).padStart(2, '0')}` : d.today });
  const amount = pos(v.amount);
  return html`<${Sheet} title=${`Разовая выплата · ${t.name}`} cls="narrow" onClose=${close} onSubmit=${() => { if (!amount || !C.isSaneDate(v.due)) return; close(); act.addTeacherExtra(id, { label: v.label, amount, due: v.due, ym: ym || C.ymOf(v.due) }); }}
    foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary" disabled=${!amount}>Добавить</button>`}>
    <div class="stack" style="gap:14px">
      <div class="field"><label for="px-label">За что</label><input id="px-label" class="input" value=${v.label} onInput=${(e) => setV({ ...v, label: e.target.value })} placeholder="Премия, замена, пробный урок…" /></div>
      <div class="field"><label for="px-amount">Сумма</label><input id="px-amount" class="input big" inputmode="decimal" autocomplete="off" value=${v.amount} onInput=${(e) => setV({ ...v, amount: e.target.value })} placeholder="0" /></div>
      <div class="field"><label for="px-due">Выплатить до</label><input id="px-due" class="input" type="date" value=${v.due} onInput=${(e) => C.isSaneDate(e.target.value) && setV({ ...v, due: e.target.value })} /></div>
      <p class="hint">Появится в списке «К выплате» и в ведомости. Записать саму выплату — кнопкой «Выплатить».</p>
    </div>
  <//>`;
}

export const PayLines = guard('teachers', PayLinesI), PayAdj = guard('teachers', PayAdjI), PayExtra = guard('teachers', PayExtraI);
Object.assign(sheets, { payout: PayLines, payAdj: PayAdj, payExtra: PayExtra });
