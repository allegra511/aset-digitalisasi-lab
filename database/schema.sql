SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS maintenance_consumables;
DROP TABLE IF EXISTS maintenance_logs;
DROP TABLE IF EXISTS consumable_stock_transactions;
DROP TABLE IF EXISTS consumables;
DROP TABLE IF EXISTS asset_replacements;
DROP TABLE IF EXISTS asset_status_histories;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS receiving_records;
DROP TABLE IF EXISTS procurement_items;
DROP TABLE IF EXISTS procurement_drafts;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  label VARCHAR(120) NOT NULL,
  description TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  username VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(40) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role_id (role_id),
  KEY idx_users_is_active (is_active),
  CONSTRAINT fk_users_role_id FOREIGN KEY (role_id) REFERENCES roles (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rooms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(60) NOT NULL,
  name VARCHAR(150) NOT NULL,
  location VARCHAR(190) NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rooms_code (code),
  KEY idx_rooms_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE procurement_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  year SMALLINT UNSIGNED NOT NULL,
  title VARCHAR(190) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  is_locked TINYINT(1) NOT NULL DEFAULT 0,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  submitted_at DATETIME NULL,
  finalized_by_user_id BIGINT UNSIGNED NULL,
  finalized_at DATETIME NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_procurement_drafts_year (year),
  KEY idx_procurement_drafts_status (status),
  KEY idx_procurement_drafts_creator (created_by_user_id),
  KEY idx_procurement_drafts_finalizer (finalized_by_user_id),
  CONSTRAINT fk_procurement_drafts_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_procurement_drafts_finalized_by FOREIGN KEY (finalized_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE procurement_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  draft_id BIGINT UNSIGNED NOT NULL,
  item_type VARCHAR(40) NOT NULL,
  name VARCHAR(190) NOT NULL,
  specification TEXT NULL,
  quantity_requested INT UNSIGNED NOT NULL,
  quantity_approved INT UNSIGNED NULL,
  estimated_unit_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  final_unit_price DECIMAL(15,2) NULL,
  room_id BIGINT UNSIGNED NULL,
  reference_link VARCHAR(500) NULL,
  notes TEXT NULL,
  replacement_candidate_asset_id BIGINT UNSIGNED NULL,
  review_status VARCHAR(40) NOT NULL DEFAULT 'draft',
  review_note TEXT NULL,
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  receiving_status VARCHAR(40) NOT NULL DEFAULT 'not_received',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_procurement_items_draft_id (draft_id),
  KEY idx_procurement_items_type (item_type),
  KEY idx_procurement_items_review_status (review_status),
  KEY idx_procurement_items_receiving_status (receiving_status),
  KEY idx_procurement_items_room_id (room_id),
  KEY idx_procurement_items_reviewed_by (reviewed_by_user_id),
  KEY idx_procurement_items_replacement_candidate (replacement_candidate_asset_id),
  CONSTRAINT fk_procurement_items_draft_id FOREIGN KEY (draft_id) REFERENCES procurement_drafts (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_procurement_items_room_id FOREIGN KEY (room_id) REFERENCES rooms (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_procurement_items_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE receiving_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  procurement_item_id BIGINT UNSIGNED NOT NULL,
  received_quantity INT UNSIGNED NOT NULL,
  received_date DATE NOT NULL,
  receiver_user_id BIGINT UNSIGNED NOT NULL,
  supplier_name VARCHAR(190) NULL,
  purchase_reference VARCHAR(190) NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_receiving_records_item_id (procurement_item_id),
  KEY idx_receiving_records_receiver (receiver_user_id),
  KEY idx_receiving_records_date (received_date),
  CONSTRAINT fk_receiving_records_item_id FOREIGN KEY (procurement_item_id) REFERENCES procurement_items (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_receiving_records_receiver FOREIGN KEY (receiver_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  procurement_item_id BIGINT UNSIGNED NULL,
  receiving_record_id BIGINT UNSIGNED NULL,
  room_id BIGINT UNSIGNED NULL,
  inventory_number VARCHAR(120) NOT NULL,
  name VARCHAR(190) NOT NULL,
  specification TEXT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'active',
  asset_condition VARCHAR(40) NOT NULL DEFAULT 'good',
  acquisition_date DATE NULL,
  photo_path VARCHAR(500) NULL,
  qr_code_path VARCHAR(500) NULL,
  deleted_at DATETIME NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assets_inventory_number (inventory_number),
  KEY idx_assets_procurement_item_id (procurement_item_id),
  KEY idx_assets_receiving_record_id (receiving_record_id),
  KEY idx_assets_room_id (room_id),
  KEY idx_assets_status (status),
  KEY idx_assets_condition (asset_condition),
  KEY idx_assets_created_by (created_by_user_id),
  CONSTRAINT fk_assets_procurement_item_id FOREIGN KEY (procurement_item_id) REFERENCES procurement_items (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_assets_receiving_record_id FOREIGN KEY (receiving_record_id) REFERENCES receiving_records (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_assets_room_id FOREIGN KEY (room_id) REFERENCES rooms (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_assets_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE procurement_items
  ADD CONSTRAINT fk_procurement_items_replacement_candidate FOREIGN KEY (replacement_candidate_asset_id) REFERENCES assets (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL;

CREATE TABLE asset_status_histories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id BIGINT UNSIGNED NOT NULL,
  previous_status VARCHAR(40) NULL,
  new_status VARCHAR(40) NOT NULL,
  previous_condition VARCHAR(40) NULL,
  new_condition VARCHAR(40) NULL,
  changed_by_user_id BIGINT UNSIGNED NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_asset_status_histories_asset_id (asset_id),
  KEY idx_asset_status_histories_new_status (new_status),
  KEY idx_asset_status_histories_changed_by (changed_by_user_id),
  CONSTRAINT fk_asset_status_histories_asset_id FOREIGN KEY (asset_id) REFERENCES assets (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_asset_status_histories_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE asset_replacements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  old_asset_id BIGINT UNSIGNED NOT NULL,
  new_asset_id BIGINT UNSIGNED NOT NULL,
  reason TEXT NULL,
  replacement_date DATE NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_asset_replacements_pair (old_asset_id, new_asset_id),
  KEY idx_asset_replacements_old_asset (old_asset_id),
  KEY idx_asset_replacements_new_asset (new_asset_id),
  KEY idx_asset_replacements_created_by (created_by_user_id),
  CONSTRAINT fk_asset_replacements_old_asset FOREIGN KEY (old_asset_id) REFERENCES assets (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_asset_replacements_new_asset FOREIGN KEY (new_asset_id) REFERENCES assets (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_asset_replacements_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE consumables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  procurement_item_id BIGINT UNSIGNED NULL,
  room_id BIGINT UNSIGNED NULL,
  name VARCHAR(190) NOT NULL,
  specification TEXT NULL,
  unit VARCHAR(40) NOT NULL DEFAULT 'unit',
  current_stock INT UNSIGNED NOT NULL DEFAULT 0,
  minimum_stock INT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'available',
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_consumables_procurement_item_id (procurement_item_id),
  KEY idx_consumables_room_id (room_id),
  KEY idx_consumables_name (name),
  KEY idx_consumables_status (status),
  KEY idx_consumables_current_stock (current_stock),
  KEY idx_consumables_minimum_stock (minimum_stock),
  KEY idx_consumables_created_by (created_by_user_id),
  CONSTRAINT fk_consumables_procurement_item_id FOREIGN KEY (procurement_item_id) REFERENCES procurement_items (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_consumables_room_id FOREIGN KEY (room_id) REFERENCES rooms (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_consumables_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE consumable_stock_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  consumable_id BIGINT UNSIGNED NOT NULL,
  transaction_type VARCHAR(40) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  stock_before INT UNSIGNED NOT NULL,
  stock_after INT UNSIGNED NOT NULL,
  source_type VARCHAR(80) NULL,
  source_id BIGINT UNSIGNED NULL,
  transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stock_transactions_consumable_id (consumable_id),
  KEY idx_stock_transactions_type (transaction_type),
  KEY idx_stock_transactions_date (transaction_date),
  KEY idx_stock_transactions_source (source_type, source_id),
  KEY idx_stock_transactions_created_by (created_by_user_id),
  CONSTRAINT fk_stock_transactions_consumable_id FOREIGN KEY (consumable_id) REFERENCES consumables (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_stock_transactions_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE maintenance_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id BIGINT UNSIGNED NOT NULL,
  maintenance_date DATE NOT NULL,
  description TEXT NOT NULL,
  condition_before VARCHAR(40) NULL,
  condition_after VARCHAR(40) NULL,
  status_after VARCHAR(40) NULL,
  cost DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  performed_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_maintenance_logs_asset_id (asset_id),
  KEY idx_maintenance_logs_date (maintenance_date),
  KEY idx_maintenance_logs_performed_by (performed_by_user_id),
  CONSTRAINT fk_maintenance_logs_asset_id FOREIGN KEY (asset_id) REFERENCES assets (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_maintenance_logs_performed_by FOREIGN KEY (performed_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE maintenance_consumables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  maintenance_log_id BIGINT UNSIGNED NOT NULL,
  consumable_id BIGINT UNSIGNED NOT NULL,
  quantity_used INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_maintenance_consumables_pair (maintenance_log_id, consumable_id),
  KEY idx_maintenance_consumables_log_id (maintenance_log_id),
  KEY idx_maintenance_consumables_consumable_id (consumable_id),
  CONSTRAINT fk_maintenance_consumables_log_id FOREIGN KEY (maintenance_log_id) REFERENCES maintenance_logs (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_maintenance_consumables_consumable_id FOREIGN KEY (consumable_id) REFERENCES consumables (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  uploaded_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attachments_entity (entity_type, entity_id),
  KEY idx_attachments_uploaded_by (uploaded_by_user_id),
  CONSTRAINT fk_attachments_uploaded_by FOREIGN KEY (uploaded_by_user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(120) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  before_data JSON NULL,
  after_data JSON NULL,
  ip_address VARCHAR(80) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_user_id (user_id),
  KEY idx_audit_logs_action (action),
  KEY idx_audit_logs_entity (entity, entity_id),
  KEY idx_audit_logs_created_at (created_at),
  CONSTRAINT fk_audit_logs_user_id FOREIGN KEY (user_id) REFERENCES users (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
