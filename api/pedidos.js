const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { Resend } = require('resend');

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
  return doc.sheetsByIndex[0];
}

async function enviarEmail(pedido) {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return;
    const resend = new Resend(resendKey);
    const emailDest = process.env.NOTIFICATION_EMAIL || 'migareposteriacali@gmail.com';
    const esCliente = pedido.origen === 'cliente';
    const productos = Array.isArray(pedido.items)
      ? pedido.items.map(i => i.qty + ' ' + (i.unit||'') + ' ' + (i.label||i.prod)).join('<br>')
      : '';
    const saldo = (pedido.total||0) - (pedido.abono||0);

    await resend.emails.send({
      from: 'More Mio <onboarding@resend.dev>',
      to: [emailDest],
      subject: (esCliente ? 'Nuevo pedido de cliente' : 'Pedido registrado') + ' - ' + (pedido.cliente||''),
      html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
      <body style="font-family:Georgia,serif;background:#FBF3DE;margin:0;padding:20px;">
        <div style="max-width:500px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;">
          <div style="background:#5A1E2E;padding:24px;text-align:center;">
            <h1 style="color:#FBF3DE;margin:0;font-size:28px;">More Mio</h1>
            <p style="color:#CDA45E;font-size:11px;letter-spacing:2px;margin:4px 0 0;">reposteria artesanal · cali</p>
          </div>
          <div style="padding:24px;">
            <div style="background:#fbeaf0;border-radius:10px;padding:12px 16px;margin-bottom:20px;border-left:4px solid #B33A57;">
              <p style="margin:0;font-size:13px;color:#B33A57;font-weight:bold;">${esCliente?'Nuevo pedido de cliente':'Pedido registrado'}</p>
            </div>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#7a5a63;font-size:12px;width:35%;">CLIENTE</td><td style="padding:8px 0;font-size:14px;font-weight:500;">${pedido.cliente||'-'}</td></tr>
              <tr><td style="padding:8px 0;color:#7a5a63;font-size:12px;">DIRECCION</td><td style="padding:8px 0;font-size:14px;">${pedido.dir||'-'}</td></tr>
              <tr><td style="padding:8px 0;color:#7a5a63;font-size:12px;">ENTREGA</td><td style="padding:8px 0;font-size:14px;">${pedido.fecha||'Por confirmar'}</td></tr>
              <tr><td style="padding:8px 0;color:#7a5a63;font-size:12px;">PRODUCTOS</td><td style="padding:8px 0;font-size:14px;">${productos}</td></tr>
              <tr><td style="padding:8px 0;color:#7a5a63;font-size:12px;">PAGO</td><td style="padding:8px 0;font-size:14px;">${pedido.pago||'-'}</td></tr>
              <tr><td style="padding:8px 0;color:#7a5a63;font-size:12px;">TOTAL</td><td style="padding:8px 0;font-size:16px;font-weight:bold;color:#5A1E2E;">$${(pedido.total||0).toLocaleString('es-CO')}</td></tr>
              ${pedido.abono>0?'<tr><td style="padding:8px 0;color:#7a5a63;font-size:12px;">ABONO</td><td style="padding:8px 0;">$'+(pedido.abono||0).toLocaleString('es-CO')+'</td></tr><tr><td style="padding:8px 0;color:#7a5a63;font-size:12px;">SALDO</td><td style="padding:8px 0;color:'+(saldo>0?'#A32D2D':'#27500A')+';font-weight:500;">$'+saldo.toLocaleString('es-CO')+'</td></tr>':''}
            </table>
            ${pedido.nota?'<div style="background:#faeeda;border-radius:8px;padding:10px 14px;margin-top:16px;font-size:13px;color:#633806;">Nota: '+pedido.nota+'</div>':''}
          </div>
          <div style="background:#f8f0e0;padding:14px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#7a5a63;">More Mio · migareposteriacali@gmail.com</p>
          </div>
        </div>
      </body></html>`
    });
  } catch(err) {
    console.error('Error email:', err);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const sheet = await getSheet();

    // GET — leer todos los pedidos del Sheet para mostrar en app admin
    if (req.method === 'GET') {
      const rows = await sheet.getRows();
      const pedidos = rows.map(r => ({
        id: r.get('ID'),
        cliente: r.get('Cliente'),
        dir: r.get('Direccion'),
        nota: r.get('Nota'),
        fecha: r.get('Fecha_Entrega'),
        productos: r.get('Productos'),
        estado: r.get('Estado'),
        total: parseFloat(r.get('Total')) || 0,
        abono: parseFloat(r.get('Abono')) || 0,
        saldo: parseFloat(r.get('Saldo')) || 0,
        pago: r.get('Pago'),
        origen: r.get('Origen') || 'admin',
        fecha_registro: r.get('Fecha_Registro')
      }));
      return res.status(200).json({ ok: true, pedidos });
    }

    // POST — guardar nuevo pedido
    if (req.method === 'POST') {
      const pedido = req.body;
      const estadoLabels = ['Pendiente comprar','Hacer de cero','Masa lista','Hecho'];
      const productos = Array.isArray(pedido.items)
        ? pedido.items.map(i => i.qty+' '+(i.unit||'')+' '+(i.label||i.prod)).join(' | ')
        : '';

      await sheet.addRow({
        ID: String(pedido.id||''),
        Fecha_Registro: new Date().toLocaleString('es-CO',{timeZone:'America/Bogota'}),
        Cliente: pedido.cliente||'',
        Direccion: pedido.dir||'',
        Nota: pedido.nota||'',
        Fecha_Entrega: pedido.fecha||'',
        Productos: productos,
        Estado: estadoLabels[pedido.estado]||'',
        Total: pedido.total||0,
        Abono: pedido.abono||0,
        Saldo: (pedido.total||0)-(pedido.abono||0),
        Pago: pedido.pago||'',
        Origen: pedido.origen||'admin'
      });

      await enviarEmail(pedido);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Metodo no permitido' });
  } catch(error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
