const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { registerSchema } = require("../validators/authValidators");
const { loginSchema } = require("../validators/authValidators");
const jwt = require("jsonwebtoken");
const { writeAudit } = require("../services/auditLogService");
const { comparePassword } = require("../services/passwordComparisonPool");

async function register(req, res, next) {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid name, email, and password."
    });
  }

  const name = parsed.data.name;
  const email = parsed.data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.execute(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    const [roles] = await connection.execute(
      "SELECT role_id FROM roles WHERE role_name = 'ATTENDEE' LIMIT 1"
    );

    if (roles.length === 0) {
      throw new Error("ATTENDEE role is missing from the database.");
    }

    await connection.execute(
      "INSERT INTO users (user_id, full_name, email, password_hash) VALUES (UUID(), ?, ?, ?)",
      [name, email, passwordHash]
    );

    const [createdUsers] = await connection.execute(
      "SELECT user_id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    if (createdUsers.length === 0) {
      throw new Error("Could not retrieve the created user.");
    }

    await connection.execute(
      "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
      [createdUsers[0].user_id, roles[0].role_id]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "User registered successfully.",
      data: {
        id: createdUsers[0].user_id,
        name,
        email
      }
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists."
      });
    }

    next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function login(req, res, next) {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Please provide a valid email and password."
    });
  }

  try {
    const email = parsed.data.email.toLowerCase();
    const password = parsed.data.password;

    const [users] = await pool.execute(
      `SELECT u.user_id, u.full_name, u.email, u.password_hash,
              u.account_status, r.role_name
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN roles r ON r.role_id = ur.role_id
       WHERE u.email = ?`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const user = users[0];

if (user.account_status !== "ACTIVE") {
  return res.status(403).json({
    success: false,
    message: "Your account is inactive. Please contact an administrator."
  });
}

const passwordMatches = await comparePassword(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const roleNames = [...new Set(
      users.map(row => row.role_name).filter(roleName => typeof roleName === "string")
    )];

    const token = jwt.sign(
      {
        sub: user.user_id,
        roles: roleNames
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        token,
        user: {
          id: user.user_id,
          name: user.full_name,
          email: user.email,
          roles: roleNames
        }
      }
    });
  } catch (error) {
    next(error);
  }
}


async function assignRole(req, res, next) {
  const { userId, roleName } = req.body;

  const allowedRoles = ["ATTENDEE", "ORGANIZER", "EVENT_STAFF"];

  if (!userId || !allowedRoles.includes(roleName)) {
    return res.status(400).json({
      success: false,
      message: "A valid userId and roleName (ORGANIZER or EVENT_STAFF) are required."
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [users] = await connection.execute(
      "SELECT user_id FROM users WHERE user_id = ? LIMIT 1",
      [userId]
    );

    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    const [roles] = await connection.execute(
      "SELECT role_id FROM roles WHERE role_name = ? LIMIT 1",
      [roleName]
    );

    if (roles.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Role does not exist in the database."
      });
    }

    // Replace the user's existing role with the selected role.
// Add the selected role without removing existing roles.
const [assignment] = await connection.execute(
  `INSERT IGNORE INTO user_roles (user_id, role_id)
   VALUES (?, ?)`,
  [userId, roles[0].role_id]
);

if (assignment.affectedRows > 0) {
  await writeAudit(
    connection,
    req.user.id,
    "ASSIGN_ROLE",
    "USER",
    userId,
    null,
    { roleName }
  );
}

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: `${roleName} role assigned successfully.`
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}


async function getUsers(req, res, next) {
  try {
    const [users] = await pool.execute(
      `SELECT
         u.user_id,
         u.full_name,
         u.email,
         u.account_status,
         GROUP_CONCAT(r.role_name ORDER BY r.role_name SEPARATOR ',') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON u.user_id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.role_id
       GROUP BY u.user_id, u.full_name, u.email,u.account_status
       ORDER BY u.full_name`
    );

    return res.status(200).json({
      success: true,
      data: users.map(user => ({
  id: user.user_id,
  name: user.full_name,
  email: user.email,
  accountStatus: user.account_status,
  roles: user.roles ? user.roles.split(",") : []
}))
    });
  } catch (error) {
    next(error);
  }
}


async function updateUserStatus(req, res, next) {
  const { userId } = req.params;
  const { accountStatus } = req.body;

  if (!["ACTIVE", "INACTIVE"].includes(accountStatus)) {
    return res.status(400).json({
      success: false,
      message: "Account status must be ACTIVE or INACTIVE."
    });
  }

  if (userId === req.user.id && accountStatus === "INACTIVE") {
    return res.status(400).json({
      success: false,
      message: "You cannot deactivate your own account."
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Lock the target user while checking and updating their status.
    const [users] = await connection.execute(
      `SELECT user_id, account_status
       FROM users
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );

    if (users.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    const oldStatus = users[0].account_status;

    if (oldStatus === accountStatus) {
      await connection.rollback();
      return res.status(200).json({
        success: true,
        message: `User account is already ${accountStatus}.`
      });
    }

    // Prevent deactivation of the last active administrator.
    if (accountStatus === "INACTIVE") {
      const [adminRows] = await connection.execute(
        `SELECT COUNT(DISTINCT u.user_id) AS active_admins
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id
         WHERE r.role_name = 'ADMIN'
           AND u.account_status = 'ACTIVE'`
      );

      const [targetAdmin] = await connection.execute(
        `SELECT COUNT(*) AS is_admin
         FROM user_roles ur
         JOIN roles r ON r.role_id = ur.role_id
         WHERE ur.user_id = ?
           AND r.role_name = 'ADMIN'`,
        [userId]
      );

      if (
        targetAdmin[0].is_admin > 0 &&
        adminRows[0].active_admins <= 1
      ) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Cannot deactivate the last active administrator."
        });
      }
    }

    await connection.execute(
      `UPDATE users
       SET account_status = ?
       WHERE user_id = ?`,
      [accountStatus, userId]
    );

    // Record the administrative action.
    await writeAudit(
      connection,
      req.user.id,
      accountStatus === "ACTIVE" ? "ACTIVATE_USER" : "DEACTIVATE_USER",
      "USER",
      userId,
      { accountStatus: oldStatus },
      { accountStatus }
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: `User account ${accountStatus.toLowerCase()} successfully.`,
      data: {
        userId,
        accountStatus
      }
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    next(error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}


module.exports = {
  register,
  login,
  assignRole,
  getUsers,
  updateUserStatus
};
