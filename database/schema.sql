CREATE DATABASE IF NOT EXISTS event_management_system;
USE event_management_system;

-- =====================================================
-- EMS-F-001 / EMS-F-002: Users and role-based access
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    user_id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    CONSTRAINT chk_users_full_name
        CHECK (CHAR_LENGTH(TRIM(full_name)) > 0),
    CONSTRAINT chk_users_email
        CHECK (CHAR_LENGTH(TRIM(email)) > 0)
);

CREATE TABLE IF NOT EXISTS roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id CHAR(36) NOT NULL,
    role_id INT NOT NULL,
    PRIMARY KEY (user_id, role_id),

    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_user_roles_role
        FOREIGN KEY (role_id)
        REFERENCES roles(role_id)
        ON DELETE CASCADE
);

-- Seed supported roles without duplicating existing entries.
INSERT IGNORE INTO roles (role_name)
VALUES
    ('ATTENDEE'),
    ('ADMIN'),
    ('ORGANIZER'),
    ('EVENT_STAFF');

-- Event and registration tables are managed by the
-- versioned SQL migrations in database/migrations/.
-- Apply those migrations in numerical order.
```