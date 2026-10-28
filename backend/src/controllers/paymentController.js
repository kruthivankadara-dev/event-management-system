const pool = require("../config/db");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sendError(res, status, message, code) {
  return res.status(status).json({ success: false, message, code });
}

async function getRegistrationPayment(req, res, next) {
  const registrationId = req.params.registrationId;
  if (!UUID_PATTERN.test(registrationId)) {
    return sendError(res, 400, "Invalid registration ID.", "INVALID_REGISTRATION_ID");
  }

  try {
    const [rows] = await pool.execute(
      `SELECT r.registration_id, r.event_id, r.registration_status,
              p.payment_status, p.created_at, p.updated_at
       FROM event_registrations r
       JOIN registration_payments p ON p.registration_id = r.registration_id
       WHERE r.registration_id = ? AND r.attendee_id = ?
       LIMIT 1`,
      [registrationId, req.user.id]
    );

    if (!rows.length) {
      return sendError(res, 404, "Registration or payment status not found.", "PAYMENT_NOT_FOUND");
    }

    return res.status(200).json({
      success: true,
      data: { payment: rows[0], processingAvailable: false }
    });
  } catch (error) {
    return next(error);
  }
}

// Deliberately does not accept a client-provided payment result. A configured,
// verified gateway callback can be connected here when one exists.
async function requestPaymentProcessing(req, res, next) {
  const registrationId = req.params.registrationId;
  if (!UUID_PATTERN.test(registrationId)) {
    return sendError(res, 400, "Invalid registration ID.", "INVALID_REGISTRATION_ID");
  }
  try {
    const [rows] = await pool.execute(
      `SELECT registration_id FROM event_registrations
       WHERE registration_id = ? AND attendee_id = ? LIMIT 1`,
      [registrationId, req.user.id]
    );
    if (!rows.length) {
      return sendError(res, 404, "Registration or payment status not found.", "PAYMENT_NOT_FOUND");
    }
  } catch (error) {
    return next(error);
  }

  return sendError(
    res,
    503,
    "Payment processing is unavailable. Your registration payment status is tracked as pending.",
    "PAYMENT_PROCESSING_UNAVAILABLE"
  );
}

module.exports = { getRegistrationPayment, requestPaymentProcessing };
