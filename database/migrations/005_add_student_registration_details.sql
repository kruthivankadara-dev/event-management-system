USE event_management_system;

ALTER TABLE event_registrations
    ADD COLUMN attendee_name VARCHAR(100) NULL,
    ADD COLUMN attendee_email VARCHAR(254) NULL,
    ADD COLUMN phone_number VARCHAR(20) NULL,
    ADD COLUMN college VARCHAR(150) NULL,
    ADD COLUMN department VARCHAR(100) NULL;