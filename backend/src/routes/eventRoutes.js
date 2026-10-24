
const express = require("express");

const {
  createEvent,
  getEvents,
  updateEvent,
  cancelEvent
} = require("../controllers/eventController");

const {
  authenticateToken,
  authorizeRoles
} = require("../middleware/authMiddleware");

const router = express.Router();

// View events: authenticated users only.
router.get("/", authenticateToken, getEvents);

// Create events: Admins and Organizers only.
router.post(
  "/",
  authenticateToken,
  authorizeRoles("ADMIN", "ORGANIZER"),
  createEvent
);

// Edit or postpone an event.
router.put(
  "/:id",
  authenticateToken,
  authorizeRoles("ADMIN", "ORGANIZER"),
  updateEvent
);

// Cancel an event.
router.patch(
  "/:id/cancel",
  authenticateToken,
  authorizeRoles("ADMIN", "ORGANIZER"),
  cancelEvent
);

module.exports = router;
