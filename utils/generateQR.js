const QRCode = require("qrcode");

async function generateQR(text) {
  return await QRCode.toDataURL(text);
}

module.exports = generateQR;
