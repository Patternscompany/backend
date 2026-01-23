
const express = require("express");
const router = express.Router();
const Registration = require("../models/Registration");
const TempRegistration = require("../models/TempRegistration");


const razorpayConfig = require("../config/razorpay");
const generateQRCode = require("../utils/qrcode");
const sendEmail = require("../utils/email");
const generateRegistrationCard = require("../utils/cardGenerator");
const saveQrToPublic = require("../utils/qrStorage");
const sendWhatsAppTicket = require("../utils/sendWhatsApp");
const generateCertificate = require("../utils/certificateGenerator");
const fs = require("fs");
const path = require("path");

const crypto = require("crypto");

// GET RAZORPAY KEY
router.get("/get-razorpay-key", (req, res) => {
  res.json({ key: razorpayConfig.key_id });
});

/**
 * IDEMPOTENT FUNCTION TO COMPLETE REGISTRATION
 * Can be called by /verify-payment (Client) or Webhook (Server)
 */
async function completeRegistration(razorpay_order_id, razorpay_payment_id, razorpay_signature, reg_id) {
  // 1. Check if already processed (Idempotency)
  const existingMain = await Registration.findOne({
    $or: [{ razorpay_order_id }, { razorpay_payment_id }]
  });
  if (existingMain) {
    console.log(`Registration already exists for Order ${razorpay_order_id}. Skipping.`);
    return existingMain;
  }

  // 2. Find the TEMP Registration
  let tempReg = await TempRegistration.findOne({ razorpay_order_id });

  // FALLBACK: If not found by Order ID, try finding by Reg ID (Self-Healing)
  if (!tempReg && reg_id) {
    console.warn(`Order ID ${razorpay_order_id} not found in DB. Trying Reg ID ${reg_id}...`);
    tempReg = await TempRegistration.findOne({ reg_id });
    if (tempReg) {
      tempReg.razorpay_order_id = razorpay_order_id;
      await tempReg.save();
    }
  }

  if (!tempReg) {
    throw new Error(`Registration session not found for order ${razorpay_order_id}`);
  }

  // 3. MOVE TO PERMANENT COLLECTION (OR UPDATE IF UPGRADE)
  let finalReg;
  const existingReg = await Registration.findOne({ reg_id: tempReg.reg_id });

  if (existingReg) {
    // UPGRADE CASE: Update existing record
    existingReg.reg_type = tempReg.reg_type;
    existingReg.amount = (existingReg.amount || 0) + tempReg.amount; // Add upgrade fee to total
    existingReg.razorpay_order_id = razorpay_order_id;
    existingReg.razorpay_payment_id = razorpay_payment_id;
    existingReg.razorpay_signature = razorpay_signature || "WEBHOOK_CAPTURE";
    // Update basic info too just in case
    existingReg.email = tempReg.email;
    existingReg.mobile = tempReg.mobile;

    await existingReg.save();
    finalReg = existingReg;
    console.log(`Updated existing registration ${tempReg.reg_id} (Upgrade)`);
  } else {
    // NEW REGISTRATION CASE
    finalReg = new Registration({
      reg_id: tempReg.reg_id,
      reg_type: tempReg.reg_type,
      college: tempReg.college,
      study_year: tempReg.study_year,
      organization: tempReg.organization,
      designation: tempReg.designation,
      dci_reg_number: tempReg.dci_reg_number,
      title: tempReg.title,
      name: tempReg.name,
      gender: tempReg.gender,
      address: tempReg.address,
      state: tempReg.state,
      city: tempReg.city,
      pincode: tempReg.pincode,
      email: tempReg.email,
      mobile: tempReg.mobile,
      comments: tempReg.comments,
      amount: tempReg.amount,
      payment_status: "Paid",
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature: razorpay_signature || "WEBHOOK_CAPTURE"
    });
    await finalReg.save();
  }

  // 4. DELETE TEMP
  await TempRegistration.deleteOne({ _id: tempReg._id });

  // 5. Send Emails (Non-blocking)
  handleRegistrationEmails(finalReg).catch(err => console.error("Email Error after capture:", err));

  return finalReg;
}

router.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, reg_id } = req.body;
    await completeRegistration(razorpay_order_id, razorpay_payment_id, razorpay_signature, reg_id);
    res.json({ success: true });
  } catch (err) {
    console.error("Manual Verify Error:", err);
    // Even if it fails here, we return success if it was already processed (already handled in completeRegistration)
    res.json({ success: false, error: err.message });
  }
});

