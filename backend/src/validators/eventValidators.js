const { z } = require("zod");

const eventSchema = z.object({
  title: z.string().trim().min(1, "Event title is required.").max(200),
  description: z.string().trim().max(5000).optional().default(""),
  category: z.string().trim().max(100).optional().default(""),
  venue: z.string().trim().min(1, "Venue is required.").max(255),
  startDateTime: z.string().min(1, "Start date and time are required."),
  endDateTime: z.string().min(1, "End date and time are required."),
  capacity: z.coerce.number().int("Capacity must be a whole number.").positive("Capacity must be a positive integer.").max(4294967295, "Capacity is too large."),
  registrationDeadline: z.string().optional().nullable().transform(value => value || null),
  imageUrl: z.string().trim().max(2048).optional().default("")
}).strict();

function validateEvent(input) {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return parsed;

  const { startDateTime, endDateTime, registrationDeadline } = parsed.data;
  const start = new Date(startDateTime);
  const end = new Date(endDateTime);
  if (Number.isNaN(start.getTime())) {
    return { success: false, error: { issues: [{ path: ["startDateTime"], message: "Enter a valid start date and time." }] } };
  }
  if (Number.isNaN(end.getTime())) {
    return { success: false, error: { issues: [{ path: ["endDateTime"], message: "Enter a valid end date and time." }] } };
  }
  if (end <= start) {
    return { success: false, error: { issues: [{ path: ["endDateTime"], message: "End date and time must be later than the start." }] } };
  }
  if (registrationDeadline) {
    const deadline = new Date(registrationDeadline);
    if (Number.isNaN(deadline.getTime())) {
      return { success: false, error: { issues: [{ path: ["registrationDeadline"], message: "Enter a valid registration deadline." }] } };
    }
    if (deadline > start) {
      return { success: false, error: { issues: [{ path: ["registrationDeadline"], message: "Registration deadline must be on or before the event start." }] } };
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
      return { success: false, error: { issues: [{ path: ["imageUrl"], message: "Enter a valid image URL starting with http:// or https://." }] } };
    }
  }
  return parsed;
}

module.exports = { eventSchema, validateEvent };
