const axios = require("axios");

async function sendWhatsAppTicket(finalReg, qrImageUrl) {
    try {
        const payload = {
            countryCode: "91",
            phoneNumber: finalReg.mobile,
            type: "Template",
            template: {
                name: "tgsdc_entry_ticket_qr",
                languageCode: "en",
                headerValues: [
                    qrImageUrl
                ],
                bodyValues: [
                    `${finalReg.title}. ${finalReg.name}`
                ]
            }
        };

        const response = await axios.post(
            "https://api.interakt.ai/v1/public/message/",
            payload,
            {
                headers: {
                    "Authorization": `Basic ${process.env.INTERAKT_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("WhatsApp sent:", response.data);
        return true;

    } catch (error) {
        console.error("WhatsApp send failed:", error.response?.data || error.message);
        return false;
    }
}

async function sendWhatsAppCertificate(regData, certUrl) {
    try {
        const payload = {
            countryCode: "91",
            phoneNumber: regData.mobile,
            type: "Template",
            template: {
                name: "tgsdc_certificate", // Assumes user creates this template
                languageCode: "en",
                headerValues: [
                    certUrl
                ],
                bodyValues: [
                    `${regData.title}. ${regData.name}`
                ]
            }
        };

        const response = await axios.post(
            "https://api.interakt.ai/v1/public/message/",
            payload,
            {
                headers: {
                    "Authorization": `Basic ${process.env.INTERAKT_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("WhatsApp Certificate sent:", response.data);
        return true;

    } catch (error) {
        console.error("WhatsApp Cert send failed:", error.response?.data || error.message);
        return false;
    }
}

sendWhatsAppTicket.sendCertificate = sendWhatsAppCertificate;
module.exports = sendWhatsAppTicket;
