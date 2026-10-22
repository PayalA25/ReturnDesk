
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./config/db");
const returnRoutes = require("./routes/returnRoutes");

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      process.env.CLIENT_URL,
    ].filter(Boolean),
  })
);

app.use(express.json());

// Welcome route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to ReturnDesk API",
  });
});

// Database health check
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");

    res.json({
      status: "OK",
      database: "Connected",
      time: result.rows[0].current_time,
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);

    res.status(500).json({
      status: "ERROR",
      database: "Disconnected",
    });
  }
});

// Return request routes
app.use("/api/returns", returnRoutes);

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ReturnDesk API running on port ${PORT}`);
});
