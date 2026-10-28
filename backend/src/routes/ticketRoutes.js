const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { getRegistrationTicket, checkInTicket } = require("../controllers/ticketController");

const router = express.Router();
router.get(
  "/registrations/:registrationId",
  authenticateToken,
  authorizeRoles("ATTENDEE"),
  getRegistrationTicket
);
router.post(
  "/check-in",
  authenticateToken,
  authorizeRoles("ADMIN", "ORGANIZER", "EVENT_STAFF"),
  checkInTicket
);

module.exports = router;
