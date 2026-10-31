Event Management System (EMS)
A web-based Event Management System supporting authentication, role-based access control, event creation, registration links, event editing, postponement, and cancellation.
Implemented Features
EMS-F-002 — Authentication and Role-Based Access Control
- User registration and login.
- Password hashing using bcrypt.
- Token-based authentication using JWT.
- Roles: ATTENDEE, ORGANIZER, ADMIN, and EVENT_STAFF.
- Admin interface to view registered users and assign supported roles.
- Protected backend routes using authentication and role-authorization middleware.
EMS-F-003 — Event Creation and Registration
- Users with ADMIN or ORGANIZER roles can create events.
- Event details include title, description, category, venue, start/end date and time, capacity, registration deadline, image URL or uploaded image, and an optional registration-form URL.
- Event data is stored in MySQL.
- Authenticated users can view events.
- Attendees can select an optional external registration form from event details.
EMS-F-004 — Event Editing, Postponement, and Cancellation
- Authorized event creators can edit scheduled events.
- Events can be postponed by updating their date or time through the edit workflow.
- Authorized users can cancel scheduled events.
- Updated event details and status are reflected in the application.
- Backend authorization must be enforced; frontend button visibility alone is not a security control.
EMS-F-005 — Event Search and Filtering
- Authenticated users can search scheduled events by title or description, and filter by category, event date, and venue.
- Filters can be combined, and event details open inline from the results.
- The current event model has no draft or unpublished state; events are scheduled and available when created.
- EMS-F-007: authenticated ATTENDEE users can register for scheduled events. MySQL prevents duplicate registrations, and a transaction locking the event row enforces capacity. Event details show the current attendee's registration status and remaining capacity.
The project team reports that these workflows have been tested in the local development environment.
Technology Stack
- Frontend: React, Vite, JavaScript, CSS
- Backend: Node.js, Express
- Database: MySQL
- Authentication: JWT and bcrypt
- Validation: Zod (event request validation)
- Tools: VS Code, npm, MySQL Workbench
Project Structure
event-management-system/
├── backend/
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── validators/
│   ├── test/
│   ├── package.json
│   └── .env                 # Create locally; do not commit
├── database/
│   ├── schema.sql
│   └── migrations/
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── index.css
│   ├── package.json
│   └── .env.example
└── README.md
Folder contents may differ slightly depending on the current branch.
Prerequisites
- Node.js and npm
- MySQL Server
- Git (optional, for version control)
Local Setup
1. Clone the repository
git clone https://github.com/se-ems-team8/event-management-system.git
cd event-management-system
If the repository is already cloned, open its project directory in VS Code.
2. Set up the database
Start MySQL and run the repository's schema and migration SQL files in order using MySQL Workbench or the MySQL command line. Migrations `002_add_event_status.sql`, `003_add_event_registration_url.sql`, and `004_create_event_registrations.sql` can be rerun safely.

The application database is:
CREATE DATABASE IF NOT EXISTS event_management_system;
Ensure the schema creates the users, roles, and user_roles tables, then apply the event migrations in `database/migrations/` in numerical order. The registration migration creates the records table with foreign keys and a unique attendee/event constraint.

Ensure the roles table contains:
INSERT IGNORE INTO roles (role_name)
VALUES ('ATTENDEE'), ('ADMIN'), ('ORGANIZER'), ('EVENT_STAFF');
Use the repository's schema and migrations as the source of truth for complete table definitions and constraints.
3. Configure backend environment variables
Create backend/.env locally. Use the exact variable names expected by backend/src/config/db.js and the authentication code in your checkout. Example values:
PORT=5000
DB_HOST=localhost
DB_USER=your_mysql_username
DB_PASSWORD=your_mysql_password
DB_NAME=event_management_system
JWT_SECRET=replace_with_a_long_random_secret
These names are examples; verify the exact names in your project files. Never commit .env or real credentials.
4. Install backend dependencies and start the API
From the project root:
cd backend
npm install
npm start
If package.json does not define a start script, use the script listed in that file (for example, a development script).

The current local setup uses port 5000 for the backend API.
5. Install and start the frontend
Open a second terminal from the project root:
cd frontend
npm install
The frontend uses VITE_API_URL when configured; otherwise, the current default is:
http://localhost:5000/api/v1
If needed, create frontend/.env:
VITE_API_URL=http://localhost:5000/api/v1
Start the frontend:
npm run dev
Open the local URL printed by Vite (the current setup uses http://localhost:5173).
API Routes
The following event routes are part of the current implementation:
Method	Endpoint	Access	Purpose
GET	/api/v1/events	Authenticated users	Retrieve scheduled events; supports `q`, `category`, `date` (`YYYY-MM-DD`), and `venue` filters
POST	/api/v1/events/:id/register	ATTENDEE	Register for an available event; returns 409 for duplicates, full, or closed events
POST	/api/v1/events	ADMIN or ORGANIZER	Create an event
GET	/api/v1/admin/audit-logs	ADMIN	Retrieve the latest 100 administrative and event-management audit records


Other authentication, user-management, editing, and cancellation routes depend on the current backend route definitions. Check backend/src/routes/ for their exact methods and paths.

Protected requests use the token returned by the login flow, typically in this header:
Authorization: Bearer <token>
Typical User Workflow
1. Register an account or sign in.
2. An administrator assigns the appropriate role.
3. An administrator or organizer creates an event and optionally provides a registration-form URL.
4. Authenticated users search and filter event cards, then open a result to view its details.
5. Attendees open event details and register through EMS. An optional external registration form is also shown when configured.
6. An authorized creator edits or postpones a scheduled event when needed.
7. An authorized user cancels a scheduled event when required.
Testing Checklist
- [ ] Register a user and sign in.
- [ ] Verify passwords are not stored as plain text.
- [ ] Verify unauthenticated requests to protected endpoints are rejected.
- [ ] Verify attendees cannot access organizer/admin-only event operations.
- [ ] Create an event with valid details.
- [ ] Verify invalid event data is rejected.
- [ ] Verify events appear after refreshing the event list.
- [ ] Search by title/description; verify category, date, venue, and combined filters.
- [ ] Verify cancelled events are excluded and the no-results message appears.
- [ ] Verify the Register link opens the configured form.
- [ ] Edit a scheduled event and verify changes persist after refresh.
- [ ] Postpone an event and verify the new schedule persists.
- [ ] Cancel an event and verify CANCELLED persists after refresh.
- [ ] Verify users cannot modify events they are not authorized to manage.
Security Notes
- Never commit .env files, credentials, JWT secrets, or production data.
- Use strong, unique secrets.
- Enforce authorization on the backend for every protected operation.
- Validate user input on the server.
- Do not rely on frontend-only restrictions as access control.
- Configure HTTPS and production security settings before deployment.
Current Scope
This README documents EMS-F-002 through EMS-F-005. The current database model does not distinguish unpublished or draft events.

Non-functional requirements NF-001 through NF-004, including performance/load-test instructions, availability measurement assumptions, and privacy/security controls, are documented in [docs/NON_FUNCTIONAL_REQUIREMENTS.md](./docs/NON_FUNCTIONAL_REQUIREMENTS.md).
