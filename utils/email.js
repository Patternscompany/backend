const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, // cPanel usually mail.domain.com
    port: parseInt(process.env.SMTP_PORT), // 465 for SSL, 587 for TLS
    secure: true, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    // cPanel often requires this if certs are self-signed, but try true first for production
    tls: {
        rejectUnauthorized: false,
    },
    connectionTimeout: 20000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
});

// Optional but VERY helpful for debugging
transporter.verify((error, success) => {
    if (error) {
        console.error("SMTP verify failed:", error);
    } else {
        console.log("SMTP server is ready to send emails");
    }
});

const sendEmail = async (to, subject, html, attachments = []) => {
    try {
        const info = await transporter.sendMail({
            from: `"10th Telangana State Dental Conference" <${process.env.EMAIL_USER}>`, // ✅ MUST MATCH
            to,
            subject,
            html,
            attachments,
        });

        console.log("Email sent:", info.messageId);
        return true;
    } catch (error) {
        console.error("Error sending email:", error);
        return false;
    }
};

module.exports = sendEmail;
