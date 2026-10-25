USE event_management_system;

SET @event_registration_url_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'events'
      AND COLUMN_NAME = 'registration_url'
);

SET @event_registration_url_migration = IF(
    @event_registration_url_exists = 0,
    'ALTER TABLE events ADD COLUMN registration_url VARCHAR(2048) NULL',
    'SELECT 1'
);

PREPARE event_registration_url_statement FROM @event_registration_url_migration;
EXECUTE event_registration_url_statement;
DEALLOCATE PREPARE event_registration_url_statement;
