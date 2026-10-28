USE event_management_system;

CREATE TABLE IF NOT EXISTS event_tickets (
    ticket_id CHAR(36) NOT NULL,
    registration_id CHAR(36) NOT NULL,
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    checked_in_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (ticket_id),
    UNIQUE KEY uq_event_tickets_registration (registration_id),
    CONSTRAINT fk_event_tickets_registration
        FOREIGN KEY (registration_id)
        REFERENCES event_registrations(registration_id)
        ON DELETE CASCADE
) ENGINE=InnoDB;
