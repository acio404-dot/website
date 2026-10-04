/* demo.js — выдуманные данные для знакомства с дашбордом («Посмотреть на примере»). */
import { today, ymOf, ymAdd, dateFor, addDays } from './core.js';
import { normalize } from './store.js';

export function demoState() {
  const t = today(), cur = ymOf(t);
  const ym = (n) => ymAdd(cur, n);
  let n = 0;
  const id = (p) => `${p}${++n}`;
  const payments = [];
  const groups = [
    { id: 'g1', name: 'Математика · утро', teacherId: 't1', subject: 'Математика', schedule: 'Пн, Ср, Пт 10:00', price: 120, payDay: 5, color: 0, pay: { payDay: 10, rates: [{ from: ym(-4), mode: 'fixed', amount: 320 }] } },
    { id: 'g2', name: 'Математика · вечер', teacherId: 't1', subject: 'Математика', schedule: 'Вт, Чт 19:00', price: 110, payDay: 12, color: 1, pay: { payDay: 15, rates: [{ from: ym(-4), mode: 'fixed', amount: 280 }] } },
    { id: 'g3', name: 'Английский B1', teacherId: 't2', subject: 'Английский', schedule: 'Сб 12:00', price: 90, payDay: 20, color: 2, pay: { payDay: 2, rates: [{ from: ym(-3), mode: 'fixed', amount: 150 }] } },
  ];
  // [имя, группа, цена, месяцев назад начал, сколько месяцев оплатил, телефон]
  const S = [
    ['Алина К.', 'g1', 120, 4, 5, '+7 900 000-00-01'], ['Тимур С.', 'g1', 120, 4, 4, ''], ['Дарья М.', 'g1', 100, 3, 3, '+7 900 000-00-03'], ['Руслан А.', 'g1', 120, 2, 3, ''], ['Ева Л.', 'g1', 120, 1, 1, ''],
    ['Марк В.', 'g2', 110, 4, 4, ''], ['София Р.', 'g2', 110, 4, 3, '+7 900 000-00-07'], ['Артём Н.', 'g2', 110, 2, 2, ''], ['Лейла Б.', 'g2', 95, 1, 2, ''],
    ['Игорь П.', 'g3', 90, 3, 4, ''], ['Камила Т.', 'g3', 90, 3, 3, ''], ['Олег Д.', 'g3', 90, 2, 1, '+7 900 000-00-12'],
    ['Мила Ж.', '', 200, 3, 4, ''], ['Давид Г.', '', 180, 1, 1, ''],
  ];
  const students = S.map(([name, groupId, price, ago, paid, phone]) => {
    const g = groups.find((x) => x.id === groupId);
    const sid = id('s'), payDay = g ? g.payDay : 8, start = ym(-ago);
    for (let i = 0; i < paid; i++) {
      const m = ymAdd(start, i);
      let date = addDays(dateFor(m, payDay), (name.length + i) % 3 - 1);
      if (date > t) date = t;
      payments.push({ id: id('p'), kind: 'income', date, amount: price, personId: sid, personName: name, category: g ? g.name : '', groupId, projectId: 'p1', method: i % 2 ? 'Карта' : 'Перевод' });
    }
    return { id: sid, name, groupId, projectId: 'p1', teacherId: g ? g.teacherId : 't2', subject: g ? g.subject : 'Английский', phone, payDay, startYm: start, rates: [{ from: start, price }], pay: g ? null : { payDay: 28, rates: [{ from: ym(0), mode: 'percent', amount: 50 }] } };
  });
  const teachers = [
    { id: 't1', name: 'Анна Сергеевна', projectId: 'p1', subject: 'Математика', payType: 'perGroup' },
    { id: 't2', name: 'Джон', projectId: 'p1', subject: 'Английский', payType: 'perGroup' },
    { id: 't3', name: 'Администратор Оля', projectId: 'p1', payType: 'salary', payDay: 1, startYm: ym(-4), rates: [{ from: ym(-4), amount: 350 }] },
  ];
  for (let i = -4; i < 0; i++) {
    payments.push({ id: id('p'), kind: 'salary', date: dateFor(ym(i), 10), amount: 320, personId: 't1', personName: 'Анна Сергеевна', category: 'Зарплаты', projectId: 'p1' });
    payments.push({ id: id('p'), kind: 'salary', date: dateFor(ym(i), 15), amount: 280, personId: 't1', personName: 'Анна Сергеевна', category: 'Зарплаты', projectId: 'p1' });
    payments.push({ id: id('p'), kind: 'salary', date: dateFor(ym(i), 1), amount: 350, personId: 't3', personName: 'Администратор Оля', category: 'Зарплаты', projectId: 'p1' });
    if (i >= -3) payments.push({ id: id('p'), kind: 'salary', date: dateFor(ym(i), 2), amount: 150, personId: 't2', personName: 'Джон', category: 'Зарплаты', projectId: 'p1' });
  }
  if (dateFor(cur, 1) <= t) payments.push({ id: id('p'), kind: 'salary', date: dateFor(cur, 1), amount: 350, personId: 't3', personName: 'Администратор Оля', category: 'Зарплаты', projectId: 'p1' });
  const recurring = [
    { id: 'r1', name: 'Zoom', projectId: 'p1', amount: 15, payDay: 3, startYm: ym(-4), auto: true },
    { id: 'r2', name: 'Аренда кабинета', projectId: 'p1', amount: 400, payDay: 1, startYm: ym(-4) },
    { id: 'r3', name: 'Реклама Instagram', projectId: 'p1', amount: 60, payDay: 18, startYm: ym(-4) },
  ];
  for (const r of recurring) for (let i = -4; i <= 0; i++) {
    const date = dateFor(ym(i), r.payDay);
    if (date > t || (i === 0 && r.id === 'r3')) continue;
    payments.push({ id: id('p'), kind: 'expense', date, amount: r.amount, personName: r.name, category: r.name, projectId: 'p1', recurringId: r.id, period: ym(i), auto: !!r.auto });
  }
  [[-3, 'Учебники', 140], [-2, 'Канцелярия', 35], [-1, 'Учебники', 60], [-1, 'Реклама Telegram', 45]].forEach(([i, c, a]) => payments.push({ id: id('p'), kind: 'expense', date: dateFor(ym(i), 14), amount: a, personName: c, category: c, projectId: 'p1' }));
  payments.push({ id: id('p'), kind: 'otherIncome', date: dateFor(ym(-1), 22), amount: 75, personName: 'Пробный экзамен', category: 'Пробный экзамен', projectId: 'p1' });
  const st = normalize({ settings: { orgName: 'Демо-центр', remindDays: 5 }, projects: [{ id: 'p1', name: 'Демо-центр' }], groups, students, teachers, recurring, payments });
  st.meta.demo = true;
  return st;
}
