import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { detectCameraCapability } from './inventory-camera-utils';

type CameraState = 'idle' | 'starting' | 'active' | 'unsupported' | 'denied' | 'failed' | 'cancelled';

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

    <section class="two-column" *ngIf="scannedItem">
      <article class="panel item-highlight">
        <p class="eyebrow">Matched lot</p>
        <h3>{{ scannedItem.item_name }}</h3>
        <p>Lot {{ scannedItem.lot_code }} · Bin {{ scannedItem.bin_code }} · {{ scannedItem.quantity_on_hand }} on hand</p>

        <label class="field-label">Quantity</label>
        <input class="form-input" type="number" min="1" [(ngModel)]="quantity" />

        <div class="button-row inventory-action-row">
          <button class="primary-button" type="button" [disabled]="actionBusy || lookupBusy" (click)="pick()">
            {{ actionBusy ? 'Working...' : 'Pick' }}
          </button>
          <select class="form-input inventory-select" [disabled]="actionBusy || lookupBusy" [(ngModel)]="targetBinId">
            <option value="">Select target bin</option>
            <option *ngFor="let bin of targetBins" [value]="bin.bin_id">{{ bin.zone_code }} / {{ bin.bin_code }}</option>
          </select>
          <button class="secondary-button" type="button" [disabled]="actionBusy || lookupBusy" (click)="move()">
            {{ actionBusy ? 'Working...' : 'Move' }}
          </button>
        </div>

        <div class="inline-status success" *ngIf="targetBins.length">Loaded {{ targetBins.length }} target bins from warehouse {{ scannedItem.warehouse_name }}.</div>

        <div class="section-title catalog-section-gap">
          <h3>Receive stock</h3>
          <span class="pill">Receiving</span>
        </div>
        <div class="filter-strip">
          <input class="form-input" [disabled]="actionBusy || lookupBusy" [(ngModel)]="receiveLotCode" placeholder="New or existing lot code" />
          <input class="form-input" [disabled]="actionBusy || lookupBusy" type="date" [(ngModel)]="receiveExpirationDate" />
          <select class="form-input inventory-select" [disabled]="actionBusy || lookupBusy" [(ngModel)]="receiveBinId">
            <option value="">Select receive bin</option>
            <option *ngFor="let bin of targetBinsWithCurrent" [value]="bin.bin_id">{{ bin.zone_code }} / {{ bin.bin_code }}</option>
          </select>
          <button class="secondary-button" type="button" [disabled]="actionBusy || lookupBusy" (click)="receive()">
            {{ actionBusy ? 'Working...' : 'Receive' }}
          </button>
        </div>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Current position</h3>
          <span class="pill">{{ scannedItem.warehouse_name }}</span>
        </div>
        <div class="detail-grid">
          <div><span>Barcode</span><strong>{{ scannedItem.barcode || scannedItem.sku }}</strong></div>
          <div><span>Temperature</span><strong>{{ scannedItem.temperature_band }}</strong></div>
          <div><span>Current bin</span><strong>{{ scannedItem.bin_code }}</strong></div>
          <div><span>Warehouse</span><strong>{{ scannedItem.warehouse_id }}</strong></div>
        </div>
      </article>
    </section>
  `
})
export class InventoryPageComponent implements AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  @ViewChild('cameraVideo') cameraVideo?: ElementRef<HTMLVideoElement>;
  private mediaStream: MediaStream | null = null;
  private detector: { detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>> } | null = null;
  private cameraLoopHandle: number | null = null;

  scanCode = '';
  scannedItem: any = null;
  targetBins: any[] = [];
  targetBinId = '';
  quantity = 1;
  message = '';
  errorMessage = '';
  lookupBusy = false;
  actionBusy = false;
  receiveLotCode = '';
  receiveExpirationDate = '';
  receiveBinId = '';
  cameraState: CameraState = 'idle';
  cameraHint = '';

  ngAfterViewInit() {
    if (this.cameraState === 'active' || this.cameraState === 'starting') {
      void this.attachVideoStream();
    }
  }

  ngOnDestroy() {
    this.stopCamera('idle');
  }

  get targetBinsWithCurrent() {
    if (!this.scannedItem?.bin_id) {
      return this.targetBins;
    }

    const current = {
      bin_id: this.scannedItem.bin_id,
      zone_code: 'CURRENT',
      bin_code: this.scannedItem.bin_code
    };
    return [current, ...this.targetBins];
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
      this.scannedItem = await this.api.inventoryScan(code);
      const tree = await this.api.warehouseTree(this.scannedItem.warehouse_id);
      this.targetBins = tree.filter((row) => row.bin_id && row.bin_id !== this.scannedItem.bin_id);
      this.targetBinId = '';
      this.receiveBinId = this.scannedItem.bin_id;
      this.receiveLotCode = this.scannedItem.lot_code ? `${this.scannedItem.lot_code}-R` : '';
      this.receiveExpirationDate = '';
      this.message = `Matched ${this.scannedItem.item_name} in ${this.scannedItem.warehouse_name}.`;
    } catch (error) {
      this.scannedItem = null;
      this.targetBins = [];
      this.errorMessage = this.toMessage(error);
      this.message = '';
    } finally {
      this.lookupBusy = false;
    }
  }

  async pick() {
    if (!this.scannedItem || this.actionBusy) {
      return;
    }

    try {
      this.actionBusy = true;
      this.errorMessage = '';
      await this.api.pickInventory({
        lotId: this.scannedItem.lot_id,
        binId: this.scannedItem.bin_id,
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
    if (!this.scannedItem || !this.targetBinId) {
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
        lotId: this.scannedItem.lot_id,
        sourceBinId: this.scannedItem.bin_id,
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
    if (!this.scannedItem || !this.receiveBinId || !this.receiveLotCode.trim()) {
      this.errorMessage = 'Select a receive bin and provide a lot code before receiving stock.';
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
        warehouseId: this.scannedItem.warehouse_id,
        binId: this.receiveBinId,
        lotCode: this.receiveLotCode.trim(),
        quantity: Number(this.quantity),
        expirationDate: this.receiveExpirationDate || undefined
      });
      this.scanCode = this.scannedItem.sku || this.scannedItem.barcode;
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
