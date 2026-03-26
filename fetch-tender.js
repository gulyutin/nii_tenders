// api/fetch-tender.js
// Скачивает данные закупки с ЕИС по регистрационному номеру

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { regNumber } = req.body || {};
  if (!regNumber) return res.status(400).json({ error: 'Не указан номер закупки' });

  // Чистим номер — убираем лишние символы
  const clean = regNumber.trim().replace(/\s+/g, '');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'ru-RU,ru;q=0.9',
    'Cache-Control': 'no-cache',
  };

  // Пробуем разные форматы URL
  const urls = [
    `https://zakupki.gov.ru/epz/order/notice/printForm/view.html?regNumber=${clean}`,
    `https://zakupki.gov.ru/epz/order/notice/ea44/view/documents.html?regNumber=${clean}`,
    `https://zakupki.gov.ru/epz/order/notice/ea223/view/documents.html?regNumber=${clean}`,
  ];

  let html = null;
  let usedUrl = null;

  for (const url of urls) {
    try {
      const resp = await fetch(url, { headers, redirect: 'follow' });
      if (resp.ok) {
        const text = await resp.text();
        // Проверяем что получили реальные данные, а не страницу ошибки
        if (text.includes('регистрационный номер') || text.includes('Наименование') || text.includes('НМЦК') || text.includes('заказчик')) {
          html = text;
          usedUrl = url;
          break;
        }
      }
    } catch (e) {
      // пробуем следующий URL
    }
  }

  if (!html) {
    return res.status(404).json({
      error: `Закупка с номером "${clean}" не найдена в ЕИС. Проверьте номер или загрузите документы вручную.`
    });
  }

  // Извлекаем текст из HTML
  const text = extractText(html);

  // Ищем ссылки на документы
  const docLinks = extractDocLinks(html, clean);

  return res.status(200).json({
    text,
    docLinks,
    sourceUrl: usedUrl,
    regNumber: clean,
  });
}

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, 80000); // ограничиваем размер
}

function extractDocLinks(html, regNumber) {
  const links = [];
  const patterns = [
    /href="([^"]*(?:download|file|document|doc|attach)[^"]*\.(?:pdf|docx|doc|xlsx|xls|zip)[^"]*)"/gi,
    /href="([^"]*\/files\/[^"]+)"/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      let url = match[1];
      if (url.startsWith('/')) url = 'https://zakupki.gov.ru' + url;
      if (!links.includes(url)) links.push(url);
    }
  }

  return links.slice(0, 10); // максимум 10 документов
}
