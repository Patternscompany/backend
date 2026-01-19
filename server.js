require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const connectDB = require("./config/db");
const fs = require("fs");
const path = require("path");

const app = express();


const os = require("os");

app.use(
  "/qrcodes",
  express.static(path.join(os.tmpdir(), "tgsdc_qrcodes"), {
    setHeaders: (res) => {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=31536000");
    }
  })
);
// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));


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
