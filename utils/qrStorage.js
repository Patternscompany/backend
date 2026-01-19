const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Saves the registration card image buffer to a temporary directory
 * outside the project folder to avoid triggering file-watchers (Live Server/Nodemon).
 */
function saveQrToPublic(cardImageBuffer, regId) {
    const qrDir = path.join(os.tmpdir(), "tgsdc_qrcodes");

    if (!fs.existsSync(qrDir)) {
        fs.mkdirSync(qrDir, { recursive: true });
    }

    const fileName = `TGSDC_${regId}.png`;
    const filePath = path.join(qrDir, fileName);

    fs.writeFileSync(filePath, cardImageBuffer);

    // Return the URL. (Using env or fallback to localhost)
    const baseUrl = process.env.BASE_URL || "http://localhost:5000";
    return `${baseUrl}/qrcodes/${fileName}`;
}

module.exports = saveQrToPublic;
