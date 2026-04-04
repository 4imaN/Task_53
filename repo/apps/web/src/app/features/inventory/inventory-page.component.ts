import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ApiService,
  type InventoryScanItem,
  type InventoryScanLotMatch,
  type InventoryScanResult,
  type InventoryScanWarehouseOption
} from '../../core/services/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { detectCameraCapability } from './inventory-camera-utils';

type CameraState = 'idle' | 'starting' | 'active' | 'unsupported' | 'denied' | 'failed' | 'cancelled';

type WarehouseTreeBin = {
  warehouse_id: string;
  warehouse_name: string;
  zone_id: string | null;
  zone_code: string | null;
  zone_name: string | null;
  bin_id: string | null;
  bin_code: string | null;
  is_active: boolean;
};

@Component({
  selector: 'app-inventory-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Clerk Workspace</p>
        <h2>Scan, validate, and execute inventory actions inline</h2>
      </div>
      <span class="pill">Live API</span>
    </section>

    <section class="scan-surface panel panel-highlight">
      <div>
        <p class="eyebrow">Focused scan field</p>
        <input class="scan-input" [(ngModel)]="scanCode" [disabled]="lookupBusy || actionBusy" placeholder="barcode, lot, or SKU" />
      </div>
      <div class="button-row">
        <button class="primary-button" type="button" [disabled]="lookupBusy || actionBusy" (click)="scan()">
          {{ lookupBusy ? 'Looking up...' : 'Lookup' }}
        </button>
        <button class="secondary-button" type="button" [disabled]="cameraState === 'starting'" (click)="toggleCamera()">
          {{ cameraState === 'active' ? 'Stop Camera' : 'Use Camera' }}
        </button>
      </div>
    </section>

    <div class="inline-status" *ngIf="message">{{ message }}</div>
    <div class="inline-status error-status" *ngIf="errorMessage">{{ errorMessage }}</div>

    <section class="panel inventory-camera-panel" *ngIf="cameraState !== 'idle'">
      <div class="section-title">
        <div>
          <h3>Camera scanning</h3>
          <p class="supporting">Browser barcode detection for mobile and tablet workflows.</p>
        </div>
        <span class="pill">{{ cameraState }}</span>
      </div>

      <div class="inventory-camera-stage" *ngIf="cameraState === 'active' || cameraState === 'starting'">
        <video #cameraVideo class="inventory-camera-video" autoplay muted playsinline></video>
      </div>

      <div class="inline-status" *ngIf="cameraState === 'starting'">Requesting camera access and initializing the detector.</div>
      <div class="inline-status success" *ngIf="cameraState === 'active' && cameraHint">{{ cameraHint }}</div>
      <div class="inline-status error-status" *ngIf="cameraState === 'unsupported'">This browser does not expose barcode detection or camera APIs. Continue with keyboard-wedge scanning.</div>
      <div class="inline-status error-status" *ngIf="cameraState === 'denied'">Camera permission was denied. Allow camera access in the browser, or continue with keyboard-wedge scanning.</div>
      <div class="inline-status error-status" *ngIf="cameraState === 'failed'">{{ cameraHint || 'Barcode detection did not find a readable value yet.' }}</div>
      <div class="inline-status" *ngIf="cameraState === 'cancelled'">Camera scanning was cancelled.</div>
    </section>

    <section class="panel" *ngIf="ambiguousMatches.length">
      <div class="section-title">
        <div>
          <h3>Choose matching lot</h3>
          <p class="supporting">Multiple visible lot positions matched this code. Select the correct position before acting.</p>
        </div>
        <span class="pill">{{ ambiguousMatches.length }} matches</span>
      </div>
      <div class="tab-strip">
        <button
          class="tab"
          type="button"
          *ngFor="let match of ambiguousMatches"
          (click)="selectAmbiguousMatch(match)"
        >
          {{ match.lot_code }} · {{ match.bin_code }} · {{ match.warehouse_name }}
        </button>
      </div>
    </section>

    <section class="two-column" *ngIf="scannedItem">
      <article class="panel item-highlight">
        <p class="eyebrow">{{ selectedMatch ? 'Matched lot position' : 'Matched item' }}</p>
        <h3>{{ scannedItem.item_name }}</h3>
        <p *ngIf="selectedMatch; else unmatchedSummary">
          Lot {{ selectedMatch.lot_code }} · Bin {{ selectedMatch.bin_code }} · {{ selectedMatch.quantity_on_hand }} on hand
        </p>
        <ng-template #unmatchedSummary>
          <p *ngIf="scanKind === 'multiple_positions'; else itemOnlySummary">Multiple visible lots matched this code. Select the correct position before acting.</p>
        </ng-template>
        <ng-template #itemOnlySummary>
          <p>No visible lot is currently on hand. Choose a warehouse and bin to receive the first lot.</p>
        </ng-template>

        <label class="field-label">Quantity</label>
        <input class="form-input" type="number" min="1" [(ngModel)]="quantity" />

        <div class="button-row inventory-action-row" *ngIf="selectedMatch">
          <button class="primary-button" type="button" [disabled]="actionBusy || lookupBusy || !canPick()" (click)="pick()">
            {{ actionBusy ? 'Working...' : 'Pick' }}
          </button>
          <select class="form-input inventory-select" [disabled]="actionBusy || lookupBusy" [(ngModel)]="targetBinId">
            <option value="">Select target bin</option>
            <option *ngFor="let bin of moveTargetBins" [value]="bin.bin_id">{{ bin.zone_code }} / {{ bin.bin_code }}</option>
          </select>
          <button class="secondary-button" type="button" [disabled]="actionBusy || lookupBusy || !canMove()" (click)="move()">
            {{ actionBusy ? 'Working...' : 'Move' }}
          </button>
        </div>

        <div class="inline-status success" *ngIf="selectedWarehouseName() && availableBins.length">
          Loaded {{ availableBins.length }} active bins from warehouse {{ selectedWarehouseName() }}.
        </div>
        <div class="inline-status" *ngIf="selectedWarehouseId && !availableBins.length">
          No active bins are currently available in the selected warehouse.
        </div>
        <div class="inline-status" *ngIf="!canPick() || !canMove() || !canReceive()">Visible actions follow your inventory permissions.</div>

        <ng-container *ngIf="scanKind !== 'multiple_positions' || selectedMatch">
          <div class="section-title catalog-section-gap">
            <h3>Receive stock</h3>
            <span class="pill">{{ selectedMatch ? 'Receiving' : 'First receipt' }}</span>
          </div>
          <div class="filter-strip">
            <select
              *ngIf="!selectedMatch"
              class="form-input inventory-select"
              [disabled]="actionBusy || lookupBusy"
              [(ngModel)]="selectedWarehouseId"
              (ngModelChange)="onWarehouseChange($event)"
            >
              <option value="">Select warehouse</option>
              <option *ngFor="let warehouse of receivingWarehouses" [value]="warehouse.warehouse_id">{{ warehouse.warehouse_name }}</option>
            </select>
            <input class="form-input" [disabled]="actionBusy || lookupBusy" [(ngModel)]="receiveLotCode" placeholder="New or existing lot code" />
            <input class="form-input" [disabled]="actionBusy || lookupBusy" type="date" [(ngModel)]="receiveExpirationDate" />
            <select class="form-input inventory-select" [disabled]="actionBusy || lookupBusy" [(ngModel)]="receiveBinId">
              <option value="">Select receive bin</option>
              <option *ngFor="let bin of receiveBinOptions" [value]="bin.bin_id">{{ bin.zone_code }} / {{ bin.bin_code }}</option>
            </select>
            <button class="secondary-button" type="button" [disabled]="actionBusy || lookupBusy || !canReceive()" (click)="receive()">
              {{ actionBusy ? 'Working...' : 'Receive' }}
            </button>
          </div>
        </ng-container>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>{{ selectedMatch ? 'Current position' : 'Item details' }}</h3>
          <span class="pill">{{ selectedWarehouseName() || (scanKind === 'multiple_positions' ? 'Awaiting selection' : 'No lot on hand') }}</span>
        </div>
        <div class="detail-grid">
          <div><span>Barcode</span><strong>{{ scannedItem.barcode || scannedItem.sku }}</strong></div>
          <div><span>Temperature</span><strong>{{ scannedItem.temperature_band }}</strong></div>
          <div><span>Current bin</span><strong>{{ selectedMatch?.bin_code || 'Not yet assigned' }}</strong></div>
          <div><span>Warehouse</span><strong>{{ selectedMatch?.warehouse_id || selectedWarehouseId || 'Choose target warehouse' }}</strong></div>
        </div>
      </article>
    </section>
  `
})
export class InventoryPageComponent implements AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);
  @ViewChild('cameraVideo') cameraVideo?: ElementRef<HTMLVideoElement>;
  private mediaStream: MediaStream | null = null;
  private detector: { detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> } | null = null;
  private cameraLoopHandle: number | null = null;

  scanCode = '';
  scannedItem: InventoryScanItem | null = null;
  selectedMatch: InventoryScanLotMatch | null = null;
  ambiguousMatches: InventoryScanLotMatch[] = [];
  receivingWarehouses: InventoryScanWarehouseOption[] = [];
  availableBins: WarehouseTreeBin[] = [];
  selectedWarehouseId = '';
  targetBinId = '';
  receiveBinId = '';
  quantity = 1;
  scanKind: InventoryScanResult['kind'] | null = null;
  message = '';
  errorMessage = '';
  lookupBusy = false;
  actionBusy = false;
  receiveLotCode = '';
  receiveExpirationDate = '';
  cameraState: CameraState = 'idle';
  cameraHint = '';
  readonly canPick = computed(() => this.session.user()?.permissionCodes.includes('inventory.pick') ?? false);
  readonly canMove = computed(() => this.session.user()?.permissionCodes.includes('inventory.move') ?? false);
  readonly canReceive = computed(() => this.session.user()?.permissionCodes.includes('inventory.receive') ?? false);

  ngAfterViewInit() {
    if (this.cameraState === 'active' || this.cameraState === 'starting') {
      void this.attachVideoStream();
    }
  }

  ngOnDestroy() {
    this.stopCamera('idle');
  }

  get moveTargetBins() {
    if (!this.selectedMatch) {
      return [];
    }

    return this.availableBins.filter((row) => row.bin_id && row.bin_id !== this.selectedMatch!.bin_id);
  }

  get receiveBinOptions() {
    return this.availableBins.filter((row) => row.bin_id);
  }

  async scan() {
    const code = this.scanCode.trim();
    if (!code || this.lookupBusy) {
      if (!code) {
        this.errorMessage = 'Scan or enter a barcode, lot, or SKU value first.';
      }
      return;
    }

    try {
      this.lookupBusy = true;
      this.message = '';
      this.errorMessage = '';
      this.resetLookupState();

      const result = await this.api.inventoryScan(code);
      await this.applyScanResult(result);
    } catch (error) {
      this.resetLookupState();
      this.errorMessage = this.toMessage(error);
      this.message = '';
    } finally {
      this.lookupBusy = false;
    }
  }

  async selectAmbiguousMatch(match: InventoryScanLotMatch) {
    if (this.lookupBusy || this.actionBusy) {
      return;
    }

    try {
      this.lookupBusy = true;
      this.errorMessage = '';
      await this.selectMatch(match);
      this.message = `Selected ${match.lot_code} in ${match.warehouse_name}.`;
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.lookupBusy = false;
    }
  }

  async onWarehouseChange(warehouseId: string) {
    this.selectedWarehouseId = warehouseId;
    this.receiveBinId = '';
    this.availableBins = [];

    if (!warehouseId) {
      return;
    }

    try {
      this.lookupBusy = true;
      this.errorMessage = '';
      await this.loadWarehouseBins(warehouseId);
      this.receiveBinId = this.receiveBinOptions[0]?.bin_id ?? '';
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.lookupBusy = false;
    }
  }

  async pick() {
    if (!this.selectedMatch || this.actionBusy || !this.canPick()) {
      return;
    }

    try {
      this.actionBusy = true;
      this.errorMessage = '';
      await this.api.pickInventory({
        lotId: this.selectedMatch.lot_id,
        binId: this.selectedMatch.bin_id,
        quantity: Number(this.quantity)
      });
      await this.scan();
      this.message = 'Pick completed.';
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.actionBusy = false;
    }
  }

  async move() {
    if (!this.canMove()) {
      this.errorMessage = 'Move permission is required for this action.';
      return;
    }
    if (!this.selectedMatch || !this.targetBinId) {
      this.errorMessage = 'Select a target bin before moving inventory.';
      return;
    }
    if (this.actionBusy) {
      return;
    }

    try {
      this.actionBusy = true;
      this.errorMessage = '';
      await this.api.moveInventory({
        lotId: this.selectedMatch.lot_id,
        sourceBinId: this.selectedMatch.bin_id,
        targetBinId: this.targetBinId,
        quantity: Number(this.quantity)
      });
      await this.scan();
      this.message = 'Move completed.';
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.actionBusy = false;
    }
  }

  async receive() {
    if (!this.canReceive()) {
      this.errorMessage = 'Receive permission is required for this action.';
      return;
    }
    if (!this.scannedItem || !this.selectedWarehouseId || !this.receiveBinId || !this.receiveLotCode.trim()) {
      this.errorMessage = 'Select a warehouse, choose a receive bin, and provide a lot code before receiving stock.';
      return;
    }
    if (this.actionBusy) {
      return;
    }

    try {
      this.actionBusy = true;
      this.errorMessage = '';
      await this.api.receiveInventory({
        itemId: this.scannedItem.item_id,
        warehouseId: this.selectedWarehouseId,
        binId: this.receiveBinId,
        lotCode: this.receiveLotCode.trim(),
        quantity: Number(this.quantity),
        expirationDate: this.receiveExpirationDate || undefined
      });
      this.scanCode = this.scannedItem.barcode || this.scannedItem.sku;
      await this.scan();
      this.message = 'Receive completed.';
    } catch (error) {
      this.errorMessage = this.toMessage(error);
    } finally {
      this.actionBusy = false;
    }
  }

  async toggleCamera() {
    if (this.cameraState === 'active' || this.cameraState === 'starting') {
      this.stopCamera('cancelled');
      return;
    }

    await this.startCamera();
  }

  selectedWarehouseName() {
    if (this.selectedMatch) {
      return this.selectedMatch.warehouse_name;
    }

    return this.receivingWarehouses.find((warehouse) => warehouse.warehouse_id === this.selectedWarehouseId)?.warehouse_name ?? '';
  }

  private async applyScanResult(result: InventoryScanResult) {
    if (result.kind === 'no_match') {
      this.scanKind = 'no_match';
      this.errorMessage = result.message;
      return;
    }

    if (result.kind === 'item_only') {
      this.scanKind = 'item_only';
      this.scannedItem = result.item;
      this.receivingWarehouses = result.receiving_warehouses;
      this.selectedWarehouseId = result.receiving_warehouses[0]?.warehouse_id ?? '';
      if (this.selectedWarehouseId) {
        await this.loadWarehouseBins(this.selectedWarehouseId);
        this.receiveBinId = this.receiveBinOptions[0]?.bin_id ?? '';
      }
      this.receiveLotCode = '';
      this.message = `Matched ${result.item.item_name}. Choose a warehouse and bin to receive the first lot.`;
      return;
    }

    if (result.kind === 'single_position') {
      this.scanKind = 'single_position';
      await this.selectMatch(result.match);
      this.message = `Matched ${result.match.item_name} in ${result.match.warehouse_name}.`;
      return;
    }

    this.scanKind = 'multiple_positions';
    this.scannedItem = this.toScanItem(result.matches[0]);
    this.ambiguousMatches = result.matches;
    this.message = `Found ${result.matches.length} visible lot matches for ${result.code}. Select the correct lot before continuing.`;
  }

  private async selectMatch(match: InventoryScanLotMatch) {
    this.scannedItem = this.toScanItem(match);
    this.selectedMatch = match;
    this.selectedWarehouseId = match.warehouse_id;
    this.receiveLotCode = `${match.lot_code}-R`;
    this.receiveExpirationDate = '';
    await this.loadWarehouseBins(match.warehouse_id);
    this.targetBinId = '';
    this.receiveBinId = match.bin_id;
  }

  private async loadWarehouseBins(warehouseId: string) {
    const tree = await this.api.warehouseTree(warehouseId);
    this.availableBins = (tree as WarehouseTreeBin[]).filter((row) => row.bin_id && row.is_active !== false);
  }

  private resetLookupState() {
    this.scannedItem = null;
    this.selectedMatch = null;
    this.ambiguousMatches = [];
    this.receivingWarehouses = [];
    this.availableBins = [];
    this.scanKind = null;
    this.selectedWarehouseId = '';
    this.targetBinId = '';
    this.receiveBinId = '';
    this.receiveLotCode = '';
    this.receiveExpirationDate = '';
    this.quantity = 1;
  }

  private toScanItem(match: InventoryScanLotMatch): InventoryScanItem {
    return {
      item_id: match.item_id,
      item_name: match.item_name,
      sku: match.sku,
      barcode: match.barcode,
      temperature_band: match.temperature_band,
      weight_lbs: match.weight_lbs,
      length_in: match.length_in,
      width_in: match.width_in,
      height_in: match.height_in
    };
  }

  private async startCamera() {
    this.errorMessage = '';
    this.cameraHint = '';

    const barcodeDetectorCtor = (globalThis as unknown as { BarcodeDetector?: new (options?: { formats?: string[] }) => { detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    const cameraCapability = detectCameraCapability({
      hasMediaDevices: Boolean(navigator.mediaDevices),
      hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
      hasBarcodeDetector: Boolean(barcodeDetectorCtor)
    });

    if (cameraCapability === 'unsupported') {
      this.cameraState = 'unsupported';
      return;
    }
    const DetectorCtor = barcodeDetectorCtor!;

    this.cameraState = 'starting';

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      this.detector = new DetectorCtor({
        formats: ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code']
      });
      this.cameraState = 'active';
      this.cameraHint = 'Align the barcode inside the camera frame.';
      await this.attachVideoStream();
      this.pollCamera();
    } catch (error) {
      this.stopCamera('denied');
      this.cameraHint = error instanceof Error ? error.message : '';
    }
  }

  private async attachVideoStream() {
    const video = this.cameraVideo?.nativeElement;
    if (!video || !this.mediaStream) {
      return;
    }

    video.srcObject = this.mediaStream;
    await video.play().catch(() => undefined);
  }

  private pollCamera() {
    if (!this.detector || !this.cameraVideo?.nativeElement || this.cameraState !== 'active') {
      return;
    }

    const video = this.cameraVideo.nativeElement;
    this.cameraLoopHandle = window.setTimeout(async () => {
      try {
        const matches = await this.detector!.detect(video);
        const code = matches.find((entry) => entry.rawValue?.trim())?.rawValue?.trim();
        if (code) {
          this.scanCode = code;
          this.stopCamera('idle');
          await this.scan();
          return;
        }

        this.cameraHint = 'Camera is active. No barcode detected yet.';
      } catch {
        this.cameraState = 'failed';
        this.cameraHint = 'Barcode detection failed for the current camera frame.';
        return;
      }

      this.pollCamera();
    }, 450);
  }

  private stopCamera(nextState: CameraState) {
    if (this.cameraLoopHandle !== null) {
      window.clearTimeout(this.cameraLoopHandle);
      this.cameraLoopHandle = null;
    }

    this.mediaStream?.getTracks().forEach((track) => track.stop());
    this.mediaStream = null;
    this.detector = null;

    const video = this.cameraVideo?.nativeElement;
    if (video) {
      video.pause();
      video.srcObject = null;
    }

    this.cameraState = nextState;
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      return (error as { error?: { message?: string } }).error?.message ?? 'Inventory request failed';
    }

    return 'Inventory request failed';
  }
}
