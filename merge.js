/* merge.js — объединение данных двух устройств без участия пользователя.
   Сравниваются три версии: база (последняя синхронизированная), это устройство и аккаунт.
   Запись, изменённую только с одной стороны, берём оттуда; изменённую с обеих — с того устройства, где правили позже. */

/** Быстрый хеш строки (cyrb53): чтобы сравнивать версии данных, не храня их целиком. */
export function hash53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Содержимое данных без служебной части: по нему решаем, одинаковы ли версии. */
export const body = (st) => JSON.stringify({ ...st, meta: null });

const COLLECTIONS = ['projects', 'groups', 'students', 'teachers', 'recurring', 'payments'];
const byId = (list) => { const m = new Map(); for (const x of list || []) if (x && x.id) m.set(x.id, x); return m; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Трёхстороннее объединение. base может быть null — тогда объединяем по правилу «что есть у кого-то, то есть у всех»,
 * а при расхождении одной и той же записи берём более позднюю сторону.
 * Возвращает { state, changed: сколько записей пришло с другой стороны, clashes: сколько записей правили с обеих сторон }.
 */
export function merge3(base, local, remote) {
  const lt = Date.parse((local.meta && local.meta.updatedAt) || 0) || 0;
  const rt = Date.parse((remote.meta && remote.meta.updatedAt) || 0) || 0;
  const preferLocal = lt >= rt;
  const out = { ...local, meta: { ...(local.meta || {}) } };
  let changed = 0, clashes = 0;
  for (const k of COLLECTIONS) {
    const B = byId(base && base[k]), L = byId(local[k]), R = byId(remote[k]);
    const ids = [...new Set([...L.keys(), ...R.keys(), ...B.keys()])];
    const res = [];
    for (const id of ids) {
      const b = B.get(id), l = L.get(id), r = R.get(id);
      let pick;
      if (same(l, r)) pick = l;
      else if (base && same(l, b)) { pick = r; changed++; }           // менялось только в аккаунте (или там удалено)
      else if (base && same(r, b)) pick = l;                          // менялось только здесь (или здесь удалено)
      else if (!base && (!l || !r)) { pick = l || r; if (!l) changed++; } // без базы: удалений не знаем — оставляем всё
      else { clashes++; pick = preferLocal ? l : r; if (!preferLocal) changed++; } // правили с обеих сторон
      if (pick) res.push(pick);
    }
    // порядок: как на этом устройстве, новое из аккаунта — в конец
    const order = new Map([...L.keys()].map((id, i) => [id, i]));
    res.sort((a, b) => (order.has(a.id) ? order.get(a.id) : 1e9) - (order.has(b.id) ? order.get(b.id) : 1e9));
    out[k] = res;
  }
  const ls = local.settings, rs = remote.settings, bs = base && base.settings;
  if (!same(ls, rs)) { if (base && same(ls, bs)) { out.settings = rs; changed++; } else if (base && same(rs, bs)) out.settings = ls; else { out.settings = preferLocal ? ls : rs; clashes++; } }
  out.meta.rev = Math.max(Number(local.meta && local.meta.rev) || 0, Number(remote.meta && remote.meta.rev) || 0) + 1;
  out.meta.updatedAt = new Date().toISOString();
  if (remote.meta && remote.meta.createdAt && (!out.meta.createdAt || remote.meta.createdAt < out.meta.createdAt)) out.meta.createdAt = remote.meta.createdAt;
  return { state: out, changed, clashes };
}
