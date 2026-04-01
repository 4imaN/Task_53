import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { SessionStore } from '../../core/auth/session.store';

type DocumentType = 'receiving' | 'shipping' | 'transfer' | 'cycle_count' | 'adjustment';

type WarehouseOption = {
  id: string;
  code: string;
  name: string;
};

type ItemOption = {
  id: string;
  sku: string;
  name: string;
  unit_of_measure: string;
  temperature_band: string;
};

type WarehouseTreeRow = {
  warehouse_id: string;
  zone_id: string;
  zone_code: string;
  zone_name: string;
  bin_id: string;
  bin_code: string;
  is_active: boolean;
  temperature_band: string;
};

type BinOption = {
  id: string;
  label: string;
  temperatureBand: string;
  warehouseId: string;
};

type DocumentLineForm = {
  itemId: string;
  expectedQuantity: number;
  quantity: number;
  quantityDelta: number;
  lotCode: string;
  expirationDate: string;
  sourceBinId: string;
  targetBinId: string;
  binId: string;
};

const transitions: Record<string, string[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['approved', 'cancelled'],
  approved: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: []
};

const documentTypeMeta: Record<DocumentType, { label: string; note: string }> = {
  receiving: {
    label: 'Receiving',
    note: 'Captures inbound inventory, expected quantities, and planned put-away bins.'
  },
  shipping: {
    label: 'Shipping',
    note: 'Captures outbound demand, source bins, and requested ship dates.'
  },
  transfer: {
    label: 'Transfer',
    note: 'Moves stock between warehouses inside the same department.'
  },
  cycle_count: {
    label: 'Cycle Count',
    note: 'Schedules counts by bin and records expected on-hand quantities.'
  },
  adjustment: {
    label: 'Adjustment',
    note: 'Records quantity corrections with explicit reason codes and bin-level deltas.'
  }
};

