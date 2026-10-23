Apply `schema.sql` to a new local database. For a database that already has the authentication tables, apply `migrations/001_create_events.sql` after selecting the EMS database. It creates the event table and adds the architecture's ADMIN, ORGANIZER, and EVENT_STAFF role names idempotently. Existing users are not assigned new roles. To grant an existing account the documented organizer role, use its email and run the following as a database administrator:

```sql
INSERT INTO user_roles (user_id, role_id)
SELECT u.user_id, r.role_id
FROM users u JOIN roles r ON r.role_name = 'ORGANIZER'
WHERE u.email = 'organizer@example.com';
```

After granting the role, the user must sign in again to receive a token containing the updated role.

Event creation is limited to users with ADMIN or ORGANIZER in `user_roles`. The event's `created_by` value references `users.user_id` and comes from the verified JWT. Event dates are stored as MySQL `DATETIME` wall-clock values supplied by the browser.
