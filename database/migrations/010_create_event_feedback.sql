USE event_management_system;

CREATE TABLE IF NOT EXISTS event_feedback (
    feedback_id CHAR(36) NOT NULL,
    event_id CHAR(36) NOT NULL,
    attendee_id CHAR(36) NOT NULL,
    registration_id CHAR(36) NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment VARCHAR(2000) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (feedback_id),
    UNIQUE KEY uq_event_feedback_event_attendee (event_id, attendee_id),
    UNIQUE KEY uq_event_feedback_registration (registration_id),
    INDEX idx_event_feedback_event_created (event_id, created_at),
    CONSTRAINT fk_event_feedback_event FOREIGN KEY (event_id)
        REFERENCES events(event_id) ON DELETE CASCADE,
    CONSTRAINT fk_event_feedback_attendee FOREIGN KEY (attendee_id)
        REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_event_feedback_registration FOREIGN KEY (registration_id)
        REFERENCES event_registrations(registration_id) ON DELETE CASCADE,
    CONSTRAINT chk_event_feedback_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;
