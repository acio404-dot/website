/* settings.js — «Настройки»: название и валюта, оформление, виджеты обзора, оплаты и напоминания, категории, импорт, копии. */
import { html, useState } from './vendor.js';
import { store, act, allCategories, hasData, HOME_WIDGETS, ACCENTS, DEFAULT_TEMPLATES, importAny } from './store.js';
import * as C from './core.js';
import { money, cx, Icon, Sheet, Seg, Switch, Pill, Fields, useForm, open, openSheet, confirmSheet, toast, download, toCSV, getDerived, sheets } from './ui.js';
import { backupNow, importFile } from './home.js';
import { demoState } from './demo.js';
import { SHEET_TYPES, syncSource, resultText } from './sheets.js';

const S = () => store.state;
const set = (patch, label) => act.setSettings(patch, label);
const ACCENT_COLOR = { blue: '#2a78d6', violet: '#5b4bc4', green: '#0f8a5f', orange: '#c9521c', pink: '#c2417a', graphite: '#3d3d3a' };
const ACCENT_NAME = { blue: 'Синий', violet: 'Фиолетовый', green: 'Зелёный', orange: 'Оранжевый', pink: 'Розовый', graphite: 'Графит' };
const Row = ({ title, hint, children }) => html`<div class="setrow"><div><b>${title}</b>${hint && html`<div class="hint">${hint}</div>`}</div><div class="ctl">${children}</div></div>`;
/** Поле, которое сохраняется, когда из него вышли. */
function Saved({ value, onSave, type, width, mode, ph, label }) {
  const [v, setV] = useState(null);
  return html`<input class="input" style=${`width:${width || 140}px`} type=${type || 'text'} inputmode=${mode} placeholder=${ph || ''} aria-label=${label} value=${v == null ? value : v} onInput=${(e) => setV(e.target.value)} onBlur=${() => { if (v != null && v !== String(value)) onSave(v); setV(null); }} onKeyDown=${(e) => { if (e.key === 'Enter') e.target.blur(); }} />`;
}

function RenameSheet({ title, value, label, onSave, close }) {
  const [v, setV] = useForm({ name: value || '' });
  return html`<${Sheet} title=${title} cls="narrow" onClose=${close} onSubmit=${() => { if (!v.name.trim()) return; close(); onSave(v.name.trim()); }} foot=${html`<button type="button" class="btn" onClick=${close}>Отмена</button><button type="submit" class="btn primary">Сохранить</button>`}>
    <${Fields} fields=${[{ k: 'name', label: label || 'Название', span: true, req: true }]} v=${v} set=${setV} />
  <//>`;
}

function TemplateEditor({ k, title, hint }) {
  const st = S();
  const [v, setV] = useState(null);
  const val = v == null ? st.settings.templates[k] : v;
  const save = (text) => { set({ templates: { ...st.settings.templates, [k]: text } }, 'Шаблон сохранён'); setV(null); };
  return html`<div class="field" style="padding:12px 0;border-top:1px solid var(--line)"><label><b style="color:var(--text)">${title}</b> — ${hint}</label>
    <textarea class="input" rows="3" aria-label=${title} value=${val} onInput=${(e) => setV(e.target.value)} onBlur=${() => { if (v != null && v !== st.settings.templates[k]) save(v); }}></textarea>
    <div class="toolbar">${['имя', 'сумма', 'месяц', 'срок', 'группа', 'центр'].map((t) => html`<button type="button" class="tagbtn" onMouseDown=${(e) => e.preventDefault()} onClick=${() => save(`${val}${val && !/\s$/.test(val) ? ' ' : ''}{${t}}`)}>{${t}}</button>`)}<span class="grow"></span>${val !== DEFAULT_TEMPLATES[k] && html`<button type="button" class="btn sm ghost" onClick=${() => save(DEFAULT_TEMPLATES[k])}>Вернуть стандартный</button>`}</div>
  </div>`;
}

