import { describe, expect, it } from 'vitest';
import { AccessControlService, validateRoleScopeAssignments } from '../src/services/access-control.service.js';

// ---------------------------------------------------------------------------
// validateRoleScopeAssignments — standalone exported pure function
// ---------------------------------------------------------------------------

describe('validateRoleScopeAssignments', () => {
  it('accepts warehouse_clerk with at least one warehouse', () => {
    expect(() =>
      validateRoleScopeAssignments({
        roleCodes: ['warehouse_clerk'],
        warehouseIds: ['wh-1'],
        departmentIds: []
      })
    ).not.toThrow();
  });

  it('rejects warehouse_clerk with no warehouse assignments', () => {
    expect(() =>
      validateRoleScopeAssignments({
        roleCodes: ['warehouse_clerk'],
        warehouseIds: [],
        departmentIds: []
      })
    ).toThrow('Warehouse-scoped roles must be assigned at least one warehouse');
  });

  it('accepts moderator with at least one department', () => {
    expect(() =>
      validateRoleScopeAssignments({
        roleCodes: ['moderator'],
        warehouseIds: [],
        departmentIds: ['dept-1']
      })
    ).not.toThrow();
  });

  it('rejects moderator with neither department nor warehouse assignments', () => {
    expect(() =>
      validateRoleScopeAssignments({
        roleCodes: ['moderator'],
        warehouseIds: [],
        departmentIds: []
      })
    ).toThrow('Moderator and catalog roles must be assigned at least one department or warehouse-backed department scope');
  });

  it('accepts moderator backed only by a warehouse assignment', () => {
    expect(() =>
      validateRoleScopeAssignments({
        roleCodes: ['moderator'],
        warehouseIds: ['wh-2'],
        departmentIds: []
      })
    ).not.toThrow();
  });

  it('accepts catalog_editor with at least one department', () => {
    expect(() =>
      validateRoleScopeAssignments({
        roleCodes: ['catalog_editor'],
        warehouseIds: [],
        departmentIds: ['dept-2']
      })
    ).not.toThrow();
  });

  it('rejects catalog_editor with neither department nor warehouse', () => {
    expect(() =>
      validateRoleScopeAssignments({
        roleCodes: ['catalog_editor'],
        warehouseIds: [],
        departmentIds: []
      })
    ).toThrow();
  });

  it('accepts administrator with no warehouse or department assignments', () => {
    expect(() =>
      validateRoleScopeAssignments({
        roleCodes: ['administrator'],
        warehouseIds: [],
        departmentIds: []
      })
    ).not.toThrow();
  });

  it('accepts manager with no assignments', () => {
    expect(() =>
      validateRoleScopeAssignments({
        roleCodes: ['manager'],
        warehouseIds: [],
        departmentIds: []
      })
    ).not.toThrow();
  });

  it('accepts empty role list with no assignments', () => {
    expect(() =>
      validateRoleScopeAssignments({
        roleCodes: [],
        warehouseIds: [],
        departmentIds: []
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AccessControlService — synchronous pure methods
// ---------------------------------------------------------------------------

const makeService = () => new AccessControlService({ db: {} } as any);

const makeUser = (roleCodes: string[], assignedWarehouseIds: string[] = [], departmentIds: string[] = []) =>
  ({ roleCodes, assignedWarehouseIds, departmentIds, id: 'user-1', username: 'tester' } as any);

describe('AccessControlService.hasGlobalWarehouseAccess', () => {
  const service = makeService();

  it('returns true for administrator', () => {
    expect(service.hasGlobalWarehouseAccess(makeUser(['administrator']))).toBe(true);
  });

  it('returns true for manager', () => {
    expect(service.hasGlobalWarehouseAccess(makeUser(['manager']))).toBe(true);
  });

  it('returns false for warehouse_clerk', () => {
    expect(service.hasGlobalWarehouseAccess(makeUser(['warehouse_clerk']))).toBe(false);
  });

  it('returns false for moderator', () => {
    expect(service.hasGlobalWarehouseAccess(makeUser(['moderator']))).toBe(false);
  });

  it('returns false for catalog_editor', () => {
    expect(service.hasGlobalWarehouseAccess(makeUser(['catalog_editor']))).toBe(false);
  });

  it('returns false for empty role list', () => {
    expect(service.hasGlobalWarehouseAccess(makeUser([]))).toBe(false);
  });
});

describe('AccessControlService.hasGlobalDepartmentAccess', () => {
  const service = makeService();

  it('returns true for administrator', () => {
    expect(service.hasGlobalDepartmentAccess(makeUser(['administrator']))).toBe(true);
  });

  it('returns true for manager', () => {
    expect(service.hasGlobalDepartmentAccess(makeUser(['manager']))).toBe(true);
  });

  it('returns false for catalog_editor', () => {
    expect(service.hasGlobalDepartmentAccess(makeUser(['catalog_editor']))).toBe(false);
  });

  it('returns false for moderator', () => {
    expect(service.hasGlobalDepartmentAccess(makeUser(['moderator']))).toBe(false);
  });

  it('returns false for empty role list', () => {
    expect(service.hasGlobalDepartmentAccess(makeUser([]))).toBe(false);
  });
});

describe('AccessControlService.canAccessWarehouse', () => {
  const service = makeService();

  it('returns false when warehouseId is null', () => {
    expect(service.canAccessWarehouse(makeUser(['administrator']), null)).toBe(false);
  });

  it('returns false when warehouseId is undefined', () => {
    expect(service.canAccessWarehouse(makeUser(['administrator']), undefined)).toBe(false);
  });

  it('returns true for administrator regardless of assigned warehouses', () => {
    expect(service.canAccessWarehouse(makeUser(['administrator'], []), 'wh-any')).toBe(true);
  });

  it('returns true for manager regardless of assigned warehouses', () => {
    expect(service.canAccessWarehouse(makeUser(['manager'], []), 'wh-any')).toBe(true);
  });

  it('returns true when non-global user has the warehouse in assignedWarehouseIds', () => {
    expect(service.canAccessWarehouse(makeUser(['warehouse_clerk'], ['wh-1', 'wh-2']), 'wh-1')).toBe(true);
  });

  it('returns false when non-global user does not have the warehouse in assignedWarehouseIds', () => {
    expect(service.canAccessWarehouse(makeUser(['warehouse_clerk'], ['wh-1']), 'wh-99')).toBe(false);
  });

  it('returns false when non-global user has no assigned warehouses', () => {
    expect(service.canAccessWarehouse(makeUser(['warehouse_clerk'], []), 'wh-1')).toBe(false);
  });
});

describe('AccessControlService.ensureCatalogAnswerAccess', () => {
  const service = makeService();

  it('does not throw for administrator', () => {
    expect(() => service.ensureCatalogAnswerAccess(makeUser(['administrator']))).not.toThrow();
  });

  it('does not throw for catalog_editor', () => {
    expect(() => service.ensureCatalogAnswerAccess(makeUser(['catalog_editor']))).not.toThrow();
  });

  it('throws for manager', () => {
    expect(() => service.ensureCatalogAnswerAccess(makeUser(['manager']))).toThrow(
      'Only catalog editors and administrators can publish answers'
    );
  });

  it('throws for moderator', () => {
    expect(() => service.ensureCatalogAnswerAccess(makeUser(['moderator']))).toThrow();
  });

  it('throws for warehouse_clerk', () => {
    expect(() => service.ensureCatalogAnswerAccess(makeUser(['warehouse_clerk']))).toThrow();
  });
});
