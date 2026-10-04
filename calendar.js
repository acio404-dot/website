/* calendar.js — календарь сроков: оплаты учеников, выплаты преподавателям, подписки. */
import { html, useState, useMemo } from './vendor.js';
import { store } from './store.js';
import * as C from './core.js';
import { money, cx, Icon, Pill, Empty, getDerived, open, go, dueText, tap } from './ui.js';
import { quickPay, quickRecurring } from './quick.js';
import { PaymentRow } from './home.js';

export function Calendar() {
  const d = getDerived(), st = store.state;
  const ym = store.ui.calMonth || d.ym;
  const [sel, setSel] = useState(d.today);
  const first = ym + '-01';
  const offset = (C.parseISO(first).getDay() + 6) % 7, dim = C.daysInYm(ym);
  const cells = Math.ceil((offset + dim) / 7) * 7;
  const start = C.addDays(first, -offset), end = C.addDays(start, cells - 1);
  const map = useMemo(() => { const m = new Map(); for (const e of C.eventsBetween(st, d, start, end)) { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date).push(e); } return m; }, [d, start, end]);
  let tin = 0, tout = 0, left = 0;
  for (const [date, evs] of map) if (C.ymOf(date) === ym) for (const e of evs) { if (e.dir === 'in') { tin += e.charge ? e.charge.amount : e.amount; if (e.status !== 'paid') left += e.amount; } else tout += e.amount; }
  // текущий месяц не запоминаем как конкретный: завтра «сегодня» будет другим
  const shift = (n) => { const to = n === 0 ? d.ym : C.ymAdd(ym, n); store.setUI({ calMonth: to === d.ym ? null : to }); };
  // события выбранного дня считаем отдельно: он может быть вне показанного месяца
  const evs = useMemo(() => map.get(sel) || C.eventsBetween(st, d, sel, sel), [map, sel]);
  const ahead = useMemo(() => C.eventsBetween(st, d, C.addDays(sel, 1), C.addDays(sel, 45)).filter((e) => e.status !== 'paid').slice(0, 6), [d, sel]);
  const oldDebt = C.r2(d.debtors.reduce((a, s) => a + d.student(s.id).due.reduce((b, c) => b + (c.due < first ? c.rest : 0), 0), 0));
  const done = (e) => e.status === 'paid';
  const pays = d.payments.filter((p) => p.date === sel);
  const act = (e) => e.kind === 'student' ? html`<button class="btn sm good" onClick=${() => quickPay(e.id)}><${Icon} name="check" cls="s" /><span class="only-wide">Оплатил</span></button>`
    : e.kind === 'teacher' ? html`<button class="btn sm good" onClick=${() => open('payout', { id: e.id })}><${Icon} name="cash" cls="s" /><span class="only-wide">Выплатить</span></button>`
    : html`<button class="btn sm good" onClick=${() => quickRecurring(e.id, e.period)}><${Icon} name="check" cls="s" /><span class="only-wide">Оплачено</span></button>`;
  return html`<div class="cols cal">
    <section class="card">
      <div class="cal-head"><h2>${C.ymLong(ym)}</h2><div class="toolbar"><button class="btn sm icon ghost" aria-label="Предыдущий месяц" onClick=${() => shift(-1)}><${Icon} name="left" /></button><button class="btn sm ghost" onClick=${() => { shift(0); setSel(d.today); }}>Сегодня</button><button class="btn sm icon ghost" aria-label="Следующий месяц" onClick=${() => shift(1)}><${Icon} name="right" /></button></div></div>
      <div class="legend" style="margin-bottom:10px"><span><i style="background:var(--series-1)"></i>оплаты учеников ${money(tin)}${left > 0 ? ` · ждём ${money(left)}` : ''}</span><span><i style="background:var(--series-2)"></i>выплаты и подписки ${money(tout)}</span>${oldDebt > 0 && html`<a href="#/students" onClick=${() => store.setUI({ studentsFilter: 'due', studentsView: 'list' })} style="color:var(--overdue)">долги с прошлых месяцев: ${money(oldDebt)}</a>`}</div>
      <div class="cal-grid">
        ${C.WEEKDAYS.map((w) => html`<div class="cal-dow">${w}</div>`)}
        ${Array.from({ length: cells }, (_, i) => {
          const iso = C.addDays(start, i), list = map.get(iso) || [];
          return html`<button class=${cx('cal-day', C.ymOf(iso) !== ym && 'other', iso === d.today && 'is-today', iso === sel && 'is-sel')} onClick=${() => setSel(iso)} aria-label=${C.fmtDateLong(iso)}>
            <span class="d">${Number(iso.slice(8))}</span>
            ${list.slice(0, 3).map((e) => html`<span class=${cx('cal-ev', e.dir, done(e) && 'done', e.status === 'overdue' && 'late')}>${e.name}</span>`)}
            ${list.length > 3 && html`<span class="cal-more">ещё ${list.length - 3}</span>`}
            <span class="cal-dots">${list.slice(0, 6).map((e) => html`<span class=${cx('dot', done(e) ? 'ok' : e.status === 'overdue' ? 'overdue' : e.dir)}></span>`)}</span>
          </button>`;
        })}
      </div>
    </section>
    <div class="stack">
      <section class="card flush">
        <div class="card-head"><div><h2>${C.fmtDateLong(sel).replace(/ \d{4}$/, '')}</h2><div class="hint">${C.relDays(sel)}</div></div><button class="btn sm ghost" onClick=${() => open('quickAdd', { kind: 'expense', preset: { date: sel } })}><${Icon} name="plus" cls="s" />Запись</button></div>
        ${evs.length ? html`<div class="rows">${evs.map((e) => html`<div class="row tap" ...${tap(() => (e.kind === 'student' ? open('student', { id: e.id }) : e.kind === 'teacher' ? open('teacher', { id: e.id }) : open('recurringForm', { id: e.id })))}><span class=${cx('dot', e.dir)}></span><div class="row-main"><div class="row-title"><span>${e.name}</span></div><div class="row-sub">${done(e) ? html`<${Pill} status="paid">оплачено<//> ` : e.status !== 'later' ? html`<${Pill} status=${e.status}>${dueText(e.date)}<//> ` : ''}${e.sub}</div></div><span class="row-amount">${e.dir === 'in' ? '+' : '−'}${money(e.amount)}</span>${!done(e) && html`<div class="row-actions" onClick=${(x) => x.stopPropagation()}>${act(e)}</div>`}</div>`)}</div>`
          : html`<${Empty}>По графику в этот день платежей нет.<//>`}
      </section>
      ${pays.length > 0 && html`<section class="card flush"><div class="card-head"><h2>Записано в этот день</h2></div><div class="rows">${pays.map((p) => html`<${PaymentRow} key=${p.id} p=${p} />`)}</div></section>`}
      ${ahead.length > 0 && html`<section class="card flush"><div class="card-head"><h2>Дальше по графику</h2></div><div class="rows">${ahead.map((e) => html`<div class="row tap" ...${tap(() => { setSel(e.date); if (C.ymOf(e.date) !== ym) store.setUI({ calMonth: C.ymOf(e.date) === d.ym ? null : C.ymOf(e.date) }); })}><span class=${cx('dot', e.dir)}></span><div class="row-main"><div class="row-title"><span>${e.name}</span></div><div class="row-sub">${C.fmtDate(e.date)} · ${C.relDays(e.date)} · ${e.sub}</div></div><span class="row-amount">${e.dir === 'in' ? '+' : '−'}${money(e.amount)}</span></div>`)}</div></section>`}
    </div>
  </div>`;
}
