
const express = require("express");

const {
  createEvent,
  getEvents,
  getEventById,
  getEventAttendees,
  updateEvent,
  cancelEvent
} = require("../controllers/eventController");

const {
  authenticateToken,
  authorizeRoles
} = require("../middleware/authMiddleware");
const { registerForEvent } = require("../controllers/registrationController");

const router = express.Router();

// View events: authenticated users only.
router.get("/", authenticateToken, getEvents);

// Organizers may view registrations for their own events; admins may view all.
router.get(
  "/:id/attendees",
  authenticateToken,
  authorizeRoles("ADMIN", "ORGANIZER"),
  getEventAttendees
);

// View one scheduled event: authenticated users only.
router.get("/:id", authenticateToken, getEventById);

// Register attendees for a scheduled event.
router.post(
  "/:id/register",
  authenticateToken,
  authorizeRoles("ATTENDEE"),
  registerForEvent
);

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
