
const { randomUUID } = require("crypto");
const pool = require("../config/db");
const { z } = require("zod");

// Validation schemas
const venueSchema = z.object({
  venueName: z.string().trim().min(2).max(255),
  address: z.string().trim().max(500).optional().default(""),
  description: z.string().trim().max(1000).optional().default("")
}).strict();

const categorySchema = z.object({
  categoryName: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().default("")
}).strict();

const statusSchema = z.object({
  isActive: z.boolean()
}).strict();

function validationError(res, message) {
  return res.status(400).json({
    success: false,
    message
  });
}

function handleDuplicate(error, res, entity) {
  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: `${entity} already exists.`
    });
  }
  return null;
}

async function writeAudit(
  connection,
  adminId,
  action,
  entityType,
  entityId,
  oldValues,
  newValues
) {
  await connection.execute(
    `INSERT INTO admin_audit_logs
     (audit_id, admin_id, action, entity_type, entity_id,
      old_values, new_values)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      adminId,
      action,
      entityType,
      entityId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null
    ]
  );
}

// =====================================================
// VENUE MANAGEMENT
// =====================================================


async function getVenues(req, res, next) {
  try {
    const [venues] = await pool.execute(
      `SELECT
         venue_id AS venueId,
         venue_name AS venueName,
         address,
         description,
         is_active AS isActive,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM event_venues
       ORDER BY venue_name`
    );

    return res.json({
      success: true,
      data: venues
    });
  } catch (error) {
    next(error);
  }
}


async function createVenue(req, res, next) {
  const parsed = venueSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, "Please provide valid venue details.");
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const venueId = randomUUID();
    const venue = parsed.data;

    await connection.execute(
      `INSERT INTO event_venues
       (venue_id, venue_name, address, description)
       VALUES (?, ?, ?, ?)`,
      [
        venueId,
        venue.venueName,
        venue.address,
        venue.description
      ]
    );

    await writeAudit(
      connection,
      req.user.id,
      "CREATE_VENUE",
      "VENUE",
      venueId,
      null,
      venue
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Venue created successfully.",
      data: { venueId, ...venue, is_active: 1 }
    });
  } catch (error) {
    if (connection) await connection.rollback();
    const duplicate = handleDuplicate(error, res, "Venue");
    if (duplicate) return duplicate;
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

async function updateVenue(req, res, next) {
  const parsed = venueSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, "Please provide valid venue details.");
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT venue_id, venue_name, address, description, is_active
       FROM event_venues
       WHERE venue_id = ?
       FOR UPDATE`,
      [req.params.id]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Venue not found."
      });
    }

    const oldVenue = rows[0];
    const venue = parsed.data;

    await connection.execute(
      `UPDATE event_venues
       SET venue_name = ?, address = ?, description = ?
       WHERE venue_id = ?`,
      [
        venue.venueName,
        venue.address,
        venue.description,
        req.params.id
      ]
    );

    await writeAudit(
      connection,
      req.user.id,
      "UPDATE_VENUE",
      "VENUE",
      req.params.id,
      oldVenue,
      venue
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Venue updated successfully.",
      data: { venueId: req.params.id, ...venue }
    });
  } catch (error) {
    if (connection) await connection.rollback();
    const duplicate = handleDuplicate(error, res, "Venue");
    if (duplicate) return duplicate;
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

async function updateVenueStatus(req, res, next) {
  const parsed = statusSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, "isActive must be true or false.");
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT venue_id, venue_name, is_active
       FROM event_venues
       WHERE venue_id = ?
       FOR UPDATE`,
      [req.params.id]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Venue not found."
      });
    }

    const oldStatus = Boolean(rows[0].is_active);
    const newStatus = parsed.data.isActive;

    if (oldStatus === newStatus) {
      await connection.rollback();
      return res.json({
        success: true,
        message: "Venue already has the requested status."
      });
    }

    await connection.execute(
      `UPDATE event_venues SET is_active = ? WHERE venue_id = ?`,
      [newStatus ? 1 : 0, req.params.id]
    );

    await writeAudit(
      connection,
      req.user.id,
      newStatus ? "ACTIVATE_VENUE" : "DEACTIVATE_VENUE",
      "VENUE",
      req.params.id,
      { isActive: oldStatus },
      { isActive: newStatus }
    );

    await connection.commit();

    return res.json({
      success: true,
      message: `Venue ${newStatus ? "activated" : "deactivated"} successfully.`
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

// =====================================================
// EVENT CATEGORY MANAGEMENT
// =====================================================


async function getCategories(req, res, next) {
  try {
    const [categories] = await pool.execute(
      `SELECT
         category_id AS categoryId,
         category_name AS categoryName,
         description,
         is_active AS isActive,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM event_categories
       ORDER BY category_name`
    );

    return res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    next(error);
  }
}


async function createCategory(req, res, next) {
  const parsed = categorySchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, "Please provide valid category details.");
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const categoryId = randomUUID();
    const category = parsed.data;

    await connection.execute(
      `INSERT INTO event_categories
       (category_id, category_name, description)
       VALUES (?, ?, ?)`,
      [
        categoryId,
        category.categoryName,
        category.description
      ]
    );

    await writeAudit(
      connection,
      req.user.id,
      "CREATE_CATEGORY",
      "CATEGORY",
      categoryId,
      null,
      category
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Category created successfully.",
      data: { categoryId, ...category, is_active: 1 }
    });
  } catch (error) {
    if (connection) await connection.rollback();
    const duplicate = handleDuplicate(error, res, "Category");
    if (duplicate) return duplicate;
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

async function updateCategory(req, res, next) {
  const parsed = categorySchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, "Please provide valid category details.");
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT category_id, category_name, description, is_active
       FROM event_categories
       WHERE category_id = ?
       FOR UPDATE`,
      [req.params.id]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Category not found."
      });
    }

    const oldCategory = rows[0];
    const category = parsed.data;

    await connection.execute(
      `UPDATE event_categories
       SET category_name = ?, description = ?
       WHERE category_id = ?`,
      [
        category.categoryName,
        category.description,
        req.params.id
      ]
    );

    await writeAudit(
      connection,
      req.user.id,
      "UPDATE_CATEGORY",
      "CATEGORY",
      req.params.id,
      oldCategory,
      category
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Category updated successfully.",
      data: { categoryId: req.params.id, ...category }
    });
  } catch (error) {
    if (connection) await connection.rollback();
    const duplicate = handleDuplicate(error, res, "Category");
    if (duplicate) return duplicate;
    next(error);
  } finally {
    if (connection) connection.release();
  }
}

