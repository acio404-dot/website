/* home.js — «Обзор»: кто и сколько должен, что сделать сегодня, где теряются деньги, экономика групп, график, ближайшие дни. */
import { html, useState, useMemo } from './vendor.js';
import { store, act, hasData, importAny } from './store.js';
import * as C from './core.js';
import { money, moneyBig, cx, Icon, Avatar, Pill, Empty, Seg, Meter, Spark, CashChart, DueLabel, getDerived, open, go, dueText, studentInfo, toast, copyText, download, pickFile, openMenu, tap, confirmSheet } from './ui.js';
import { quickPay, quickRecurring, debtorsText } from './quick.js';
import { demoState } from './demo.js';
import { sync } from './sync.js';

const S = () => store.state;
const groupOf = (s) => S().groups.find((g) => g.id === s.groupId);

export function backupNow() { download(`tryos-finance-${C.today()}.json`, store.exportJSON()); store.markBackup(); toast('Копия скачана — сохраните файл в надёжном месте'); }
/** Загрузить копию из файла. Если в дашборде уже есть данные — сначала показываем, что на что меняется. */
export function importFile() {
  pickFile('application/json,.json', (text) => {
    let next;
    try { next = importAny(JSON.parse(text)); }
    catch (e) { return toast(e instanceof SyntaxError ? 'Это не файл копии: его не удаётся прочитать' : (e && e.message) || 'Файл не читается'); }
    const count = (st) => `${st.students.length} ${C.plural(st.students.length, 'ученик', 'ученика', 'учеников')} и ${st.payments.length} ${C.plural(st.payments.length, 'запись', 'записи', 'записей')}`;
    const stamp = (st) => (st.meta.updatedAt ? `, изменения от ${new Date(st.meta.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}` : '');
    const apply = () => { next.meta.lastBackupAt = new Date().toISOString(); store.replace(next, `Копия загружена: ${count(next)}`, 'Перед загрузкой копии'); };
    const cur = store.state;
    if (!hasData(cur)) return apply();
    const older = !!cur.meta.updatedAt && !!next.meta.updatedAt && next.meta.updatedAt < cur.meta.updatedAt;
    confirmSheet({ title: 'Заменить данные копией?', text: `Сейчас в дашборде: ${count(cur)}${stamp(cur)}. В файле: ${count(next)}${stamp(next)}.${older ? ' Файл старше текущих данных — более поздние изменения пропадут.' : ''} Перед заменой будет сделан автоснимок, а саму замену можно отменить.`, ok: 'Заменить', danger: older || !hasData(next), onOk: apply });
  });
}

