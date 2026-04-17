import test from 'node:test';
import assert from 'node:assert/strict';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { SearchPageComponent } from '../../src/app/features/search/search-page.component.ts';
import { ApiService } from '../../src/app/core/services/api.service.ts';
import { setupAngularTestEnvironment } from './angular-test-setup.ts';

setupAngularTestEnvironment();

const emptyParamMap = { get: (_: string) => null };
const routeStub = {
  queryParamMap: of(emptyParamMap),
  snapshot: { queryParamMap: emptyParamMap }
};

test('renders search results on successful load', async () => {
  TestBed.resetTestingModule();

  const mockRows = [
    {
      item_name: 'Widget Alpha',
      barcode: 'BAR-001',
      sku: 'SKU-001',
      lot_code: 'LOT-A',
      warehouse_name: 'Main Warehouse',
      document_status: 'open',
      updated_at: null
    }
  ];

  const apiStub = {
    savedViews: async () => [],
    search: async () => ({ results: mockRows, total: 1, totalPages: 1 })
  };

  TestBed.configureTestingModule({
    imports: [SearchPageComponent],
    providers: [
      { provide: ApiService, useValue: apiStub },
      { provide: ActivatedRoute, useValue: routeStub }
    ]
  });

  const fixture = TestBed.createComponent(SearchPageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const content = fixture.nativeElement.textContent;
  assert.match(content, /Widget Alpha/);
  assert.match(content, /1 rows/);
  assert.match(content, /Global Search Workspace/);
});

test('shows error message on failed search and recovers on retry', async () => {
  TestBed.resetTestingModule();

  let shouldFail = true;
  const apiStub = {
    savedViews: async () => [],
    search: async () => {
      if (shouldFail) {
        throw { error: { message: 'Search service unavailable' } };
      }
      return { results: [{ item_name: 'Recovery Item', barcode: 'BAR-REC', sku: 'SKU-REC', lot_code: null, warehouse_name: null, document_status: null, updated_at: null }], total: 1, totalPages: 1 };
    }
  };

  TestBed.configureTestingModule({
    imports: [SearchPageComponent],
    providers: [
      { provide: ApiService, useValue: apiStub },
      { provide: ActivatedRoute, useValue: routeStub }
    ]
  });

  const fixture = TestBed.createComponent(SearchPageComponent);
  fixture.autoDetectChanges(false);
  await fixture.componentInstance.ngOnInit();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.equal(fixture.componentInstance.errorMessage, 'Search service unavailable');
  assert.match(fixture.nativeElement.textContent, /Search service unavailable/);

  shouldFail = false;
  const component = fixture.componentInstance;
  await component.runSearch();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.equal(fixture.componentInstance.errorMessage, '');
  assert.match(fixture.nativeElement.textContent, /Recovery Item/);
});
