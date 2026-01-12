const fs = require("fs");
const path = require("path");

/**
 * Saves the registration card image buffer to the public directory
 * and returns the publicly accessible URL.
 */
function saveQrToPublic(cardImageBuffer, regId) {
    const qrDir = path.join(__dirname, "../../public/qrcodes");

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
