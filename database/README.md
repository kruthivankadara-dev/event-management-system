Set up the users and roles tables from `schema.sql`, then apply the migrations in order:

1. `migrations/001_create_events.sql`
2. `migrations/002_add_event_status.sql`
3. `migrations/003_add_event_registration_url.sql`

The migrations are safe to rerun. They bring an existing database up to the event schema used by the application.
