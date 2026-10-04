/* finance.js — раздел «Финансы»: сводка с графиками, таблица по месяцам, журнал операций, подписки. */
import { html, useState, useMemo } from './vendor.js';
import { store, act } from './store.js';
import * as C from './core.js';
import { money, moneyBig, cx, Icon, Avatar, Pill, Empty, Seg, SearchInput, HBars, getDerived, open, openMenu, download, toCSV, dueText, toast, tap } from './ui.js';
import { CashflowCard, PaymentRow } from './home.js';
import { quickRecurring } from './quick.js';

const S = () => store.state;
const projectName = (id) => (S().projects.find((p) => p.id === id) || {}).name || '';
const top = (rows, n = 7) => { const s = rows.filter((r) => r.total > 0).sort((a, b) => b.total - a.total); if (s.length <= n + 1) return s.map((r) => ({ label: r.label, value: r.total })); const head = s.slice(0, n).map((r) => ({ label: r.label, value: r.total })); return [...head, { label: `Прочее (${s.length - n})`, value: C.r2(s.slice(n).reduce((a, r) => a + r.total, 0)) }]; };

function Summary({ d }) {
  const ui = store.ui, range = ui.financeRange === 12 ? 12 : 6;
  const months = useMemo(() => C.ymRange(C.ymAdd(d.ym, -(range - 1)), d.ym), [d.ym, range]);
  const m = useMemo(() => C.plMatrix(S(), months, d.project), [d, months]);
  const SEC = ['Группы', 'Индивидуально', 'Прочие доходы'];
  const exportCSV = () => {
    const rows = [['Строка', ...months.map((ym) => C.ymShort(ym, true)), 'Итого'], ['ДОХОДЫ']];
    for (const r of m.income) rows.push([r.label, ...months.map((ym) => r.cells[ym] || ''), r.total]);
    rows.push(['Доходы всего', ...months.map((ym) => m.totalIn[ym]), m.sumIn], ['РАСХОДЫ']);
    for (const r of m.expense) rows.push([r.label, ...months.map((ym) => (r.cells[ym] ? -r.cells[ym] : '')), -r.total]);
    rows.push(['Расходы всего', ...months.map((ym) => -m.totalOut[ym]), -m.sumOut], ['Прибыль', ...months.map((ym) => m.net[ym]), m.sumNet]);
    download(`pomesyachno-${C.today()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
  };
  const cell = (v, neg) => html`<td class=${cx('num', !v && 'faint')}>${v ? money(neg ? -v : v) : '·'}</td>`;
  let last = -1;
  const empty = !m.income.length && !m.expense.some((r) => r.total > 0);
  return html`<div class="stack">
    <div class="page-tools" style="margin-bottom:0"><${Seg} value=${range} onChange=${(x) => store.setUI({ financeRange: x })} options=${[[6, '6 месяцев'], [12, 'Год']]} /><button class="btn push" onClick=${exportCSV}><${Icon} name="download" cls="s" /><span class="only-wide">Скачать CSV</span></button></div>
    <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
      <div class="kpi"><span class="kpi-label"><span class="dot in"></span>Доходы</span><span class="kpi-value">${moneyBig(m.sumIn)}</span><span class="kpi-sub">≈ ${moneyBig(m.sumIn / months.length)} в месяц</span></div>
      <div class="kpi"><span class="kpi-label"><span class="dot out"></span>Расходы</span><span class="kpi-value">${moneyBig(m.sumOut)}</span><span class="kpi-sub">≈ ${moneyBig(m.sumOut / months.length)} в месяц</span></div>
      <div class="kpi"><span class="kpi-label">Прибыль</span><span class=${cx('kpi-value', m.sumNet < 0 && 'neg')}>${moneyBig(m.sumNet)}</span><span class="kpi-sub">${m.sumIn > 0 ? `${Math.round((m.sumNet / m.sumIn) * 100)}% от доходов` : 'за период'}</span></div>
    </div>
    ${empty ? html`<div class="card"><${Empty} icon="chart" title="Пока нет операций">Записывайте оплаты и расходы — здесь появятся графики и таблица по месяцам.<//></div>` : html`
    <${CashflowCard} d=${d} range=${range} />
    <div class="cols even">
      <section class="card"><div class="card-head"><div><h2>На что уходят деньги</h2><div class="hint">расходы по категориям за период</div></div></div>${m.sumOut > 0 ? html`<${HBars} rows=${top(m.expense)} />` : html`<div class="hint">Расходов за период нет.</div>`}</section>
      <section class="card"><div class="card-head"><div><h2>Откуда приходят</h2><div class="hint">оплаты по группам и ученикам</div></div></div>${m.sumIn > 0 ? html`<${HBars} rows=${top(m.income)} kind="inc" />` : html`<div class="hint">Поступлений за период нет.</div>`}</section>
    </div>
    <section class="card flush">
      <div class="card-head"><div><h2>По месяцам</h2><div class="hint">по датам оплат; зарплаты входят в расходы</div></div></div>
      <div class="table-wrap"><table class="matrix">
        <thead><tr><th>Статья</th>${months.map((ym) => html`<th class=${cx('num', ym === d.ym && 'cur')}>${C.ymShort(ym, true)}</th>`)}<th class="num">Итого</th></tr></thead>
        <tbody>
          ${m.income.map((r) => { const head = r.section !== last; last = r.section; return html`${head && html`<tr class="sec"><td colspan=${months.length + 2}><span class="stick">${SEC[r.section]}</span></td></tr>`}<tr><td title=${r.sub}>${r.label}</td>${months.map((ym) => cell(r.cells[ym]))}<td class="num"><b>${money(r.total)}</b></td></tr>`; })}
          <tr class="sec"><td>Доходы всего</td>${months.map((ym) => html`<td class="num">${money(m.totalIn[ym])}</td>`)}<td class="num">${money(m.sumIn)}</td></tr>
          <tr class="sec"><td colspan=${months.length + 2}><span class="stick">Расходы</span></td></tr>
          ${m.expense.map((r) => html`<tr><td>${r.label}</td>${months.map((ym) => html`<td class=${cx('num btncell', !r.cells[ym] && 'faint')}><button class="cellbtn" title=${`Добавить расход «${r.label}» за ${C.ymName(ym)}`} onClick=${() => open('quickAdd', { kind: 'expense', preset: { category: r.label === 'Без категории' || r.label === 'Зарплаты' ? '' : r.label, date: ym === d.ym ? d.today : ym + '-01' } })}>${r.cells[ym] ? money(-r.cells[ym]) : '·'}</button></td>`)}<td class="num"><b>${money(-r.total)}</b></td></tr>`)}
          <tr class="sec"><td>Расходы всего</td>${months.map((ym) => html`<td class="num">${money(-m.totalOut[ym])}</td>`)}<td class="num">${money(-m.sumOut)}</td></tr>
        </tbody>
        <tfoot><tr><td>Прибыль</td>${months.map((ym) => html`<td class="num" style=${m.net[ym] < 0 ? 'color:var(--overdue)' : ''}>${money(m.net[ym])}</td>`)}<td class="num" style=${m.sumNet < 0 ? 'color:var(--overdue)' : ''}>${money(m.sumNet)}</td></tr></tfoot>
      </table></div>
    </section>`}
  </div>`;
}

function Journal({ d }) {
  const ui = store.ui, st = S();
  const [q, setQ] = useState('');
  const [ym, setYm] = useState('');
  const [limit, setLimit] = useState(80);
  const kind = ui.journalKind || 'all';
  const nq = C.norm(q);
  const all = useMemo(() => d.payments.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)), [d]);
  const months = useMemo(() => [...new Set(all.map((p) => C.ymOf(p.date)))], [all]);
  const list = all.filter((p) => (kind === 'all' || (kind === 'in' ? C.isIn(p) : !C.isIn(p))) && (!ym || C.ymOf(p.date) === ym) && (!nq || C.norm([p.personName, p.category, p.note, p.method, C.KIND_LABEL[p.kind]].join(' ')).includes(nq)));
  const tin = C.r2(list.filter(C.isIn).reduce((a, p) => a + p.amount, 0)), tout = C.r2(list.filter((p) => !C.isIn(p)).reduce((a, p) => a + p.amount, 0));
  const exportCSV = () => download(`zhurnal-${C.today()}.csv`, toCSV([['Дата', 'Тип', 'Проект', 'Кто / что', 'Категория', 'Способ', 'Сумма', 'Комментарий'], ...list.map((p) => [p.date, C.KIND_LABEL[p.kind], projectName(p.projectId), p.personName, p.category, p.method, C.isIn(p) ? p.amount : -p.amount, p.note])]), 'text/csv;charset=utf-8');
  let lastYm = '';
  const sums = {};
  for (const p of list) { const k = C.ymOf(p.date); sums[k] = sums[k] || { i: 0, o: 0 }; if (C.isIn(p)) sums[k].i += p.amount; else sums[k].o += p.amount; }
  return html`<div class="stack">
    <div class="page-tools" style="margin-bottom:0"><${SearchInput} value=${q} onInput=${setQ} placeholder="Имя, категория, комментарий…" /><${Seg} value=${kind} onChange=${(x) => store.setUI({ journalKind: x })} options=${[['all', 'Всё'], ['in', 'Доходы'], ['out', 'Расходы']]} />
      <button class=${cx('chip', ym && 'is-active')} onClick=${(e) => openMenu(e, [{ label: 'Все месяцы', on: !ym, onClick: () => setYm('') }, ...months.slice(0, 24).map((m) => ({ label: C.ymLong(m), on: ym === m, onClick: () => setYm(m) }))])}>${ym ? C.ymLong(ym) : 'Все месяцы'}<${Icon} name="down" cls="s" /></button>
      <button class="btn push" onClick=${exportCSV}><${Icon} name="download" cls="s" /><span class="only-wide">Скачать CSV</span></button></div>
    ${list.length ? html`<section class="card flush"><div class="rows">${list.slice(0, limit).map((p) => { const k = C.ymOf(p.date), head = k !== lastYm; lastYm = k; return html`${head && html`<div class="row" style="background:var(--surface-2);padding-top:7px;padding-bottom:7px"><b class="small grow">${C.ymLong(k)}</b><span class="small muted num">+${money(sums[k].i)} · −${money(sums[k].o)}</span></div>`}<${PaymentRow} key=${p.id} p=${p} />`; })}</div>
      <div class="card-foot" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><span class="hint">${list.length} ${C.plural(list.length, 'запись', 'записи', 'записей')} · доходы ${money(tin)} · расходы ${money(tout)} · итог ${money(tin - tout)}</span>${list.length > limit && html`<button class="btn sm ghost" onClick=${() => setLimit(limit + 200)}>Показать ещё</button>`}</div></section>`
      : html`<div class="card"><${Empty} icon="list" title=${all.length ? 'Ничего не нашлось' : 'Журнал пуст'}>${all.length ? 'Измените поиск или фильтры.' : 'Здесь появится каждая оплата, выплата и расход. Любую запись можно открыть, поправить или удалить.'}<//></div>`}
  </div>`;
}

function Recurring({ d }) {
  const st = S();
  const active = st.recurring.filter((r) => !r.archived && d.inProject(r)).sort((a, b) => a.payDay - b.payDay || a.name.localeCompare(b.name, 'ru'));
  const off = st.recurring.filter((r) => r.archived && d.inProject(r));
  const total = C.r2(active.reduce((a, r) => a + r.amount, 0));
  const row = (r) => { const L = d.recurring(r.id), c = L.due[0] || L.next; return html`<div class="row tap srow" key=${r.id} ...${tap(() => open('recurringForm', { id: r.id }))}><${Avatar} icon="repeat" />
    <div class="row-main"><div class="row-title"><span>${r.name}</span>${r.auto && html`<${Pill} status="muted"><${Icon} name="zap" />авто<//>`}</div><div class="row-sub">${r.archived ? 'отключена' : html`${L.status !== 'ok' ? html`<${Pill} status=${L.status}>${dueText(c.due)}<//> ` : ''}${r.payDay}-го числа${c ? ` · следующее ${C.fmtDate(c.due)}` : ''}`}${r.notes ? ` · ${r.notes}` : ''}</div></div>
    <span class="row-amount">${money(r.amount)}</span>
    <div class="row-actions" onClick=${(e) => e.stopPropagation()}>${!r.archived && L.due.length > 0 && html`<button class="btn sm good" onClick=${() => quickRecurring(r.id, L.due[0].ym)}><${Icon} name="check" cls="s" /><span class="only-wide">Оплачено</span></button>`}
      <button class="btn sm ghost icon" aria-label="Ещё" onClick=${(e) => openMenu(e, [{ label: 'Изменить', icon: 'edit', onClick: () => open('recurringForm', { id: r.id }) }, !r.archived && c && { label: `Записать оплату за ${C.ymName(c.ym)}…`, icon: 'check', onClick: () => open('recurringPay', { id: r.id, ym: c.ym }) }, ...Object.keys(r.skipped || {}).sort().reverse().slice(0, 3).map((ym) => ({ label: `Вернуть пропущенный ${C.ymShort(ym, true)}`, icon: 'undo', onClick: () => act.skipRecurring(r.id, ym, false) })), { label: r.archived ? 'Включить' : 'Отключить', icon: r.archived ? 'undo' : 'pause', onClick: () => act.archiveRecurring(r.id, !r.archived) }])}><${Icon} name="more" /></button></div></div>`; };
  return html`<div class="stack">
    <div class="page-tools" style="margin-bottom:0"><span class="muted small">${active.length ? html`${active.length} ${C.plural(active.length, 'подписка', 'подписки', 'подписок')} · <b style="color:var(--text)">${money(total)}</b> в месяц` : 'Регулярные расходы: подписки, аренда, реклама'}</span><button class="btn primary push" onClick=${() => open('recurringForm', {})}><${Icon} name="plus" cls="s" />Подписка</button></div>
    ${active.length ? html`<section class="card flush"><div class="rows">${active.map(row)}</div></section>` : html`<div class="card"><${Empty} icon="repeat" title="Подписок пока нет">Добавьте регулярные расходы — дашборд напомнит о сроке или запишет расход сам, если списание автоматическое.<//></div>`}
    ${off.length > 0 && html`<div><div class="sec-title">Отключённые</div><section class="card flush"><div class="rows">${off.map(row)}</div></section></div>`}
  </div>`;
}

export function Finance() {
  const d = getDerived(), tab = store.ui.financeTab || 'summary';
  return html`<div class="stack">
    <${Seg} value=${tab} onChange=${(x) => store.setUI({ financeTab: x })} options=${[['summary', 'Сводка', 'chart'], ['journal', 'Журнал', 'list'], ['recurring', 'Подписки', 'repeat']]} />
    ${tab === 'journal' ? html`<${Journal} d=${d} />` : tab === 'recurring' ? html`<${Recurring} d=${d} />` : html`<${Summary} d=${d} />`}
  </div>`;
}
