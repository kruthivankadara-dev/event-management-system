const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const { getEventReports, getEventReport } = require("../controllers/reportController");

const router = express.Router();
router.use(authenticateToken, authorizeRoles("ADMIN", "ORGANIZER"));
router.get("/events", getEventReports);
router.get("/events/:eventId", getEventReport);

module.exports = router;
