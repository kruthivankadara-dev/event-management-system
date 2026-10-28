const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const {
  getRegistrationTicket,
  validateTicket,
  checkInTicket
} = require("../controllers/ticketController");

const router = express.Router();
router.get(
  "/registrations/:registrationId",
  authenticateToken,
  authorizeRoles("ATTENDEE"),
  getRegistrationTicket
);
router.post(
  "/validate",
  authenticateToken,
  authorizeRoles("ADMIN", "ORGANIZER", "EVENT_STAFF"),
  validateTicket
);
router.post(
  "/check-in",
  authenticateToken,
  authorizeRoles("ADMIN", "ORGANIZER", "EVENT_STAFF"),
  checkInTicket
);

module.exports = router;
