exports.handler = async function () {
  try {
    const [goldRes, fxRes] = await Promise.all([
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F'),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X'),
    ]);

    const [goldData, fxData] = await Promise.all([goldRes.json(), fxRes.json()]);

    const goldUSD = goldData?.chart?.result?.[0]?.meta?.regularMarketPrice;
    const eurusd = fxData?.chart?.result?.[0]?.meta?.regularMarketPrice;

    if (!goldUSD || !eurusd) {
      return {
        statusCode: 500,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ ok: false, error: 'Dati Yahoo non disponibili' }),
      };
    }

    const goldEURPerOunce = goldUSD / eurusd;
    const marketPrice = goldEURPerOunce / 31.1035;
    const buratoPrice = ((marketPrice - 15) / 1000) * 730;

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        ok: true,
        marketPrice: Number(marketPrice.toFixed(2)),
        buratoPrice: Number(buratoPrice.toFixed(2)),
        fetchedAt: new Date().toISOString(),
        fetchedAtDisplay: new Date().toLocaleString('it-IT'),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: error.message }),
    };
  }
};
