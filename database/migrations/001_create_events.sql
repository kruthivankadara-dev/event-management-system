
USE event_management_system;

CREATE TABLE IF NOT EXISTS events (
    event_id CHAR(36) PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NULL,
    venue VARCHAR(255) NOT NULL,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    capacity INT UNSIGNED NOT NULL,
    registration_deadline DATETIME NULL,
    registration_url VARCHAR(2048) NULL,
    image_url VARCHAR(2048) NULL,
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_events_creator
        FOREIGN KEY (created_by) REFERENCES users(user_id),
    CONSTRAINT chk_events_positive_capacity
        CHECK (capacity > 0),
    CONSTRAINT chk_events_date_range
        CHECK (end_datetime > start_datetime),
    INDEX idx_events_start_datetime (start_datetime),
    INDEX idx_events_created_by (created_by)
);

INSERT IGNORE INTO roles (role_name)
VALUES ('ADMIN'), ('ORGANIZER'), ('EVENT_STAFF');
