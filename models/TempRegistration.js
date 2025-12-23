const mongoose = require("mongoose");

const TempRegSchema = new mongoose.Schema({
    reg_id: String,

    reg_type: String,
    college: String,
    study_year: String,
    dci_reg_number: String,
    title: String,
    name: String,
    gender: String,

    organization: String,
    designation: String,
    address: String,

    country: String,
    state: String,
    city: String,
    pincode: String,

    email: String,
    mobile: String,

    comments: String,

    amount: Number,
    payment_status: { type: String, default: "Pending" },
    razorpay_payment_id: String,
    razorpay_order_id: String,

    // TTL Index: Auto-delete after 24 hours if not paid
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("TempRegistration", TempRegSchema);
