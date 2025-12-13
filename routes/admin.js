const express = require("express");
const router = express.Router();
const Registration = require("../models/Registration");

// DUMMY ADMIN CREDENTIALS
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";

// ADMIN LOGIN
router.post("/login", (req, res) => {
    console.log("Admin login attempt:", req.body);
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        res.json({ success: true });
    } else {
        res.json({ success: false, error: "Invalid Credentials" });
    }
});

// GET ALL REGISTRATIONS
router.get("/registrations", async (req, res) => {
    try {
        const registrations = await Registration.find().sort({ createdAt: -1 }); // Newest first
        res.json({ success: true, data: registrations });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: err.message });
    }
});

module.exports = router;
