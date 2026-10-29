Set up the users and roles tables from `schema.sql`, then apply the migrations in order:

1. `migrations/001_create_events.sql`
2. `migrations/002_add_event_status.sql`
3. `migrations/003_add_event_registration_url.sql`
4. `migrations/004_create_event_registrations.sql`
5. `migrations/005_add_student_registration_details.sql`
6. `migrations/006_create_registration_payments.sql`
7. `migrations/007_create_event_tickets.sql`
8. `migrations/008_add_ticket_checkin_validation.sql`
9. `migrations/009_create_event_notifications.sql`

The migrations are safe to rerun. They bring an existing database up to the event schema used by the application, including the attendee registrations table and its unique event/attendee constraint.

Migration 006 creates one payment status row per EMS registration and initializes existing registrations to `PENDING` without modifying registration records. Run it after migration 005. The application has no payment gateway configured, so it does not process transactions or accept payment confirmations from clients.

Migration 007 creates a unique ticket record per registration. Tickets are issued for confirmed registrations; existing confirmed registrations receive a ticket when the attendee first retrieves it. Payment is not a prerequisite because the current event schema has no fee or required-payment field.

Run migration 007 after migration 006 before starting the ticket endpoints.

Migration 008 adds an active/revoked ticket state and an optional check-in actor reference. Check-in requires an active ticket, a confirmed registration, a scheduled event, and a matching selected event.

Migration 009 adds persistent, recipient-scoped in-app notifications. No email provider is configured; reminder notifications are sent on demand by an event owner or administrator.
