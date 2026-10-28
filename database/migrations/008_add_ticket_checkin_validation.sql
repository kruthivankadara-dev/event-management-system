USE event_management_system;

SET @ticket_status_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'event_tickets'
      AND COLUMN_NAME = 'ticket_status'
);
SET @ticket_status_migration = IF(
    @ticket_status_exists = 0,
    'ALTER TABLE event_tickets ADD COLUMN ticket_status ENUM(''ACTIVE'', ''REVOKED'') NOT NULL DEFAULT ''ACTIVE'' AFTER registration_id',
    'SELECT 1'
);
PREPARE ticket_status_statement FROM @ticket_status_migration;
EXECUTE ticket_status_statement;
DEALLOCATE PREPARE ticket_status_statement;

SET @checked_in_by_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'event_tickets'
      AND COLUMN_NAME = 'checked_in_by'
);
SET @checked_in_by_migration = IF(
    @checked_in_by_exists = 0,
    'ALTER TABLE event_tickets ADD COLUMN checked_in_by CHAR(36) NULL DEFAULT NULL AFTER checked_in_at',
    'SELECT 1'
);
PREPARE checked_in_by_statement FROM @checked_in_by_migration;
EXECUTE checked_in_by_statement;
DEALLOCATE PREPARE checked_in_by_statement;

SET @checked_in_by_fk_exists = (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'event_tickets'
      AND CONSTRAINT_NAME = 'fk_event_tickets_checked_in_by'
);
SET @checked_in_by_fk_migration = IF(
    @checked_in_by_fk_exists = 0,
    'ALTER TABLE event_tickets ADD CONSTRAINT fk_event_tickets_checked_in_by FOREIGN KEY (checked_in_by) REFERENCES users(user_id) ON DELETE SET NULL',
    'SELECT 1'
);
PREPARE checked_in_by_fk_statement FROM @checked_in_by_fk_migration;
EXECUTE checked_in_by_fk_statement;
DEALLOCATE PREPARE checked_in_by_fk_statement;
