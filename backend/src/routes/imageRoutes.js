
const express = require("express");
const path = require("path");
const { randomUUID } = require("crypto");
const { authenticateToken, authorizeRoles } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

router.post(
  "/",
  authenticateToken,
  authorizeRoles("ADMIN", "ORGANIZER"),
  upload.single("image"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select an image to upload."
      });
    }

    return res.status(201).json({
      success: true,
      message: "Image uploaded successfully.",
      data: {
        imageUrl: `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`
      }
    });
  }
);

module.exports = router;
