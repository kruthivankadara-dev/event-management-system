const { randomUUID } = require("crypto");
const pool = require("../config/db");

const SENSITIVE_KEY = /password|hash|token|jwt|secret|credential|authorization|api.?key|private.?key|cookie|session|email|phone|address|payment|card|cvv|ssn|birth|description|full.?name|attendee.?name|user.?name/i;
const SAFE_METADATA_KEYS = new Set([
  "accountStatus",
  "status",
  "roleName",
  "isActive",
  "fields",
  "changedFields",
  "configKey"
]);

function sanitizeMetadata(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeMetadata);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => SAFE_METADATA_KEYS.has(key) && !SENSITIVE_KEY.test(key))
        .map(([key, item]) => [key, sanitizeMetadata(item)])
    );
  }

  return value;
}

async function writeAudit(
  connection,
  actorId,
  action,
  entityType,
  entityId,
  oldValues = null,
  newValues = null
) {
  const safeOldValues = sanitizeMetadata(oldValues);
  const safeNewValues = sanitizeMetadata(newValues);

  await connection.execute(
    `INSERT INTO admin_audit_logs
     (audit_id, admin_id, action, entity_type, entity_id,
      old_values, new_values)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      actorId,
      action,
      entityType,
      entityId,
      safeOldValues == null ? null : JSON.stringify(safeOldValues),
      safeNewValues == null ? null : JSON.stringify(safeNewValues)
    ]
  );
}

function parseMetadata(value) {
  if (value == null) return null;
  return sanitizeMetadata(typeof value === "string" ? JSON.parse(value) : value);
}

async function listAuditLogs() {
  const [rows] = await pool.execute(
    `SELECT audit_id, admin_id, action, entity_type, entity_id,
            old_values, new_values, created_at
     FROM admin_audit_logs
     ORDER BY created_at DESC, audit_id DESC
     LIMIT 100`
  );

  return rows.map(row => {
    const isConfiguration = row.entity_type === "CONFIGURATION";

    return {
      auditId: row.audit_id,
      actorId: row.admin_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: isConfiguration && SENSITIVE_KEY.test(String(row.entity_id))
        ? "[REDACTED]"
        : row.entity_id,
      oldValues: isConfiguration ? null : parseMetadata(row.old_values),
      newValues: isConfiguration ? null : parseMetadata(row.new_values),
      createdAt: row.created_at
    };
  });
}

module.exports = {
  writeAudit,
  listAuditLogs,
  sanitizeMetadata
};
