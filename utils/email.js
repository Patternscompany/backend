const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "bom1plzcpnl503557.prod.bom1.secureserver.net",
    port: 465,
    secure: true, // Use SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    // Add timeouts to fail faster if blocked
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
});

const sendEmail = async (to, subject, html, attachments = []) => {
    try {
        console.log(`Sending email via ${transporter.options.host}...`);
        const info = await transporter.sendMail({
            from: `"TGSDC Support" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`, // MUST match auth user for GoDaddy
            to,
            subject,
            html,
            attachments,
        });
        console.log("Email sent: %s", info.messageId);
        return true;
    } catch (error) {
        console.error("Error sending email: ", error);
        return false;
    }
};

module.exports = sendEmail;