async function updateCategoryStatus(req, res, next) {
  const parsed = statusSchema.safeParse(req.body);

  if (!parsed.success) {
    return validationError(res, "isActive must be true or false.");
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT category_id, category_name, is_active
       FROM event_categories
       WHERE category_id = ?
       FOR UPDATE`,
      [req.params.id]
    );

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Category not found."
      });
    }

    const oldStatus = Boolean(rows[0].is_active);
    const newStatus = parsed.data.isActive;

    if (oldStatus === newStatus) {
      await connection.rollback();
      return res.json({
        success: true,
        message: "Category already has the requested status."
      });
    }

    await connection.execute(
      `UPDATE event_categories SET is_active = ? WHERE category_id = ?`,
      [newStatus ? 1 : 0, req.params.id]
    );

    await writeAudit(
      connection,
      req.user.id,
      newStatus ? "ACTIVATE_CATEGORY" : "DEACTIVATE_CATEGORY",
      "CATEGORY",
      req.params.id,
      { isActive: oldStatus },
      { isActive: newStatus }
    );

    await connection.commit();

    return res.json({
      success: true,
      message: `Category ${newStatus ? "activated" : "deactivated"} successfully.`
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
}


async function getConfigurations(req, res, next) {
  try {
    const [configurations] = await pool.execute(
      `SELECT config_key, config_value, description,
              updated_by, created_at, updated_at
       FROM system_configurations
       ORDER BY config_key`
    );

    return res.status(200).json({
      success: true,
      data: configurations.map(item => ({
        configKey: item.config_key,
        configValue: item.config_value,
        description: item.description,
        updatedBy: item.updated_by,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }))
    });
  } catch (error) {
    next(error);
  }
}

async function updateConfiguration(req, res, next) {
  const configKey = req.params.key;

  if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,99}$/.test(configKey)) {
    return res.status(400).json({
      success: false,
      message: "Invalid configuration key."
    });
  }

  const { configValue, description } = req.body;

  if (
    configValue === undefined ||
    typeof configValue === "function"
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid configuration value is required."
    });
  }

  if (
    description !== undefined &&
    (typeof description !== "string" || description.length > 500)
  ) {
    return res.status(400).json({
      success: false,
      message: "Description must be a string of at most 500 characters."
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [existing] = await connection.execute(
      `SELECT config_value, description
       FROM system_configurations
       WHERE config_key = ?
       FOR UPDATE`,
      [configKey]
    );

    const oldValues = existing.length
      ? {
          configValue: existing[0].config_value,
          description: existing[0].description
        }
      : null;

    const newValues = {
      configValue,
      description: description || ""
    };

    await connection.execute(
      `INSERT INTO system_configurations
       (config_key, config_value, description, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         config_value = VALUES(config_value),
         description = VALUES(description),
         updated_by = VALUES(updated_by)`,
      [
        configKey,
        JSON.stringify(configValue),
        newValues.description,
        req.user.id
      ]
    );

    await writeAudit(
      connection,
      req.user.id,
      existing.length ? "UPDATE_CONFIGURATION" : "CREATE_CONFIGURATION",
      "CONFIGURATION",
      configKey,
      oldValues,
      newValues
    );

    await connection.commit();

    return res.status(existing.length ? 200 : 201).json({
      success: true,
      message: "Configuration saved successfully.",
      data: {
        configKey,
        ...newValues
      }
    });
  } catch (error) {
    if (connection) await connection.rollback();
    next(error);
  } finally {
    if (connection) connection.release();
  }
}


module.exports = {
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
};
