
const { z } = require("zod");

const eventSchema = z.object({
  title: z.string().trim().min(1, "Event title is required.").max(200),
  description: z.string().trim().max(5000).optional().default(""),
  category: z.string().trim().max(100).optional().default(""),
  venue: z.string().trim().min(1, "Venue is required.").max(255),
  startDateTime: z.string().min(1, "Start date and time are required."),
  endDateTime: z.string().min(1, "End date and time are required."),
  capacity: z.coerce
    .number()
    .int("Capacity must be a whole number.")
    .positive("Capacity must be a positive integer.")
    .max(4294967295, "Capacity is too large."),
  registrationDeadline: z
    .string()
    .optional()
    .nullable()
    .transform(value => value || null),
  imageUrl: z.string().trim().max(2048).optional().default(""),
  registrationUrl: z.string().trim().max(2048).optional().default("")
}).strict();

function optionalTrimmedString(maxLength) {
  return z.preprocess(
    value => typeof value === "string" && !value.trim() ? undefined : value,
    z.string().trim().max(maxLength).optional()
  );
}

const eventSearchQuerySchema = z.object({
  q: optionalTrimmedString(200),
  category: optionalTrimmedString(100),
  date: z.preprocess(
    value => typeof value === "string" && !value.trim() ? undefined : value,
    z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date in YYYY-MM-DD format.")
      .refine(value => {
        const [year] = value.split("-").map(Number);
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return year >= 1000 &&
          !Number.isNaN(parsed.getTime()) &&
          parsed.toISOString().slice(0, 10) === value;
      }, "Use a valid date in YYYY-MM-DD format.")
      .optional()
  ),
  venue: optionalTrimmedString(255)
}).strict();

function validateEventSearchQuery(input) {
  return eventSearchQuerySchema.safeParse(input);
}

function validateEvent(input) {
  const parsed = eventSchema.safeParse(input);

  if (!parsed.success) return parsed;

  const { startDateTime, endDateTime, registrationDeadline } = parsed.data;
  const start = new Date(startDateTime);
  const end = new Date(endDateTime);

  if (Number.isNaN(start.getTime())) {
    return {
      success: false,
      error: {
        issues: [{
          path: ["startDateTime"],
          message: "Enter a valid start date and time."
        }]
      }
    };
  }

  if (Number.isNaN(end.getTime())) {
    return {
      success: false,
      error: {
        issues: [{
          path: ["endDateTime"],
          message: "Enter a valid end date and time."
        }]
      }
    };
  }

  if (end <= start) {
    return {
      success: false,
      error: {
        issues: [{
          path: ["endDateTime"],
          message: "End date and time must be later than the start."
        }]
      }
    };
  }

  if (registrationDeadline) {
    const deadline = new Date(registrationDeadline);

    if (Number.isNaN(deadline.getTime())) {
      return {
        success: false,
        error: {
          issues: [{
            path: ["registrationDeadline"],
            message: "Enter a valid registration deadline."
          }]
        }
      };
    }

    if (deadline > start) {
      return {
        success: false,
        error: {
          issues: [{
            path: ["registrationDeadline"],
            message: "Registration deadline must be on or before the event start."
          }]
        }
      };
    }
  }

  if (parsed.data.imageUrl) {
    let imageUrl;

    try {
      imageUrl = new URL(parsed.data.imageUrl);
    } catch {
      imageUrl = null;
    }

    if (!imageUrl || !["http:", "https:"].includes(imageUrl.protocol)) {
      return {
        success: false,
        error: {
          issues: [{
            path: ["imageUrl"],
            message: "Enter a valid image URL starting with http:// or https://."
          }]
        }
      };
    }
  }
  if (parsed.data.registrationUrl) {
  let registrationUrl;

  try {
    registrationUrl = new URL(parsed.data.registrationUrl);
  } catch {
    registrationUrl = null;
  }

  if (
    !registrationUrl ||
    !["http:", "https:"].includes(registrationUrl.protocol)
  ) {
    return {
      success: false,
      error: {
        issues: [{
          path: ["registrationUrl"],
          message: "Enter a valid registration URL starting with http:// or https://."
        }]
      }
    };
  }
}
  return parsed;
}

module.exports = {
  eventSchema,
  eventSearchQuerySchema,
  validateEvent,
  validateEventSearchQuery
};
