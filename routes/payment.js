const express = require("express");
const router = express.Router();
const razorpay = require("../config/razorpay");

router.post("/create-order", async (req, res) => {
    try {
        const { amount, reg_id } = req.body;

        const options = {
            amount: amount * 100, // convert to paise
            currency: "INR",
            receipt: reg_id
        };

        const order = await razorpay.orders.create(options);

        // LINK ORDER ID TO REGISTRATION (CRITICAL FOR DUPLICATE REG_IDs)
        // We find the 'Pending' TEMP registration for this ID
        // LINK ORDER ID TO REGISTRATION (CRITICAL FOR DUPLICATE REG_IDs)
        const updatedReg = await require("../models/TempRegistration").findOneAndUpdate(
            { reg_id: reg_id },
            { razorpay_order_id: order.id, payment_status: "Pending" },
            { new: true, sort: { createdAt: -1 } }
        );

        if (!updatedReg) {
            throw new Error("Registration session not found. Please register again.");
        }
        console.log(`Order ${order.id} linked to Reg ID ${reg_id}`);

        res.json({ success: true, order });
    } catch (error) {
        console.error("Create Order Error:", error);
        res.json({ success: false, error: error.message });
    }
});

module.exports = router;
