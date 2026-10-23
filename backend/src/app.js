const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const eventRoutes = require("./routes/eventRoutes");

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173"
}));

app.use(express.json({ limit: "10kb" }));

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "EMS API is running." });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/events", eventRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found."
  });
});

app.use((err, req, res, next) => {
  console.error("API error:", err.message);
  res.status(500).json({
    success: false,
    message: "An unexpected server error occurred."
  });
});

module.exports = app;
