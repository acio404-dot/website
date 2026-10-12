// Синхронизация дашборда между браузерами. Сервер хранит один зашифрованный файл на аккаунт:
// данные шифруются паролем в браузере, сюда приходит только шифр. Номер аккаунта — производная от логина и пароля.
// GET  — отдать файл (или { same: true }, если у клиента уже эта версия).
// PUT  — записать новую версию; etag прежней версии обязателен, иначе ответ 409 (на другом устройстве были изменения).
const ID = /^[a-f0-9]{64}$/;
const MAX = 3000000;
const ACCESS = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
const blob = () => globalThis.__tryosBlob || require('@vercel/blob');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const id = String(req.headers['x-sync-id'] || '');
  if (!ID.test(id)) return res.status(400).json({ error: 'Неверный запрос' });
  if (!globalThis.__tryosBlob && !process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'Хранилище для синхронизации ещё не подключено' });
  const path = `sync/${id}.json`;
  try {
    const { get, put } = blob();
    if (req.method === 'GET') {
      const etag = String(req.headers['x-sync-etag'] || '');
      const r = await get(path, { access: ACCESS, useCache: false, ...(etag ? { ifNoneMatch: etag } : {}) });
      if (!r) return res.status(404).json({ error: 'Аккаунт не найден' });
      if (r.statusCode === 304 || !r.stream) return res.status(200).json({ same: true });
      const text = await new Response(r.stream).text();
      return res.status(200).json({ etag: r.blob.etag, doc: JSON.parse(text) });
    }
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const doc = body.doc || {};
      if (typeof doc.data !== 'string' || !doc.data || doc.data.length > MAX) return res.status(400).json({ error: 'Неверные данные' });
      const etag = typeof body.etag === 'string' && body.etag ? body.etag : null;
      const text = JSON.stringify({ v: 1, at: new Date().toISOString(), data: doc.data });
      try {
        // первая запись — только если файла ещё нет; дальше — только поверх той версии, которую видел клиент
        const out = await put(path, text, { access: ACCESS, contentType: 'application/json', addRandomSuffix: false, allowOverwrite: !!etag, ...(etag ? { ifMatch: etag } : {}) });
        return res.status(200).json({ etag: out.etag });
      } catch (e) {
        if (e && (e.name === 'BlobPreconditionFailedError' || /precondition|already exists|allowOverwrite/i.test(String(e.message)))) return res.status(409).json({ error: 'На другом устройстве были изменения' });
        throw e;
      }
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Метод не поддерживается' });
  } catch (e) {
    return res.status(500).json({ error: 'Ошибка хранилища: ' + String((e && e.message) || e).slice(0, 200) });
  }
};
