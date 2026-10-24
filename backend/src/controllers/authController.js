const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { registerSchema } = require("../validators/authValidators");
const { loginSchema } = require("../validators/authValidators");
const jwt = require("jsonwebtoken");

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
      `SELECT user_id, full_name, email, password_hash
       FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const user = users[0];
    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password."
      });
    }

    const [roles] = await pool.execute(
      `SELECT r.role_name
       FROM roles r
       JOIN user_roles ur ON r.role_id = ur.role_id
       WHERE ur.user_id = ?`,
      [user.user_id]
    );

    const roleNames = roles.map(role => role.role_name);

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
await connection.execute(
  "DELETE FROM user_roles WHERE user_id = ?",
  [userId]
);

await connection.execute(
  "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
  [userId, roles[0].role_id]
);

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
         GROUP_CONCAT(r.role_name ORDER BY r.role_name SEPARATOR ',') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON u.user_id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.role_id
       GROUP BY u.user_id, u.full_name, u.email
       ORDER BY u.full_name`
    );

    return res.status(200).json({
      success: true,
      data: users.map(user => ({
        id: user.user_id,
        name: user.full_name,
        email: user.email,
        roles: user.roles ? user.roles.split(",") : []
      }))
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { register, login, assignRole, getUsers };

