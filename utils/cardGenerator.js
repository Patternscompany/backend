const { createCanvas } = require("canvas");
const QRCode = require("qrcode");

/**
 * Generate registration card image
 * @param {Object} regData - Registration data
 * @param {string} regData.name - Full name
 * @param {string} regData.organization - Organization/College name  
 * @param {string} regData.reg_id - Registration ID
 * @param {string} regData.reg_type - Registration ID
 * @returns {Promise<Buffer>} - PNG image buffer
 */
async function generateRegistrationCard(regData) {
    const width = 800;
    const height = 450;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 3;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    // Name
    ctx.fillStyle = "#000";
    ctx.font = "bold 24px Arial";
    // Add Title to Name
    const fullName = regData.title ? `${regData.title}. ${regData.name}` : regData.name;

    // Text Wrapping for Name
    const maxNameWidth = 420;
    const lineHeight = 50;
    let x = 60;
    let y = 120;

    const words = fullName.split(' ');
    let line = '';

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;

        if (testWidth > maxNameWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);

    // 10th TGSDC Label
    ctx.font = "bold 24px Arial";
    ctx.fillStyle = "#f9af47";
    ctx.fillText("10th - TGSDC", x, y + 40);

    // Organization (Hidden as per request)
    // ctx.font = "28px Arial";

    // Registration ID Label
    ctx.font = "14px Arial";
    ctx.fillStyle = "#555";
    ctx.fillText("REGISTRATION ID", 60, 260);

    // Registration ID Value
    ctx.font = "bold 20px Arial";
    ctx.fillStyle = "#c41e3a";
    ctx.fillText(regData.reg_id, 60, 300);



    // Generate QR Code with Status and Amount
    // Generate QR Code with Status and Amount
    // Generate QR Code with Status and Amount
    const qrCodeData = `Name: ${fullName}\nReg Type: ${regData.reg_type}\nReg ID: ${regData.reg_id}\nStatus: ${regData.status || 'Paid'}`;
    const qrCodeDataURL = await QRCode.toDataURL(qrCodeData, { width: 250, margin: 1 });

    // Load and draw QR code (convert base64 to image)
    const qrImage = await loadImage(qrCodeDataURL);
    ctx.drawImage(qrImage, 500, 80, 250, 250);

    return canvas.toBuffer("image/png");
}

// Helper to load image from data URL
function loadImage(dataURL) {
    return new Promise((resolve, reject) => {
        const { Image } = require("canvas");
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataURL;
    });
}

module.exports = generateRegistrationCard;
