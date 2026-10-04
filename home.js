/* home.js — «Обзор»: главные цифры, кто должен, кому выплатить, график, сбор по группам, ближайшие дни. */
import { html, useState, useMemo } from './vendor.js';
import { store, act, hasData, importAny } from './store.js';
import * as C from './core.js';
import { money, moneyBig, cx, Icon, Avatar, Pill, Empty, Seg, Meter, Spark, CashChart, DueLabel, getDerived, open, go, dueText, studentInfo, toast, copyText, download, pickFile, openMenu, tap, confirmSheet } from './ui.js';
import { quickPay, quickRecurring, debtorsText } from './quick.js';
import { demoState } from './demo.js';

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

function Kpis({ d }) {
  const k = d.kpi, soon = C.r2(k.toCollect - k.overdue), n = d.debtors.length;
  const mon = C.ymShort(d.ym);
  const hist = C.ymRange(C.ymAdd(d.ym, -5), d.ym).map((ym) => d.month(ym));
  return html`<div class="kpis">
    <button class="kpi hero" onClick=${() => { store.setUI({ studentsFilter: 'due', studentsView: 'list' }); go('students'); }}>
      <span class="kpi-label">Ждём оплату сейчас</span>
      <span class="kpi-value">${money(k.toCollect)}</span>
      ${k.toCollect > 0 ? html`<span class="split" aria-hidden="true">${k.overdue > 0 && html`<i class="o" style=${`flex:${k.overdue}`}></i>`}${soon > 0 && html`<i class="s" style=${`flex:${soon}`}></i>`}</span>
        <span class="kpi-sub">${k.overdue > 0 && html`<span><span class="dot overdue"></span> просрочено ${money(k.overdue)} · ${k.overdueCount}</span>`}${soon > 0 && html`<span><span class="dot soon"></span> на подходе ${money(soon)}</span>`}</span>`
        : html`<span class="kpi-sub">${d.activeStudents.length ? 'Все оплатили — долгов нет' : 'Добавьте учеников, чтобы видеть оплаты'}</span>`}
      ${n > 0 && html`<span class="kpi-sub">${n} ${C.plural(n, 'ученик', 'ученика', 'учеников')}</span>`}
    </button>
    <div class="sec-title only-narrow" style="grid-column:1/-1;margin:6px 2px -2px">${C.ymLong(d.ym)}</div>
    <div class="kpi" title=${`Получено в ${C.ymPrep(d.ym)}: ${money(k.cur.income)}`}><span class="kpi-label">Получено<span class="only-wide"> · ${mon}</span></span><span class="kpi-value">${moneyBig(k.cur.income)}</span><span class="kpi-sub">${k.expectedRest > 0 ? `ждём ${moneyBig(k.expectedRest)}` : 'всё собрано'}</span><${Spark} values=${hist.map((m) => m.income)} /></div>
    <div class="kpi" title=${`Расходы в ${C.ymPrep(d.ym)}: ${money(k.cur.out)}`}><span class="kpi-label">Расходы<span class="only-wide"> · ${mon}</span></span><span class="kpi-value">${moneyBig(k.cur.out)}</span><span class="kpi-sub">${k.toPay > 0 ? `к выплате ${moneyBig(k.toPay)}` : 'выплат нет'}</span><${Spark} values=${hist.map((m) => m.out)} color="var(--series-2)" /></div>
    <div class="kpi" title=${`Прибыль в ${C.ymPrep(d.ym)}: ${money(k.cur.net)}`}><span class="kpi-label">Прибыль<span class="only-wide"> · ${mon}</span></span><span class=${cx('kpi-value', k.cur.net < 0 && 'neg')}>${moneyBig(k.cur.net)}</span><span class="kpi-sub">${C.ymShort(C.ymAdd(d.ym, -1))}: ${moneyBig(k.prev.net)}</span><${Spark} values=${hist.map((m) => m.net)} color="var(--ok-mark)" /></div>
  </div>`;
}

