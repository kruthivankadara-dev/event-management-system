
const express = require("express");
const { register, login } = require("../controllers/authController");
const {
  authenticateToken,
  authorizeRoles
} = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

// Test endpoint: any authenticated user
router.get("/me", authenticateToken, (req, res) => {
  res.json({
    success: true,
    message: "Authentication successful.",
    user: req.user
  });
});

// Test endpoint: only ADMIN users
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

module.exports = router;
