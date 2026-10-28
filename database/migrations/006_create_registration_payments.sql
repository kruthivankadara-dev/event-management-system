USE event_management_system;

-- One status record per EMS registration. Existing registrations are preserved;
-- payment tracking is initialized as pending because no gateway is configured.
CREATE TABLE IF NOT EXISTS registration_payments (
    registration_id CHAR(36) NOT NULL,
    payment_status ENUM('PENDING', 'SUCCESSFUL', 'FAILED') NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (registration_id),
    CONSTRAINT fk_registration_payments_registration
        FOREIGN KEY (registration_id)
        REFERENCES event_registrations(registration_id)
        ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO registration_payments (registration_id, payment_status)
SELECT registration_id, 'PENDING' FROM event_registrations;
