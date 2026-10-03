// Vercel serverless function: proxy for Google Sheets CSV export.
// Used by the site when the browser cannot fetch docs.google.com directly (CORS).
// Only docs.google.com is allowed; the sheet must be shared "anyone with the link" or published to the web.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const raw = (req.query && req.query.url) || '';
  let url;
  try { url = new URL(raw); } catch { return res.status(400).json({ error: 'Некорректная ссылка' }); }
  if (url.hostname !== 'docs.google.com') return res.status(400).json({ error: 'Разрешены только ссылки docs.google.com' });
  try {
    const r = await fetch(url.toString(), { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (finance-dashboard)' } });
    const text = await r.text();
    if (!r.ok || /<html/i.test(text.slice(0, 300))) {
      return res.status(403).json({ error: 'Google не отдал таблицу. Откройте доступ: Файл → Поделиться → «Все, у кого есть ссылка» (Читатель), либо Файл → Опубликовать в интернете.' });
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(502).json({ error: 'Не удалось получить таблицу: ' + e.message });
  }
};
