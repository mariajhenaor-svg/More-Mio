module.exports = async function handler(req, res) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  return res.status(200).json({
    email_ok: !!email,
    email_value: email ? email.substring(0, 20) + '...' : 'MISSING',
    key_ok: !!key,
    key_starts: key ? key.substring(0, 30) : 'MISSING',
    sheet_ok: !!sheetId,
    sheet_value: sheetId || 'MISSING'
  });
};
