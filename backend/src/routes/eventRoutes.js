const express = require("express");
const { createEvent } = require("../controllers/eventController");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authenticateToken, authorizeRoles("ADMIN", "ORGANIZER"), createEvent);

module.exports = router;
