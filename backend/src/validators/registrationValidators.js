const { z } = require("zod");

const registrationRequestSchema = z.object({}).strict();

function validateRegistrationRequest(input) {
  return registrationRequestSchema.safeParse(input);
}

module.exports = {
  registrationRequestSchema,
  validateRegistrationRequest
};
