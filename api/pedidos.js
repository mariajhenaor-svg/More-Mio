const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

async function enviarEmailNotificacion(pedido) {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    const emailDest = process.env.NOTIFICATION_EMAIL || 'migareposteriacali@gmail.com';
    if (!resendKey) return;

    const estadoLabels = ['Pendiente comprar', 'Hacer de cero', 'Masa lista', 'Hecho'];
    const productos = Array.isArray(pedido.items)
      ? pedido.items.map(i => `${i.qty} ${i.unit || ''} ${i.label || i.prod}`).join('<br>')
      : '';
    const saldo = (pedido.total || 0) - (pedido.abono || 0);
    const esCliente = pedido.origen === 'cliente';

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"></head>
      <body style="font-family:Georgia,serif;background:#FBF3DE;margin:0;padding:20px;">
        <div style="max-width:500px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(90,30,46,0.1);">
          <div style="background:#5A1E2E;padding:24px;text-align:center;">
            <h1 style="font-family:Georgia,serif;color:#FBF3DE;margin:0;font-size:28px;">More Mío</h1>
            <p style="color:#CDA45E;font-size:11px;letter-spacing:2px;margin:4px 0 0;text-transform:uppercase;">repostería artesanal · cali</p>
          </div>
          <div style="padding:24px;">
            <div style="background:#fbeaf0;border-radius:10px;padding:12px 16px;margin-bottom:20px;border-left:4px solid #B33A57;">
              <p style="margin:0;font-size:13px;color:#B33A57;font-weight:bold;">
                ${esCliente ? '🛍️ Nuevo pedido de cliente' : '📋 Pedido registrado'}
              </p>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr style="border-bottom:1px solid #f0e8d8;">
                <td style="padding:10px 0;color:#7a5a63;font-size:12px;width:40%;">CLIENTE</td>
                <td style="padding:10px 0;font-size:14px;font-weight:500;">${pedido.cliente || '-'}</td>
              </tr>
              <tr style="border-bottom:1px solid #f0e8d8;">
                <td style="padding:10px 0;color:#7a5a63;font-size:12px;">DIRECCIÓN</td>
                <td style="padding:10px 0;font-size:14px;">${pedido.dir || '-'}</td>
              </tr>
              <tr style="border-bottom:1px solid #f0e8d8;">
                <td style="padding:10px 0;color:#7a5a63;font-size:12px;">ENTREGA</td>
                <td style="padding:10px 0;font-size:14px;">${pedido.fecha || 'Por confirmar'}</td>
              </tr>
              <tr style="border-bottom:1px solid #f0e8d8;">
                <td style="padding:10px 0;color:#7a5a63;font-size:12px;">PRODUCTOS</td>
                <td style="padding:10px 0;font-size:14px;">${productos}</td>
              </tr>
              <tr style="border-bottom:1px solid #f0e8d8;">
                <td style="padding:10px 0;color:#7a5a63;font-size:12px;">PAGO</td>
                <td style="padding:10px 0;font-size:14px;">${pedido.pago || '-'}</td>
              </tr>
              <tr style="border-bottom:1px solid #f0e8d8;">
                <td style="padding:10px 0;color:#7a5a63;font-size:12px;">TOTAL</td>
                <td style="padding:10px 0;font-size:16px;font-weight:bold;color:#5A1E2E;">$${(pedido.total||0).toLocaleString('es-CO')}</td>
              </tr>
              ${pedido.abono > 0 ? `
              <tr style="border-bottom:1px solid #f0e8d8;">
                <td style="padding:10px 0;color:#7a5a63;font-size:12px;">ABONO</td>
                <td style="padding:10px 0;font-size:14px;">$${(pedido.abono||0).toLocaleString('es-CO')}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#7a5a63;font-size:12px;">SALDO</td>
                <td style="padding:10px 0;font-size:14px;color:${saldo>0?'#A32D2D':'#27500A'};font-weight:500;">$${saldo.toLocaleString('es-CO')}</td>
              </tr>` : ''}
            </table>
            ${pedido.nota ? `<div style="background:#faeeda;border-radius:8px;padding:10px 14px;margin-top:16px;font-size:13px;color:#633806;">📝 ${pedido.nota}</div>` : ''}
          </div>
          <div style="background:#f8f0e0;padding:14px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#7a5a63;">More Mío · migareposteriacali@gmail.com</p>
          </div>
        </div>
      </body>
      </html>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'More Mío <onboarding@resend.dev>',
        to: [emailDest],
        subject: `🎂 Nuevo pedido — ${pedido.cliente || 'Cliente'}`,
        html
      })
    });
  } catch (err) {
    console.error('Error enviando email:', err);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });

  try {
    const pedido = req.body;

    // 1. Guardar en Google Sheets
    const privateKey = process.env.GOOGLE_PRIVATE_KEY
      ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/\n/g, '\n')
      : '';
    const sheetId = (process.env.GOOGLE_SHEET_ID || '').trim();

    const serviceAccountAuth = new JWT({
      email: (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim(),
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    const estadoLabels = ['Pendiente comprar', 'Hacer de cero', 'Masa lista', 'Hecho'];
    const productos = Array.isArray(pedido.items)
      ? pedido.items.map(i => `${i.qty} ${i.unit || ''} ${i.label || i.prod}`).join(' | ')
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
      Pago: pedido.pago || '',
      Origen: pedido.origen || 'admin'
    });

    // 2. Enviar notificación por email
    await enviarEmailNotificacion(pedido);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
