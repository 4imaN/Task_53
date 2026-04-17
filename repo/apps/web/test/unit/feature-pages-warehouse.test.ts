import test from 'node:test';
import assert from 'node:assert/strict';
import { TestBed } from '@angular/core/testing';
import { WarehousePageComponent } from '../../src/app/features/warehouse/warehouse-page.component.ts';
import { ApiService } from '../../src/app/core/services/api.service.ts';
import { setupAngularTestEnvironment } from './angular-test-setup.ts';

setupAngularTestEnvironment();

const stubWarehouse = {
  id: 'wh-1',
  code: 'WH-01',
  name: 'Main Warehouse',
  address: '100 Main St',
  department_id: 'dept-1',
  department_name: 'Operations'
};

const stubSetupOptions = {
  departments: [{ id: 'dept-1', name: 'Operations' }],
  temperatureBands: ['ambient', 'frozen']
};

const stubTreeRows = [
  {
    warehouse_id: 'wh-1',
    zone_id: 'zone-1',
    zone_code: 'RECV',
    zone_name: 'Receiving',
    bin_id: 'bin-1',
    bin_code: 'PICK-01',
    is_active: true,
    temperature_band: 'ambient',
    max_load_lbs: 500,
    max_length_in: 36,
    max_width_in: 24,
    max_height_in: 24,
    warehouse_name: 'Main Warehouse'
  }
];

test('warehouse page renders warehouse list on successful load', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WarehousePageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        warehouses: async () => [stubWarehouse],
        warehouseSetupOptions: async () => stubSetupOptions,
        warehouseTree: async () => stubTreeRows,
        binTimeline: async () => []
      }
    }]
  });

  const fixture = TestBed.createComponent(WarehousePageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /WH-01/);
  assert.match(fixture.nativeElement.textContent, /Main Warehouse/);
  assert.match(fixture.nativeElement.textContent, /Warehouse Hierarchy/i);
  assert.match(fixture.nativeElement.textContent, /Warehouses/);
});

test('warehouse page shows error and recovers on retry', async () => {
  let calls = 0;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WarehousePageComponent],
    providers: [{
      provide: ApiService,
      useValue: {
        warehouses: async () => {
          calls += 1;
          if (calls === 1) {
            throw { error: { message: 'Warehouse service unavailable' } };
          }
          return [stubWarehouse];
        },
        warehouseSetupOptions: async () => stubSetupOptions,
        warehouseTree: async () => stubTreeRows,
        binTimeline: async () => []
      }
    }]
  });

  const fixture = TestBed.createComponent(WarehousePageComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /Warehouse service unavailable/i);

  await (fixture.componentInstance as WarehousePageComponent).reload();
  fixture.detectChanges();

  assert.match(fixture.nativeElement.textContent, /WH-01/);
});
