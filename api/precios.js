const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

async function getSheet() {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '')
    .replace(/\\n/g, '\n').replace(/\n/g, '\n');
  const auth = new JWT({
    email: (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim(),
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const doc = new GoogleSpreadsheet((process.env.GOOGLE_SHEET_ID || '').trim(), auth);
  await doc.loadInfo();

  // Buscar hoja "Precios" o crearla
  let sheet = doc.sheetsByTitle['Precios'];
  if (!sheet) {
    sheet = await doc.addSheet({ title: 'Precios', headerValues: ['producto', 'label', 'precio'] });
  }
  return sheet;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheet = await getSheet();

    // ── GET: devolver todos los precios ──────────────────────────────────────
    if (req.method === 'GET') {
      const rows = await sheet.getRows();
      const precios = {};
      rows.forEach(r => {
        const prod = r.get('producto');
        const label = r.get('label');
        const precio = parseInt(r.get('precio')) || 0;
        if (!precios[prod]) precios[prod] = {};
        precios[prod][label] = precio;
      });
      return res.status(200).json({ ok: true, precios });
    }

    // ── POST: guardar precios ─────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { precios } = req.body;
      if (!precios) return res.status(400).json({ error: 'Faltan precios' });

      // Limpiar hoja y reescribir
      const rows = await sheet.getRows();
      for (const row of rows) await row.delete();

      const newRows = [];
      Object.entries(precios).forEach(([prod, labels]) => {
        Object.entries(labels).forEach(([label, precio]) => {
          newRows.push({ producto: prod, label, precio: precio || 0 });
        });
      });
      if (newRows.length) await sheet.addRows(newRows);

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Metodo no permitido' });
  } catch (error) {
    console.error('Error precios:', error);
    return res.status(500).json({ error: error.message });
  }
};
