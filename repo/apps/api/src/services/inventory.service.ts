import type { FastifyInstance } from 'fastify';
import type { AuthenticatedUser } from '../types/fastify.js';
import { AccessControlService } from './access-control.service.js';

const inventoryError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

export class InventoryService {
  private readonly accessControl: AccessControlService;

  constructor(private readonly fastify: FastifyInstance) {
    this.accessControl = new AccessControlService(fastify);
  }

  private assertPositiveQuantity(quantity: number) {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw Object.assign(new Error('Quantity must be greater than zero'), { statusCode: 422 });
    }
  }

  async lookupScan(code: string, user: AuthenticatedUser) {
    const result = await this.fastify.db.query(
      `
        SELECT
          i.id AS item_id,
          i.name AS item_name,
          i.sku,
          i.temperature_band,
          i.weight_lbs,
          i.length_in,
          i.width_in,
          i.height_in,
          b.barcode,
          l.id AS lot_id,
          l.lot_code,
          l.quantity_on_hand,
          w.id AS warehouse_id,
          w.name AS warehouse_name,
          bin.id AS bin_id,
          bin.code AS bin_code,
          ip.quantity AS bin_quantity
        FROM items i
        LEFT JOIN barcodes b ON b.item_id = i.id
        LEFT JOIN lots l ON l.item_id = i.id
        LEFT JOIN warehouses w ON w.id = l.warehouse_id
        LEFT JOIN inventory_positions ip ON ip.lot_id = l.id
        LEFT JOIN bins bin ON bin.id = ip.bin_id
        WHERE (b.barcode = $1 OR l.lot_code = $1 OR i.sku = $1)
          AND i.deleted_at IS NULL
      `,
      [code]
    );

    const visible = result.rows.filter((row) => this.accessControl.canAccessWarehouse(user, row.warehouse_id));
    if (!visible.length) {
      throw inventoryError(404, 'No matching item or lot found');
    }

    return visible[0];
  }

  async moveInventory(input: { lotId: string; sourceBinId: string; targetBinId: string; quantity: number; user: AuthenticatedUser }) {
    this.assertPositiveQuantity(Number(input.quantity));
    const result = await this.fastify.db.query(
      `
        SELECT
          l.id AS lot_id,
          l.warehouse_id,
          i.id AS item_id,
          i.temperature_band,
          i.weight_lbs,
          i.length_in,
          i.width_in,
          i.height_in,
          src.quantity AS source_quantity,
          target.is_active AS target_active,
          target.temperature_band AS target_temperature_band,
          target.max_load_lbs,
          target.max_length_in,
          target.max_width_in,
          target.max_height_in,
          COALESCE(load.current_load_lbs, 0) AS current_load_lbs
        FROM lots l
        JOIN items i ON i.id = l.item_id
        JOIN inventory_positions src ON src.lot_id = l.id AND src.bin_id = $2
        JOIN bins target ON target.id = $3
        LEFT JOIN (
          SELECT ip.bin_id, COALESCE(SUM(ip.quantity * item.weight_lbs), 0) AS current_load_lbs
          FROM inventory_positions ip
          JOIN lots lot ON lot.id = ip.lot_id
          JOIN items item ON item.id = lot.item_id
          GROUP BY ip.bin_id
        ) load ON load.bin_id = target.id
        WHERE l.id = $1
      `,
      [input.lotId, input.sourceBinId, input.targetBinId]
    );

    if (!result.rowCount) {
      throw new Error('Inventory position not found');
    }

    const row = result.rows[0];
    this.accessControl.ensureWarehouseAccess(input.user, row.warehouse_id, 'Warehouse access denied');
    if (Number(row.source_quantity) < input.quantity) {
      throw new Error('Insufficient source quantity');
    }
    if (!row.target_active) {
      throw new Error('Target bin is disabled');
    }
    if (row.target_temperature_band !== row.temperature_band) {
      throw inventoryError(422, 'Temperature band mismatch');
    }
    if (Number(row.max_length_in) < Number(row.length_in) || Number(row.max_width_in) < Number(row.width_in) || Number(row.max_height_in) < Number(row.height_in)) {
      throw new Error('Item dimensions exceed target bin limits');
    }
    if (Number(row.current_load_lbs) + Number(row.weight_lbs) * input.quantity > Number(row.max_load_lbs)) {
      throw new Error('Target bin max load exceeded');
    }

    const client = await this.fastify.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE inventory_positions SET quantity = quantity - $3 WHERE lot_id = $1 AND bin_id = $2`,
        [input.lotId, input.sourceBinId, input.quantity]
      );
      await client.query(
        `
          INSERT INTO inventory_positions (lot_id, bin_id, quantity)
          VALUES ($1, $2, $3)
          ON CONFLICT (lot_id, bin_id)
          DO UPDATE SET quantity = inventory_positions.quantity + EXCLUDED.quantity
        `,
        [input.lotId, input.targetBinId, input.quantity]
      );
      await client.query(
        `
          INSERT INTO inventory_transactions (warehouse_id, item_id, lot_id, source_bin_id, target_bin_id, transaction_type, quantity, created_by)
          VALUES ($1, $2, $3, $4, $5, 'move', $6, $7)
        `,
        [row.warehouse_id, row.item_id, input.lotId, input.sourceBinId, input.targetBinId, input.quantity, input.user.id]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async receiveInventory(input: {
    itemId: string;
    warehouseId: string;
    binId: string;
    lotCode: string;
    quantity: number;
    expirationDate?: string;
    documentId?: string;
    user: AuthenticatedUser;
  }) {
    this.assertPositiveQuantity(Number(input.quantity));
    this.accessControl.ensureWarehouseAccess(input.user, input.warehouseId, 'Warehouse access denied');

    const result = await this.fastify.db.query(
      `
        SELECT
          i.id AS item_id,
          i.temperature_band,
          i.weight_lbs,
          i.length_in,
          i.width_in,
          i.height_in,
          b.id AS bin_id,
          b.is_active,
          b.temperature_band AS bin_temperature_band,
          b.max_load_lbs,
          b.max_length_in,
          b.max_width_in,
          b.max_height_in,
          z.warehouse_id,
          COALESCE(load.current_load_lbs, 0) AS current_load_lbs
        FROM items i
        JOIN bins b ON b.id = $2
        JOIN zones z ON z.id = b.zone_id
        LEFT JOIN (
          SELECT ip.bin_id, COALESCE(SUM(ip.quantity * item.weight_lbs), 0) AS current_load_lbs
          FROM inventory_positions ip
          JOIN lots lot ON lot.id = ip.lot_id
          JOIN items item ON item.id = lot.item_id
          GROUP BY ip.bin_id
        ) load ON load.bin_id = b.id
        WHERE i.id = $1
      `,
      [input.itemId, input.binId]
    );

    if (!result.rowCount) {
      throw new Error('Item or bin not found');
    }

    const row = result.rows[0];
    if (row.warehouse_id !== input.warehouseId) {
      throw new Error('Selected bin does not belong to the target warehouse');
    }
    if (!row.is_active) {
      throw new Error('Target bin is disabled');
    }
    if (row.bin_temperature_band !== row.temperature_band) {
      throw inventoryError(422, 'Temperature band mismatch');
    }
    if (Number(row.max_length_in) < Number(row.length_in) || Number(row.max_width_in) < Number(row.width_in) || Number(row.max_height_in) < Number(row.height_in)) {
      throw new Error('Item dimensions exceed target bin limits');
    }
    if (Number(row.current_load_lbs) + Number(row.weight_lbs) * input.quantity > Number(row.max_load_lbs)) {
      throw new Error('Target bin max load exceeded');
    }

    if (input.documentId) {
      const documentResult = await this.fastify.db.query<{ warehouse_id: string; type: string }>(
        `SELECT warehouse_id, type FROM documents WHERE id = $1`,
        [input.documentId]
      );

      if (!documentResult.rowCount) {
        throw new Error('Receiving document not found');
      }

      const document = documentResult.rows[0];
      if (document.warehouse_id !== input.warehouseId || document.type !== 'receiving') {
        throw new Error('Receiving document does not match the selected warehouse');
      }
    }

    const client = await this.fastify.db.connect();
    try {
      await client.query('BEGIN');

      const lotResult = await client.query<{ id: string }>(
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

      await client.query(
        `
          INSERT INTO inventory_positions (lot_id, bin_id, quantity)
          VALUES ($1, $2, $3)
          ON CONFLICT (lot_id, bin_id)
          DO UPDATE SET quantity = inventory_positions.quantity + EXCLUDED.quantity
        `,
        [lotId, input.binId, input.quantity]
      );

      await client.query(
        `
          INSERT INTO inventory_transactions (warehouse_id, item_id, lot_id, target_bin_id, document_id, transaction_type, quantity, created_by)
          VALUES ($1, $2, $3, $4, $5, 'receive', $6, $7)
        `,
        [input.warehouseId, input.itemId, lotId, input.binId, input.documentId ?? null, input.quantity, input.user.id]
      );

      await client.query('COMMIT');
      return { lotId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async transferInventory(input: {
    sourceLotId: string;
    sourceBinId: string;
    targetWarehouseId: string;
    targetBinId: string;
    quantity: number;
    lotCode: string;
    expirationDate?: string;
    documentId?: string;
    user: AuthenticatedUser;
  }) {
    this.assertPositiveQuantity(Number(input.quantity));
    const result = await this.fastify.db.query(
      `
        SELECT
          source_lot.id AS source_lot_id,
          source_lot.warehouse_id AS source_warehouse_id,
          source_lot.item_id,
          item.temperature_band,
          item.weight_lbs,
          item.length_in,
          item.width_in,
          item.height_in,
          source_position.quantity AS source_quantity,
          target_bin.is_active AS target_active,
          target_bin.temperature_band AS target_temperature_band,
          target_bin.max_load_lbs,
          target_bin.max_length_in,
          target_bin.max_width_in,
          target_bin.max_height_in,
          target_zone.warehouse_id AS target_warehouse_id,
          COALESCE(load.current_load_lbs, 0) AS current_load_lbs
        FROM lots source_lot
        JOIN items item ON item.id = source_lot.item_id
        JOIN inventory_positions source_position ON source_position.lot_id = source_lot.id AND source_position.bin_id = $2
        JOIN bins target_bin ON target_bin.id = $3
        JOIN zones target_zone ON target_zone.id = target_bin.zone_id
        LEFT JOIN (
          SELECT ip.bin_id, COALESCE(SUM(ip.quantity * inventory_item.weight_lbs), 0) AS current_load_lbs
          FROM inventory_positions ip
          JOIN lots inventory_lot ON inventory_lot.id = ip.lot_id
          JOIN items inventory_item ON inventory_item.id = inventory_lot.item_id
          GROUP BY ip.bin_id
        ) load ON load.bin_id = target_bin.id
        WHERE source_lot.id = $1
      `,
      [input.sourceLotId, input.sourceBinId, input.targetBinId]
    );

    if (!result.rowCount) {
      throw new Error('Transfer source inventory position not found');
    }

    const row = result.rows[0];
    this.accessControl.ensureWarehouseAccess(input.user, row.source_warehouse_id, 'Warehouse access denied');
    this.accessControl.ensureWarehouseAccess(input.user, row.target_warehouse_id, 'Warehouse access denied');
    if (row.target_warehouse_id !== input.targetWarehouseId) {
      throw new Error('Target bin does not belong to the destination warehouse');
    }
    if (Number(row.source_quantity) < input.quantity) {
      throw new Error('Insufficient source quantity');
    }
    if (!row.target_active) {
      throw new Error('Target bin is disabled');
    }
    if (row.target_temperature_band !== row.temperature_band) {
      throw new Error('Temperature band mismatch');
    }
    if (Number(row.max_length_in) < Number(row.length_in)
      || Number(row.max_width_in) < Number(row.width_in)
      || Number(row.max_height_in) < Number(row.height_in)) {
      throw new Error('Item dimensions exceed target bin limits');
    }
    if (Number(row.current_load_lbs) + Number(row.weight_lbs) * input.quantity > Number(row.max_load_lbs)) {
      throw new Error('Target bin max load exceeded');
    }

    if (input.documentId) {
      const documentResult = await this.fastify.db.query<{ warehouse_id: string; type: string }>(
        `SELECT warehouse_id, type FROM documents WHERE id = $1`,
        [input.documentId]
      );

      if (!documentResult.rowCount) {
        throw new Error('Transfer document not found');
      }

      const document = documentResult.rows[0];
      if (document.warehouse_id !== row.source_warehouse_id || document.type !== 'transfer') {
        throw new Error('Transfer document does not match the selected source warehouse');
      }
    }

    const client = await this.fastify.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE inventory_positions SET quantity = quantity - $3 WHERE lot_id = $1 AND bin_id = $2`,
        [input.sourceLotId, input.sourceBinId, input.quantity]
      );
      await client.query(
        `UPDATE lots SET quantity_on_hand = quantity_on_hand - $2 WHERE id = $1`,
        [input.sourceLotId, input.quantity]
      );
      await client.query(
        `DELETE FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2 AND quantity <= 0`,
        [input.sourceLotId, input.sourceBinId]
      );

      const targetLotResult = await client.query<{ id: string }>(
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

      await client.query(
        `
          INSERT INTO inventory_positions (lot_id, bin_id, quantity)
          VALUES ($1, $2, $3)
          ON CONFLICT (lot_id, bin_id)
          DO UPDATE SET quantity = inventory_positions.quantity + EXCLUDED.quantity
        `,
        [targetLotId, input.targetBinId, input.quantity]
      );

      await client.query(
        `
          INSERT INTO inventory_transactions (warehouse_id, item_id, lot_id, source_bin_id, target_bin_id, document_id, transaction_type, quantity, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, 'transfer', $7, $8)
        `,
        [row.source_warehouse_id, row.item_id, input.sourceLotId, input.sourceBinId, input.targetBinId, input.documentId ?? null, input.quantity, input.user.id]
      );

      await client.query('COMMIT');
      return { targetLotId };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async pickInventory(input: { lotId: string; binId: string; quantity: number; user: AuthenticatedUser; documentId?: string }) {
    this.assertPositiveQuantity(Number(input.quantity));
    const result = await this.fastify.db.query(
      `
        SELECT l.warehouse_id, l.item_id, ip.quantity
        FROM lots l
        JOIN inventory_positions ip ON ip.lot_id = l.id AND ip.bin_id = $2
        WHERE l.id = $1
      `,
      [input.lotId, input.binId]
    );

    if (!result.rowCount) {
      throw new Error('Inventory position not found');
    }

    const row = result.rows[0];
    this.accessControl.ensureWarehouseAccess(input.user, row.warehouse_id, 'Warehouse access denied');
    if (Number(row.quantity) < input.quantity) {
      throw new Error('Insufficient stock');
    }

    const client = await this.fastify.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE inventory_positions SET quantity = quantity - $3 WHERE lot_id = $1 AND bin_id = $2`,
        [input.lotId, input.binId, input.quantity]
      );
      await client.query(
        `UPDATE lots SET quantity_on_hand = quantity_on_hand - $2 WHERE id = $1`,
        [input.lotId, input.quantity]
      );
      await client.query(
        `
          INSERT INTO inventory_transactions (warehouse_id, item_id, lot_id, source_bin_id, document_id, transaction_type, quantity, created_by)
          VALUES ($1, $2, $3, $4, $5, 'pick', $6, $7)
        `,
        [row.warehouse_id, row.item_id, input.lotId, input.binId, input.documentId ?? null, input.quantity, input.user.id]
      );
      await client.query(
        `DELETE FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2 AND quantity <= 0`,
        [input.lotId, input.binId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