@Component({
  selector: 'app-documents-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">Document Workflow</p>
        <h2>Operational records with controlled state transitions</h2>
      </div>
      <span class="pill">{{ documents.length }} documents</span>
    </section>

    <section class="two-column">
      <article class="panel">
        <div class="section-title">
          <div>
            <h3>Create {{ documentTypeMeta[createForm.type].label }} document</h3>
            <p class="supporting catalog-section-gap">{{ documentTypeMeta[createForm.type].note }}</p>
          </div>
          <span class="pill">Draft</span>
        </div>

        <div class="filter-strip catalog-section-gap">
          <select class="form-input" [(ngModel)]="createForm.type" (ngModelChange)="onTypeChange()">
            <option *ngFor="let type of documentTypes" [value]="type">{{ documentTypeMeta[type].label }}</option>
          </select>
          <select class="form-input" [(ngModel)]="createForm.warehouseId" (ngModelChange)="onWarehouseChange()">
            <option value="">Select warehouse</option>
            <option *ngFor="let warehouse of warehouses" [value]="warehouse.id">{{ warehouse.code }} · {{ warehouse.name }}</option>
          </select>
          <input class="form-input" [(ngModel)]="createForm.documentNumber" placeholder="Optional document number" />
          <input class="form-input" [(ngModel)]="createForm.reference" placeholder="Reference or note" />
        </div>

        <div class="filter-strip" *ngIf="createForm.type === 'receiving'">
          <input class="form-input" [(ngModel)]="createForm.source" placeholder="Source supplier or dock" />
          <input class="form-input" type="date" [(ngModel)]="createForm.expectedArrivalDate" />
        </div>

        <div class="filter-strip" *ngIf="createForm.type === 'shipping'">
          <input class="form-input" [(ngModel)]="createForm.destination" placeholder="Destination school or department" />
          <input class="form-input" type="date" [(ngModel)]="createForm.requestedShipDate" />
        </div>

        <div class="filter-strip" *ngIf="createForm.type === 'transfer'">
          <select class="form-input" [(ngModel)]="createForm.destinationWarehouseId" (ngModelChange)="refreshBinOptions()">
            <option value="">Destination warehouse</option>
            <option *ngFor="let warehouse of destinationWarehouses()" [value]="warehouse.id">{{ warehouse.code }} · {{ warehouse.name }}</option>
          </select>
          <input class="form-input" type="date" [(ngModel)]="createForm.requestedTransferDate" />
        </div>

        <div class="filter-strip" *ngIf="createForm.type === 'cycle_count'">
          <input class="form-input" type="date" [(ngModel)]="createForm.scheduledDate" />
          <input class="form-input" [(ngModel)]="createForm.countScope" placeholder="Count scope" />
        </div>

        <div class="filter-strip" *ngIf="createForm.type === 'adjustment'">
          <input class="form-input" [(ngModel)]="createForm.reasonCode" placeholder="Reason code" />
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Line items</h3>
          <div class="button-row">
            <span class="pill">{{ createForm.lines.length }}</span>
            <button class="secondary-button" type="button" (click)="addLine()">Add line</button>
          </div>
        </div>

        <div class="document-line-grid">
          <div class="document-line-card" *ngFor="let line of createForm.lines; let i = index">
            <div class="section-title">
              <h3>Line {{ i + 1 }}</h3>
              <button class="secondary-button" type="button" *ngIf="createForm.lines.length > 1" (click)="removeLine(i)">Remove</button>
            </div>

            <div class="filter-strip">
              <select class="form-input" [(ngModel)]="line.itemId">
                <option value="">Select item</option>
                <option *ngFor="let item of items" [value]="item.id">{{ item.sku }} · {{ item.name }}</option>
              </select>

              <input
                *ngIf="usesExpectedQuantity()"
                class="form-input"
                type="number"
                min="0"
                step="1"
                [(ngModel)]="line.expectedQuantity"
                placeholder="Expected quantity" />

              <input
                *ngIf="usesQuantity()"
                class="form-input"
                type="number"
                min="0"
                step="1"
                [(ngModel)]="line.quantity"
                placeholder="Quantity" />

              <input
                *ngIf="usesQuantityDelta()"
                class="form-input"
                type="number"
                step="1"
                [(ngModel)]="line.quantityDelta"
                placeholder="Delta" />
            </div>

            <div class="filter-strip" *ngIf="usesLotCode()">
              <input class="form-input" [(ngModel)]="line.lotCode" placeholder="Lot code" />
              <input class="form-input" type="date" [(ngModel)]="line.expirationDate" *ngIf="createForm.type === 'receiving'" />
            </div>

            <div class="filter-strip">
              <select class="form-input" *ngIf="usesSourceBin()" [(ngModel)]="line.sourceBinId">
                <option value="">Source bin</option>
                <option *ngFor="let bin of sourceBins" [value]="bin.id">{{ bin.label }}</option>
              </select>

              <select class="form-input" *ngIf="usesTargetBin()" [(ngModel)]="line.targetBinId">
                <option value="">Target bin</option>
                <option *ngFor="let bin of targetBins()" [value]="bin.id">{{ bin.label }}</option>
              </select>

              <select class="form-input" *ngIf="usesCountBin()" [(ngModel)]="line.binId">
                <option value="">Bin</option>
                <option *ngFor="let bin of sourceBins" [value]="bin.id">{{ bin.label }}</option>
              </select>
            </div>
          </div>
        </div>

        <div class="button-row catalog-section-gap">
          <button class="primary-button" type="button" (click)="createDocument()">Create document</button>
          <span class="supporting">Server-side validation still applies to warehouse scope, department match, and bin ownership.</span>
        </div>

        <div class="inline-status" [class.success]="messageTone === 'success'" [class.error-status]="messageTone === 'error'" *ngIf="message">{{ message }}</div>
      </article>

      <article class="panel">
        <div class="section-title">
          <h3>Filters</h3>
          <span class="pill">Live</span>
        </div>
        <div class="filter-strip">
          <select class="form-input" [(ngModel)]="statusFilter" (ngModelChange)="loadDocuments()">
            <option value="">All statuses</option>
            <option *ngFor="let status of availableStatuses" [value]="status">{{ status }}</option>
          </select>
          <input class="form-input" [(ngModel)]="transitionNotes" placeholder="Optional transition note" />
        </div>
      </article>
    </section>

    <section class="two-column">
      <article class="panel">
        <table class="data-table" *ngIf="documents.length; else emptyState">
          <thead>
            <tr>
              <th>Number</th>
              <th>Type</th>
              <th>Warehouse</th>
              <th>Status</th>
              <th>Updated</th>
              <th *ngIf="canTransition()">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let document of documents" [class.table-row-active]="selectedDocumentId === document.id" (click)="selectDocument(document.id)">
              <td><strong>{{ document.document_number }}</strong></td>
              <td>{{ documentLabel(document.type) }}</td>
              <td>{{ document.warehouse_name }}</td>
              <td><span class="pill">{{ document.status }}</span></td>
              <td>{{ document.updated_at | date:'short' }}</td>
              <td *ngIf="canTransition()">
                <div class="button-row document-action-row">
                  <button
                    class="secondary-button"
                    type="button"
                    *ngFor="let nextStatus of nextStatuses(document.status)"
                    (click)="transition(document.id, nextStatus, $event)">
                    {{ nextStatus }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <ng-template #emptyState>
          <p class="supporting">No documents match the current filter.</p>
        </ng-template>
      </article>

      <article class="panel" *ngIf="selectedDocument; else noSelection">
        <div class="section-title">
          <div>
            <h3>{{ selectedDocument.document.document_number }}</h3>
            <p class="supporting catalog-section-gap">{{ documentNote(selectedDocument.document.type) }}</p>
          </div>
          <div class="button-row">
            <span class="pill">{{ selectedDocument.document.status }}</span>
            <button
              class="primary-button"
              type="button"
              *ngIf="showExecuteAction()"
              (click)="executeDocument(selectedDocument.document.id)">
              {{ executeLabel() }}
            </button>
          </div>
        </div>
        <div class="detail-grid">
          <div><span>Type</span><strong>{{ documentLabel(selectedDocument.document.type) }}</strong></div>
          <div><span>Warehouse</span><strong>{{ selectedDocument.document.warehouse_name }}</strong></div>
          <div><span>Created by</span><strong>{{ selectedDocument.document.created_by_name || 'system' }}</strong></div>
          <div><span>Approved by</span><strong>{{ selectedDocument.document.approved_by_name || 'n/a' }}</strong></div>
          <div *ngFor="let fact of payloadFacts(selectedDocument.document.payload)">
            <span>{{ fact.label }}</span>
            <strong>{{ fact.value }}</strong>
          </div>
        </div>

        <div class="section-title catalog-section-gap" *ngIf="payloadLines(selectedDocument.document.payload).length">
          <h3>Payload lines</h3>
          <span class="pill">{{ payloadLines(selectedDocument.document.payload).length }}</span>
        </div>
        <div class="document-line-grid" *ngIf="payloadLines(selectedDocument.document.payload).length">
          <div class="document-line-card document-line-card-readonly" *ngFor="let line of payloadLines(selectedDocument.document.payload); let i = index">
            <strong>Line {{ i + 1 }}</strong>
            <pre class="payload-block">{{ line | json }}</pre>
          </div>
        </div>

        <div class="section-title catalog-section-gap">
          <h3>Payload</h3>
          <span class="pill">JSON</span>
        </div>
        <pre class="payload-block">{{ selectedDocument.document.payload | json }}</pre>

        <div class="section-title catalog-section-gap">
          <h3>Workflow history</h3>
          <span class="pill">{{ selectedDocument.workflow.length }}</span>
        </div>
        <div class="timeline-row" *ngFor="let step of selectedDocument.workflow">
          <span class="timeline-mark"></span>
          <div>
            <strong>{{ step.from_status || 'start' }} -> {{ step.to_status }}</strong>
            <p>{{ step.changed_by_name || 'system' }}{{ step.notes ? ' · ' + step.notes : '' }}</p>
          </div>
          <small>{{ step.created_at | date:'short' }}</small>
        </div>
      </article>

      <ng-template #noSelection>
        <article class="panel">
          <p class="supporting">Select a document to inspect payload and workflow history.</p>
        </article>
      </ng-template>
    </section>
  `
})
export class DocumentsPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionStore);

  readonly canTransition = computed(() => this.session.user()?.permissionCodes.includes('documents.approve') ?? false);
  readonly canExecuteReceiving = computed(() => this.session.user()?.permissionCodes.includes('inventory.receive') ?? false);
  readonly canExecuteShipping = computed(() => this.session.user()?.permissionCodes.includes('inventory.pick') ?? false);
  readonly canExecuteTransfer = computed(() => this.session.user()?.permissionCodes.includes('inventory.move') ?? false);

  readonly documentTypeMeta = documentTypeMeta;
  readonly documentTypes = Object.keys(documentTypeMeta) as DocumentType[];
  readonly availableStatuses = Object.keys(transitions);

  documents: any[] = [];
  warehouses: WarehouseOption[] = [];
  items: ItemOption[] = [];
  sourceBins: BinOption[] = [];
  destinationBins: BinOption[] = [];
  selectedDocumentId = '';
  selectedDocument: any = null;
  statusFilter = '';
  transitionNotes = '';
  message = '';
  messageTone: 'success' | 'error' = 'success';

  createForm = {
    warehouseId: '',
    type: 'receiving' as DocumentType,
    documentNumber: '',
    reference: '',
    source: '',
    expectedArrivalDate: '',
    destination: '',
    requestedShipDate: '',
    destinationWarehouseId: '',
    requestedTransferDate: '',
    scheduledDate: '',
    countScope: '',
    reasonCode: '',
    lines: [this.createLine()]
  };

  private readonly loadingSignal = signal(false);

  async ngOnInit() {
    await Promise.all([this.loadWarehouses(), this.loadItems(), this.loadDocuments()]);
    await this.refreshBinOptions();
  }

  nextStatuses(status: string) {
    return transitions[status] ?? [];
  }

  documentLabel(type: string) {
    return documentTypeMeta[type as DocumentType]?.label ?? type;
  }

  documentNote(type: string) {
    return documentTypeMeta[type as DocumentType]?.note ?? '';
  }

  usesExpectedQuantity() {
    return this.createForm.type === 'receiving' || this.createForm.type === 'cycle_count';
  }

  usesQuantity() {
    return this.createForm.type === 'shipping' || this.createForm.type === 'transfer';
  }

  usesQuantityDelta() {
    return this.createForm.type === 'adjustment';
  }

  usesLotCode() {
    return this.createForm.type === 'receiving' || this.createForm.type === 'shipping' || this.createForm.type === 'transfer';
  }

  usesSourceBin() {
    return this.createForm.type === 'shipping' || this.createForm.type === 'transfer';
  }

  usesTargetBin() {
    return this.createForm.type === 'receiving' || this.createForm.type === 'transfer';
  }

  usesCountBin() {
    return this.createForm.type === 'cycle_count' || this.createForm.type === 'adjustment';
  }

  destinationWarehouses() {
    return this.warehouses.filter((warehouse) => warehouse.id !== this.createForm.warehouseId);
  }

  targetBins() {
    return this.createForm.type === 'transfer' ? this.destinationBins : this.sourceBins;
  }

  showExecuteAction() {
    if (!this.selectedDocument || !['approved', 'in_progress'].includes(this.selectedDocument.document.status)) {
      return false;
    }

    if (this.selectedDocument.document.type === 'receiving') {
      return this.canExecuteReceiving();
    }

    if (this.selectedDocument.document.type === 'shipping') {
      return this.canExecuteShipping();
    }

    if (this.selectedDocument.document.type === 'transfer') {
      return this.canExecuteTransfer();
    }

    return false;
  }

  executeLabel() {
    if (this.selectedDocument?.document.type === 'shipping') {
      return 'Execute Shipping';
    }

    if (this.selectedDocument?.document.type === 'transfer') {
      return 'Execute Transfer';
    }

    return 'Execute Receiving';
  }

  payloadLines(payload: Record<string, unknown> | null | undefined) {
    return Array.isArray(payload?.['lines']) ? payload['lines'] as Array<Record<string, unknown>> : [];
  }

  payloadFacts(payload: Record<string, unknown> | null | undefined) {
    if (!payload || typeof payload !== 'object') {
      return [];
    }

    const facts: Array<{ label: string; value: string }> = [];
    const addFact = (label: string, key: string) => {
      const value = payload[key];
      if (typeof value === 'string' && value.trim()) {
        facts.push({ label, value });
      }
    };

    addFact('Reference', 'reference');
    addFact('Source', 'source');
    addFact('Destination', 'destination');
    addFact('Destination warehouse', 'destinationWarehouseId');
    addFact('Expected arrival', 'expectedArrivalDate');
    addFact('Requested ship', 'requestedShipDate');
    addFact('Requested transfer', 'requestedTransferDate');
    addFact('Scheduled date', 'scheduledDate');
    addFact('Count scope', 'countScope');
    addFact('Reason code', 'reasonCode');

    const lines = this.payloadLines(payload);
    if (lines.length) {
      facts.push({ label: 'Line count', value: String(lines.length) });
    }

    return facts;
  }

  addLine() {
    this.createForm.lines = [...this.createForm.lines, this.createLine()];
  }

  removeLine(index: number) {
    this.createForm.lines = this.createForm.lines.filter((_, currentIndex) => currentIndex !== index);
  }

  async onTypeChange() {
    this.message = '';
    this.createForm.source = '';
    this.createForm.expectedArrivalDate = '';
    this.createForm.destination = '';
    this.createForm.requestedShipDate = '';
    this.createForm.destinationWarehouseId = this.destinationWarehouses()[0]?.id ?? '';
    this.createForm.requestedTransferDate = '';
    this.createForm.scheduledDate = '';
    this.createForm.countScope = '';
    this.createForm.reasonCode = '';
    this.createForm.lines = [this.createLine()];
    await this.refreshBinOptions();
  }

  async onWarehouseChange() {
    if (this.createForm.destinationWarehouseId === this.createForm.warehouseId) {
      this.createForm.destinationWarehouseId = this.destinationWarehouses()[0]?.id ?? '';
    }

    await this.refreshBinOptions();
  }

  async loadDocuments() {
    if (this.loadingSignal()) {
      return;
    }

    this.loadingSignal.set(true);
    try {
      this.documents = await this.api.documents(this.statusFilter || undefined);
      if (!this.selectedDocumentId && this.documents[0]) {
        await this.selectDocument(this.documents[0].id);
      } else if (this.selectedDocumentId) {
        const selectedStillVisible = this.documents.some((document) => document.id === this.selectedDocumentId);
        if (selectedStillVisible) {
          await this.selectDocument(this.selectedDocumentId);
        } else {
          this.selectedDocumentId = '';
          this.selectedDocument = null;
        }
      }
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async loadWarehouses() {
    this.warehouses = await this.api.warehouses();
    if (!this.createForm.warehouseId && this.warehouses[0]) {
      this.createForm.warehouseId = this.warehouses[0].id;
    }

    if (!this.createForm.destinationWarehouseId) {
      this.createForm.destinationWarehouseId = this.destinationWarehouses()[0]?.id ?? '';
    }
  }

  async loadItems() {
    this.items = await this.api.catalogItems();
  }

  async refreshBinOptions() {
    if (!this.createForm.warehouseId) {
      this.sourceBins = [];
      this.destinationBins = [];
      return;
    }

    this.sourceBins = this.flattenBins(await this.api.warehouseTree(this.createForm.warehouseId));

    if (this.createForm.type === 'transfer' && this.createForm.destinationWarehouseId) {
      this.destinationBins = this.flattenBins(await this.api.warehouseTree(this.createForm.destinationWarehouseId));
    } else {
      this.destinationBins = [];
    }
  }

  async createDocument() {
    if (!this.createForm.warehouseId) {
      this.setMessage('Select a warehouse before creating a document.', 'error');
      return;
    }

    try {
      const created = await this.api.createDocument({
        warehouseId: this.createForm.warehouseId,
        type: this.createForm.type,
        documentNumber: this.createForm.documentNumber || undefined,
        payload: this.buildPayload()
      });

      this.setMessage(`Created ${created.documentNumber}.`, 'success');
      this.createForm.documentNumber = '';
      this.createForm.reference = '';
      this.createForm.lines = [this.createLine()];
      await this.loadDocuments();
      await this.selectDocument(created.id);
    } catch (error) {
      this.setMessage(this.toMessage(error), 'error');
    }
  }

  async selectDocument(documentId: string) {
    this.selectedDocumentId = documentId;
    this.selectedDocument = await this.api.document(documentId);
  }

  async transition(documentId: string, toStatus: string, event?: Event) {
    event?.stopPropagation();
    try {
      await this.api.transitionDocument(documentId, toStatus, this.transitionNotes || undefined);
      this.setMessage(`Document moved to ${toStatus}.`, 'success');
      await this.loadDocuments();
      await this.selectDocument(documentId);
    } catch (error) {
      this.setMessage(this.toMessage(error), 'error');
    }
  }

  async executeDocument(documentId: string) {
    try {
      if (this.selectedDocument?.document.type === 'shipping') {
        const result = await this.api.executeShippingDocument(documentId);
        this.setMessage(`Shipping execution completed for ${result.pickedLotIds.length} lot line(s).`, 'success');
      } else if (this.selectedDocument?.document.type === 'transfer') {
        const result = await this.api.executeTransferDocument(documentId);
        this.setMessage(`Transfer execution completed for ${result.targetLotIds.length} lot line(s).`, 'success');
      } else {
        const result = await this.api.executeReceivingDocument(documentId);
        this.setMessage(`Receiving execution completed for ${result.lotIds.length} lot line(s).`, 'success');
      }
      await this.loadDocuments();
      await this.selectDocument(documentId);
    } catch (error) {
      this.setMessage(this.toMessage(error), 'error');
    }
  }

  private buildPayload() {
    const common = {
      reference: this.createForm.reference || undefined
    };

    switch (this.createForm.type) {
      case 'receiving':
        return {
          ...common,
          source: this.createForm.source,
          expectedArrivalDate: this.createForm.expectedArrivalDate || undefined,
          lines: this.createForm.lines.map((line) => ({
            itemId: line.itemId,
            expectedQuantity: Number(line.expectedQuantity),
            targetBinId: line.targetBinId,
            lotCode: line.lotCode,
            expirationDate: line.expirationDate || undefined
          }))
        };
      case 'shipping':
        return {
          ...common,
          destination: this.createForm.destination,
          requestedShipDate: this.createForm.requestedShipDate || undefined,
          lines: this.createForm.lines.map((line) => ({
            itemId: line.itemId,
            quantity: Number(line.quantity),
            sourceBinId: line.sourceBinId,
            lotCode: line.lotCode
          }))
        };
      case 'transfer':
        return {
          ...common,
          destinationWarehouseId: this.createForm.destinationWarehouseId,
          requestedTransferDate: this.createForm.requestedTransferDate || undefined,
          lines: this.createForm.lines.map((line) => ({
            itemId: line.itemId,
            quantity: Number(line.quantity),
            sourceBinId: line.sourceBinId,
            targetBinId: line.targetBinId,
            lotCode: line.lotCode
          }))
        };
      case 'cycle_count':
        return {
          ...common,
          scheduledDate: this.createForm.scheduledDate,
          countScope: this.createForm.countScope || undefined,
          lines: this.createForm.lines.map((line) => ({
            itemId: line.itemId,
            binId: line.binId,
            expectedQuantity: Number(line.expectedQuantity)
          }))
        };
      case 'adjustment':
        return {
          ...common,
          reasonCode: this.createForm.reasonCode,
          lines: this.createForm.lines.map((line) => ({
            itemId: line.itemId,
            binId: line.binId,
            quantityDelta: Number(line.quantityDelta)
          }))
        };
    }
  }

  private createLine(): DocumentLineForm {
    return {
      itemId: this.items[0]?.id ?? '',
      expectedQuantity: 1,
      quantity: 1,
      quantityDelta: 1,
      lotCode: '',
      expirationDate: '',
      sourceBinId: this.sourceBins[0]?.id ?? '',
      targetBinId: '',
      binId: this.sourceBins[0]?.id ?? ''
    };
  }

  private flattenBins(rows: WarehouseTreeRow[]) {
    return rows
      .filter((row) => row.bin_id)
      .map((row) => ({
        id: row.bin_id,
        label: `${row.zone_code} / ${row.bin_code} · ${row.temperature_band}`,
        temperatureBand: row.temperature_band,
        warehouseId: row.warehouse_id
      }));
  }

  private setMessage(message: string, tone: 'success' | 'error') {
    this.message = message;
    this.messageTone = tone;
  }

  private toMessage(error: unknown) {
    if (typeof error === 'object' && error && 'error' in error) {
      return (error as { error?: { message?: string } }).error?.message ?? 'Document request failed';
    }

    return 'Document request failed';
  }
}
