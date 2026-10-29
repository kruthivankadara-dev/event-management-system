USE event_management_system;

CREATE TABLE IF NOT EXISTS event_notifications (
    notification_id CHAR(36) NOT NULL,
    recipient_id CHAR(36) NOT NULL,
    event_id CHAR(36) NOT NULL,
    registration_id CHAR(36) NULL,
    notification_type ENUM('REGISTRATION_CONFIRMED', 'EVENT_POSTPONED', 'EVENT_UPDATED', 'EVENT_CANCELLED', 'EVENT_REMINDER') NOT NULL,
    title VARCHAR(200) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    dedupe_key CHAR(64) NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id),
    UNIQUE KEY uq_event_notifications_recipient_dedupe (recipient_id, dedupe_key),
    INDEX idx_event_notifications_recipient_created (recipient_id, created_at),
    CONSTRAINT fk_event_notifications_recipient FOREIGN KEY (recipient_id) REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_event_notifications_event FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    CONSTRAINT fk_event_notifications_registration FOREIGN KEY (registration_id) REFERENCES event_registrations(registration_id) ON DELETE CASCADE
) ENGINE=InnoDB;