export function StudentRow({ s, L, compact, noAvatar }) {
  const i = studentInfo(s, L), g = groupOf(s);
  return html`<div class="row tap srow" ...${tap(() => open('student', { id: s.id }))}>
    ${!noAvatar && html`<${Avatar} name=${s.name} color=${g ? g.color : null} />`}
    <div class="row-main">
      <div class="row-title"><span>${s.name}</span></div>
      <div class="row-sub">${L.status !== 'ok' && html`<${Pill} status=${L.status}>${i.first ? html`<${DueLabel} due=${i.first.due} />` : i.when}<//> `}${i.main}${!compact ? ' · ' + (g ? g.name : 'индивидуально') : ''}${s.remindedAt && L.status !== 'ok' ? ` · напомнили ${C.fmtDate(s.remindedAt)}` : ''}</div>
    </div>
    ${i.amount > 0 ? html`<span class="row-amount">${money(i.amount)}</span>` : i.next ? html`<span class="faint small num">${money(i.next)}</span>` : null}
    ${!s.archived && html`<div class="row-actions" onClick=${(e) => e.stopPropagation()}>
      ${L.status !== 'ok' && html`<button class="btn sm ghost icon" title="Напомнить" aria-label="Напомнить" onClick=${() => open('remind', { id: s.id })}><${Icon} name="bell" /></button>`}
      ${L.status !== 'ok' ? html`<button class="btn sm good" title="Записать оплату" aria-label=${`Оплатил: ${s.name}`} onClick=${() => quickPay(s.id)}><${Icon} name="check" cls="s" /><span class="only-wide">Оплатил</span></button>`
        : html`<button class="btn sm ghost icon" title="Записать оплату заранее" aria-label="Записать оплату" onClick=${() => open('pay', { id: s.id })}><${Icon} name="plus" /></button>`}
    </div>`}
  </div>`;
}

// ---------- Главные цифры ----------
function Hero({ d, i }) {
  const k = d.kpi, soon = C.r2(k.toCollect - k.overdue);
  const eco = i.economy;
  const subs = C.r2(d.activeRecurring.reduce((a, r) => a + (Number(r.amount) || 0), 0));
  const other = C.r2(d.payments.filter((p) => C.ymOf(p.date) === d.ym && p.kind === 'expense' && !p.recurringId).reduce((a, p) => a + p.amount, 0));
  const forecast = C.r2(eco.income - eco.cost - eco.salaries - subs - other);
  const pct = eco.income > 0 ? Math.min(100, Math.round((eco.collected / eco.income) * 100)) : 0;
  const payNow = C.r2(d.teachersDue.reduce((a, t) => a + d.teacher(t.id).dueNow, 0));
  const payLate = C.r2(d.teachersDue.reduce((a, t) => a + d.teacher(t.id).debt, 0));
  const recNow = C.r2(d.recurringDue.reduce((a, r) => a + d.recurring(r.id).dueNow, 0));
  const goDebtors = () => { store.setUI({ studentsFilter: 'due', studentsView: 'list', studentsSort: 'amount' }); go('students'); };
  return html`<div class="hero-grid">
    <button class=${cx('hero', i.owed > 0 ? 'warn' : 'calm')} onClick=${goDebtors}>
      <span class="hero-label"><${Icon} name=${i.owed > 0 ? 'alert' : 'check'} cls="s" />${i.owed > 0 ? 'Вам должны' : 'Просроченных долгов нет'}</span>
      <span class="hero-value">${money(i.owed)}</span>
      <span class="hero-sub">${i.debtors.length ? `${i.debtors.length} ${C.plural(i.debtors.length, 'ученик', 'ученика', 'учеников')} просрочили оплату` : 'все платят вовремя'}${soon > 0 ? ` · ещё ${money(soon)} — срок в ближайшие ${d.remindDays} ${C.plural(d.remindDays, 'день', 'дня', 'дней')}` : ''}</span>
      ${i.owed > 0 && html`<span class="aging">${i.aging.map((b) => html`<span class=${cx('ag', b.key, !(b.amount > 0) && 'zero')} key=${b.key}><b>${money(b.amount)}</b><small>${b.label}</small></span>`)}</span>`}
    </button>
    <div class="kpi">
      <span class="kpi-label">Собрано за ${C.ymName(d.ym)}</span>
      <span class="kpi-value">${moneyBig(eco.collected)}</span>
      <div class=${cx('meter', pct >= 100 && 'done')} style="margin:6px 0 4px"><i style=${`width:${pct}%`}></i></div>
      <span class="kpi-sub">${eco.income > 0 ? `${pct}% из ${money(eco.income)}${eco.income > eco.collected ? ` · осталось ${money(C.r2(eco.income - eco.collected))}` : ''}` : 'начислений пока нет'}</span>
    </div>
    <button class="kpi" onClick=${() => { store.setUI({ payrollTab: 'due' }); go('teachers'); }}>
      <span class="kpi-label">Выплатить сейчас</span>
      <span class=${cx('kpi-value', payLate > 0 && 'neg')}>${moneyBig(C.r2(payNow + recNow))}</span>
      <span class="kpi-sub">${payNow + recNow > 0 ? [payNow > 0 && `зарплаты ${money(payNow)}`, recNow > 0 && `подписки ${money(recNow)}`].filter(Boolean).join(' · ') : 'никому не должны'}</span>
      ${payLate > 0 && html`<span class="kpi-sub" style="color:var(--overdue)">из них просрочено ${money(payLate)}</span>`}
    </button>
    <button class="kpi" onClick=${() => { store.setUI({ financeTab: 'month' }); go('finance'); }}>
      <span class="kpi-label">Прибыль ${C.ymGen(d.ym)}</span>
      <span class=${cx('kpi-value', forecast < 0 && 'neg')}>${moneyBig(forecast)}</span>
      <span class="kpi-sub">прогноз, если все оплатят</span>
      <span class="kpi-sub">сейчас по кассе ${money(k.cur.net)}</span>
    </button>
  </div>`;
}

// ---------- Сделать сегодня ----------
export function summaryText(d, i) {
  const st = S(), lines = [`${st.settings.orgName} — сводка на ${C.fmtDateLong(d.today)}`];
  if (i.debtors.length) { lines.push('', `Должны: ${money(i.owed)}`); for (const x of i.debtors.slice(0, 15)) lines.push(`— ${x.s.name}: ${money(x.L.dueNow)}${x.days ? `, просрочено ${x.days} дн.` : ''}`); }
  const soon = d.debtors.filter((s) => d.student(s.id).status !== 'overdue');
  if (soon.length) { lines.push('', 'Скоро срок оплаты:'); for (const s of soon.slice(0, 15)) { const L = d.student(s.id); lines.push(`— ${s.name}: ${money(L.dueNow)}, ${C.fmtDate(L.due[0].due)}`); } }
  if (d.teachersDue.length) { lines.push('', 'Выплатить преподавателям:'); for (const t of d.teachersDue) { const L = d.teacher(t.id); lines.push(`— ${t.name}: ${money(L.dueNow)} (${[...new Set(L.due.map((c) => c.label))].join(', ')})`); } }
  if (d.recurringDue.length) { lines.push('', 'Оплатить:'); for (const r of d.recurringDue) lines.push(`— ${r.name}: ${money(d.recurring(r.id).dueNow)}`); }
  const warn = [];
  if (i.longDebt.length) warn.push(`${i.longDebt.length} ${C.plural(i.longDebt.length, 'ученик не платит', 'ученика не платят', 'учеников не платят')} больше месяца (${money(i.longDebtSum)})`);
  if (i.noPrice.length) warn.push(`без цены: ${i.noPrice.map((s) => s.name).join(', ')}`);
  for (const r of i.loss) warn.push(`${r.label}: доход ${money(r.income)}, преподавателю ${money(r.cost)}`);
  if (warn.length) { lines.push('', 'Внимание:'); for (const w of warn) lines.push('— ' + w); }
  if (lines.length === 1) lines.push('', 'Сегодня всё в порядке: долгов и выплат нет.');
  return lines.join('\n');
}
function Tasks({ d, i }) {
  const [open1, setOpen] = useState('');
  const now = d.debtors.filter((s) => ['overdue', 'today'].includes(d.student(s.id).status));
  const nowSum = C.r2(now.reduce((a, s) => a + d.student(s.id).dueNow, 0));
  const teachersNow = d.teachersDue.filter((t) => ['overdue', 'today'].includes(d.teacher(t.id).status));
  const tSum = C.r2(teachersNow.reduce((a, t) => a + d.teacher(t.id).dueNow, 0));
  const recNow = d.recurringDue.filter((r) => ['overdue', 'today'].includes(d.recurring(r.id).status));
  const items = [
    { key: 'collect', icon: 'in', tone: now.some((s) => d.student(s.id).status === 'overdue') ? 'bad' : 'warn', show: now.length > 0, title: `Получить оплату от ${now.length} ${C.plural(now.length, 'ученика', 'учеников', 'учеников')}`, sub: 'срок сегодня или уже прошёл', amount: nowSum,
      list: () => now.map((s) => html`<${StudentRow} key=${s.id} s=${s} L=${d.student(s.id)} />`) },
    { key: 'remind', icon: 'bell', tone: 'warn', show: i.remindAgain.length > 0, title: `Напомнить ${i.remindAgain.length} ${C.plural(i.remindAgain.length, 'должнику', 'должникам', 'должникам')}`, sub: 'не напоминали 5 дней и больше', amount: C.r2(i.remindAgain.reduce((a, x) => a + x.amount, 0)),
      list: () => i.remindAgain.map((x) => html`<div class="row" key=${x.s.id}><div class="row-main"><div class="row-title"><span>${x.s.name}</span></div><div class="row-sub">${x.days ? `просрочено ${x.days} дн.` : 'закончился абонемент'} · ${x.since == null ? 'ещё не напоминали' : `напоминали ${x.since} дн. назад`}</div></div><span class="row-amount">${money(x.amount)}</span><div class="row-actions"><button class="btn sm" onClick=${() => open('remind', { id: x.s.id })}><${Icon} name="bell" cls="s" /><span class="only-wide">Напомнить</span></button></div></div>`) },
    { key: 'pay', icon: 'cash', tone: teachersNow.some((t) => d.teacher(t.id).status === 'overdue') ? 'bad' : 'warn', show: teachersNow.length > 0, title: `Выплатить ${teachersNow.length} ${C.plural(teachersNow.length, 'преподавателю', 'преподавателям', 'преподавателям')}`, sub: 'срок сегодня или уже прошёл', amount: tSum,
      list: () => teachersNow.map((t) => { const L = d.teacher(t.id); return html`<div class="row" key=${t.id}><div class="row-main"><div class="row-title"><span>${t.name}</span></div><div class="row-sub">${[...new Set(L.due.map((c) => c.label))].join(', ')} · ${dueText(L.due[0].due)}</div></div><span class="row-amount">${money(L.dueNow)}</span><div class="row-actions"><button class="btn sm good" onClick=${() => open('payout', { id: t.id })}><${Icon} name="cash" cls="s" /><span class="only-wide">Выплатить</span></button></div></div>`; }) },
    { key: 'subs', icon: 'repeat', tone: 'warn', show: recNow.length > 0, title: `Оплатить ${recNow.length} ${C.plural(recNow.length, 'подписку', 'подписки', 'подписок')}`, sub: recNow.map((r) => r.name).join(', '), amount: C.r2(recNow.reduce((a, r) => a + d.recurring(r.id).dueNow, 0)),
      list: () => recNow.map((r) => { const c = d.recurring(r.id).due[0]; return html`<div class="row" key=${r.id}><div class="row-main"><div class="row-title"><span>${r.name}</span></div><div class="row-sub">${C.ymName(c.ym)} · ${dueText(c.due)}</div></div><span class="row-amount">${money(c.amount)}</span><div class="row-actions"><button class="btn sm good" onClick=${() => quickRecurring(r.id, c.ym)}><${Icon} name="check" cls="s" /><span class="only-wide">Оплачено</span></button></div></div>`; }) },
  ].filter((x) => x.show);
  const copy = async () => toast((await copyText(summaryText(d, i))) ? 'Сводка скопирована — её можно вставить в заметки или отправить себе в мессенджер' : 'Не удалось скопировать');
  return html`<section class="card flush">
    <div class="card-head"><div><h2>Сделать сегодня</h2><div class="hint">${items.length ? `${items.length} ${C.plural(items.length, 'дело', 'дела', 'дел')} — нажмите, чтобы раскрыть` : C.fmtDateLong(d.today)}</div></div><button class="btn sm ghost" title="Скопировать сводку на сегодня текстом" onClick=${copy}><${Icon} name="copy" cls="s" />Сводка</button></div>
    ${items.length ? html`<div class="rows">${items.map((x) => html`<div key=${x.key}>
      <button class=${cx('task', x.tone, open1 === x.key && 'is-open')} aria-expanded=${open1 === x.key} onClick=${() => setOpen(open1 === x.key ? '' : x.key)}>
        <span class=${cx('task-ic', x.tone)}><${Icon} name=${x.icon} /></span>
        <span class="row-main"><span class="row-title"><span>${x.title}</span></span><span class="row-sub">${x.sub}</span></span>
        <span class="row-amount">${money(x.amount)}</span><${Icon} name="down" cls="s faint chev" />
      </button>
      ${open1 === x.key && html`<div class="task-list rows">${x.list()}</div>`}
    </div>`)}</div>`
      : html`<div class="all-done"><span class="task-ic good"><${Icon} name="check" /></span><div><b>На сегодня всё сделано</b><div class="hint">Просроченных оплат и выплат нет. Ближайшие сроки — в блоке «Ближайшие 7 дней».</div></div></div>`}
  </section>`;
}

// ---------- Где теряются деньги ----------
function Leaks({ d, i }) {
  const [open1, setOpen] = useState('');
  const [showOk, setShowOk] = useState(false);
  const st = S();
  const sRow = (s, right, sub) => html`<div class="row tap" key=${s.id} ...${tap(() => open('student', { id: s.id }))}><div class="row-main"><div class="row-title"><span>${s.name}</span></div>${sub && html`<div class="row-sub">${sub}</div>`}</div>${right}</div>`;
  const checks = [
    { key: 'long', bad: i.longDebt.length > 0, tone: 'bad', title: i.longDebt.length ? `${i.longDebt.length} ${C.plural(i.longDebt.length, 'ученик не платит', 'ученика не платят', 'учеников не платят')} больше месяца` : 'Долгов дольше месяца нет', sub: 'чем дольше долг, тем меньше шансов его получить — позвоните или договоритесь о рассрочке', amount: i.longDebtSum,
      list: () => i.longDebt.map((x) => sRow(x.s, html`<span class="row-amount">${money(x.amount)}</span>`, `просрочено ${x.days} дн.`)) },
    { key: 'noprice', bad: i.noPrice.length > 0, tone: 'bad', title: i.noPrice.length ? `${i.noPrice.length} ${C.plural(i.noPrice.length, 'ученик занимается', 'ученика занимаются', 'учеников занимаются')} без цены` : 'У всех учеников задана цена', sub: 'им ничего не начисляется — укажите цену в карточке', amount: null,
      list: () => i.noPrice.map((s) => sRow(s, html`<button class="btn sm" onClick=${(e) => { e.stopPropagation(); open('studentForm', { id: s.id }); }}>Указать цену</button>`, (st.groups.find((g) => g.id === s.groupId) || {}).name || 'индивидуально')) },
    { key: 'loss', bad: i.loss.length > 0, tone: 'bad', title: i.loss.length ? `${i.loss.length} ${C.plural(i.loss.length, 'группа убыточна', 'группы убыточны', 'групп убыточны')}` : 'Убыточных групп нет', sub: `преподавателю платите больше, чем приносят ученики за ${C.ymName(d.ym)}`, amount: C.r2(i.loss.reduce((a, r) => a - r.margin, 0)),
      list: () => i.loss.map((r) => html`<div class="row tap" key=${r.key} ...${tap(() => r.group && open('group', { id: r.group.id }))}><div class="row-main"><div class="row-title"><span>${r.label}</span></div><div class="row-sub">ученики ${money(r.income)} · преподавателю ${money(r.cost)}</div></div><span class="row-amount" style="color:var(--overdue)">${money(r.margin)}</span></div>`) },
    { key: 'remind', bad: i.remindAgain.length > 0, tone: 'warn', title: i.remindAgain.length ? `${i.remindAgain.length} ${C.plural(i.remindAgain.length, 'должнику давно не напоминали', 'должникам давно не напоминали', 'должникам давно не напоминали')}` : 'Всем должникам напомнили', sub: 'последнее напоминание 5 и больше дней назад', amount: C.r2(i.remindAgain.reduce((a, x) => a + x.amount, 0)),
      list: () => i.remindAgain.map((x) => sRow(x.s, html`<button class="btn sm" onClick=${(e) => { e.stopPropagation(); open('remind', { id: x.s.id }); }}><${Icon} name="bell" cls="s" />Напомнить</button>`, x.since == null ? 'ещё не напоминали' : `напоминали ${x.since} дн. назад`)) },
    { key: 'thin', bad: i.thin.length > 0, tone: 'warn', title: i.thin.length ? `${i.thin.length} ${C.plural(i.thin.length, 'группа почти ничего не приносит', 'группы почти ничего не приносят', 'групп почти ничего не приносят')}` : 'Все группы с запасом', sub: 'после зарплаты преподавателю остаётся меньше 25%', amount: null,
      list: () => i.thin.map((r) => html`<div class="row tap" key=${r.key} ...${tap(() => r.group && open('group', { id: r.group.id }))}><div class="row-main"><div class="row-title"><span>${r.label}</span></div><div class="row-sub">ученики ${money(r.income)} · преподавателю ${money(r.cost)}</div></div><span class="row-amount">${r.pct}%</span></div>`) },
    { key: 'disc', bad: i.discounts.length > 0, tone: 'info', title: i.discounts.length ? `Скидки и паузы в ${C.ymPrep(d.ym)}: −${money(i.discountSum)}` : `Скидок в ${C.ymPrep(d.ym)} нет`, sub: 'своя сумма ниже обычной цены', amount: null,
      list: () => i.discounts.map((x) => sRow(x.s, html`<span class="row-amount">−${money(x.lost)}</span>`, `${money(x.amount)} вместо ${money(x.base)}`)) },
    { key: 'unset', bad: i.unset.length + i.orphanGroups.length > 0, tone: 'warn', title: i.unset.length + i.orphanGroups.length ? 'Не настроены выплаты преподавателям' : 'Выплаты преподавателям настроены', sub: [i.unset.length && `сумма не задана: ${i.unset.map((u) => u.name).join(', ')}`, i.orphanGroups.length && `без преподавателя: ${i.orphanGroups.map((g) => g.name).join(', ')}`].filter(Boolean).join(' · ') || 'у каждой группы есть преподаватель и ставка', amount: null,
      action: () => { store.setUI({ payrollTab: 'rates' }); go('teachers'); } },
    { key: 'adv', bad: i.advances.length > 0, tone: 'info', title: i.advances.length ? `Выплачено вперёд: ${money(i.advances.reduce((a, x) => a + x.amount, 0))}` : 'Авансов преподавателям нет', sub: i.advances.map((x) => `${x.teacher.name} ${money(x.amount)}`).join(', ') || 'выплачено ровно столько, сколько начислено', amount: null,
      action: i.advances.length ? () => open('teacher', { id: i.advances[0].teacher.id }) : null },
  ];
  const bad = checks.filter((c) => c.bad), ok = checks.filter((c) => !c.bad);
  const row = (c) => html`<div key=${c.key}>
    <button class=${cx('task', c.bad ? c.tone : 'ok', open1 === c.key && 'is-open')} aria-expanded=${open1 === c.key} onClick=${() => (c.list && c.bad ? setOpen(open1 === c.key ? '' : c.key) : c.action && c.action())}>
      <span class=${cx('task-ic', c.bad ? c.tone : 'good')}><${Icon} name=${c.bad ? (c.tone === 'info' ? 'info' : 'alert') : 'check'} /></span>
      <span class="row-main"><span class="row-title"><span>${c.title}</span></span>${c.bad && html`<span class="row-sub wrap">${c.sub}</span>`}</span>
      ${c.bad && c.amount ? html`<span class="row-amount">${money(c.amount)}</span>` : null}${c.bad && (c.list || c.action) && html`<${Icon} name=${c.list ? 'down' : 'right'} cls="s faint chev" />`}
    </button>
    ${open1 === c.key && c.list && html`<div class="task-list rows">${c.list()}</div>`}
  </div>`;
  return html`<section class="card flush">
    <div class="card-head"><div><h2>Где теряются деньги</h2><div class="hint">${bad.length ? `${bad.length} из ${checks.length} проверок требуют внимания` : 'Все проверки пройдены'}</div></div><span class=${cx('score', bad.some((c) => c.tone === 'bad') ? 'bad' : bad.length ? 'warn' : 'good')}>${checks.length - bad.length}/${checks.length}</span></div>
    <div class="rows">${bad.map(row)}${(showOk || !bad.length) && ok.map(row)}</div>
    ${bad.length > 0 && ok.length > 0 && html`<div class="card-foot"><button class="btn sm ghost" onClick=${() => setShowOk(!showOk)}>${showOk ? 'Скрыть пройденные' : `В порядке ещё ${ok.length} ${C.plural(ok.length, 'проверка', 'проверки', 'проверок')}`}</button></div>`}
  </section>`;
}

// ---------- Экономика групп ----------
export function EconomyCard({ d, i }) {
  const e = i.economy;
  if (!e.rows.length) return null;
  return html`<section class="card flush">
    <div class="card-head"><div><h2>Экономика групп · ${C.ymName(d.ym)}</h2><div class="hint">сколько приносят ученики и сколько остаётся после зарплаты</div></div></div>
    <div class="rows only-narrow">${e.rows.map((r) => html`<div class="row tap" key=${r.key} ...${tap(() => (r.group ? open('group', { id: r.group.id }) : go('students')))}><div class="row-main"><div class="row-title"><span>${r.label}</span></div><div class="row-sub wrap">ученики ${money(r.income)} · ${r.cost ? `преподавателю ${money(r.cost)}` : r.salaryTeacher ? 'оклад' : 'без зарплаты за группу'}</div></div><div class="row-end"><span class=${cx('row-amount', r.margin < 0 ? 'neg-t' : r.pct != null && r.pct < 25 && r.cost > 0 ? 'warn-t' : '')}>${money(r.margin)}</span>${r.pct != null && r.cost > 0 ? html`<span class="xs faint">${r.pct}%</span>` : null}</div></div>`)}
      <div class="row" style="background:var(--surface-2)"><div class="row-main"><div class="row-title"><span>Итого остаётся</span></div><div class="row-sub">ученики ${money(e.income)} · зарплаты ${money(C.r2(e.cost + e.salaries))}</div></div><span class=${cx('row-amount', e.margin < 0 && 'neg-t')}>${money(e.margin)}</span></div></div>
    <div class="table-wrap only-wide"><table class="eco">
      <thead><tr><th>Группа</th><th class="num">Ученики</th><th class="num only-wide">Собрано</th><th class="num"><span class="only-wide">Преподавателю</span><span class="only-narrow">Преп.</span></th><th class="num">Остаётся</th></tr></thead>
      <tbody>${e.rows.map((r) => html`<tr class="tap" key=${r.key} onClick=${() => (r.group ? open('group', { id: r.group.id }) : (store.setUI({ studentsGroup: 'solo', studentsFilter: 'all', studentsView: 'list' }), go('students')))}>
        <td><b>${r.label}</b><div class="sub">${r.teacher ? r.teacher.name : r.group ? 'без преподавателя' : ''}${r.salaryTeacher ? ' · оклад' : ''}</div></td>
        <td class="num">${money(r.income)}</td>
        <td class="num only-wide"><span class=${r.collected >= r.income ? 'ok-t' : ''}>${money(r.collected)}</span></td>
        <td class="num">${r.cost ? money(r.cost) : r.salaryTeacher ? html`<span class="faint">оклад</span>` : html`<span class="faint">—</span>`}</td>
        <td class="num"><b class=${r.margin < 0 ? 'neg-t' : r.pct != null && r.pct < 25 && r.cost > 0 ? 'warn-t' : ''}>${money(r.margin)}</b>${r.pct != null && r.cost > 0 ? html`<div class="sub">${r.pct}%</div>` : null}</td>
      </tr>`)}</tbody>
      <tfoot>
        ${e.salaries > 0 && html`<tr><td>Оклады и занятия</td><td class="num"></td><td class="num only-wide"></td><td class="num">${money(e.salaries)}</td><td class="num">−${money(e.salaries)}</td></tr>`}
        <tr><td>Итого</td><td class="num">${money(e.income)}</td><td class="num only-wide">${money(e.collected)}</td><td class="num">${money(C.r2(e.cost + e.salaries))}</td><td class="num"><b class=${e.margin < 0 ? 'neg-t' : ''}>${money(e.margin)}</b></td></tr>
      </tfoot>
    </table></div>
    <div class="card-foot" style="justify-content:flex-start"><span class="hint">Подписки и прочие расходы сюда не входят — они в «Финансах».</span></div>
  </section>`;
}

function Attention({ d }) {
  const [all, setAll] = useState(false);
  const list = all || d.debtors.length <= 8 ? d.debtors : d.debtors.slice(0, 6);
  return html`<section class="card flush">
    <div class="card-head"><div><h2>Кто должен</h2><div class="hint">сначала просроченные, потом ближайшие ${d.remindDays} ${C.plural(d.remindDays, 'день', 'дня', 'дней')}</div></div>
      ${d.debtors.length > 0 && html`<button class="btn sm ghost" aria-label="Скопировать список должников" title="Скопировать список должников текстом" onClick=${async () => toast((await copyText(debtorsText())) ? 'Список должников скопирован' : 'Не удалось скопировать')}><${Icon} name="copy" cls="s" /><span class="only-wide">Список</span></button>`}</div>
    ${d.debtors.length ? html`<div class="rows">${list.map((s) => html`<${StudentRow} key=${s.id} s=${s} L=${d.student(s.id)} />`)}</div>`
      : html`<${Empty} icon="check" title=${d.activeStudents.length ? 'Все оплатили' : 'Учеников пока нет'}>${d.activeStudents.length ? `Напоминания появятся за ${d.remindDays} ${C.plural(d.remindDays, 'день', 'дня', 'дней')} до срока оплаты.` : 'Добавьте группу и учеников — здесь появится список тех, кому пора платить.'}<//>`}
    ${d.debtors.length > 8 && html`<div class="card-foot"><button class="btn sm ghost" onClick=${() => setAll(!all)}>${all ? 'Свернуть' : `Показать всех · ${d.debtors.length}`}</button></div>`}
  </section>`;
}

function Payouts({ d }) {
  const st = S();
  const unset = d.activeTeachers.filter((t) => C.teacherUnset(t, st).length).length;
  const rows = [
    ...d.teachersDue.map((t) => { const L = d.teacher(t.id); return html`<div class="row tap srow" key=${t.id} ...${tap(() => open('teacher', { id: t.id }))}><${Avatar} name=${t.name} /><div class="row-main"><div class="row-title"><span>${t.name}</span></div><div class="row-sub"><${Pill} status=${L.status}><${DueLabel} due=${L.due[0].due} /><//> ${[...new Set(L.due.map((c) => c.label))].join(', ')}</div></div><span class="row-amount">${money(L.dueNow)}</span><div class="row-actions" onClick=${(e) => e.stopPropagation()}><button class="btn sm good" aria-label=${`Выплатить: ${t.name}`} onClick=${() => open('payout', { id: t.id })}><${Icon} name="cash" cls="s" /><span class="only-wide">Выплатить</span></button></div></div>`; }),
    ...d.recurringDue.map((r) => { const L = d.recurring(r.id), c = L.due[0]; return html`<div class="row tap srow" key=${r.id} ...${tap(() => open('recurringPay', { id: r.id, ym: c.ym }))}><${Avatar} icon="repeat" /><div class="row-main"><div class="row-title"><span>${r.name}</span></div><div class="row-sub"><${Pill} status=${L.status}><${DueLabel} due=${c.due} /><//> подписка · ${C.ymName(c.ym)}</div></div><span class="row-amount">${money(L.dueNow)}</span><div class="row-actions" onClick=${(e) => e.stopPropagation()}><button class="btn sm good" aria-label=${`Оплачено: ${r.name}`} onClick=${() => quickRecurring(r.id, c.ym)}><${Icon} name="check" cls="s" /><span class="only-wide">Оплачено</span></button></div></div>`; }),
  ];
  return html`<section class="card flush">
    <div class="card-head"><div><h2>Выплатить и оплатить</h2><div class="hint">зарплаты и подписки</div></div></div>
    ${rows.length ? html`<div class="rows">${rows}</div>` : html`<${Empty} icon="check">${d.activeTeachers.length || d.activeRecurring.length ? 'Сейчас платить никому не нужно.' : 'Добавьте преподавателей и подписки — напомним, когда придёт срок.'}<//>`}
    ${unset > 0 && html`<div class="card-foot" style="justify-content:flex-start"><button class="btn sm ghost wrap" onClick=${() => go('teachers')}><${Icon} name="info" cls="s" />У ${unset} ${C.plural(unset, 'преподавателя', 'преподавателей', 'преподавателей')} не задана оплата за группы</button></div>`}
  </section>`;
}

export function CashflowCard({ d, range: r0, onRange }) {
  const [table, setTable] = useState(false);
  const range = r0 || 6;
  const data = useMemo(() => C.ymRange(C.ymAdd(d.ym, -(range - 1)), d.ym).map((ym) => ({ ym, ...d.month(ym) })), [d, range]);
  return html`<section class="card">
    <div class="card-head"><h2>Доходы и расходы</h2><div class="toolbar">${onRange && html`<${Seg} value=${range} onChange=${onRange} options=${[[6, '6 мес'], [12, 'Год']]} />`}<button class="btn sm ghost icon" title=${table ? 'График' : 'Таблица'} aria-label=${table ? 'Показать график' : 'Показать таблицу'} onClick=${() => setTable(!table)}><${Icon} name=${table ? 'chart' : 'table'} /></button></div></div>
    ${table ? html`<div class="table-wrap"><table><thead><tr><th>Месяц</th><th class="num">Доходы</th><th class="num">Расходы</th><th class="num">Прибыль</th></tr></thead><tbody>${data.map((m) => html`<tr><td>${C.ymLong(m.ym)}</td><td class="num">${money(m.income)}</td><td class="num">${money(m.out)}</td><td class="num"><b>${money(m.net)}</b></td></tr>`)}</tbody></table></div>`
      : html`<${CashChart} data=${data} /><div class="legend" style="margin-top:8px"><span><i style="background:var(--series-1)"></i>Доходы</span><span><i style="background:var(--series-2)"></i>Расходы, включая зарплаты</span></div>`}
  </section>`;
}

function Upcoming({ d }) {
  const ev = useMemo(() => C.eventsBetween(S(), d, d.today, C.addDays(d.today, 7)).filter((e) => e.status !== 'paid'), [d]);
  return html`<section class="card flush">
    <div class="card-head"><h2>Ближайшие 7 дней</h2><button class="btn sm ghost" onClick=${() => go('calendar')}>Календарь<${Icon} name="right" cls="s" /></button></div>
    ${ev.length ? html`<div class="rows">${ev.slice(0, 8).map((e) => html`<div class="row tap" ...${tap(() => (e.kind === 'student' ? open('student', { id: e.id }) : e.kind === 'teacher' ? open('teacher', { id: e.id }) : open('recurringPay', { id: e.id, ym: e.period })))}><span class=${cx('dot', e.dir)}></span><div class="row-main"><div class="row-title"><span>${e.name}</span></div><div class="row-sub">${C.fmtDate(e.date)} · ${C.relDays(e.date)} · ${e.sub}</div></div><span class="row-amount">${e.dir === 'in' ? '+' : '−'}${money(e.amount)}</span></div>`)}</div>${ev.length > 8 && html`<div class="card-foot"><span class="faint small">и ещё ${ev.length - 8}</span></div>`}`
      : html`<${Empty}>На неделю вперёд платежей по графику нет.<//>`}
  </section>`;
}

/** Строка операции. own — внутри карточки человека: вместо имени показываем дату. */
/** За что ушла выплата преподавателю: записано при выплате, а для старых записей — по текущему расчёту. */
const allocCache = new WeakMap();
export function payoutFor(p) {
  if (p.kind !== 'salary' || p.legacy) return '';
  if (p.covers || p.advance) return C.coversText(p.covers, p.advance);
  const d = getDerived(), L = p.personId && d.teacher(p.personId);
  if (!L) return '';
  let m = allocCache.get(d); if (!m) { m = new Map(); allocCache.set(d, m); }
  if (!m.has(p.personId)) m.set(p.personId, C.allocatePayouts(L.lines, S().payments.filter((x) => x.kind === 'salary' && x.personId === p.personId && !x.legacy)));
  const a = m.get(p.personId).byPay.get(p.id);
  return a ? C.coversText(a.parts, a.advance) : '';
}
export function PaymentRow({ p, own }) {
  const inc = C.isIn(p);
  const forWhat = payoutFor(p);
  const what = p.kind === 'income' ? p.category || 'индивидуально' : forWhat ? `зарплата ${forWhat}` : C.KIND_LABEL[p.kind].toLowerCase();
  return html`<div class="row tap" ...${tap(() => open('payment', { id: p.id }))}><${Avatar} icon=${inc ? 'in' : p.kind === 'salary' ? 'cash' : p.recurringId ? 'repeat' : 'out'} size="sm" /><div class="row-main"><div class="row-title"><span>${own ? C.fmtDate(p.date, true) : p.personName}</span></div><div class="row-sub wrap">${(own ? [forWhat || null, p.method, p.note] : [C.fmtDate(p.date), what, p.method, p.note]).filter(Boolean).join(' · ') || what}</div></div><span class=${cx('row-amount', inc && 'in')}>${inc ? '+' : '−'}${money(p.amount)}</span></div>`;
}
function Recent({ d }) {
  const list = useMemo(() => d.payments.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || b.date.localeCompare(a.date)).slice(0, 6), [d]);
  if (!list.length) return null;
  return html`<section class="card flush"><div class="card-head"><h2>Последние операции</h2><button class="btn sm ghost" onClick=${() => { store.setUI({ financeTab: 'journal' }); go('finance'); }}>Журнал<${Icon} name="right" cls="s" /></button></div><div class="rows">${list.map((p) => html`<${PaymentRow} key=${p.id} p=${p} />`)}</div></section>`;
}

function Banners({ d }) {
  const st = S(), ui = store.ui;
  const dismiss = (k, v = true) => store.setUI({ dismissed: { ...ui.dismissed, [k]: v } });
  const days = st.meta.lastBackupAt ? Math.floor((Date.now() - Date.parse(st.meta.lastBackupAt)) / 86400000) : null;
  // первую копию предлагаем, когда в дашборде уже поработали, а не в первую минуту
  const needBackup = !sync.cfg && st.settings.backupDays > 0 && (days == null ? (st.meta.rev || 0) - (st.meta.demo ? st.meta.demoRev || 0 : 0) >= 8 : days >= st.settings.backupDays) && ui.dismissed.backup !== C.today();
  return html`
    ${store.saveError && html`<div class="banner warn"><${Icon} name="alert" /><div class="grow"><b>Изменения не сохраняются</b><div class="small muted">В хранилище браузера закончилось место. Скачайте резервную копию, чтобы ничего не потерять.</div></div><button class="btn sm primary" onClick=${backupNow}><${Icon} name="download" cls="s" />Скачать копию</button></div>`}
    ${!store.persistent && html`<div class="banner warn"><${Icon} name="alert" /><div class="grow"><b>Браузер не сохраняет данные</b><div class="small muted">Похоже, включён приватный режим. Всё, что вы внесёте, пропадёт после закрытия вкладки.</div></div></div>`}
    ${st.meta.migratedFrom && !ui.dismissed.migrated && html`<div class="banner"><${Icon} name="check" /><div class="grow"><b>Данные из прежней версии перенесены</b><div class="small muted">${st.students.length} ${C.plural(st.students.length, 'ученик', 'ученика', 'учеников')} и ${st.payments.length} ${C.plural(st.payments.length, 'запись', 'записи', 'записей')} на месте. Долги теперь считаются по месяцам.</div></div><button class="btn sm" onClick=${() => dismiss('migrated')}>Понятно</button></div>`}
    ${needBackup && html`<div class="banner warn"><${Icon} name="database" /><div class="grow"><b>${days == null ? 'Сделайте резервную копию' : `Копия не обновлялась ${days} ${C.plural(days, 'день', 'дня', 'дней')}`}</b><div class="small muted">Данные хранятся только в этом браузере. Файл копии спасёт их при очистке браузера и перенесёт на другое устройство.</div></div><div class="toolbar"><button class="btn sm primary" onClick=${backupNow}><${Icon} name="download" cls="s" />Скачать</button><button class="btn sm ghost" onClick=${() => dismiss('backup', C.today())}>Позже</button></div></div>`}`;
}

/** Сообщение о том, что сохранённые данные не прочитались и были восстановлены. */
function Recovered() {
  const r = store.recovered;
  if (!r) return null;
  const at = r.at ? new Date(r.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  const what = r.from === 'snapshot' ? `Восстановлен автоснимок${at ? ' от ' + at : ''} — проверьте последние записи.` : r.from === 'v1' ? 'Данные заново перенесены из прежней версии дашборда.' : r.from === 'empty' ? 'Автоснимков не нашлось, дашборд начат заново.' : 'Данные были восстановлены при одном из прошлых запусков.';
  return html`<div class="banner warn"><${Icon} name="alert" /><div class="grow"><b>Сохранённые данные были повреждены</b><div class="small muted">${what} Нечитаемый файл сохранён — его можно скачать и попробовать восстановить.</div></div>
    <div class="toolbar">${store.brokenRaw() && html`<button class="btn sm" onClick=${() => download('tryos-finance-povrezhdennye-dannye.json', store.brokenRaw())}><${Icon} name="download" cls="s" />Скачать</button>`}<button class="btn sm ghost" onClick=${() => store.dropBroken()}>Понятно</button></div></div>`;
}

export function Onboarding() {
  const loadDemo = () => store.replace(demoState(), 'Загружены демо-данные', 'Перед демо-данными');
  return html`<div class="onboard">
    <span class="logo"><${Icon} name="logo" cls="l" /></span>
    <h1>Начнём с данных</h1>
    <p class="muted">Дашборд покажет, кто и за какие месяцы должен, кому пора напомнить, сколько выплатить преподавателям и что осталось после расходов. Данные хранятся в этом браузере.</p>
    <div class="opts">
      <button class="opt" style="grid-column:1/-1" onClick=${() => open('signIn', {})}><${Avatar} icon="cloud" /><span><b>Войти в аккаунт</b><span class="hint">Если вы уже ведёте дашборд в другом браузере — данные загрузятся оттуда</span></span></button>
      <button class="opt" onClick=${importFile}><${Avatar} icon="upload" /><span><b>Загрузить копию</b><span class="hint">Файл .json из этого или прежнего дашборда</span></span></button>
      <button class="opt" onClick=${() => open('groupForm', {})}><${Avatar} icon="layers" /><span><b>Создать первую группу</b><span class="hint">Цена и день оплаты, затем ученики</span></span></button>
      <button class="opt" onClick=${() => go('settings')}><${Avatar} icon="table" /><span><b>Импорт из таблицы</b><span class="hint">Google Таблица или файл CSV</span></span></button>
      <button class="opt" onClick=${loadDemo}><${Avatar} icon="zap" /><span><b>Посмотреть на примере</b><span class="hint">Выдуманные ученики и оплаты, удаляются одной кнопкой</span></span></button>
    </div>
  </div>`;
}

export function Home() {
  const st = S(), d = getDerived();
  const [range, setRange] = useState(6);
  const i = useMemo(() => (hasData(st) ? C.insights(st, d) : null), [d]);
  if (!hasData(st)) return html`<div class="stack"><${Recovered} /><${Onboarding} /></div>`;
  const on = (id) => (st.settings.home.find((w) => w.id === id) || { on: true }).on;
  const W = {
    tasks: () => html`<${Tasks} d=${d} i=${i} />`, attention: () => html`<${Attention} d=${d} />`, leaks: () => html`<${Leaks} d=${d} i=${i} />`, payouts: () => html`<${Payouts} d=${d} />`,
    economy: () => html`<${EconomyCard} d=${d} i=${i} />`, cashflow: () => html`<${CashflowCard} d=${d} range=${range} onRange=${setRange} />`, upcoming: () => html`<${Upcoming} d=${d} />`, recent: () => html`<${Recent} d=${d} />`,
  };
  const pick = (ids) => ids.filter((id) => on(id) && W[id]);
  const pair = (a, b) => { const l = pick(a), r = pick(b); if (!l.length && !r.length) return null; return html`<div class=${cx('cols', (!l.length || !r.length) && 'even')}>${l.length > 0 && html`<div class="stack">${l.map((id) => html`<div key=${id}>${W[id]()}</div>`)}</div>`}${r.length > 0 && html`<div class="stack">${r.map((id) => html`<div key=${id}>${W[id]()}</div>`)}</div>`}</div>`; };
  return html`<div class="stack">
    <${Recovered} />
    ${sync.status === 'conflict' && html`<div class="banner warn"><${Icon} name="alert" /><div class="grow"><b>Данные в аккаунте и на этом устройстве различаются</b><div class="small muted">Пока вы не выберете, какие оставить, синхронизация приостановлена.</div></div><button class="btn sm primary" onClick=${() => open('syncConflict', {})}>Выбрать</button></div>`}
    <${Banners} d=${d} />
    ${on('kpi') && html`<${Hero} d=${d} i=${i} />`}
    ${pair(['tasks', 'attention'], ['leaks', 'payouts'])}
    ${on('economy') && html`<${EconomyCard} d=${d} i=${i} />`}
    ${pair(['cashflow'], ['upcoming'])}
    ${pair(['recent'], [])}
  </div>`;
}
