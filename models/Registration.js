const mongoose = require("mongoose");

const RegSchema = new mongoose.Schema({
  reg_id: String,

  reg_type: String,        // Registration category
  college: String,         // Student: College Name OR Manual Input
  study_year: String,
  dci_reg_number: String,  // Doctor: DCI Number
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


  // Legacy backups (Spouse/Kids preserved if needed for backward compat, or can comment out)
  // spouse: Number... 
  /* 
  spouse... 
  kids... 
  */

  comments: String,

  amount: Number,
  payment_status: { type: String, default: "Pending" },
  razorpay_payment_id: String,
  razorpay_order_id: String,

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Registration", RegSchema);

