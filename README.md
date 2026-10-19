# Event Management System (EMS)

EMS-F-001: user registration starter implementation.

## Requirements

- Node.js 18 or newer
- MySQL 8
- npm

## 1. Database

Copy your existing schema file to `database/schema.sql`, then execute it in MySQL Workbench. Verify that the database `event_management_system` and the tables `users`, `roles`, and `user_roles` exist, and that `ATTENDEE` is present in `roles`.

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

Copy `.env.example` to `.env`, then update `DB_USER` and `DB_PASSWORD` to match your local MySQL credentials. Do not commit `.env`.

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

This implements registration only. Login, tokens/sessions, email verification, rate limiting, password reset, and protected routes are not included in EMS-F-001. Test locally before merging; this starter archive does not include your actual `schema.sql` because the exact file was not attached in the current request.
