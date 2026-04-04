import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { AuthenticatedUser } from '../types/fastify.js';
import type { DbExecutor } from '../utils/db.js';
import { withTransaction } from '../utils/db.js';
import { areTemperatureBandsCompatible } from '../domain/temperature-band.js';
import { AccessControlService } from './access-control.service.js';

const inventoryError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

type MoveInventoryInput = {
  lotId: string;
  sourceBinId: string;
  targetBinId: string;
  quantity: number;
  user: AuthenticatedUser;
};

type ReceiveInventoryInput = {
  itemId: string;
  warehouseId: string;
  binId: string;
  lotCode: string;
  quantity: number;
  expirationDate?: string;
  documentId?: string;
  user: AuthenticatedUser;
};

type TransferInventoryInput = {
  sourceLotId: string;
  sourceBinId: string;
  targetWarehouseId: string;
  targetBinId: string;
  quantity: number;
  lotCode: string;
  expirationDate?: string;
  documentId?: string;
  user: AuthenticatedUser;
};

type PickInventoryInput = {
  lotId: string;
  binId: string;
  quantity: number;
  user: AuthenticatedUser;
  documentId?: string;
};

type InventoryScanItemSummary = {
  item_id: string;
  item_name: string;
  sku: string;
  barcode: string | null;
  temperature_band: string;
  weight_lbs: string;
  length_in: string;
  width_in: string;
  height_in: string;
};

type InventoryScanWarehouseOption = {
  warehouse_id: string;
  warehouse_name: string;
};

export type InventoryScanLotMatch = InventoryScanItemSummary & {
  lot_id: string;
  lot_code: string;
  quantity_on_hand: string;
  warehouse_id: string;
  warehouse_name: string;
  bin_id: string;
  bin_code: string;
  bin_quantity: string;
};

export type InventoryScanResult =
  | {
    kind: 'no_match';
    code: string;
    message: string;
  }
  | {
    kind: 'item_only';
    code: string;
    item: InventoryScanItemSummary;
    receiving_warehouses: InventoryScanWarehouseOption[];
  }
  | {
    kind: 'single_position';
    code: string;
    match: InventoryScanLotMatch;
  }
  | {
    kind: 'multiple_positions';
    code: string;
    matches: InventoryScanLotMatch[];
  };

export class InventoryService {
  private readonly accessControl: AccessControlService;

  constructor(private readonly fastify: FastifyInstance) {
    this.accessControl = new AccessControlService(fastify);
  }

