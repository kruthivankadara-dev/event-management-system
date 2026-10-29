const { z } = require("zod");

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.")
  .refine(value => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date.");

const reportQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  status: z.enum(["SCHEDULED", "CANCELLED"]).optional()
}).strict().superRefine((value, context) => {
  if (value.from && value.to && value.from > value.to) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["from"],
      message: "Start date must be on or before end date."
    });
  }
});

function validateReportQuery(input) {
  return reportQuerySchema.safeParse(input);
}

module.exports = { reportQuerySchema, validateReportQuery };
