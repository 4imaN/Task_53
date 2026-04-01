import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';

type BinForm = {
  code: string;
  temperatureBand: string;
  maxLoadLbs: number;
  maxLengthIn: number;
  maxWidthIn: number;
  maxHeightIn: number;
  isActive: boolean;
  reason: string;
};

@Component({
  selector: 'app-warehouse-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Warehouse Hierarchy</p>
        <h2>Warehouse, zone, and bin controls with visible operational detail</h2>
      </div>
      <button class="secondary-button" type="button" [disabled]="loading || submitting" (click)="reload()">{{ loading ? 'Refreshing...' : 'Refresh' }}</button>
    </section>

    <div class="inline-status success" *ngIf="message">{{ message }}</div>
    <div class="inline-status error-status" *ngIf="errorMessage">{{ errorMessage }}</div>

    <section class="metric-grid">
      <article class="panel metric-card">
        <p class="eyebrow">Warehouses</p>
        <strong>{{ warehouses.length }}</strong>
        <span>Visible to this account</span>
      </article>
      <article class="panel metric-card">
        <p class="eyebrow">Bins</p>
        <strong>{{ treeRows.length }}</strong>
        <span>Total rows loaded for the selected warehouse</span>
      </article>
      <article class="panel metric-card">
        <p class="eyebrow">Disabled</p>
        <strong>{{ disabledBinCount() }}</strong>
        <span>Currently unavailable for new placements</span>
      </article>
      <article class="panel metric-card">
        <p class="eyebrow">Zones</p>
        <strong>{{ zoneCount() }}</strong>
        <span>Storage areas in the selected warehouse</span>
      </article>
    </section>

    <section class="two-column layout-tight">
      <article class="panel">
        <div class="section-title">
          <h3>Warehouse setup</h3>
          <span class="pill">{{ departments.length }} departments</span>
        </div>

        <div class="detail-grid">
          <label>
            <span>Department</span>
            <select class="form-input" [(ngModel)]="warehouseForm.departmentId">
              <option value="">Select department</option>
              <option *ngFor="let department of departments" [value]="department.id">{{ department.name }}</option>
            </select>
          </label>
          <label>
            <span>Warehouse code</span>
            <input class="form-input" [(ngModel)]="warehouseForm.code" placeholder="WH-03" />
          </label>
          <label>
            <span>Name</span>
            <input class="form-input" [(ngModel)]="warehouseForm.name" placeholder="New warehouse name" />
          </label>
          <label>
            <span>Address</span>
            <input class="form-input" [(ngModel)]="warehouseForm.address" placeholder="Address" />
          </label>
        </div>

        <div class="button-row catalog-section-gap">
          <button class="primary-button" type="button" [disabled]="loading || submitting" (click)="createWarehouse()">{{ submitting ? 'Saving...' : 'Create warehouse' }}</button>
          <button class="secondary-button" type="button" [disabled]="loading || submitting || !selectedWarehouseId" (click)="updateWarehouse()">Update selected warehouse</button>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Zone setup</h3>
          <span class="pill">{{ zoneCount() }} zones</span>
        </div>
        <div class="detail-grid">
          <label>
            <span>Zone code</span>
            <input class="form-input" [(ngModel)]="zoneForm.code" placeholder="RECV" />
          </label>
          <label>
            <span>Name</span>
            <input class="form-input" [(ngModel)]="zoneForm.name" placeholder="Receiving" />
          </label>
        </div>
        <div class="button-row catalog-section-gap">
          <button class="primary-button" type="button" [disabled]="loading || submitting || !selectedWarehouseId" (click)="createZone()">Create zone</button>
          <button class="secondary-button" type="button" [disabled]="loading || submitting || !selectedZoneId" (click)="updateZone()">Update selected zone</button>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Bin setup</h3>
          <span class="pill">{{ selectedZoneId ? 'Selected zone' : 'Choose zone' }}</span>
        </div>
        <div class="warehouse-form-grid">
          <label>
            <span>Bin code</span>
            <input class="form-input" [(ngModel)]="binForm.code" placeholder="PICK-02" />
          </label>
          <label>
            <span>Temperature band</span>
            <select class="form-input" [(ngModel)]="binForm.temperatureBand">
              <option value="ambient">ambient</option>
              <option value="cold">cold</option>
              <option value="frozen">frozen</option>
            </select>
          </label>
          <label>
            <span>Max load lbs</span>
            <input class="form-input" type="number" [(ngModel)]="binForm.maxLoadLbs" />
          </label>
          <label>
            <span>Max length in</span>
            <input class="form-input" type="number" [(ngModel)]="binForm.maxLengthIn" />
          </label>
          <label>
            <span>Max width in</span>
            <input class="form-input" type="number" [(ngModel)]="binForm.maxWidthIn" />
          </label>
          <label>
            <span>Max height in</span>
            <input class="form-input" type="number" [(ngModel)]="binForm.maxHeightIn" />
          </label>
          <label>
            <span>Status</span>
            <select class="form-input" [(ngModel)]="binForm.isActive">
              <option [ngValue]="true">enabled</option>
              <option [ngValue]="false">disabled</option>
            </select>
          </label>
          <label class="warehouse-form-span">
            <span>Change reason</span>
            <input class="form-input" [(ngModel)]="binForm.reason" placeholder="Reason for update" />
          </label>
        </div>
        <div class="button-row catalog-section-gap">
          <button class="primary-button" type="button" [disabled]="loading || submitting || !selectedZoneId" (click)="createBin()">Create bin</button>
          <button class="secondary-button" type="button" [disabled]="loading || submitting || !selectedBin" (click)="updateSelectedBin()">Update selected bin</button>
        </div>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Hierarchy browser</h3>
          <span class="pill">{{ warehouses.length }}</span>
        </div>

        <div class="tree-children">
          <button class="tree-node" type="button" *ngFor="let warehouse of warehouses" [class.active]="warehouse.id === selectedWarehouseId" (click)="selectWarehouse(warehouse.id)">
            <div class="section-title">
              <strong>{{ warehouse.code }}</strong>
              <span class="pill">{{ warehouse.department_name }}</span>
            </div>
            <p>{{ warehouse.name }}</p>
          </button>
        </div>

        <div class="section-title catalog-section-gap" *ngIf="selectedWarehouseId">
          <h3>Zones and bins</h3>
          <span class="pill">{{ zoneGroups.length }} zones</span>
        </div>
        <div class="warehouse-zone-stack" *ngFor="let zone of zoneGroups">
          <button class="tree-node"
                  type="button"
                  [class.active]="selectedZoneId === zone.zoneId"
                  (click)="selectZone(zone.zoneId)">
            <strong>{{ zone.zoneCode }}</strong>
            <p>{{ zone.zoneName }}</p>
          </button>

          <div class="tree-children" *ngIf="zone.bins.length">
            <button class="tree-node"
                    type="button"
                    *ngFor="let row of zone.bins"
                    [class.active]="selectedBin?.bin_id === row.bin_id"
                    (click)="selectBin(row)">
              <div class="section-title">
                <strong>{{ row.bin_code }}</strong>
                <span class="pill" [class.pill-warning]="!row.is_active">{{ row.is_active ? 'active' : 'disabled' }}</span>
              </div>
              <p>{{ row.temperature_band }} · {{ row.max_load_lbs }} lbs max</p>
            </button>
          </div>
        </div>
      </article>
    </section>

    <section class="two-column" *ngIf="selectedBin">
      <article class="panel">
        <div class="section-title">
          <div>
            <h3>{{ selectedBin.zone_code }} / {{ selectedBin.bin_code }}</h3>
            <p class="supporting catalog-section-gap">{{ selectedBin.warehouse_name }}</p>
          </div>
          <button class="primary-button" type="button" [disabled]="loading || submitting" (click)="toggle(selectedBin)">{{ selectedBin.is_active ? 'Disable bin' : 'Enable bin' }}</button>
        </div>

        <div class="detail-grid">
          <div><span>Temperature band</span><strong>{{ selectedBin.temperature_band }}</strong></div>
          <div><span>Max load</span><strong>{{ selectedBin.max_load_lbs }} lbs</strong></div>
          <div><span>Max length</span><strong>{{ selectedBin.max_length_in }} in</strong></div>
          <div><span>Max width</span><strong>{{ selectedBin.max_width_in }} in</strong></div>
          <div><span>Max height</span><strong>{{ selectedBin.max_height_in }} in</strong></div>
          <div><span>Status</span><strong>{{ selectedBin.is_active ? 'enabled' : 'disabled' }}</strong></div>
        </div>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Change timeline</h3>
          <span class="pill">{{ timeline.length }}</span>
        </div>
        <div class="timeline-row" *ngFor="let item of timeline">
          <span class="timeline-mark"></span>
          <div>
            <strong>{{ item.action }}</strong>
            <p>{{ item.changed_by_name || 'system' }}{{ item.reason ? ' · ' + item.reason : '' }}</p>
          </div>
          <small>{{ item.created_at | date:'short' }}</small>
        </div>
        <p class="supporting" *ngIf="!timeline.length">No timeline entries recorded for this bin yet.</p>
      </article>
    </section>
  `
})
export class WarehousePageComponent implements OnInit {
  private readonly api = inject(ApiService);

  warehouses: any[] = [];
  departments: any[] = [];
  treeRows: any[] = [];
  zoneGroups: Array<{ zoneId: string; zoneCode: string; zoneName: string; bins: any[] }> = [];
  selectedWarehouseId = '';
  selectedZoneId = '';
  selectedBin: any = null;
  timeline: any[] = [];
  message = '';
  errorMessage = '';
  loading = false;
  submitting = false;

  warehouseForm = {
    departmentId: '',
    code: '',
    name: '',
    address: ''
  };

  zoneForm = {
    code: '',
    name: ''
  };

  binForm: BinForm = this.emptyBinForm();

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    try {
      this.loading = true;
      this.errorMessage = '';
      const [warehouses, options] = await Promise.all([
        this.api.warehouses(),
        this.api.warehouseSetupOptions()
      ]);
      this.warehouses = warehouses;
      this.departments = options.departments ?? [];

      if (!this.selectedWarehouseId && this.warehouses[0]) {
        this.selectedWarehouseId = this.warehouses[0].id;
      }

      if (this.selectedWarehouseId) {
        await this.loadWarehouseTree(this.selectedWarehouseId);
      }
    } catch (error) {
      this.errorMessage = this.toMessage(error);
      this.message = '';
    } finally {
      this.loading = false;
    }
  }

  async loadWarehouseTree(warehouseId: string) {
    this.treeRows = await this.api.warehouseTree(warehouseId);
    this.zoneGroups = this.buildZoneGroups(this.treeRows);
    this.selectedZoneId = this.zoneGroups.find((zone) => zone.zoneId === this.selectedZoneId)?.zoneId ?? this.zoneGroups[0]?.zoneId ?? '';
    this.selectedBin = this.treeRows.find((row) => row.bin_id === this.selectedBin?.bin_id) ?? this.zoneGroups[0]?.bins[0] ?? null;
    this.syncFormsFromSelection();
    await this.loadTimeline();
  }

  async selectWarehouse(warehouseId: string) {
    this.selectedWarehouseId = warehouseId;
    this.selectedZoneId = '';
    this.selectedBin = null;
    this.message = '';
    await this.loadWarehouseTree(warehouseId);
  }

  selectZone(zoneId: string) {
    this.selectedZoneId = zoneId;
    this.selectedBin = this.zoneGroups.find((zone) => zone.zoneId === zoneId)?.bins[0] ?? null;
    this.syncFormsFromSelection();
    void this.loadTimeline();
  }

  async selectBin(row: any) {
    this.selectedBin = row;
    this.selectedZoneId = row.zone_id;
    this.syncFormsFromSelection();
    await this.loadTimeline();
  }

  async createWarehouse() {
    if (this.submitting) {
      return;
    }
    try {
      this.submitting = true;
      await this.api.createWarehouse(this.warehouseForm);
      this.message = 'Warehouse created.';
      this.warehouseForm = { departmentId: '', code: '', name: '', address: '' };
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.submitting = false;
    }
  }

  async updateWarehouse() {
    if (!this.selectedWarehouseId || this.submitting) {
      return;
    }

    try {
      this.submitting = true;
      await this.api.updateWarehouse(this.selectedWarehouseId, this.warehouseForm);
      this.message = 'Warehouse updated.';
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.submitting = false;
    }
  }

  async createZone() {
    if (!this.selectedWarehouseId || this.submitting) {
      return;
    }

    try {
      this.submitting = true;
      await this.api.createZone(this.selectedWarehouseId, this.zoneForm);
      this.message = 'Zone created.';
      this.zoneForm = { code: '', name: '' };
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.submitting = false;
    }
  }

  async updateZone() {
    if (!this.selectedZoneId || this.submitting) {
      return;
    }

    try {
      this.submitting = true;
      await this.api.updateZone(this.selectedZoneId, this.zoneForm);
      this.message = 'Zone updated.';
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.submitting = false;
    }
  }

  async createBin() {
    if (!this.selectedZoneId || this.submitting) {
      return;
    }

    try {
      this.submitting = true;
      await this.api.createBin(this.selectedZoneId, this.binForm);
      this.message = 'Bin created.';
      this.binForm = this.emptyBinForm();
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.submitting = false;
    }
  }

  async updateSelectedBin() {
    if (!this.selectedBin?.bin_id || this.submitting) {
      return;
    }

    try {
      this.submitting = true;
      await this.api.updateBin(this.selectedBin.bin_id, this.binForm);
      this.message = `Bin ${this.selectedBin.bin_code} updated.`;
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.submitting = false;
    }
  }

  async toggle(row: any) {
    if (this.submitting) {
      return;
    }
    try {
      this.submitting = true;
      await this.api.toggleBin(row.bin_id, !row.is_active, row.is_active ? 'Disabled from UI' : 'Enabled from UI');
      this.message = `Bin ${row.bin_code} updated.`;
      await this.reload();
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.submitting = false;
    }
  }

  async loadTimeline() {
    this.timeline = this.selectedBin?.bin_id ? await this.api.binTimeline(this.selectedBin.bin_id) : [];
  }

  disabledBinCount() {
    return this.treeRows.filter((row) => !row.is_active).length;
  }

  zoneCount() {
    return new Set(this.treeRows.map((row) => row.zone_id).filter(Boolean)).size;
  }

  private buildZoneGroups(rows: any[]) {
    const groups = new Map<string, { zoneId: string; zoneCode: string; zoneName: string; bins: any[] }>();

    for (const row of rows) {
      if (!row.zone_id) {
        continue;
      }

      if (!groups.has(row.zone_id)) {
        groups.set(row.zone_id, {
          zoneId: row.zone_id,
          zoneCode: row.zone_code,
          zoneName: row.zone_name,
          bins: []
        });
      }

      if (row.bin_id) {
        groups.get(row.zone_id)!.bins.push(row);
      }
    }

    return [...groups.values()];
  }

  private syncFormsFromSelection() {
    const warehouse = this.warehouses.find((item) => item.id === this.selectedWarehouseId);
    if (warehouse) {
      this.warehouseForm = {
        departmentId: warehouse.department_id,
        code: warehouse.code,
        name: warehouse.name,
        address: warehouse.address ?? ''
      };
    }

    const zone = this.zoneGroups.find((item) => item.zoneId === this.selectedZoneId);
    if (zone) {
      this.zoneForm = {
        code: zone.zoneCode,
        name: zone.zoneName
      };
    }

    if (this.selectedBin) {
      this.binForm = {
        code: this.selectedBin.bin_code,
        temperatureBand: this.selectedBin.temperature_band,
        maxLoadLbs: Number(this.selectedBin.max_load_lbs),
        maxLengthIn: Number(this.selectedBin.max_length_in),
        maxWidthIn: Number(this.selectedBin.max_width_in),
        maxHeightIn: Number(this.selectedBin.max_height_in),
        isActive: Boolean(this.selectedBin.is_active),
        reason: ''
      };
    }
  }

  private emptyBinForm(): BinForm {
    return {
      code: '',
      temperatureBand: 'ambient',
      maxLoadLbs: 500,
      maxLengthIn: 36,
      maxWidthIn: 24,
      maxHeightIn: 24,
      isActive: true,
      reason: ''
    };
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      return (error as { error?: { message?: string } }).error?.message ?? 'Warehouse action failed';
    }

    return 'Warehouse action failed';
  }
}
