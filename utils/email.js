const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "bom1plzcpnl503557.prod.bom1.secureserver.net",   // ✅ GoDaddy SMTP
    port: 587,                          // ✅ MUST be 587
    secure: false,                      // ✅ MUST be false
    auth: {
        user: process.env.EMAIL_USER,  // contact@yourdomain.com
        pass: process.env.EMAIL_PASS,  // cPanel email password
    },
    tls: {
        rejectUnauthorized: false,
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
});

// 🔍 Verify SMTP (VERY IMPORTANT for Render logs)
transporter.verify((error, success) => {
    if (error) {
        console.error("SMTP verify failed:", error);
    } else {
        console.log("GoDaddy SMTP server is ready to send emails ✅");
    }
});

const sendEmail = async (to, subject, html, attachments = []) => {
    try {
        const info = await transporter.sendMail({
            from: `"Dental Conference" <${process.env.EMAIL_USER}>`, // MUST match cPanel email
            to,
            subject,
            html,
            attachments,
        });

        console.log("Email sent successfully:", info.messageId);
        return true;
    } catch (error) {
        console.error("Error sending email:", error);
        return false;
    }
};

module.exports = sendEmail;