function Attention({ d }) {
  const [all, setAll] = useState(false);
  const list = all || d.debtors.length <= 8 ? d.debtors : d.debtors.slice(0, 6);
  return html`<section class="card flush">
    <div class="card-head"><div><h2>Ждём оплату</h2><div class="hint">сначала просроченные, потом ближайшие ${d.remindDays} ${C.plural(d.remindDays, 'день', 'дня', 'дней')}</div></div>
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

function GroupsCard({ d }) {
  const c = useMemo(() => C.collection(S(), d, d.ym), [d]);
  if (!c.rows.length) return null;
  return html`<section class="card flush">
    <div class="card-head"><div><h2>Сбор за ${C.ymName(d.ym)}</h2><div class="hint">${money(c.collected)} из ${money(c.expected)} · оплатили ${c.paidCount} из ${c.count}</div></div><button class="btn sm ghost" onClick=${() => { store.setUI({ studentsView: 'matrix' }); go('students'); }}>По месяцам<${Icon} name="right" cls="s" /></button></div>
    <div>${c.rows.map((r) => html`<button class="gmeter" key=${r.key} onClick=${() => (r.group ? open('group', { id: r.group.id }) : (store.setUI({ studentsGroup: 'solo', studentsFilter: 'all', studentsView: 'list' }), go('students')))}><span class="name">${r.label}</span><${Meter} value=${r.collected} max=${r.expected} /><span class="val"><b>${money(r.collected)}</b> / ${money(r.expected)}</span></button>`)}</div>
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
export function PaymentRow({ p, own }) {
  const inc = C.isIn(p);
  const what = p.kind === 'income' ? p.category || 'индивидуально' : C.KIND_LABEL[p.kind].toLowerCase();
  return html`<div class="row tap" ...${tap(() => open('payment', { id: p.id }))}><${Avatar} icon=${inc ? 'in' : p.kind === 'salary' ? 'cash' : p.recurringId ? 'repeat' : 'out'} size="sm" /><div class="row-main"><div class="row-title"><span>${own ? C.fmtDate(p.date, true) : p.personName}</span></div><div class="row-sub">${(own ? [p.method, p.note] : [C.fmtDate(p.date), what, p.method, p.note]).filter(Boolean).join(' · ') || what}</div></div><span class=${cx('row-amount', inc && 'in')}>${inc ? '+' : '−'}${money(p.amount)}</span></div>`;
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
  const needBackup = st.settings.backupDays > 0 && (days == null ? (st.meta.rev || 0) - (st.meta.demo ? st.meta.demoRev || 0 : 0) >= 8 : days >= st.settings.backupDays) && ui.dismissed.backup !== C.today();
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
  if (!hasData(st)) return html`<div class="stack"><${Recovered} /><${Onboarding} /></div>`;
  const on = (id) => (st.settings.home.find((w) => w.id === id) || { on: true }).on;
  const W = {
    kpi: () => html`<${Kpis} d=${d} />`, attention: () => html`<${Attention} d=${d} />`, payouts: () => html`<${Payouts} d=${d} />`,
    cashflow: () => html`<${CashflowCard} d=${d} range=${range} onRange=${setRange} />`, groups: () => html`<${GroupsCard} d=${d} />`, upcoming: () => html`<${Upcoming} d=${d} />`, recent: () => html`<${Recent} d=${d} />`,
  };
  const order = st.settings.home.filter((w) => w.on && W[w.id]).map((w) => w.id);
  // на широком экране списки встают в две колонки: слева то, что требует действий, справа — справочное
  const left = order.filter((id) => ['attention', 'cashflow', 'recent'].includes(id)), right = order.filter((id) => ['payouts', 'groups', 'upcoming'].includes(id));
  return html`<div class="stack">
    <${Recovered} />
    <${Banners} d=${d} />
    ${on('kpi') && W.kpi()}
    <div class=${cx('cols', (!left.length || !right.length) && 'even')}>
      ${left.length > 0 && html`<div class="stack">${left.map((id) => html`<div key=${id}>${W[id]()}</div>`)}</div>`}
      ${right.length > 0 && html`<div class="stack">${right.map((id) => html`<div key=${id}>${W[id]()}</div>`)}</div>`}
    </div>
  </div>`;
}
