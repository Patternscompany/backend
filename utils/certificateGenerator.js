const { createCanvas, loadImage, registerFont } = require("canvas");
const path = require("path");
const fs = require("fs");

// Optionally register a font if needed. Using default Arial for now.
// registerFont(path.join(__dirname, "../assets/fonts/arial.ttf"), { family: "Arial" });

/**
 * Generate Certificate of Participation
 * @param {Object} regData - Registration data
 * @param {string} regData.name - Full name
 * @param {string} regData.title - Title (Dr/Mr/Ms)
 * @returns {Promise<Buffer>} - PNG image buffer
 */
async function generateCertificate(regData) {
    try {
        const templatePath = path.join(__dirname, "../assets/certificate_template.jpg");

        // Load Template
        const image = await loadImage(templatePath);
        const width = image.width;
        const height = image.height;

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext("2d");

        // Draw Background Template
        ctx.drawImage(image, 0, 0, width, height);

        // Configure Text
        // Center of calculation: roughly Width / 2
        // Vertical position: The user said "below 'This certificate is awarded to'". 
        // Based on visually estimating typical certificates, this is usually slightly above the center vertical line.
        // Let's approximate Y = Height * 0.52 (52% down)

        const centerX = width / 2;
        const centerY = height * 0.67;

        // Font Style
        // Large, fancy, bold text for the name
        // Scale font size based on image width to keep proportions
        const fontSize = Math.floor(width * 0.03); // e.g. 3500px -> 140px
        ctx.font = `600 ${fontSize}px "Times New Roman"`;
        ctx.fillStyle = "#5b031d"; // Using the deep red/maroon color from the logo/theme (approx)
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";


        // Construct Name
        const fullName = regData.title ? `${regData.title}. ${regData.name}` : regData.name;

        // Draw Name
        ctx.fillText(fullName, centerX, centerY);

        return canvas.toBuffer("image/jpeg");
    } catch (err) {
        console.error("Certificate Gen Error:", err);
        throw err;
    }
}

module.exports = generateCertificate;