  private assertPositiveQuantity(quantity: number) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw inventoryError(422, 'Quantity must be greater than zero');
    }
  }

  private async runInTransaction<T>(handler: (client: PoolClient) => Promise<T>) {
    return withTransaction(this.fastify.db, handler);
  }

  private getScopedWarehouseIds(user: AuthenticatedUser) {
    if (this.accessControl.hasGlobalWarehouseAccess(user)) {
      return null;
    }

    return [...new Set(user.assignedWarehouseIds.map((warehouseId) => String(warehouseId).trim()).filter(Boolean))];
  }

  private async listVisibleScanMatches(code: string, user: AuthenticatedUser) {
    const scopedWarehouseIds = this.getScopedWarehouseIds(user);
    // Barcode existence is checked via EXISTS so one logical lot/bin position is never multiplied by barcode cardinality.
    const result = await this.fastify.db.query<InventoryScanLotMatch>(
      `
        SELECT
          i.id AS item_id,
          i.name AS item_name,
          i.sku,
          i.temperature_band,
          i.weight_lbs::text,
          i.length_in::text,
          i.width_in::text,
          i.height_in::text,
          barcode_rollup.display_barcode AS barcode,
          l.id AS lot_id,
          l.lot_code,
          l.quantity_on_hand::text,
          w.id AS warehouse_id,
          w.name AS warehouse_name,
          bin.id AS bin_id,
          bin.code AS bin_code,
          ip.quantity::text AS bin_quantity
        FROM lots l
        JOIN items i ON i.id = l.item_id
        JOIN warehouses w ON w.id = l.warehouse_id AND w.deleted_at IS NULL
        JOIN inventory_positions ip ON ip.lot_id = l.id AND ip.quantity > 0
        JOIN bins bin ON bin.id = ip.bin_id AND bin.deleted_at IS NULL
        LEFT JOIN LATERAL (
          SELECT MIN(b.barcode) AS display_barcode
          FROM barcodes b
          WHERE b.item_id = i.id
        ) barcode_rollup ON TRUE
        WHERE i.deleted_at IS NULL
          AND (
            i.sku = $1
            OR l.lot_code = $1
            OR EXISTS (
              SELECT 1
              FROM barcodes barcode_filter
              WHERE barcode_filter.item_id = i.id
                AND barcode_filter.barcode = $1
            )
          )
          AND ($2::uuid[] IS NULL OR w.id = ANY($2::uuid[]))
        ORDER BY w.name ASC, l.lot_code ASC, bin.code ASC, l.id ASC, bin.id ASC
      `,
      [code, scopedWarehouseIds]
    );

    return result.rows;
  }

  private async findItemOnlyScanCandidate(code: string, user: AuthenticatedUser) {
    const allowedDepartmentIds = await this.accessControl.getAllowedDepartmentIds(user);
    // Keep item-only identity stable for SKU scans even when an item has multiple barcodes.
    const itemResult = await this.fastify.db.query<InventoryScanItemSummary & { department_id: string }>(
      `
        SELECT
          i.id AS item_id,
          i.name AS item_name,
          i.sku,
          i.temperature_band,
          i.weight_lbs::text,
          i.length_in::text,
          i.width_in::text,
          i.height_in::text,
          barcode_rollup.display_barcode AS barcode,
          i.department_id::text AS department_id
        FROM items i
        LEFT JOIN LATERAL (
          SELECT MIN(b.barcode) AS display_barcode
          FROM barcodes b
          WHERE b.item_id = i.id
        ) barcode_rollup ON TRUE
        WHERE i.deleted_at IS NULL
          AND (
            i.sku = $1
            OR EXISTS (
              SELECT 1
              FROM barcodes barcode_filter
              WHERE barcode_filter.item_id = i.id
                AND barcode_filter.barcode = $1
            )
          )
          AND ($2::uuid[] IS NULL OR i.department_id = ANY($2::uuid[]))
      `,
      [code, allowedDepartmentIds]
    );

    if (!itemResult.rowCount) {
      return null;
    }

    const item = itemResult.rows[0];
    const scopedWarehouseIds = this.getScopedWarehouseIds(user);
    const warehouseResult = await this.fastify.db.query<InventoryScanWarehouseOption>(
      `
        SELECT w.id AS warehouse_id, w.name AS warehouse_name
        FROM warehouses w
        WHERE w.deleted_at IS NULL
          AND w.is_active = TRUE
          AND w.department_id = $1
          AND ($2::uuid[] IS NULL OR w.id = ANY($2::uuid[]))
        ORDER BY w.name ASC, w.id ASC
      `,
      [item.department_id, scopedWarehouseIds]
    );

    if (!warehouseResult.rowCount) {
      return null;
    }

    const { department_id: _ignoredDepartmentId, ...itemSummary } = item;
    return {
      item: itemSummary,
      receivingWarehouses: warehouseResult.rows
    };
  }

  async lookupScan(code: string, user: AuthenticatedUser): Promise<InventoryScanResult> {
    const normalizedCode = String(code).trim();
    const matches = await this.listVisibleScanMatches(normalizedCode, user);
    if (matches.length === 1) {
      return {
        kind: 'single_position',
        code: normalizedCode,
        match: matches[0]
      };
    }

    if (matches.length > 1) {
      return {
        kind: 'multiple_positions',
        code: normalizedCode,
        matches
      };
    }

    const itemOnlyCandidate = await this.findItemOnlyScanCandidate(normalizedCode, user);
    if (itemOnlyCandidate) {
      return {
        kind: 'item_only',
        code: normalizedCode,
        item: itemOnlyCandidate.item,
        receiving_warehouses: itemOnlyCandidate.receivingWarehouses
      };
    }

    return {
      kind: 'no_match',
      code: normalizedCode,
      message: 'No matching item or lot found'
    };
  }

  async moveInventory(input: MoveInventoryInput) {
    return this.runInTransaction((client) => this.moveInventoryInTransaction(client, input));
  }

  async moveInventoryInTransaction(db: DbExecutor, input: MoveInventoryInput) {
    this.assertPositiveQuantity(Number(input.quantity));
    const result = await db.query<{
      lot_id: string;
      warehouse_id: string;
      item_id: string;
      temperature_band: string;
      weight_lbs: string;
      length_in: string;
      width_in: string;
      height_in: string;
      source_quantity: string;
      target_active: boolean;
      target_temperature_band: string;
      max_load_lbs: string;
      max_length_in: string;
      max_width_in: string;
      max_height_in: string;
      current_load_lbs: string;
      target_warehouse_id: string;
    }>(
      `
        SELECT
          l.id AS lot_id,
          l.warehouse_id,
          i.id AS item_id,
          i.temperature_band,
          i.weight_lbs::text,
          i.length_in::text,
          i.width_in::text,
          i.height_in::text,
          src.quantity::text AS source_quantity,
          target.is_active AS target_active,
          target.temperature_band AS target_temperature_band,
          target.max_load_lbs::text,
          target.max_length_in::text,
          target.max_width_in::text,
          target.max_height_in::text,
          COALESCE(load.current_load_lbs, 0)::text AS current_load_lbs,
          target_zone.warehouse_id AS target_warehouse_id
        FROM lots l
        JOIN items i ON i.id = l.item_id
        JOIN inventory_positions src ON src.lot_id = l.id AND src.bin_id = $2
        JOIN bins target ON target.id = $3
        JOIN zones target_zone ON target_zone.id = target.zone_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(ip.quantity * item.weight_lbs), 0) AS current_load_lbs
          FROM inventory_positions ip
          JOIN lots lot ON lot.id = ip.lot_id
          JOIN items item ON item.id = lot.item_id
          WHERE ip.bin_id = target.id
        ) load ON TRUE
        WHERE l.id = $1
        FOR UPDATE OF l, src, target
      `,
      [input.lotId, input.sourceBinId, input.targetBinId]
    );

    if (!result.rowCount) {
      throw inventoryError(404, 'Inventory position not found');
    }

    const row = result.rows[0];
    await this.accessControl.ensureWarehouseAccess(input.user, row.warehouse_id, 'Warehouse access denied');
    if (row.target_warehouse_id !== row.warehouse_id) {
      throw inventoryError(422, 'Target bin does not belong to the same warehouse as the source lot');
    }
    if (Number(row.source_quantity) < input.quantity) {
      throw inventoryError(422, 'Insufficient source quantity');
    }
    if (!row.target_active) {
      throw inventoryError(422, 'Target bin is disabled');
    }
    if (!areTemperatureBandsCompatible(row.target_temperature_band, row.temperature_band)) {
      throw inventoryError(422, 'Temperature band mismatch');
    }
    if (
      Number(row.max_length_in) < Number(row.length_in)
      || Number(row.max_width_in) < Number(row.width_in)
      || Number(row.max_height_in) < Number(row.height_in)
    ) {
      throw inventoryError(422, 'Item dimensions exceed target bin limits');
    }
    if (Number(row.current_load_lbs) + Number(row.weight_lbs) * input.quantity > Number(row.max_load_lbs)) {
      throw inventoryError(422, 'Target bin max load exceeded');
    }

    await db.query(
      `UPDATE inventory_positions SET quantity = quantity - $3 WHERE lot_id = $1 AND bin_id = $2`,
      [input.lotId, input.sourceBinId, input.quantity]
    );
    await db.query(
      `
        INSERT INTO inventory_positions (lot_id, bin_id, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (lot_id, bin_id)
        DO UPDATE SET quantity = inventory_positions.quantity + EXCLUDED.quantity
      `,
      [input.lotId, input.targetBinId, input.quantity]
    );
    await db.query(
      `DELETE FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2 AND quantity <= 0`,
      [input.lotId, input.sourceBinId]
    );
    await db.query(
      `
        INSERT INTO inventory_transactions (warehouse_id, item_id, lot_id, source_bin_id, target_bin_id, transaction_type, quantity, created_by)
        VALUES ($1, $2, $3, $4, $5, 'move', $6, $7)
      `,
      [row.warehouse_id, row.item_id, input.lotId, input.sourceBinId, input.targetBinId, input.quantity, input.user.id]
    );
  }

  async receiveInventory(input: ReceiveInventoryInput) {
    return this.runInTransaction((client) => this.receiveInventoryInTransaction(client, input));
  }

  async receiveInventoryInTransaction(db: DbExecutor, input: ReceiveInventoryInput) {
    this.assertPositiveQuantity(Number(input.quantity));
    await this.accessControl.ensureWarehouseAccess(input.user, input.warehouseId, 'Warehouse access denied');

    const result = await db.query<{
      item_id: string;
      temperature_band: string;
      weight_lbs: string;
      length_in: string;
      width_in: string;
      height_in: string;
      bin_id: string;
      is_active: boolean;
      bin_temperature_band: string;
      max_load_lbs: string;
      max_length_in: string;
      max_width_in: string;
      max_height_in: string;
      warehouse_id: string;
      current_load_lbs: string;
    }>(
      `
        SELECT
          i.id AS item_id,
          i.temperature_band,
          i.weight_lbs::text,
          i.length_in::text,
          i.width_in::text,
          i.height_in::text,
          b.id AS bin_id,
          b.is_active,
          b.temperature_band AS bin_temperature_band,
          b.max_load_lbs::text,
          b.max_length_in::text,
          b.max_width_in::text,
          b.max_height_in::text,
          z.warehouse_id,
          COALESCE(load.current_load_lbs, 0)::text AS current_load_lbs
        FROM items i
        JOIN bins b ON b.id = $2
        JOIN zones z ON z.id = b.zone_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(ip.quantity * item.weight_lbs), 0) AS current_load_lbs
          FROM inventory_positions ip
          JOIN lots lot ON lot.id = ip.lot_id
          JOIN items item ON item.id = lot.item_id
          WHERE ip.bin_id = b.id
        ) load ON TRUE
        WHERE i.id = $1
          AND i.deleted_at IS NULL
        FOR UPDATE OF b
      `,
      [input.itemId, input.binId]
    );

    if (!result.rowCount) {
      throw inventoryError(404, 'Item or bin not found');
    }

    const row = result.rows[0];
    if (row.warehouse_id !== input.warehouseId) {
      throw inventoryError(422, 'Selected bin does not belong to the target warehouse');
    }
    if (!row.is_active) {
      throw inventoryError(422, 'Target bin is disabled');
    }
    if (!areTemperatureBandsCompatible(row.bin_temperature_band, row.temperature_band)) {
      throw inventoryError(422, 'Temperature band mismatch');
    }
    if (
      Number(row.max_length_in) < Number(row.length_in)
      || Number(row.max_width_in) < Number(row.width_in)
      || Number(row.max_height_in) < Number(row.height_in)
    ) {
      throw inventoryError(422, 'Item dimensions exceed target bin limits');
    }
    if (Number(row.current_load_lbs) + Number(row.weight_lbs) * input.quantity > Number(row.max_load_lbs)) {
      throw inventoryError(422, 'Target bin max load exceeded');
    }

    if (input.documentId) {
      const documentResult = await db.query<{ warehouse_id: string; type: string }>(
        `SELECT warehouse_id, type FROM documents WHERE id = $1`,
        [input.documentId]
      );

      if (!documentResult.rowCount) {
        throw inventoryError(404, 'Receiving document not found');
      }

      const document = documentResult.rows[0];
      if (document.warehouse_id !== input.warehouseId || document.type !== 'receiving') {
        throw inventoryError(422, 'Receiving document does not match the selected warehouse');
      }
    }

    const lotResult = await db.query<{ id: string }>(
      `
        INSERT INTO lots (item_id, warehouse_id, lot_code, expiration_date, quantity_on_hand, received_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (item_id, warehouse_id, lot_code)
        DO UPDATE SET
          expiration_date = COALESCE(EXCLUDED.expiration_date, lots.expiration_date),
          quantity_on_hand = lots.quantity_on_hand + EXCLUDED.quantity_on_hand
        RETURNING id
      `,
      [input.itemId, input.warehouseId, input.lotCode, input.expirationDate ?? null, input.quantity]
    );

    const lotId = lotResult.rows[0].id;

    await db.query(
      `
        INSERT INTO inventory_positions (lot_id, bin_id, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (lot_id, bin_id)
        DO UPDATE SET quantity = inventory_positions.quantity + EXCLUDED.quantity
      `,
      [lotId, input.binId, input.quantity]
    );

    await db.query(
      `
        INSERT INTO inventory_transactions (warehouse_id, item_id, lot_id, target_bin_id, document_id, transaction_type, quantity, created_by)
        VALUES ($1, $2, $3, $4, $5, 'receive', $6, $7)
      `,
      [input.warehouseId, input.itemId, lotId, input.binId, input.documentId ?? null, input.quantity, input.user.id]
    );

    return { lotId };
  }

  async transferInventory(input: TransferInventoryInput) {
    return this.runInTransaction((client) => this.transferInventoryInTransaction(client, input));
  }

  async transferInventoryInTransaction(db: DbExecutor, input: TransferInventoryInput) {
    this.assertPositiveQuantity(Number(input.quantity));
    const result = await db.query<{
      source_lot_id: string;
      source_warehouse_id: string;
      item_id: string;
      temperature_band: string;
      weight_lbs: string;
      length_in: string;
      width_in: string;
      height_in: string;
      source_quantity: string;
      target_active: boolean;
      target_temperature_band: string;
      max_load_lbs: string;
      max_length_in: string;
      max_width_in: string;
      max_height_in: string;
      target_warehouse_id: string;
      current_load_lbs: string;
    }>(
      `
        SELECT
          source_lot.id AS source_lot_id,
          source_lot.warehouse_id AS source_warehouse_id,
          source_lot.item_id,
          item.temperature_band,
          item.weight_lbs::text,
          item.length_in::text,
          item.width_in::text,
          item.height_in::text,
          source_position.quantity::text AS source_quantity,
          target_bin.is_active AS target_active,
          target_bin.temperature_band AS target_temperature_band,
          target_bin.max_load_lbs::text,
          target_bin.max_length_in::text,
          target_bin.max_width_in::text,
          target_bin.max_height_in::text,
          target_zone.warehouse_id AS target_warehouse_id,
          COALESCE(load.current_load_lbs, 0)::text AS current_load_lbs
        FROM lots source_lot
        JOIN items item ON item.id = source_lot.item_id
        JOIN inventory_positions source_position ON source_position.lot_id = source_lot.id AND source_position.bin_id = $2
        JOIN bins target_bin ON target_bin.id = $3
        JOIN zones target_zone ON target_zone.id = target_bin.zone_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(ip.quantity * inventory_item.weight_lbs), 0) AS current_load_lbs
          FROM inventory_positions ip
          JOIN lots inventory_lot ON inventory_lot.id = ip.lot_id
          JOIN items inventory_item ON inventory_item.id = inventory_lot.item_id
          WHERE ip.bin_id = target_bin.id
        ) load ON TRUE
        WHERE source_lot.id = $1
        FOR UPDATE OF source_lot, source_position, target_bin
      `,
      [input.sourceLotId, input.sourceBinId, input.targetBinId]
    );

    if (!result.rowCount) {
      throw inventoryError(404, 'Transfer source inventory position not found');
    }

    const row = result.rows[0];
    await this.accessControl.ensureWarehouseAccess(input.user, row.source_warehouse_id, 'Warehouse access denied');
    await this.accessControl.ensureWarehouseAccess(input.user, row.target_warehouse_id, 'Warehouse access denied');
    if (row.target_warehouse_id !== input.targetWarehouseId) {
      throw inventoryError(422, 'Target bin does not belong to the destination warehouse');
    }
    if (row.target_warehouse_id === row.source_warehouse_id) {
      throw inventoryError(422, 'Transfer destination must differ from the source warehouse');
    }
    if (Number(row.source_quantity) < input.quantity) {
      throw inventoryError(422, 'Insufficient source quantity');
    }
    if (!row.target_active) {
      throw inventoryError(422, 'Target bin is disabled');
    }
    if (!areTemperatureBandsCompatible(row.target_temperature_band, row.temperature_band)) {
      throw inventoryError(422, 'Temperature band mismatch');
    }
    if (
      Number(row.max_length_in) < Number(row.length_in)
      || Number(row.max_width_in) < Number(row.width_in)
      || Number(row.max_height_in) < Number(row.height_in)
    ) {
      throw inventoryError(422, 'Item dimensions exceed target bin limits');
    }
    if (Number(row.current_load_lbs) + Number(row.weight_lbs) * input.quantity > Number(row.max_load_lbs)) {
      throw inventoryError(422, 'Target bin max load exceeded');
    }

    if (input.documentId) {
      const documentResult = await db.query<{ warehouse_id: string; type: string }>(
        `SELECT warehouse_id, type FROM documents WHERE id = $1`,
        [input.documentId]
      );

      if (!documentResult.rowCount) {
        throw inventoryError(404, 'Transfer document not found');
      }

      const document = documentResult.rows[0];
      if (document.warehouse_id !== row.source_warehouse_id || document.type !== 'transfer') {
        throw inventoryError(422, 'Transfer document does not match the selected source warehouse');
      }
    }

    await db.query(
      `UPDATE inventory_positions SET quantity = quantity - $3 WHERE lot_id = $1 AND bin_id = $2`,
      [input.sourceLotId, input.sourceBinId, input.quantity]
    );
    await db.query(
      `UPDATE lots SET quantity_on_hand = quantity_on_hand - $2 WHERE id = $1`,
      [input.sourceLotId, input.quantity]
    );
    await db.query(
      `DELETE FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2 AND quantity <= 0`,
      [input.sourceLotId, input.sourceBinId]
    );

    const targetLotResult = await db.query<{ id: string }>(
      `
        INSERT INTO lots (item_id, warehouse_id, lot_code, expiration_date, quantity_on_hand, received_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (item_id, warehouse_id, lot_code)
        DO UPDATE SET
          expiration_date = COALESCE(EXCLUDED.expiration_date, lots.expiration_date),
          quantity_on_hand = lots.quantity_on_hand + EXCLUDED.quantity_on_hand
        RETURNING id
      `,
      [row.item_id, input.targetWarehouseId, input.lotCode, input.expirationDate ?? null, input.quantity]
    );

    const targetLotId = targetLotResult.rows[0].id;

    await db.query(
      `
        INSERT INTO inventory_positions (lot_id, bin_id, quantity)
        VALUES ($1, $2, $3)
        ON CONFLICT (lot_id, bin_id)
        DO UPDATE SET quantity = inventory_positions.quantity + EXCLUDED.quantity
      `,
      [targetLotId, input.targetBinId, input.quantity]
    );

    await db.query(
      `
        INSERT INTO inventory_transactions (warehouse_id, item_id, lot_id, source_bin_id, target_bin_id, document_id, transaction_type, quantity, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, 'transfer', $7, $8)
      `,
      [row.source_warehouse_id, row.item_id, input.sourceLotId, input.sourceBinId, input.targetBinId, input.documentId ?? null, input.quantity, input.user.id]
    );

    return { targetLotId };
  }

  async pickInventory(input: PickInventoryInput) {
    return this.runInTransaction((client) => this.pickInventoryInTransaction(client, input));
  }

  async pickInventoryInTransaction(db: DbExecutor, input: PickInventoryInput) {
    this.assertPositiveQuantity(Number(input.quantity));
    const result = await db.query<{
      warehouse_id: string;
      item_id: string;
      quantity: string;
    }>(
      `
        SELECT l.warehouse_id, l.item_id, ip.quantity::text AS quantity
        FROM lots l
        JOIN inventory_positions ip ON ip.lot_id = l.id AND ip.bin_id = $2
        WHERE l.id = $1
        FOR UPDATE OF l, ip
      `,
      [input.lotId, input.binId]
    );

    if (!result.rowCount) {
      throw inventoryError(404, 'Inventory position not found');
    }

    const row = result.rows[0];
    await this.accessControl.ensureWarehouseAccess(input.user, row.warehouse_id, 'Warehouse access denied');
    if (Number(row.quantity) < input.quantity) {
      throw inventoryError(422, 'Insufficient stock');
    }

    if (input.documentId) {
      const documentResult = await db.query<{ warehouse_id: string; type: string }>(
        `SELECT warehouse_id, type FROM documents WHERE id = $1`,
        [input.documentId]
      );

      if (!documentResult.rowCount) {
        throw inventoryError(404, 'Shipping document not found');
      }

      const document = documentResult.rows[0];
      if (document.warehouse_id !== row.warehouse_id || document.type !== 'shipping') {
        throw inventoryError(422, 'Shipping document does not match the selected warehouse');
      }
    }

    await db.query(
      `UPDATE inventory_positions SET quantity = quantity - $3 WHERE lot_id = $1 AND bin_id = $2`,
      [input.lotId, input.binId, input.quantity]
    );
    await db.query(
      `UPDATE lots SET quantity_on_hand = quantity_on_hand - $2 WHERE id = $1`,
      [input.lotId, input.quantity]
    );
    await db.query(
      `
        INSERT INTO inventory_transactions (warehouse_id, item_id, lot_id, source_bin_id, document_id, transaction_type, quantity, created_by)
        VALUES ($1, $2, $3, $4, $5, 'pick', $6, $7)
      `,
      [row.warehouse_id, row.item_id, input.lotId, input.binId, input.documentId ?? null, input.quantity, input.user.id]
    );
    await db.query(
      `DELETE FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2 AND quantity <= 0`,
      [input.lotId, input.binId]
    );
  }
}
