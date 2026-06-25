export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const pedido = req.body;

    const { GoogleSpreadsheet } = await import('google-spreadsheet');
    const { JWT } = await import('google-auth-library');

    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    await sheet.addRow({
      ID: pedido.id,
      Fecha_Registro: new Date().toLocaleString('es-CO'),
      Cliente: pedido.cliente,
      Direccion: pedido.dir || '',
      Nota: pedido.nota || '',
      Fecha_Entrega: pedido.fecha || '',
      Productos: pedido.items.map(i => `${i.qty} ${i.unit} ${i.prod}`).join(' | '),
      Estado: ['Pendiente comprar','Hacer de cero','Masa lista','Hecho'][pedido.estado],
      Total: pedido.total,
      Abono: pedido.abono,
      Saldo: pedido.total - pedido.abono,
      Pago: pedido.pago
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
