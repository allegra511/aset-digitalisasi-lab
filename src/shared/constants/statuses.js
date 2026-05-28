const DRAFT_STATUSES = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  FINALIZED: 'finalized',
};

const PROCUREMENT_ITEM_STATUSES = {
  DRAFT: 'draft',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const RECEIVING_STATUSES = {
  NOT_RECEIVED: 'not_received',
  PARTIALLY_RECEIVED: 'partially_received',
  FULLY_RECEIVED: 'fully_received',
};

const ASSET_STATUSES = {
  ACTIVE: 'active',
  MAINTENANCE: 'maintenance',
  DAMAGED: 'damaged',
  REPLACED: 'replaced',
  DELETED: 'deleted',
};

const CONSUMABLE_STATUSES = {
  AVAILABLE: 'available',
  LOW_STOCK: 'low_stock',
  OUT_OF_STOCK: 'out_of_stock',
};

module.exports = {
  DRAFT_STATUSES,
  PROCUREMENT_ITEM_STATUSES,
  RECEIVING_STATUSES,
  ASSET_STATUSES,
  CONSUMABLE_STATUSES,
};
