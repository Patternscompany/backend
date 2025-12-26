const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER, // your Gmail
        pass: process.env.EMAIL_PASS, // App Password
    },
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
            from: `"10ᵗʰ Telangana State Dental Conference" <${process.env.EMAIL_USER}>`, // ✅ MUST MATCH
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
