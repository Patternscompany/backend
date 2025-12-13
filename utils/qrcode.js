const QRCode = require('qrcode');

const generateQRCode = async (data) => {
    try {
        return await QRCode.toDataURL(data);
    } catch (err) {
        console.error(err);
        return null;
    }
};

module.exports = generateQRCode;
