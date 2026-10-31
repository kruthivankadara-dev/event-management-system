USE event_management_system;

SET @attendee_name_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'event_registrations'
      AND COLUMN_NAME = 'attendee_name'
);
SET @attendee_name_migration = IF(
    @attendee_name_exists = 0,
    'ALTER TABLE event_registrations ADD COLUMN attendee_name VARCHAR(100) NULL',
    'SELECT 1'
);
PREPARE attendee_name_statement FROM @attendee_name_migration;
EXECUTE attendee_name_statement;
DEALLOCATE PREPARE attendee_name_statement;

SET @attendee_email_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'event_registrations'
      AND COLUMN_NAME = 'attendee_email'
);
SET @attendee_email_migration = IF(
    @attendee_email_exists = 0,
    'ALTER TABLE event_registrations ADD COLUMN attendee_email VARCHAR(254) NULL',
    'SELECT 1'
);
PREPARE attendee_email_statement FROM @attendee_email_migration;
EXECUTE attendee_email_statement;
DEALLOCATE PREPARE attendee_email_statement;

SET @phone_number_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'event_registrations'
      AND COLUMN_NAME = 'phone_number'
);
SET @phone_number_migration = IF(
    @phone_number_exists = 0,
    'ALTER TABLE event_registrations ADD COLUMN phone_number VARCHAR(20) NULL',
    'SELECT 1'
);
PREPARE phone_number_statement FROM @phone_number_migration;
EXECUTE phone_number_statement;
DEALLOCATE PREPARE phone_number_statement;

SET @college_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'event_registrations'
      AND COLUMN_NAME = 'college'
);
SET @college_migration = IF(
    @college_exists = 0,
    'ALTER TABLE event_registrations ADD COLUMN college VARCHAR(150) NULL',
    'SELECT 1'
);
PREPARE college_statement FROM @college_migration;
EXECUTE college_statement;
DEALLOCATE PREPARE college_statement;

SET @department_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'event_registrations'
      AND COLUMN_NAME = 'department'
);
SET @department_migration = IF(
    @department_exists = 0,
    'ALTER TABLE event_registrations ADD COLUMN department VARCHAR(100) NULL',
    'SELECT 1'
);
PREPARE department_statement FROM @department_migration;
EXECUTE department_statement;
DEALLOCATE PREPARE department_statement;