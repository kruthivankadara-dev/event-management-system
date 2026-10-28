const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const {
  getRegistrationPayment,
  requestPaymentProcessing
} = require("../controllers/paymentController");

const router = express.Router();
router.get(
  "/registrations/:registrationId",
  authenticateToken,
  authorizeRoles("ATTENDEE"),
  getRegistrationPayment
);
router.post(
  "/registrations/:registrationId/process",
  authenticateToken,
  authorizeRoles("ATTENDEE"),
  requestPaymentProcessing
);

module.exports = router;
