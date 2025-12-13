const { createCanvas } = require("canvas");
const QRCode = require("qrcode");

/**
 * Generate registration card image
 * @param {Object} regData - Registration data
 * @param {string} regData.name - Full name
 * @param {string} regData.organization - Organization/College name  
 * @param {string} regData.reg_id - Registration ID
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
    ctx.font = "bold 42px Arial";
    ctx.fillText(regData.name, 60, 120);

    // Organization - Truncate to prevent overlap with QR
    ctx.font = "28px Arial";
    let orgText = regData.organization || regData.college || "TGSDC";
    // Measure text width and truncate if needed (max 400px to avoid QR overlap)
    const maxOrgWidth = 400;
    let orgWidth = ctx.measureText(orgText).width;
    while (orgWidth > maxOrgWidth && orgText.length > 3) {
        orgText = orgText.substring(0, orgText.length - 1);
        orgWidth = ctx.measureText(orgText + "...").width;
    }
    if (orgWidth > maxOrgWidth) {
        orgText = orgText + "...";
    }
    ctx.fillText(orgText, 60, 180);

    // Registration ID Label
    ctx.font = "24px Arial";
    ctx.fillStyle = "#555";
    ctx.fillText("REGISTRATION ID", 60, 250);

    // Registration ID Value
    ctx.font = "bold 36px Arial";
    ctx.fillStyle = "#c41e3a";
    ctx.fillText(regData.reg_id, 60, 300);

    // Generate QR Code with Status and Amount
    // Generate QR Code with Status and Amount
    const qrCodeData = `Name: ${regData.name}\nReg ID: ${regData.reg_id}\nOrg/College: ${regData.organization || regData.college || 'TGSDC'}\nStatus: ${regData.status || 'Paid'}`;
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
