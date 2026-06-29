const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

  try {
    const pedido = req.body;

    const privateKey = process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : '';

    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    const estadoLabels = ['Pendiente comprar', 'Hacer de cero', 'Masa lista', 'Hecho'];
    const productos = Array.isArray(pedido.items)
      ? pedido.items.map(i => i.qty + ' ' + i.unit + ' ' + i.prod).join(' | ')
      : '';

    await sheet.addRow({
      ID: String(pedido.id || ''),
      Fecha_Registro: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
      Cliente: pedido.cliente || '',
      Direccion: pedido.dir || '',
      Nota: pedido.nota || '',
      Fecha_Entrega: pedido.fecha || '',
      Productos: productos,
      Estado: estadoLabels[pedido.estado] || '',
      Total: pedido.total || 0,
      Abono: pedido.abono || 0,
      Saldo: (pedido.total || 0) - (pedido.abono || 0),
      Pago: pedido.pago || ''
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error guardando en Sheets:', error);
    return res.status(500).json({ error: error.message });
  }
};
