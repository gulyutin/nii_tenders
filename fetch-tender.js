// api/fetch-tender.js
// Получает данные закупки через открытый API ЕИС (XML-выгрузки)

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { regNumber } = req.body || {};
  if (!regNumber) return res.status(400).json({ error: 'Не указан номер закупки' });

  const clean = regNumber.trim().replace(/\s+/g, '');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; NIITenders/1.0)',
    'Accept': 'application/xml, text/xml, */*',
  };

  // Официальный API ЕИС — поиск по номеру извещения
  const searchUrl = `https://zakupki.gov.ru/epz/order/extendedsearch/results.html?searchString=${encodeURIComponent(clean)}&morphology=on&search-filter=Дате+размещения&pageNumber=1&sortDirection=false&recordsPerPage=10&showLotsInfoClosed=true&savedSearchSettingsIdHidden=&fz44=on&fz223=on&ppRf615=on&af=on&ca=on&pc=on&pa=on&placingWayList=&selectedLaws=&priceFromGeneral=&priceToGeneral=&priceFromGWS=&priceToGWS=&priceFromUnitGWS=&priceToUnitGWS=&currencyIdGeneral=-1&publishDateFrom=&publishDateTo=&applSubmissionCloseDateFrom=&applSubmissionCloseDateTo=&customerIdOrg=&customerFz94id=&customerTitle=&kpgz=&pbplacecode=&okpd=&okpd2=&af=on&okved2=&updateDateFrom=&updateDateTo=&thirdParty=false&asap=false&showLotsInfo=false&constructionObject=&reestrNumber=&electronSignatureNeeded=false&existingContractGuaranteeSum=false`;

  // Пробуем получить через API поиска ЕИС
  try {
    const resp = await fetch(
      `https://zakupki.gov.ru/epz/order/notice/printForm/view.html?regNumber=${clean}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'ru-RU,ru;q=0.9',
          'Referer': 'https://zakupki.gov.ru/',
        },
        redirect: 'follow',
      }
    );

    const contentType = resp.headers.get('content-type') || '';

    if (!resp.ok || contentType.includes('text/html') === false) {
      // Попробуем JSON API если есть
      throw new Error(`HTTP ${resp.status}`);
    }

    const html = await resp.text();

    // Проверяем что получили реальную страницу закупки
    if (!html.includes(clean) && !html.includes('НМЦК') && !html.includes('заказчик') && !html.includes('Заказчик')) {
      throw new Error('Данные закупки не найдены на странице');
    }

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s{3,}/g, '\n\n')
      .trim()
      .slice(0, 60000);

    return res.status(200).json({ text, regNumber: clean, source: 'eis' });

  } catch (e) {
    // ЕИС заблокировал — возвращаем понятную ошибку
    return res.status(502).json({
      error: `ЕИС не отвечает или заблокировал запрос (${e.message}). Попробуйте загрузить документы вручную или скопируйте текст со страницы закупки.`,
      fallback: true,
      eisUrl: `https://zakupki.gov.ru/epz/order/notice/printForm/view.html?regNumber=${clean}`
    });
  }
}
