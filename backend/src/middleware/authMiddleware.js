
const jwt = require("jsonwebtoken");

const VALID_ROLES = [
  "ATTENDEE",
  "ORGANIZER",
  "ADMIN",
  "EVENT_STAFF"
];

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Access token is required."
    });
  }

  const token = authHeader.slice(7);

  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Authentication is not configured."
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (
      !decoded.sub ||
      !Array.isArray(decoded.roles) ||
      !decoded.roles.every(role => VALID_ROLES.includes(role))
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid token payload."
      });
    }

    req.user = {
      id: decoded.sub,
      roles: decoded.roles
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token."
    });
  }
}

function authorizeRoles(...allowedRoles) {
  if (
    allowedRoles.length === 0 ||
    !allowedRoles.every(role => VALID_ROLES.includes(role))
  ) {
    throw new Error("authorizeRoles requires valid role names.");
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required."
      });
    }

    const hasPermission = req.user.roles.some(role =>
      allowedRoles.includes(role)
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource."
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
  VALID_ROLES
};
