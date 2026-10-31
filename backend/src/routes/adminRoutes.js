
const express = require("express");

const {
  authenticateToken,
  authorizeRoles
} = require("../middleware/authMiddleware");

const {
  getVenues,
  createVenue,
  updateVenue,
  updateVenueStatus,
  getCategories,
  createCategory,
  updateCategory,
  updateCategoryStatus,
  getConfigurations,
  updateConfiguration
} = require("../controllers/adminController");
const { getAuditLogs } = require("../controllers/auditController");

const router = express.Router();

// All administrative routes require an active ADMIN account.
router.use(authenticateToken, authorizeRoles("ADMIN"));

router.get("/audit-logs", getAuditLogs);

// Venue management
router.get("/venues", getVenues);
router.post("/venues", createVenue);
router.put("/venues/:id", updateVenue);
router.patch("/venues/:id/status", updateVenueStatus);

// Event category management
router.get("/categories", getCategories);
router.post("/categories", createCategory);
router.put("/categories/:id", updateCategory);
router.patch("/categories/:id/status", updateCategoryStatus);

// System configuration management
router.get("/configurations", getConfigurations);
router.put("/configurations/:key", updateConfiguration);

module.exports = router;
