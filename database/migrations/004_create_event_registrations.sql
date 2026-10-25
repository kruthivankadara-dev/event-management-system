USE event_management_system;

ALTER TABLE events ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_registrations (
    registration_id CHAR(36) NOT NULL,
    event_id CHAR(36) NOT NULL,
    attendee_id CHAR(36) NOT NULL,
    registration_status ENUM('CONFIRMED', 'CANCELLED') NOT NULL DEFAULT 'CONFIRMED',
    registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (registration_id),
    UNIQUE KEY uq_event_registrations_event_attendee (event_id, attendee_id),
    INDEX idx_event_registrations_attendee (attendee_id),
    CONSTRAINT fk_event_registrations_event
        FOREIGN KEY (event_id) REFERENCES events(event_id),
    CONSTRAINT fk_event_registrations_attendee
        FOREIGN KEY (attendee_id) REFERENCES users(user_id)
) ENGINE=InnoDB;
