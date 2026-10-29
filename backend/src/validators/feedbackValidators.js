const { z } = require("zod");

const feedbackSchema = z.object({
  rating: z.preprocess(value => {
    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      return Number(value);
    }
    return value;
  }, z.number()
    .int("Rating must be a whole number.")
    .min(1, "Rating must be between 1 and 5.")
    .max(5, "Rating must be between 1 and 5.")),
  comment: z.string()
    .trim()
    .max(2000, "Feedback must be 2,000 characters or fewer.")
    .optional()
    .default("")
}).strict();

function validateFeedback(input) {
  return feedbackSchema.safeParse(input);
}

module.exports = { feedbackSchema, validateFeedback };
