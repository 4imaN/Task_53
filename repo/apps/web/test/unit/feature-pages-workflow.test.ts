import test from 'node:test';
import assert from 'node:assert/strict';
import { TestBed } from '@angular/core/testing';
import { DocumentsPageComponent } from '../../src/app/features/documents/documents-page.component.ts';
import { BulkPageComponent } from '../../src/app/features/bulk/bulk-page.component.ts';
import { ApiService } from '../../src/app/core/services/api.service.ts';
import { SessionStore } from '../../src/app/core/auth/session.store.ts';
import { setupAngularTestEnvironment } from './angular-test-setup.ts';

setupAngularTestEnvironment();

const sessionStub = {
  user: () => ({
    displayName: 'Admin User',
    username: 'admin',
    primaryRole: 'administrator',
    roleCodes: ['administrator'],
    permissionCodes: [
      'users.manage', 'warehouses.read', 'metrics.read', 'search.read', 'audit.read',
      'catalog.manage', 'content.moderate', 'exports.manage',
      'documents.approve', 'inventory.receive', 'inventory.pick', 'inventory.move',
      'inventory.count', 'inventory.adjust'
    ],
    assignedWarehouseIds: [],
    departmentIds: [],
    sid: 'session-1'
  }),
  isAuthenticated: () => true,
  hasRole: (role: string) => role === 'administrator',
  hasAnyRole: (roles: string[]) => roles.includes('administrator'),
  hasAnyPermission: (_perms: string[]) => true,
  logout: async () => {},
  loaded: () => true,
  loading: () => false,
  error: () => null,
  ensureLoaded: async () => {},
  homeUrl: () => '/dashboard'
};

// ---- DocumentsPageComponent ----

const stubDocuments = [
  {
    id: 'doc-1',
    document_number: 'RECV-0001',
    type: 'receiving',
    warehouse_name: 'Main Warehouse',
    status: 'draft',
    updated_at: '2026-04-01T08:00:00.000Z',
    created_by_name: 'Admin User',
    approved_by_name: null,
    payload: { reference: 'PO-123', lines: [] }
  }
];

const stubDocumentDetail = {
  document: stubDocuments[0],
  workflow: []
};

const stubWarehouses = [
  { id: 'wh-1', code: 'WH-01', name: 'Main Warehouse' }
];

const stubCatalogItems = [
  { id: 'item-1', sku: 'SKU-001', name: 'Widget Alpha', unit_of_measure: 'each', temperature_band: 'ambient' }
];

const stubTreeRows: any[] = [];

test('documents page renders document list on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DocumentsPageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          documents: async () => stubDocuments,
          document: async () => stubDocumentDetail,
          warehouses: async () => stubWarehouses,
          catalogItems: async () => stubCatalogItems,
          warehouseTree: async () => stubTreeRows,
          createDocument: async () => ({ id: 'doc-new', documentNumber: 'RECV-0002' }),
          transitionDocument: async () => undefined,
          executeReceivingDocument: async () => ({ lotIds: [] }),
          executeShippingDocument: async () => ({ pickedLotIds: [] }),
          executeTransferDocument: async () => ({ targetLotIds: [] })
        }
      },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(DocumentsPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /RECV-0001/);
  assert.match(fixture.nativeElement.textContent, /Document Workflow/i);
  assert.match(fixture.nativeElement.textContent, /Main Warehouse/);
});

test('documents page loads empty list initially and populates on retry', async () => {
  let calls = 0;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DocumentsPageComponent],
    providers: [
      {
        provide: ApiService,
        useValue: {
          // Return empty array on first call, populated list on second
          documents: async () => {
            calls += 1;
            if (calls === 1) {
              return [];
            }
            return stubDocuments;
          },
          document: async () => stubDocumentDetail,
          warehouses: async () => stubWarehouses,
          catalogItems: async () => stubCatalogItems,
          warehouseTree: async () => stubTreeRows,
          createDocument: async () => ({ id: 'doc-new', documentNumber: 'RECV-0002' }),
          transitionDocument: async () => undefined,
          executeReceivingDocument: async () => ({ lotIds: [] }),
          executeShippingDocument: async () => ({ pickedLotIds: [] }),
          executeTransferDocument: async () => ({ targetLotIds: [] })
        }
      },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(DocumentsPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  // First load returns empty list
  assert.equal((fixture.componentInstance as DocumentsPageComponent).documents.length, 0);
  assert.match(fixture.nativeElement.textContent, /No documents match/i);

  // Second load (retry) returns documents
  await (fixture.componentInstance as DocumentsPageComponent).loadDocuments();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /RECV-0001/);
});

// ---- BulkPageComponent ----

const stubJobs = [
  {
    id: 'job-1',
    filename: 'catalog-items.csv',
    status: 'completed',
    created_by_name: 'Admin User',
    created_at: '2026-04-01T07:00:00.000Z'
  }
];

const stubJobResults = [
  { row_number: 1, outcome: 'imported', message: 'Row created successfully.' }
];

test('bulk page renders jobs list on load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BulkPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        bulkJobs: async () => stubJobs,
        bulkJobResults: async () => stubJobResults,
        bulkTemplateCatalogItems: async () => new ArrayBuffer(0),
        bulkPrecheckCatalogItems: async () => ({ summary: { totalRows: 1, validRows: 1, warningRows: 0, errorRows: 0 }, rows: [] }),
        bulkImportCatalogItems: async () => ({ status: 'completed', rows: [] }),
        bulkExportCatalogItems: async () => new ArrayBuffer(0)
      }
    }]
  });

  const fixture = TestBed.createComponent(BulkPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /catalog-items\.csv/);
  assert.match(fixture.nativeElement.textContent, /Bulk Processing/i);
  assert.match(fixture.nativeElement.textContent, /Recent jobs/i);
});

test('bulk page shows error and recovers on retry', async () => {
  let calls = 0;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BulkPageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        bulkJobs: async () => {
          calls += 1;
          if (calls === 1) {
            throw { error: { message: 'Bulk job service unavailable' } };
          }
          return stubJobs;
        },
        bulkJobResults: async () => stubJobResults,
        bulkTemplateCatalogItems: async () => new ArrayBuffer(0),
        bulkPrecheckCatalogItems: async () => ({ summary: { totalRows: 1, validRows: 1, warningRows: 0, errorRows: 0 }, rows: [] }),
        bulkImportCatalogItems: async () => ({ status: 'completed', rows: [] }),
        bulkExportCatalogItems: async () => new ArrayBuffer(0)
      }
    }]
  });

  const fixture = TestBed.createComponent(BulkPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Bulk job service unavailable/i);

  await (fixture.componentInstance as BulkPageComponent).loadJobs();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /catalog-items\.csv/);
});
