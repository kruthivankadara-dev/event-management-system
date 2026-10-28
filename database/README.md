Set up the users and roles tables from `schema.sql`, then apply the migrations in order:

1. `migrations/001_create_events.sql`
2. `migrations/002_add_event_status.sql`
3. `migrations/003_add_event_registration_url.sql`
4. `migrations/004_create_event_registrations.sql`
5. `migrations/005_add_student_registration_details.sql`
6. `migrations/006_create_registration_payments.sql`

The migrations are safe to rerun. They bring an existing database up to the event schema used by the application, including the attendee registrations table and its unique event/attendee constraint.

Migration 006 creates one payment status row per EMS registration and initializes existing registrations to `PENDING` without modifying registration records. Run it after migration 005. The application has no payment gateway configured, so it does not process transactions or accept payment confirmations from clients.
