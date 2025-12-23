
const express = require("express");
const router = express.Router();
const Registration = require("../models/Registration");
const TempRegistration = require("../models/TempRegistration");


const razorpayConfig = require("../config/razorpay");
const generateQRCode = require("../utils/qrcode");
const sendEmail = require("../utils/email");
const generateRegistrationCard = require("../utils/cardGenerator");

// GET RAZORPAY KEY
router.get("/get-razorpay-key", (req, res) => {
  res.json({ key: razorpayConfig.key_id });
});

router.post("/verify-payment", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, reg_id } = req.body;

    // 1. Find the TEMP Registration
    let tempReg = await TempRegistration.findOne({ razorpay_order_id });

    // FALLBACK: If not found by Order ID, try finding by Reg ID (Self-Healing)
    if (!tempReg && reg_id) {
      console.warn(`Order ID ${razorpay_order_id} not found in DB. Trying Reg ID ${reg_id}...`);
      tempReg = await TempRegistration.findOne({ reg_id });

      // If found, update it with the missing Order ID so we can proceed
      if (tempReg) {
        tempReg.razorpay_order_id = razorpay_order_id;
        await tempReg.save();
        console.log("Self-Healed: Linked Order ID to Registration.");
      }
    }

    if (!tempReg) {
      // Fallback: Check if it's already in Main
      const existingMain = await Registration.findOne({ razorpay_order_id });
      if (existingMain) {
        return res.json({ success: true, message: "Already verified" });
      }
      return res.json({ success: false, error: "Registration session not found or expired. Please register again." });
    }

    // 2. MOVE TO PERMANENT COLLECTION
    const finalReg = new Registration({
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

      // Payment Details
      payment_status: "Paid",
      razorpay_order_id: razorpay_order_id,
      razorpay_payment_id: razorpay_payment_id,
      razorpay_signature: razorpay_signature
    });

    await finalReg.save();

    // 3. DELETE TEMP
    // 3. DELETE TEMP
    await TempRegistration.deleteOne({ _id: tempReg._id });

    // SEND RESPONSE IMMEDIATELY to prevent UI hanging
    res.json({ success: true });

    // 4. Generate Card & Emails (BACKGROUND PROCESS)
    (async () => {
      try {
        console.log("Starting background tasks for Reg ID:", finalReg.reg_id);
        console.log("Using Email User:", process.env.EMAIL_USER ? "SET" : "NOT SET");

        // Note: cardGenerator exports the function directly
        console.log("Generating Registration Card...");
        const cardImage = await generateRegistrationCard(finalReg);
        console.log("Card generated successfully.");

        // User Email
        const userHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background-color: #0a6ebd; padding: 20px; text-align: center; color: white;">
                    <h2>10ᵗʰ Telangana State Dental Conference</h2>
                    <p>Entry Ticket</p>
                </div>
                <div style="padding: 20px; border: 1px solid #ddd;">
                    <p>Hello <b>${finalReg.name}</b>,</p>
                    
                    <p>Your entry ticket for <b>10ᵗʰ Telangana State Dental Conference 2026</b> is ready for download.</p>
                    
                    <p>This event encompasses the scientific sessions, Trade for practitioners & students, cultural events and Banquet for socialising fellow dentists.</p>
                    
                    <p>Click the <b>Download Entry Ticket</b> button below to access your ticket.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="#" style="background-color: #0a6ebd; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">Download Entry Ticket</a>
                        <p style="margin-top: 10px; font-size: 12px; color: #666;">(Please see the attachment below)</p>
                    </div>

                    <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #0a6ebd;">
                        <h4 style="margin-top: 0;">Event Details:</h4>
                        <p><b>Dates:</b> 24 - 25 January 2026</p>
                        <p><b>Venue:</b> Sevalal Banjara Bhavan, Banjara Hills, Hyderabad</p>
                    </div>
                    
                    <p style="margin-top: 20px;">Please keep this ticket handy for entry.</p>
                </div>
                <div style="text-align: center; padding: 10px; font-size: 12px; color: #888;">
                    &copy; 2026 TGSDC. All rights reserved.
                </div>
            </div>
            `;

        console.log("Sending User Email to:", finalReg.email);
        const userEmailSent = await sendEmail(finalReg.email, "Registration Confirmed - TGSDC 2026", userHtml, [
          {
            filename: "delegate_card.png",
            content: cardImage.toString("base64"),
            encoding: "base64"
          }
        ]);
        if (userEmailSent) console.log("User Email sent successfully.");
        else console.error("FAILED to send User Email.");

        // Admin Email
        const doctorHtml = finalReg.dci_reg_number
          ? `<p><b>DCI Reg Number:</b> ${finalReg.dci_reg_number}</p>`
          : "";
        const studentHtml = finalReg.study_year
          ? `<p><b>College:</b> ${finalReg.college}</p><p><b>Year:</b> ${finalReg.study_year}</p>`
          : "";

        const adminHtml = `
                    <h3>New Paid Registration</h3>
                    <p><b>Name:</b> ${finalReg.title} ${finalReg.name}</p>
                    <p><b>Reg ID:</b> ${finalReg.reg_id}</p>
                    <p><b>Type:</b> ${finalReg.reg_type}</p>
                    <p><b>Mobile:</b> ${finalReg.mobile}</p>
                    <p><b>Email:</b> ${finalReg.email}</p>
                    <p><b>Amount:</b> ₹${finalReg.amount}</p>
                    <p><b>Payment ID:</b> ${razorpay_payment_id}</p>
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
        const adminEmailSent = await sendEmail(process.env.EMAIL_USER || "pandureddypatterns@gmail.com", "New Registration Alert", adminHtml, [
          {
            filename: "delegate_card.png",
            content: cardImage.toString("base64"),
            encoding: "base64"
          }
        ]);


        if (adminEmailSent) console.log("Admin Email sent successfully.");
        else console.error("FAILED to send Admin Email.");

        if (userEmailSent && adminEmailSent) {
          console.log("All emails sent successfully for:", finalReg.reg_id);
        } else {
          console.warn("Some emails failed to send for:", finalReg.reg_id);
        }
      } catch (bkError) {
        console.error("Background Task Error (Emails/Card):", bkError);
      }
    })();
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.message });
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

    // 1. DUPLICATE CHECK (Check MAIN Registration collection)
    if (reg_type !== "Banquet Pass (Add-on)") {
      // We still check the PERMANENT collection to prevent re-registration
      const existingUser = await Registration.findOne({ mobile });
      if (existingUser) {
        return res.json({
          success: false,
          error: "A registration with this Phone Number already exists. Please use a different Phone Number or check your status."
        });
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
    let prefix = "REG";
    const typeUpper = reg_type.toUpperCase();

    if (typeUpper.includes("RC MEMBER")) {
      prefix = "RC";
    }
    else if (typeUpper.includes("DELEGATE")) {
      const hasLunch = typeUpper.includes("WITH LUNCH");
      const hasBanquet = typeUpper.includes("BANQUET");

      if (hasLunch && hasBanquet) prefix = "DLB";
      else if (hasBanquet) prefix = "DB";
      else if (hasLunch) prefix = "DL";
      else prefix = "D";
    }
    else if (typeUpper.includes("STUDENT") || typeUpper.includes("INTERN") || typeUpper.includes("PG STUDENT")) {
      const hasLunch = typeUpper.includes("WITH LUNCH");
      if (hasLunch) prefix = "SL";
      else prefix = "S";
    }
    else if (typeUpper.includes("BANQUET")) {
      prefix = "BAN"; // Standalone Banquet
    }

    const newRegId = existing_reg_id || (prefix + Date.now());

    // SAVE TO TEMP REGISTRATION
    const reg = new TempRegistration({
      reg_id: newRegId,
      reg_type,
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
      amount
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
// CHECK STATUS FOR BANQUET UPGRADE
router.post("/check-status", async (req, res) => {
  try {
    const { mobile } = req.body;
    if (!mobile) return res.json({ success: false, error: "Mobile Number is required" });

    // Find by email (sort by latest if multiple)
    const reg = await Registration.findOne({ mobile }).sort({ _id: -1 });

    if (!reg) {
      return res.json({ success: false, error: "No registration found with this Mobile Number." });
    }

    // Check if eligible (Doctor/RC, not Student)
    // Adjust logic based on exact category names
    const lowerType = reg.reg_type.toLowerCase();

    // 1. Check Eligibility (No Students)
    if (lowerType.includes("student")) {
      return res.json({ success: false, error: "Banquet Pass not available for Student categories to upgrade online." });
    }

    // 2. Check if RC Member (Already Included)
    if (lowerType.includes("rc member")) {
      return res.json({ success: false, error: "Banquet is already included in your RC Membership." });
    }

    // 2. Check if already has Banquet/Hospitality
    if (lowerType.includes("banquet") || lowerType.includes("hospitality")) {
      return res.json({ success: false, error: "Your registration already includes a Banquet Pass." });
    }

    // 3. Check for Duplicate Upgrade (Optional validation)
    // const existingUpgrade = await Registration.findOne({ comments: "Upgrade for " + reg.reg_id });
    // if (existingUpgrade) return res.json({ success: false, error: "Upgrade already exists." });

    return res.json({
      success: true,
      // Return full profile to clone
      existing_reg_id: reg.reg_id,
      title: reg.title,
      name: reg.name,
      gender: reg.gender,
      organization: reg.organization,
      designation: reg.designation,
      address: reg.address,
      state: reg.state,
      city: reg.city,
      pincode: reg.pincode,
      email: reg.email,
      mobile: reg.mobile,
      reg_type: reg.reg_type
    });

  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.message });
  }
});

module.exports = router;
