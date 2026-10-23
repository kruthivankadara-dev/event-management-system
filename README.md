# Event Management System (EMS)

EMS-F-001 authentication starter and EMS-F-003 event creation.

## Requirements

- Node.js 18 or newer
- MySQL 8
- npm

## 1. Database

For a new database, execute `database/schema.sql`. For an existing authentication database, execute `database/migrations/001_create_events.sql`. Existing users remain ATTENDEE; grant ADMIN or ORGANIZER to event creators by inserting their user ID and corresponding role ID into `user_roles` (see `database/README.md` for an email-based SQL example), then have them sign in again.

The registration controller expects the schema columns:

- `users.user_id` (UUID-compatible character column)
- `users.full_name`
- `users.email` (unique)
- `users.password_hash`
- `roles.role_id`
- `roles.role_name`
- `user_roles.user_id`
- `user_roles.role_id`

If your schema uses different column names, update the SQL in `backend/src/controllers/authController.js` to match it.

## 2. Backend setup

```bash
cd backend
npm install
```

Copy `.env.example` to `.env`, set `DB_USER`, `DB_PASSWORD`, and a strong random `JWT_SECRET` for your local setup. Do not commit `.env`.

Start the API:

```bash
npm run dev
```

Health check: `http://localhost:5000/api/health`

Registration endpoint: `POST http://localhost:5000/api/v1/auth/register`

Example JSON:

```json
{
  "name": "Test Attendee",
  "email": "attendee1@example.com",
  "password": "StrongPass123!"
}
```

## 3. Frontend setup

In a second terminal:

```bash
cd frontend
npm install
```

Copy `.env.example` to `.env` if you need to change the API URL, then run:

```bash
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## 4. Expected behavior

- Valid registration creates a user and assigns the ATTENDEE role.
- Duplicate email returns HTTP 409.
- Invalid input returns HTTP 400.
- Passwords are hashed with bcrypt before storage.
- The response never includes the password or password hash.

## 5. Scope and limitations

### Event creation API

`POST http://localhost:5000/api/v1/events` requires `Authorization: Bearer <token>` and ADMIN or ORGANIZER role. Example request:

```json
{
  "title": "Campus showcase",
  "description": "Student projects and performances",
  "category": "Campus",
  "venue": "Main Hall",
  "startDateTime": "2027-04-10T10:00",
  "endDateTime": "2027-04-10T12:00",
  "capacity": 80,
  "registrationDeadline": "2027-04-09T18:00",
  "imageUrl": "https://example.com/event.jpg"
}
```

Successful creation returns HTTP 201 with `{ "success": true, "message": "Event created successfully.", "data": { "event": ... } }`. Validation failures return HTTP 400 with an `errors` array; missing/invalid authentication returns 401 and an authenticated attendee receives 403. The creator ID is always taken from the signed-in token.

The backend reads `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `PORT`, and optional `FRONTEND_URL`; frontend may set `VITE_API_URL` (base API URL, default `http://localhost:5000/api/v1`). No secret values belong in source control. The `.env.example` files are safe templates; put actual values in the ignored `.env` files.

Install and run with `cd backend; npm install; npm run dev` and in another terminal `cd frontend; npm install; npm run dev`. Run backend unit tests with `cd backend; npm test`; build the frontend with `cd frontend; npm run build`. To verify DB persistence, sign in as an ADMIN/ORGANIZER and query `SELECT * FROM events ORDER BY created_at DESC;` in MySQL. The archive contains no configured MySQL credentials or existing role assignment workflow, so creating an authorized user and live DB verification require local setup.