function exportStudents() {
  const st = S(), d = getDerived();
  const rows = [['Имя', 'Группа', 'Преподаватель', 'Цена', 'День оплаты', 'Состояние', 'К оплате', 'Оплачено по', 'Всего оплачено', 'Телефон', 'Telegram', 'Заметка', 'Архив']];
  for (const s of st.students) { const L = d.student(s.id), g = st.groups.find((x) => x.id === s.groupId), t = st.teachers.find((x) => x.id === s.teacherId); rows.push([s.name, g ? g.name : '', t ? t.name : '', (C.rateAt(s.rates, d.ym) || {}).price || 0, s.payDay, C.STATUS_LABEL[L.status], L.dueNow, L.paidThrough || '', L.paid, s.phone, s.telegram, s.notes, s.archived ? 'да' : '']); }
  download(`ucheniki-${C.today()}.csv`, toCSV(rows), 'text/csv;charset=utf-8');
}

export function Settings() {
  const st = S(), s = st.settings;
  const [method, setMethod] = useState('');
  const cats = allCategories(st);
  const count = (c) => st.payments.filter((p) => p.kind === 'expense' && p.category === c).length;
  const moveWidget = (i, dir) => { const home = s.home.slice(); const j = i + dir; if (j < 0 || j >= home.length) return; [home[i], home[j]] = [home[j], home[i]]; set({ home }); };
  const snaps = store.snapshots();
  const days = st.meta.lastBackupAt ? Math.floor((Date.now() - Date.parse(st.meta.lastBackupAt)) / 86400000) : null;
  // данные прежней версии предлагаем перенести заново, только если там действительно что-то есть
  const legacy = (() => { try { const o = JSON.parse(store.legacyRaw() || 'null'); return hasData(o) ? o : null; } catch { return null; } })();
  const size = (JSON.stringify(st).length / 1024).toFixed(0);
  return html`<div class="stack" style="max-width:820px">
    <section class="card"><div class="card-head"><h2>Центр</h2></div>
      <${Row} title="Название" hint="Показывается в шапке и подставляется в напоминания как {центр}"><${Saved} label="Название центра" value=${s.orgName} width=${200} onSave=${(v) => set({ orgName: v.trim() || 'Мой центр' }, 'Название сохранено')} /><//>
      <${Row} title="Валюта" hint="Знак и где его ставить"><${Saved} label="Знак валюты" value=${s.currency} width=${70} onSave=${(v) => set({ currency: v.trim().slice(0, 4) || '$' }, 'Валюта сохранена')} /><select class="input" aria-label="Положение знака валюты" value=${s.currencyPos} onChange=${(e) => set({ currencyPos: e.target.value })}>${[['auto', 'Авто'], ['before', 'Перед суммой'], ['after', 'После суммы']].map(([k, l]) => html`<option value=${k} selected=${s.currencyPos === k}>${l}</option>`)}</select><//>
      <div class="setrow" style="align-items:flex-start"><div><b>Проекты</b><div class="hint">Направления центра. Если их несколько, вверху появляется переключатель.</div>
        ${st.projects.length > 0 && html`<div class="toolbar" style="margin-top:8px">${st.projects.map((p) => html`<span class="chip sm" style="cursor:default">${p.name}<button class="btn ghost icon sm" style="width:22px;height:22px;margin-right:-6px" aria-label="Изменить" onClick=${() => open('projectForm', { id: p.id })}><${Icon} name="edit" cls="s" /></button><button class="btn ghost icon sm" style="width:22px;height:22px;margin-right:-6px" aria-label="Удалить" onClick=${() => confirmSheet({ title: `Удалить проект «${p.name}»?`, text: 'Группы, ученики и записи останутся, но будут «без проекта».', onOk: () => act.deleteProject(p.id) })}><${Icon} name="x" cls="s" /></button></span>`)}</div>`}</div>
        <div class="ctl"><button class="btn sm" onClick=${() => open('projectForm', {})}><${Icon} name="plus" cls="s" />Проект</button></div></div>
    </section>

    <section class="card"><div class="card-head"><h2>Оформление</h2></div>
      <${Row} title="Тема"><${Seg} value=${s.theme} onChange=${(v) => set({ theme: v })} options=${[['auto', 'Как в системе'], ['light', 'Светлая', 'sun'], ['dark', 'Тёмная', 'moon']]} /><//>
      <${Row} title="Цвет акцента" hint=${ACCENT_NAME[s.accent]}><div class="swatches">${ACCENTS.map((a) => html`<button class=${cx('swatch', s.accent === a && 'is-active')} style=${`--sw:${ACCENT_COLOR[a]}`} title=${ACCENT_NAME[a]} aria-label=${ACCENT_NAME[a]} onClick=${() => set({ accent: a })}></button>`)}</div><//>
      <${Row} title="Плотность" hint="Компактный вид вмещает больше строк на экране"><${Seg} value=${s.density} onChange=${(v) => set({ density: v })} options=${[['cozy', 'Обычная'], ['compact', 'Компактная']]} /><//>
    </section>

    <section class="card"><div class="card-head"><div><h2>Что показывать на обзоре</h2><div class="hint">Выключайте лишнее и меняйте порядок стрелками</div></div></div>
      ${s.home.map((w, i) => html`<div class="setrow" key=${w.id}><div><b style=${w.on ? '' : 'color:var(--text-3)'}>${(HOME_WIDGETS.find(([id]) => id === w.id) || [])[1]}</b></div><div class="ctl"><button class="btn ghost icon sm" aria-label="Выше" disabled=${i === 0} onClick=${() => moveWidget(i, -1)}><${Icon} name="up" /></button><button class="btn ghost icon sm" aria-label="Ниже" disabled=${i === s.home.length - 1} onClick=${() => moveWidget(i, 1)}><${Icon} name="down" /></button><${Switch} label=${(HOME_WIDGETS.find(([id]) => id === w.id) || [])[1]} checked=${w.on} onChange=${(on) => set({ home: s.home.map((x) => (x.id === w.id ? { ...x, on } : x)) })} /></div></div>`)}
    </section>

    <section class="card"><div class="card-head"><h2>Оплаты</h2></div>
      <${Row} title="Напоминать заранее" hint="За сколько дней до срока ученик попадает в список «Ждём оплату»"><${Saved} label="За сколько дней напоминать" value=${String(s.remindDays)} width=${70} mode="numeric" onSave=${(v) => { const n = parseInt(v, 10); if (Number.isFinite(n) && n >= 0) set({ remindDays: n }, 'Сохранено'); else toast('Впишите число дней, например 3'); }} /><span class="muted small">дней</span><//>
      <${Row} title="Оплата в одно касание" hint="Кнопка «Оплатил» сразу записывает полную сумму сегодняшним днём. Любую запись можно отменить или поправить."><${Switch} label="Оплата в одно касание" checked=${s.quickPay} onChange=${(v) => set({ quickPay: v })} /><//>
      <div class="setrow" style="align-items:flex-start"><div><b>Способы оплаты</b><div class="hint">Появляются кнопками в окне оплаты. Уберите все, если способ не важен.</div>
        <div class="toolbar" style="margin-top:8px">${s.methods.map((m) => html`<span class=${cx('chip sm', s.defaultMethod === m && 'is-active')} style="cursor:pointer" title="Нажмите, чтобы сделать способом по умолчанию" onClick=${() => set({ defaultMethod: s.defaultMethod === m ? '' : m })}>${m}<button class="btn ghost icon sm" style="width:22px;height:22px;margin-right:-6px;color:inherit" aria-label="Убрать" onClick=${(e) => { e.stopPropagation(); set({ methods: s.methods.filter((x) => x !== m), defaultMethod: s.defaultMethod === m ? '' : s.defaultMethod }); }}><${Icon} name="x" cls="s" /></button></span>`)}</div>
        ${s.defaultMethod && html`<div class="hint" style="margin-top:6px">По умолчанию: ${s.defaultMethod}</div>`}</div>
        <form class="ctl" onSubmit=${(e) => { e.preventDefault(); const m = method.trim(); if (m && !s.methods.includes(m)) set({ methods: [...s.methods, m] }); setMethod(''); }}><input class="input" style="width:130px" placeholder="Новый способ" aria-label="Новый способ оплаты" value=${method} onInput=${(e) => setMethod(e.target.value)} /><button class="btn icon" aria-label="Добавить"><${Icon} name="plus" /></button></form></div>
    </section>

    <section class="card"><div class="card-head"><div><h2>Тексты напоминаний</h2><div class="hint">В фигурных скобках — подстановки: дашборд сам вставит имя, сумму и месяцы</div></div></div>
      <${Row} title="Основной мессенджер" hint="Его кнопка выделена в окне напоминания. Нужен телефон или Telegram в карточке ученика."><${Seg} value=${s.messenger} onChange=${(v) => set({ messenger: v })} options=${[['whatsapp', 'WhatsApp'], ['telegram', 'Telegram']]} /><//>
      <${TemplateEditor} k="soon" title="Скоро срок" hint="когда оплата ещё не просрочена" />
      <${TemplateEditor} k="overdue" title="Просрочено" hint="когда срок уже прошёл" />
    </section>

    <section class="card"><div class="card-head"><div><h2>Категории расходов</h2><div class="hint">Переименование меняет категорию во всех прошлых записях</div></div><button class="btn sm" onClick=${() => openSheet(RenameSheet, { title: 'Новая категория', onSave: (name) => set({ categories: [...new Set([...s.categories, name])] }, `Категория добавлена: ${name}`) })}><${Icon} name="plus" cls="s" />Категория</button></div>
      ${cats.length ? cats.map((c) => { const n = count(c), rec = st.recurring.some((r) => r.name === c); return html`<div class="setrow" key=${c}><div><b>${c}</b><div class="hint">${n} ${C.plural(n, 'запись', 'записи', 'записей')}${rec ? ' · подписка' : ''}</div></div><div class="ctl"><button class="btn ghost icon sm" aria-label="Переименовать" onClick=${() => openSheet(RenameSheet, { title: 'Переименовать категорию', value: c, onSave: (name) => act.renameCategory(c, name) })}><${Icon} name="edit" /></button>${!n && !rec && html`<button class="btn ghost icon sm" aria-label="Убрать" onClick=${() => act.removeCategory(c)}><${Icon} name="x" /></button>`}</div></div>`; }) : html`<div class="hint">Категории появятся, когда вы запишете первый расход.</div>`}
    </section>

    <section class="card"><div class="card-head"><div><h2>Импорт из таблиц</h2><div class="hint">Ученики, преподаватели, расходы или журнал платежей из Google Таблицы либо CSV</div></div></div>
      ${s.sheets.map((x) => html`<div class="setrow" key=${x.id}><div><b>${x.name}</b> <${Pill} status="muted">${SHEET_TYPES[x.type] || x.type}<//>${x.autoSync && html` <${Pill} status="muted"><${Icon} name="zap" />авто<//>`}<div class="hint" style=${x.lastError ? 'color:var(--overdue)' : ''}>${x.lastError || (x.lastSync ? `Обновлено ${new Date(x.lastSync).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${resultText(x)}` : 'Ещё не обновлялось')}</div></div>
        <div class="ctl"><button class="btn sm good" onClick=${() => syncSource(x.id)}><${Icon} name="refresh" cls="s" /><span class="only-wide">Обновить</span></button><button class="btn ghost icon sm" aria-label="Изменить" onClick=${() => open('sheetSource', { id: x.id })}><${Icon} name="edit" /></button><button class="btn ghost icon sm" aria-label="Отключить" onClick=${() => confirmSheet({ title: `Отключить «${x.name}»?`, text: 'Уже загруженные данные останутся, но обновляться не будут.', ok: 'Отключить', onOk: () => set({ sheets: s.sheets.filter((y) => y.id !== x.id) }, 'Таблица отключена') })}><${Icon} name="x" /></button></div></div>`)}
      <div class="toolbar" style=${s.sheets.length ? 'margin-top:12px' : ''}><button class="btn" onClick=${() => open('sheetSource', {})}><${Icon} name="link" cls="s" />Подключить Google Таблицу</button><button class="btn" onClick=${() => open('sheetSource', { file: true })}><${Icon} name="file" cls="s" />Импорт из CSV</button></div>
    </section>

    <section class="card"><div class="card-head"><div><h2>Копии и данные</h2><div class="hint">Данные хранятся в этом браузере (${size} КБ). На другом устройстве они появятся, если загрузить туда файл копии.</div></div></div>
      <${Row} title="Резервная копия" hint=${days == null ? 'Ещё не скачивалась' : days === 0 ? 'Скачана сегодня' : `Скачана ${days} ${C.plural(days, 'день', 'дня', 'дней')} назад`}><button class="btn primary" onClick=${backupNow}><${Icon} name="download" cls="s" />Скачать</button><button class="btn" onClick=${importFile}><${Icon} name="upload" cls="s" />Загрузить</button><//>
      <${Row} title="Напоминать о копии" hint="Плашка на обзоре, если копия давно не обновлялась"><select class="input" aria-label="Как часто напоминать о копии" value=${String(s.backupDays)} onChange=${(e) => set({ backupDays: Number(e.target.value) })}>${[[3, 'Каждые 3 дня'], [7, 'Раз в неделю'], [14, 'Раз в 2 недели'], [30, 'Раз в месяц'], [0, 'Не напоминать']].map(([k, l]) => html`<option value=${k} selected=${s.backupDays === k}>${l}</option>`)}</select><//>
      <${Row} title="Выгрузка в CSV" hint="Для Excel, Numbers и Google Таблиц. Журнал операций выгружается в разделе «Финансы»."><button class="btn" onClick=${exportStudents}><${Icon} name="download" cls="s" />Ученики</button><//>
      <div class="setrow" style="align-items:flex-start"><div><b>Автоснимки</b><div class="hint">Дашборд сам сохраняет состояние раз в день и перед опасными действиями. Хранятся последние ${Math.max(snaps.length, 8)}.</div>
        ${snaps.length > 0 && html`<div class="stack" style="gap:4px;margin-top:8px">${snaps.slice(0, 8).map((x) => html`<div class="spread small"><span>${new Date(x.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · <span class="muted">${x.reason} · ${x.students} уч., ${x.payments} зап.</span></span><button class="btn sm ghost" onClick=${() => confirmSheet({ title: 'Восстановить снимок?', text: 'Текущие данные заменятся состоянием из снимка. Действие можно отменить.', ok: 'Восстановить', danger: false, onOk: () => store.restoreSnapshot(x.key) })}>Вернуть</button></div>`)}</div>`}</div></div>
      ${legacy && html`<${Row} title="Данные прежней версии" hint="Старая копия не тронута и лежит в браузере. Можно перенести её заново — текущие данные заменятся."><button class="btn" onClick=${() => confirmSheet({ title: 'Перенести заново?', text: 'Текущие данные заменятся данными из прежней версии дашборда. Действие можно отменить.', ok: 'Перенести', danger: false, onOk: () => { try { store.replace(importAny(legacy), 'Данные прежней версии перенесены', 'Перед повторным переносом'); } catch { toast('Старые данные не читаются'); } } })}>Перенести заново</button><//>`}
      <${Row} title="Демо-данные" hint="Выдуманный центр, чтобы посмотреть, как всё работает"><button class="btn" onClick=${() => (hasData(st) ? confirmSheet({ title: 'Загрузить демо-данные?', text: 'Текущие данные заменятся примером. Перед этим будет сделан автоснимок, действие можно отменить.', ok: 'Загрузить', danger: false, onOk: () => store.replace(demoState(), 'Загружены демо-данные', 'Перед демо-данными') }) : store.replace(demoState(), 'Загружены демо-данные'))}>Загрузить</button><//>
      <${Row} title="Удалить всё" hint="Ученики, группы, записи и настройки. Перед удалением будет сделан автоснимок."><button class="btn danger" onClick=${() => confirmSheet({ title: 'Удалить все данные?', text: 'Дашборд станет пустым. Вернуть данные можно кнопкой «Отменить» сразу после удаления или из автоснимка.', ok: 'Удалить всё', onOk: () => act.wipe() })}><${Icon} name="trash" cls="s" />Удалить</button><//>
    </section>

    <section class="card"><div class="card-head"><h2>Подсказки</h2></div>
      <dl class="kv left"><dt><kbd>⌘K</kbd> или <kbd>/</kbd></dt><dd>поиск и быстрый ввод: «лиза 150» запишет оплату, «zoom 23» — расход</dd><dt><kbd>N</kbd></dt><dd>новая запись</dd><dt><kbd>⌘Z</kbd></dt><dd>отменить последнее действие</dd><dt>На телефоне</dt><dd>«Поделиться» → «На экран Домой» — дашборд откроется как приложение</dd></dl>
    </section>
  </div>`;
}
sheets.rename = RenameSheet;