// RAZORPAY WEBHOOK
router.post("/webhook/razorpay", async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // 1. Verify Signature
  const shasum = crypto.createHmac("sha256", secret);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest("hex");

  if (digest !== req.headers["x-razorpay-signature"]) {
    console.error("Invalid Webhook Signature");
    return res.status(400).send("Invalid signature");
  }

  console.log("Webhook Received:", req.body.event);

  // 2. Handle Payment Captured Event
  if (req.body.event === "payment.captured") {
    const payment = req.body.payload.payment.entity;
    const order_id = payment.order_id;
    const payment_id = payment.id;

    try {
      console.log(`Processing Webhook for Order ${order_id}...`);
      await completeRegistration(order_id, payment_id, "WEBHOOK", null);
      console.log(`Webhook: Order ${order_id} completed successfully.`);
    } catch (err) {
      console.error("Webhook Processing Error:", err.message);
      // We still return 200 to Razorpay to stop retries, 
      // since the error is likely due to record not being found (expired session)
    }
  }

  res.json({ status: "ok" });
});

// REUSABLE BACKGROUND TASKS FUNCTION (Email + WhatsApp)
async function handleRegistrationEmails(finalReg) {
  try {
    console.log("Starting background tasks for Reg ID:", finalReg.reg_id);

    // 1. Generate Registration Card
    console.log("Generating Registration Card...");
    const cardImage = await generateRegistrationCard(finalReg);
    console.log("Card generated successfully.");

    // 2. Save Card to Public Storage (for WhatsApp/Links)
    console.log("Saving card to public storage...");
    const qrPublicUrl = saveQrToPublic(cardImage, finalReg.reg_id);
    console.log("Card available at:", qrPublicUrl);

    // 3. User Email
    const userHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #0a6ebd; padding: 20px; text-align: center; color: white;">
                    <h2>10ᵗʰ Telangana State Dental Conference</h2>
                    <p>Entry Ticket</p>
                </div>
                <div style="padding: 20px; border: 1px solid #ddd;">
                    <p>Hello <b>${finalReg.title}. ${finalReg.name}</b>,</p>
                    <p>Your entry ticket for <b>10ᵗʰ Telangana State Dental Conference 2026</b> is ready for download.</p>
                    <p>This event encompasses the scientific sessions, Trade for practitioners & students, cultural events and Banquet for socialising fellow dentists.</p>
                    <p>Click the <b>Download Entry Ticket</b> button below to access your ticket.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${qrPublicUrl}" style="background-color: #0a6ebd; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Download Entry Ticket</a>
                        <p style="margin-top: 10px; font-size: 12px; color: #666;">(Please see the attachment below)</p>
                    </div>
                    <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #0a6ebd;">
                        <h4 style="margin-top: 0;">Event Details:</h4>
                        <p><b>Dates:</b> 24 - 25 January 2026</p>
                        <p><b>Venue:</b> Sevalal Banjara Bhavan, Banjara Hills, Hyderabad</p>
                    </div>
                </div>
            </div>`;

    console.log("Sending User Email to:", finalReg.email);
    const userEmailSent = await sendEmail(finalReg.email, "Registration Confirmed - TGSDC 2026", userHtml, [
      {
        filename: "registration_card.png",
        content: cardImage.toString("base64"),
        encoding: "base64"
      }
    ]);

    // 4. Admin Email
    const doctorHtml = finalReg.dci_reg_number ? `<p><b>DCI Reg Number:</b> ${finalReg.dci_reg_number}</p>` : "";
    const studentHtml = finalReg.study_year ? `<p><b>College:</b> ${finalReg.college}</p><p><b>Year:</b> ${finalReg.study_year}</p>` : "";
    const adminHtml = `
                    <h3>Registration Confirmation</h3>
                    <p><b>Name:</b> ${finalReg.title}. ${finalReg.name}</p>
                    <p><b>Reg ID:</b> ${finalReg.reg_id}</p>
                    <p><b>Mobile:</b> ${finalReg.mobile}</p>
                    <p><b>Email:</b> ${finalReg.email}</p>
                    <p><b>Amount:</b> ₹${finalReg.amount}</p>
                    <hr>
                    <h3>Additional Details</h3>
                    ${finalReg.organization ? `<p><b>Organization:</b> ${finalReg.organization}</p>` : ''}
                    ${finalReg.designation ? `<p><b>Designation:</b> ${finalReg.designation}</p>` : ''}
                    ${doctorHtml}
                    ${studentHtml}
                    ${finalReg.address ? `<p><b>Address:</b> ${finalReg.address}</p>` : ''}
                    ${finalReg.state ? `<p><b>State:</b> ${finalReg.state}</p>` : ''}
                    ${finalReg.city ? `<p><b>City:</b> ${finalReg.city}</p>` : ''}
                    ${finalReg.pincode ? `<p><b>Pincode:</b> ${finalReg.pincode}</p>` : ''}
                    ${finalReg.comments ? `<p><b>Comments:</b> ${finalReg.comments}</p>` : ''}
                    <br>
                    <p><em>Please see attached registration card.</em></p>
                `;

    console.log("Sending Admin Email...");
    const adminEmailSent = await sendEmail([process.env.ADMIN_EMAIL, process.env.EMAIL_USER], "Registration Confirmation - TGSDC 2026", adminHtml, [
      {
        filename: "registration_card.png",
        content: cardImage.toString("base64"),
        encoding: "base64"
      }
    ]);

    // 5. WhatsApp Confirmation
    console.log("Attempting WhatsApp confirmation...");
    const whatsappSent = await sendWhatsAppTicket(finalReg, qrPublicUrl);
    if (whatsappSent) console.log("WhatsApp sent successfully.");
    else console.warn("WhatsApp sending FAILED.");

    return { userEmailSent, adminEmailSent, whatsappSent };

  } catch (error) {
    console.error("handleRegistrationEmails Error:", error);
    throw error;
  }
}

// RESEND EMAIL ROUTE
router.post("/resend-email", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.json({ success: false, error: "Registration ID (Database ID) is required." });

    const registration = await Registration.findById(id);
    if (!registration) return res.json({ success: false, error: "Registration not found in database." });

    // Trigger emails
    await handleRegistrationEmails(registration);

    res.json({ success: true, message: "Emails sent successfully!" });
  } catch (error) {
    console.error("Resend Email Error:", error);
    res.json({ success: false, error: error.message });
  }
});

// RESEND WHATSAPP ROUTE
router.post("/resend-whatsapp", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.json({ success: false, error: "Registration ID (Database ID) is required." });

    const registration = await Registration.findById(id);
    if (!registration) return res.json({ success: false, error: "Registration not found in database." });

    // 1. Generate Registration Card
    console.log("Generating Registration Card for WhatsApp resend...");
    const cardImage = await generateRegistrationCard(registration);

    // 2. Save Card to Public Storage
    const qrPublicUrl = saveQrToPublic(cardImage, registration.reg_id);

    // 3. Send WhatsApp
    const whatsappSent = await sendWhatsAppTicket(registration, qrPublicUrl);

    if (whatsappSent) {
      res.json({ success: true, message: "WhatsApp message sent successfully!" });
    } else {
      res.json({ success: false, error: "WhatsApp sending failed. Check server logs." });
    }
  } catch (error) {
    console.error("Resend WhatsApp Error:", error);
    res.json({ success: false, error: error.message });
  }
});

// SEND CERTIFICATE ROUTE
router.post("/send-certificate", async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.json({ success: false, error: "Registration ID is required." });

    const registration = await Registration.findById(id);
    if (!registration) return res.json({ success: false, error: "Registration not found." });

    // 1. Generate Certificate Image
    const certParams = {
      name: registration.name,
      title: registration.title
    };
    const buffer = await generateCertificate(certParams);

    // 2. Save to Public Dir (TEMP DIR to avoid restart/reload)
    const os = require("os");
    const saveDir = path.join(os.tmpdir(), "tgsdc_certificates");
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    const fileName = `CERT-${registration.reg_id}.jpg`;
    const filePath = path.join(saveDir, fileName);
    fs.writeFileSync(filePath, buffer);

    // 3. Construct Public URL
    const baseUrl = process.env.BASE_URL || "http://localhost:5000";
    const publicUrl = `${baseUrl}/public/certificates/${fileName}`;

    // 4. Send WhatsApp
    let waSent = false;
    if (sendWhatsAppTicket.sendCertificate) {
      waSent = await sendWhatsAppTicket.sendCertificate(registration, publicUrl);
    } else {
      console.warn("sendWhatsAppTicket.sendCertificate is undefined");
    }

    // 5. Send Email
    const emailHtml = `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <h2>Certificate of Participation</h2>
                <p>Dear ${registration.title} ${registration.name},</p>
                <p>Thank you for participating in the 10th Telangana State Dental Conference.</p>
                <p>Please find your Certificate of Participation attached below.</p>
                <p>Best Regards,<br>TGSDC 2026 Organizing Committee</p>
            </div>
        `;

    const emailSent = await sendEmail(
      registration.email,
      "Certificate of Participation - TGSDC 2026",
      emailHtml,
      [
        {
          filename: fileName,
          content: buffer,
          contentType: "image/jpeg"
        }
      ]
    );

    res.json({
      success: true,
      message: "Certificate generated and sent.",
      waStats: waSent ? "Sent" : "Failed",
      emailStats: emailSent ? "Sent" : "Failed",
      url: publicUrl
    });

  } catch (error) {
    console.error("Send Certificate Error:", error);
    res.json({ success: false, error: error.message });
  }
});

router.post("/register", async (req, res) => {
  try {
    const {
      reg_type,
      existing_reg_id, // OPTIONAL: FOR UPGRADES
      college, college_manual,
      study_year,
      organization, organization_manual,
      dci_reg_number,
      title,
      name,
      gender,
      designation,
      address,
      state,
      city,
      pincode,
      email,
      mobile,
      comments,
      amount
    } = req.body;

    // 1. DUPLICATE CHECK & AUTO-UPGRADE LOGIC

    let effective_reg_id = existing_reg_id;

    if (!effective_reg_id) {
      const existingUser = await Registration.findOne({ mobile });
      if (existingUser) {
        // If it's a Banquet Pass being added to an existing registration, allow as upgrade
        if (typeUpper.includes("BANQUET")) {
          // BLOCK STUDENTS FROM BANQUET
          if (existingUser.reg_type.toUpperCase().includes("STUDENT")) {
            return res.json({
              success: false,
              error: "Banquet Pass is restricted to Doctors/Delegates and is not available for Student categories."
            });
          }
          console.log(`Auto-upgrading existing user ${existingUser.reg_id} with Banquet Pass`);
          effective_reg_id = existingUser.reg_id;
          actual_reg_type = existingUser.reg_type + " + " + reg_type;
        } else {
          return res.json({
            success: false,
            error: "A registration with this Phone Number already exists. Please use a different Phone Number or check your status/upgrade."
          });
        }
      }
    }

    // Normalize Manual Inputs
    let finalCollege = college;
    let finalOrg = organization;
    if (college === "Other" && college_manual) {
      finalCollege = college_manual;
    }
    if (organization === "Other" && organization_manual) {
      finalOrg = organization_manual;
    }

    // GENERATE ID OR USE EXISTING
    let actual_reg_type = reg_type;
    let prefix = "REG";
    const typeUpper = actual_reg_type.toUpperCase();

    // Priority 1: RC MEMBER
    if (typeUpper.includes("RC MEMBER")) {
      prefix = "RC";
    }
    // Priority 2: DELEGATE
    else if (typeUpper.includes("DELEGATE")) {
      const hasLunch = typeUpper.includes("LUNCH");
      const hasBanquet = typeUpper.includes("BANQUET");

      if (hasLunch && hasBanquet) prefix = "RC";
      else if (hasBanquet) prefix = "DB";
      else if (hasLunch) prefix = "DL";
      else prefix = "D";
    }
    // Priority 3: STUDENT
    else if (typeUpper.includes("STUDENT") || typeUpper.includes("INTERN") || typeUpper.includes("PG STUDENT")) {
      const hasLunch = typeUpper.includes("LUNCH");
      const hasBanquet = typeUpper.includes("BANQUET");

      if (hasLunch && hasBanquet) prefix = "SLB";
      else if (hasBanquet) prefix = "SB";
      else if (hasLunch) prefix = "SL";
      else prefix = "S";
    }
    // Priority 4: STANDALONE BANQUET
    else if (typeUpper.includes("BANQUET")) {
      prefix = "B";
    }
    // Priority 5: TRADER
    else if (typeUpper.includes("TRADER")) {
      prefix = "T";
    }

    let newRegId = effective_reg_id || (prefix + Date.now());

    // UPGRADE ID LOGIC: If existing ID is provided, transform the prefix to match new category
    if (effective_reg_id) {
      const numericPart = effective_reg_id.replace(/^\D+/, ''); // Get the numeric part (e.g. from REG123, D123, RC123)
      newRegId = prefix + numericPart;
      console.log(`Upgrading Registration ID: ${effective_reg_id} -> ${newRegId}`);
    }

    // SPECIAL HANDLING FOR TRADERS (CASH PAYMENT - DIRECT SAVE)
    if (typeUpper.includes("TRADER")) {
      const traderReg = new Registration({
        reg_id: newRegId,
        reg_type: "TRADER",
        title,
        name,
        email,
        mobile,
        organization: finalOrg, // Holds Stall Number
        amount: 0,
        payment_status: "Completed",
        payment_id: "CASH-" + Date.now(),
        order_id: "CASH-" + Date.now()
      });
      await traderReg.save();

      // Send Email & WhatsApp (Non-blocking)
      handleRegistrationEmails(traderReg).catch(err => console.error("Trader Email/WA Error:", err));

      return res.json({
        success: true,
        reg_id: newRegId,
        message: "Trader Registered Successfully"
      });
    }

    // SAVE TO TEMP REGISTRATION
    const reg = new TempRegistration({
      reg_id: newRegId,
      reg_type: actual_reg_type,
      college: finalCollege, study_year,
      organization: finalOrg, designation, dci_reg_number,
      title,
      name,
      gender,
      address,
      state,
      city,
      pincode,
      email,
      mobile,
      comments,
      amount,
      existing_reg_id: effective_reg_id
    });

    await reg.save();

    res.json({
      success: true,
      reg_id: reg.reg_id,
      message: "Provisional registration created. Proceed to payment."
    });

  } catch (err) {
    console.log(err);
    res.json({ success: false, error: err.message });
  }
});

// CHECK STATUS FOR BANQUET UPGRADE
// CHECK STATUS FOR UPGRADES
router.post("/check-status", async (req, res) => {
  try {
    const { mobile } = req.body;
    if (!mobile) return res.json({ success: false, error: "Mobile Number is required" });

    // Find by mobile (sort by latest if multiple)
    const reg = await Registration.findOne({ mobile }).sort({ _id: -1 });

    if (!reg) {
      return res.json({ success: false, error: "No registration found with this Mobile Number." });
    }

    const currentType = reg.reg_type.toUpperCase();
    let upgrades = [];

    // DEFINE UPGRADE OPTIONS
    // Prices based on: S(500), SL(1000), D(1000), DL(1500), RC(3500)

    if (currentType.includes("STUDENT")) {
      if (!currentType.includes("WITH LUNCH")) {
        upgrades.push({ to: "STUDENT(WITH LUNCH)", amount: 500, label: "Upgrade to Student with Lunch (+₹500)" });
      }
    }
    else if (currentType.includes("DELEGATE")) {
      const hasLunch = currentType.includes("WITH LUNCH");
      const hasBanquet = currentType.includes("BANQUET");

      if (!hasLunch && !hasBanquet) {
        upgrades.push({ to: "DELEGATES (WITH LUNCH)", amount: 500, label: "Upgrade to Delegate with Lunch (+₹500)" });
        upgrades.push({ to: "DELEGATES + BANQUET PASS", amount: 2000, label: "Add Banquet Pass (Includes DB ID) (+₹2,000)" });
        upgrades.push({ to: "RC MEMBER", amount: 2500, label: "Upgrade to RC Member (Includes Lunch + Banquet) (+₹2,500)" });
      }
      else if (hasLunch && !hasBanquet) {
        upgrades.push({ to: "RC MEMBER", amount: 2000, label: "Upgrade to RC Member (Includes Banquet) (+₹2,000)" });
      }
      else if (!hasLunch && hasBanquet) {
        upgrades.push({ to: "RC MEMBER", amount: 500, label: "Upgrade to RC Member (Includes Lunch) (+₹500)" });
      }
    }

    return res.json({
      success: true,
      existing_reg_id: reg.reg_id,
      title: reg.title,
      name: reg.name,
      email: reg.email,
      mobile: reg.mobile,
      current_reg_type: reg.reg_type,
      upgrades: upgrades
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
