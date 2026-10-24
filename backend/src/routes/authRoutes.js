const express = require("express");

const {
  register,
  login,
  assignRole,
  getUsers
} = require("../controllers/authController");

const {
  authenticateToken,
  authorizeRoles
} = require("../middleware/authMiddleware");

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);


// Any authenticated user
router.get("/me", authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: "Authentication successful.",
    user: req.user
  });
});

// ATTENDEE access
router.get(
  "/attendee-test",
  authenticateToken,
  authorizeRoles("ATTENDEE"),
  (req, res) => {
    res.json({
      success: true,
      message: "Attendee access granted."
    });
  }
);

// ORGANIZER access
router.get(
  "/organizer-test",
  authenticateToken,
  authorizeRoles("ORGANIZER"),
  (req, res) => {
    res.json({
      success: true,
      message: "Organizer access granted."
    });
  }
);

// ADMIN access
router.get(
  "/admin-test",
  authenticateToken,
  authorizeRoles("ADMIN"),
  (req, res) => {
    res.json({
      success: true,
      message: "Admin access granted."
    });
  }
);

// Only authenticated ADMIN users can view registered users
router.get(
  "/users",
  authenticateToken,
  authorizeRoles("ADMIN"),
  getUsers
);

// EVENT_STAFF access
router.get(
  "/event-staff-test",
  authenticateToken,
  authorizeRoles("EVENT_STAFF"),
  (req, res) => {
    res.json({
      success: true,
      message: "Event staff access granted."
    });
  }
);

// Only authenticated ADMIN users can assign privileged roles
router.post(
  "/assign-role",
  authenticateToken,
  authorizeRoles("ADMIN"),
  assignRole
);

module.exports = router;
