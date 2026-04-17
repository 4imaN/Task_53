import test from 'node:test';
import assert from 'node:assert/strict';
import { TestBed } from '@angular/core/testing';
import { InventoryPageComponent } from '../../src/app/features/inventory/inventory-page.component.ts';
import { ApiService } from '../../src/app/core/services/api.service.ts';
import { SessionStore } from '../../src/app/core/auth/session.store.ts';
import { setupAngularTestEnvironment } from './angular-test-setup.ts';

setupAngularTestEnvironment();

const sessionStub = {
  user: () => ({
    displayName: 'Clerk',
    username: 'clerk.demo',
    primaryRole: 'warehouse_clerk',
    roleCodes: ['warehouse_clerk'],
    permissionCodes: ['inventory.scan', 'inventory.receive', 'inventory.pick', 'inventory.move'],
    assignedWarehouseIds: ['wh-1'],
    departmentIds: [],
    sid: 'session-1'
  }),
  isAuthenticated: () => true,
  hasRole: (role: string) => role === 'warehouse_clerk',
  hasAnyRole: (roles: string[]) => roles.includes('warehouse_clerk'),
  hasAnyPermission: (perms: string[]) => perms.some((p) => ['inventory.scan', 'inventory.receive', 'inventory.pick', 'inventory.move'].includes(p)),
  loaded: () => true,
  loading: () => false,
  error: () => null,
  ensureLoaded: async () => {},
  logout: async () => {},
  homeUrl: () => '/inventory'
};

test('renders scan input and shows permission-based action areas', async () => {
  TestBed.resetTestingModule();

  const apiStub = {
    inventoryScan: async () => ({ kind: 'no_match', code: '', message: 'No match' }),
    warehouseTree: async () => []
  };

  TestBed.configureTestingModule({
    imports: [InventoryPageComponent],
    providers: [
      { provide: ApiService, useValue: apiStub },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(InventoryPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;

  const scanInput = el.querySelector('input.scan-input');
  assert.ok(scanInput, 'scan input should be present');

  assert.match(el.textContent!, /Clerk Workspace/);
  assert.match(el.textContent!, /Scan, validate, and execute inventory actions inline/);

  const lookupButton = el.querySelector('button.primary-button');
  assert.ok(lookupButton, 'Lookup button should be present');
  assert.match(lookupButton!.textContent!, /Lookup/);
});

test('handles single_position scan result and displays item details', async () => {
  TestBed.resetTestingModule();

  const matchStub = {
    item_id: 'item-1',
    item_name: 'Cold Pack Omega',
    sku: 'SKU-CPO',
    barcode: 'BAR-CPO',
    temperature_band: 'refrigerated',
    weight_lbs: '5.00',
    length_in: '12.00',
    width_in: '6.00',
    height_in: '4.00',
    lot_id: 'lot-1',
    lot_code: 'LOTCPO-001',
    quantity_on_hand: '100',
    warehouse_id: 'wh-1',
    warehouse_name: 'Main Warehouse',
    bin_id: 'bin-1',
    bin_code: 'A-01',
    bin_quantity: '100'
  };

  const apiStub = {
    inventoryScan: async () => ({
      kind: 'single_position',
      code: 'BAR-CPO',
      match: matchStub
    }),
    warehouseTree: async () => [
      { warehouse_id: 'wh-1', warehouse_name: 'Main Warehouse', zone_id: 'z-1', zone_code: 'A', zone_name: 'Zone A', bin_id: 'bin-1', bin_code: 'A-01', is_active: true }
    ]
  };

  TestBed.configureTestingModule({
    imports: [InventoryPageComponent],
    providers: [
      { provide: ApiService, useValue: apiStub },
      { provide: SessionStore, useValue: sessionStub }
    ]
  });

  const fixture = TestBed.createComponent(InventoryPageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const component = fixture.componentInstance;
  component.scanCode = 'BAR-CPO';
  fixture.detectChanges();

  await component.scan();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  assert.match(el.textContent!, /Cold Pack Omega/);
  assert.match(el.textContent!, /LOTCPO-001/);
  assert.match(el.textContent!, /Main Warehouse/);
});
