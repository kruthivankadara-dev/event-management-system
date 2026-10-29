const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { listMine, markMineRead, sendReminder } = require("../controllers/notificationController");
const router = express.Router();

router.use(authenticateToken);
router.get("/", listMine);
router.patch("/:id/read", markMineRead);
router.post("/events/:eventId/reminder", authorizeRoles("ADMIN", "ORGANIZER"), sendReminder);

module.exports = router;
