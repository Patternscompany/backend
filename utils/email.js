const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: false,
    },
    // Add timeouts to fail faster if blocked
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
});

const sendEmail = async (to, subject, html, attachments = []) => {
    try {
        const info = await transporter.sendMail({
            from: '"Dental Conference" <no-reply@tgsdc.com>',
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
