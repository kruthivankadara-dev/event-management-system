const bcrypt = require("bcryptjs");
const pool = require("../config/db");
const { registerSchema } = require("../validators/authValidators");

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

module.exports = { register };
