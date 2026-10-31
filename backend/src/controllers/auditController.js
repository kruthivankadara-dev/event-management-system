const { listAuditLogs } = require("../services/auditLogService");

async function getAuditLogs(req, res, next) {
  try {
    const logs = await listAuditLogs();
    return res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { getAuditLogs };
