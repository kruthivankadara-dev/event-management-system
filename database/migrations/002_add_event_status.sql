USE event_management_system;

SET @event_status_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'events'
      AND COLUMN_NAME = 'status'
);

SET @event_status_migration = IF(
    @event_status_exists = 0,
    'ALTER TABLE events ADD COLUMN status ENUM(''SCHEDULED'', ''CANCELLED'') NOT NULL DEFAULT ''SCHEDULED''',
    'SELECT 1'
);

PREPARE event_status_statement FROM @event_status_migration;
EXECUTE event_status_statement;
DEALLOCATE PREPARE event_status_statement;
