require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const connectDB = require("./config/db");

const app = express();

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // <-- ADD THIS

// Connect DB
connectDB();
app.get("/", (req, res) => {
  res.send("Backend is working");
});

// Routes
app.use("/api", require("./routes/register"));
app.use("/api", require("./routes/payment"));
app.use("/api", require("./routes/admin"));

app.listen(5000, () => console.log("Server running on port 5000"));
