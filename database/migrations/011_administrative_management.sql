
USE event_management_system;

-- =====================================================
-- EMS-F-016: Administrative Management
-- =====================================================

-- 1. User account status
SET @account_status_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'account_status'
);

SET @account_status_migration = IF(
    @account_status_exists = 0,
    'ALTER TABLE users ADD COLUMN account_status ENUM(''ACTIVE'', ''INACTIVE'') NOT NULL DEFAULT ''ACTIVE''',
    'SELECT 1'
);

PREPARE account_status_statement FROM @account_status_migration;
EXECUTE account_status_statement;
DEALLOCATE PREPARE account_status_statement;


-- 2. Managed venues
CREATE TABLE IF NOT EXISTS event_venues (
    venue_id CHAR(36) NOT NULL,
    venue_name VARCHAR(255) NOT NULL,
    address VARCHAR(500) NULL,
    description VARCHAR(1000) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (venue_id),
    UNIQUE KEY uq_event_venues_name (venue_name)
) ENGINE=InnoDB;


-- 3. Managed event categories
CREATE TABLE IF NOT EXISTS event_categories (
    category_id CHAR(36) NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    description VARCHAR(500) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (category_id),
    UNIQUE KEY uq_event_categories_name (category_name)
) ENGINE=InnoDB;


-- 4. System configuration
CREATE TABLE IF NOT EXISTS system_configurations (
    config_key VARCHAR(100) NOT NULL,
    config_value JSON NOT NULL,
    description VARCHAR(500) NULL,
    updated_by CHAR(36) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (config_key),
    CONSTRAINT fk_system_configurations_user
        FOREIGN KEY (updated_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL
) ENGINE=InnoDB;


-- 5. Administrative audit logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    audit_id CHAR(36) NOT NULL,
    admin_id CHAR(36) NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100) NULL,
    old_values JSON NULL,
    new_values JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (audit_id),
    INDEX idx_admin_audit_admin (admin_id),
    INDEX idx_admin_audit_entity (entity_type, entity_id),
    INDEX idx_admin_audit_created (created_at),
    CONSTRAINT fk_admin_audit_user
        FOREIGN KEY (admin_id)
        REFERENCES users(user_id)
        ON DELETE SET NULL
) ENGINE=InnoDB;
