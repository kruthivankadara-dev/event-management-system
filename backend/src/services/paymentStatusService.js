const VALID_STATUSES = new Set(["PENDING", "SUCCESSFUL", "FAILED"]);

// Internal trusted server-side entry point only. Do not wire this to an
// attendee-facing route; success must follow verified provider confirmation.
async function updatePaymentStatus(connection, registrationId, nextStatus) {
  if (!VALID_STATUSES.has(nextStatus)) {
    const error = new Error("Invalid payment status.");
    error.code = "INVALID_PAYMENT_STATUS";
    throw error;
  }

  const [rows] = await connection.execute(
    "SELECT payment_status FROM registration_payments WHERE registration_id = ? FOR UPDATE",
    [registrationId]
  );
  if (!rows.length) {
    const error = new Error("Payment status not found.");
    error.code = "PAYMENT_NOT_FOUND";
    throw error;
  }
  if (rows[0].payment_status !== "PENDING") {
    const error = new Error("Payment status transition is not allowed.");
    error.code = "INVALID_PAYMENT_TRANSITION";
    throw error;
  }

  await connection.execute(
    "UPDATE registration_payments SET payment_status = ? WHERE registration_id = ? AND payment_status = 'PENDING'",
    [nextStatus, registrationId]
  );
  return nextStatus;
}

module.exports = { updatePaymentStatus };
