import type { Page, Route } from '@playwright/test';

type MockRole = 'administrator' | 'manager' | 'moderator' | 'catalog_editor' | 'warehouse_clerk';

type MockUser = {
  sub: string;
  sid: string;
  username: string;
  displayName: string;
  roleCodes: string[];
  permissionCodes: string[];
  assignedWarehouseIds: string[];
  departmentIds: string[];
};

type MockSearchRow = {
  item_name: string;
  sku: string;
  barcode: string;
  lot_code: string;
  warehouse_id: string;
  warehouse_name: string;
  document_status: string;
  updated_at: string;
};

type MockOptions = {
  loginFails?: boolean;
  loginHintsFails?: boolean;
  captchaFails?: boolean;
  searchFails?: boolean;
  searchDelayMs?: number;
  exportFails?: boolean;
  exportDelayMs?: number;
  importFails?: boolean;
  precheckFails?: boolean;
  savedViewLimitReached?: boolean;
};

const encoder = new TextEncoder();

function buildUser(role: MockRole): MockUser {
  const map: Record<MockRole, MockUser> = {
    administrator: {
      sub: 'u-admin',
      sid: 'sid-admin',
      username: 'system.admin',
      displayName: 'System Administrator',
      roleCodes: ['administrator'],
      permissionCodes: ['users.manage', 'roles.manage', 'audit.view', 'warehouse.manage'],
      assignedWarehouseIds: [],
      departmentIds: ['dept-ops']
    },
    manager: {
      sub: 'u-manager',
      sid: 'sid-manager',
      username: 'ops.manager',
      displayName: 'Operations Manager',
      roleCodes: ['manager'],
      permissionCodes: [
        'warehouse.manage',
        'metrics.view',
        'documents.approve',
        'inventory.scan',
        'inventory.receive',
        'inventory.move',
        'inventory.pick',
        'inventory.count',
        'inventory.adjust'
      ],
      assignedWarehouseIds: [],
      departmentIds: ['dept-ops']
    },
    moderator: {
      sub: 'u-moderator',
      sid: 'sid-moderator',
      username: 'content.moderator',
      displayName: 'Content Moderator',
      roleCodes: ['moderator'],
      permissionCodes: ['moderation.resolve'],
      assignedWarehouseIds: [],
      departmentIds: ['dept-ops']
    },
    catalog_editor: {
      sub: 'u-catalog',
      sid: 'sid-catalog',
      username: 'catalog.editor',
      displayName: 'Catalog Editor',
      roleCodes: ['catalog_editor'],
      permissionCodes: ['catalog.edit', 'catalog.answer'],
      assignedWarehouseIds: [],
      departmentIds: ['dept-ops']
    },
    warehouse_clerk: {
      sub: 'u-clerk',
      sid: 'sid-clerk',
      username: 'warehouse.operator',
      displayName: 'Warehouse Clerk',
      roleCodes: ['warehouse_clerk'],
      permissionCodes: ['inventory.scan', 'inventory.receive', 'inventory.move', 'inventory.pick', 'inventory.count', 'inventory.adjust'],
      assignedWarehouseIds: ['wh-1'],
      departmentIds: ['dept-ops']
    }
  };

  return map[role];
}

function buildSearchRows(): MockSearchRow[] {
  return Array.from({ length: 35 }, (_, index) => {
    const warehouseId = index % 2 === 0 ? 'wh-1' : 'wh-2';
    const status = ['draft', 'submitted', 'approved', 'completed'][index % 4];
    const month = String((index % 9) + 1).padStart(2, '0');
    const day = String((index % 27) + 1).padStart(2, '0');

    return {
      item_name: `Inventory Item ${String(index + 1).padStart(2, '0')}`,
      sku: `SKU-${String(index + 1).padStart(3, '0')}`,
      barcode: `BC-${String(index + 1).padStart(5, '0')}`,
      lot_code: `LOT-${(index % 5) + 1}`,
      warehouse_id: warehouseId,
      warehouse_name: warehouseId === 'wh-1' ? 'Central Warehouse' : 'Secondary Warehouse',
      document_status: status,
      updated_at: `2026-${month}-${day}T08:30:00.000Z`
    };
  });
}

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body)
  });
}

function buffer(route: Route, status: number, body: string, contentType: string) {
  return route.fulfill({
    status,
    contentType,
    body: encoder.encode(body)
  });
}

export async function installMockApi(page: Page, options: MockOptions = {}) {
  const searchRows = buildSearchRows();
  const warehouses = [
    { id: 'wh-1', code: 'WH-1', name: 'Central Warehouse', department_id: 'dept-ops', department_name: 'District Ops', address: '12 Main St' },
    { id: 'wh-2', code: 'WH-2', name: 'Secondary Warehouse', department_id: 'dept-ops', department_name: 'District Ops', address: '44 East St' }
  ];
  const zones = [
    { id: 'zone-1', warehouse_id: 'wh-1', code: 'RECV', name: 'Receiving' },
    { id: 'zone-2', warehouse_id: 'wh-2', code: 'STAGE', name: 'Staging' }
  ];
  const bins = [
    {
      warehouse_id: 'wh-1',
      warehouse_name: 'Central Warehouse',
      zone_id: 'zone-1',
      zone_code: 'RECV',
      zone_name: 'Receiving',
      bin_id: 'bin-1',
      bin_code: 'BIN-A1',
      temperature_band: 'ambient',
      max_load_lbs: 500,
      max_length_in: 36,
      max_width_in: 24,
      max_height_in: 24,
      is_active: true
    },
    {
      warehouse_id: 'wh-1',
      warehouse_name: 'Central Warehouse',
      zone_id: 'zone-1',
      zone_code: 'RECV',
      zone_name: 'Receiving',
      bin_id: 'bin-2',
      bin_code: 'BIN-A2',
      temperature_band: 'ambient',
      max_load_lbs: 500,
      max_length_in: 36,
      max_width_in: 24,
      max_height_in: 24,
      is_active: true
    },
    {
      warehouse_id: 'wh-2',
      warehouse_name: 'Secondary Warehouse',
      zone_id: 'zone-2',
      zone_code: 'STAGE',
      zone_name: 'Staging',
      bin_id: 'bin-3',
      bin_code: 'BIN-B1',
      temperature_band: 'ambient',
      max_load_lbs: 500,
      max_length_in: 36,
      max_width_in: 24,
      max_height_in: 24,
      is_active: true
    }
  ];
  const roles = [
    { code: 'administrator', name: 'Administrator' },
    { code: 'manager', name: 'Manager' },
    { code: 'moderator', name: 'Moderator' },
    { code: 'catalog_editor', name: 'Catalog Editor' },
    { code: 'warehouse_clerk', name: 'Warehouse Clerk' }
  ];
  const departments = [{ id: 'dept-ops', code: 'district-ops', name: 'District Ops' }];
  const users = [
    {
      id: 'u-admin',
      username: 'system.admin',
      display_name: 'System Administrator',
      is_active: true,
      locked_until: null,
      roles: ['administrator'],
      warehouses: [],
      warehouse_ids: [],
      departments: ['District Ops'],
      department_ids: ['dept-ops']
    }
  ];
  let currentUser: MockUser | null = null;
  let sessionRotationCount = 0;
  const sessions = [
    { token_id: 'sid-current', rotation_reason: 'login', ip_address: '127.0.0.1', user_agent: 'Playwright', created_at: '2026-03-30T08:00:00.000Z' },
    { token_id: 'sid-legacy', rotation_reason: 'rotation', ip_address: '127.0.0.1', user_agent: 'Older Browser', created_at: '2026-03-29T08:00:00.000Z' }
  ];
  const inbox = [
    { id: 'note-1', title: 'Case update', body: 'Reporter-facing status changed.', created_at: '2026-03-30T08:30:00.000Z', read_at: null },
    { id: 'note-2', title: 'Document completed', body: 'Receiving document REC-1001 completed.', created_at: '2026-03-30T09:05:00.000Z', read_at: null }
  ];
  const savedViews: Array<{ id: string; view_name: string; filters: Record<string, unknown> }> = [];
  let firstReceiptCompleted = false;
  let firstReceiptLotCode = 'FIRST-LOT-001';
  const jobs = [{ id: 'job-1', filename: 'catalog-items.csv', status: 'completed', created_at: '2026-03-30T09:00:00.000Z', created_by_name: 'System Administrator' }];
  const jobResultsById: Record<string, any[]> = {
    'job-1': [{ row_number: 1, outcome: 'imported', message: 'Existing item updated' }]
  };
  const questions = [
    {
      id: 'q-1',
      question: 'Does this item fit standard classroom shelving?',
      asked_by: 'Warehouse Clerk',
      created_at: '2026-03-30T09:15:00.000Z',
      answers: []
    }
  ];
  const reviews = [
    {
      id: 'review-1',
      author: 'Warehouse Clerk',
      rating: 4,
      body: 'Holds up well during daily issue.',
      created_at: '2026-03-29T11:00:00.000Z',
      followups: [],
      images: []
    }
  ];
  const catalogItem = {
    id: 'item-1',
    sku: 'SKU-001',
    name: 'Storage Tote',
    description: 'Durable catalog item used across classrooms.',
    average_rating: 4.2,
    rating_count: reviews.length,
    is_favorited: true,
    unit_of_measure: 'each',
    temperature_band: 'ambient',
    weight_lbs: 4,
    length_in: 18,
    width_in: 12,
    height_in: 10
  };
  const defaultScanMatch = {
    item_id: 'item-1',
    item_name: 'Storage Tote',
    sku: 'SKU-001',
    barcode: 'BC-00001',
    temperature_band: 'ambient',
    weight_lbs: '4',
    length_in: '18',
    width_in: '12',
    height_in: '10'
  };
  const firstReceiptItem = {
    item_id: 'item-first',
    item_name: 'First Receipt Tote',
    sku: 'SKU-FIRST',
    barcode: 'BC-FIRST-RECEIPT',
    temperature_band: 'ambient',
    weight_lbs: '1',
    length_in: '10',
    width_in: '8',
    height_in: '4'
  };
  let catalogFavorited = true;
  const moderationCases = [
    {
      id: 'case-1',
      reason: 'Spam review',
      target_type: 'review',
      reporter_name: 'Warehouse Clerk',
      reporter_status: 'submitted',
      moderation_status: 'new',
      target_id: 'review-1'
    }
  ];
  const documents = [
    {
      id: 'doc-1',
      document_number: 'REC-1001',
      status: 'submitted',
      type: 'receiving',
      warehouse_id: 'wh-1',
      warehouse_name: 'Central Warehouse',
      updated_at: '2026-03-30T09:45:00.000Z',
      created_by_name: 'System Administrator',
      approved_by_name: null,
      completed_at: null,
      payload: {
        source: 'Dock 1',
        expectedArrivalDate: '2026-03-30',
        lines: [{ itemId: 'item-1', expectedQuantity: 4, targetBinId: 'bin-1', lotCode: 'LOT-1' }]
      },
      workflow: [
        { from_status: null, to_status: 'draft', changed_by_name: 'System Administrator', notes: 'Created', created_at: '2026-03-30T09:30:00.000Z' },
        { from_status: 'draft', to_status: 'submitted', changed_by_name: 'System Administrator', notes: 'Submitted', created_at: '2026-03-30T09:45:00.000Z' }
      ]
    },
    {
      id: 'doc-2',
      document_number: 'TRN-1002',
      status: 'approved',
      type: 'transfer',
      warehouse_id: 'wh-1',
      warehouse_name: 'Central Warehouse',
      updated_at: '2026-03-30T10:10:00.000Z',
      created_by_name: 'Operations Manager',
      approved_by_name: 'Operations Manager',
      completed_at: null,
      payload: {
        destinationWarehouseId: 'wh-2',
        requestedTransferDate: '2026-03-31',
        lines: [{ itemId: 'item-1', quantity: 2, sourceBinId: 'bin-1', targetBinId: 'bin-2', lotCode: 'LOT-2' }]
      },
      workflow: [
        { from_status: null, to_status: 'draft', changed_by_name: 'Operations Manager', notes: 'Created', created_at: '2026-03-30T09:55:00.000Z' },
        { from_status: 'draft', to_status: 'submitted', changed_by_name: 'Operations Manager', notes: 'Submitted', created_at: '2026-03-30T10:00:00.000Z' },
        { from_status: 'submitted', to_status: 'approved', changed_by_name: 'Operations Manager', notes: 'Approved', created_at: '2026-03-30T10:10:00.000Z' }
      ]
    }
  ];

  function currentCatalogDetail() {
    return {
      item: {
        ...catalogItem,
        rating_count: reviews.length,
        is_favorited: catalogFavorited
      },
      reviews,
      questions,
      favorites: [{ sku: catalogItem.sku, name: catalogItem.name, created_at: '2026-03-28T10:00:00.000Z' }],
      history: [{ sku: catalogItem.sku, name: catalogItem.name, viewed_at: '2026-03-30T10:05:00.000Z' }]
    };
  }

  function listDocuments(status?: string | null) {
    return documents
      .filter((document) => !status || document.status === status)
      .map((document) => ({
        id: document.id,
        document_number: document.document_number,
        status: document.status,
        type: document.type,
        warehouse_name: document.warehouse_name,
        updated_at: document.updated_at
      }));
  }

  function documentDetail(documentId: string) {
    const document = documents.find((entry) => entry.id === documentId);
    if (!document) {
      return null;
    }

    return {
      document,
      workflow: document.workflow
    };
  }

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;

    if (path === '/api/auth/me' && method === 'GET') {
      return currentUser ? json(route, 200, currentUser) : json(route, 401, { message: 'Not authenticated' });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = request.postDataJSON() as { username?: string; loginActor?: string };
      if (options.loginFails || body.username === 'denied.user') {
        return json(route, 401, { message: 'Invalid username or password' });
      }

      const roleByActor: Record<string, MockRole> = {
        administrator: 'administrator',
        manager: 'manager',
        moderator: 'moderator',
        'catalog-editor': 'catalog_editor',
        'warehouse-clerk': 'warehouse_clerk'
      };

      currentUser = buildUser(roleByActor[body.loginActor || 'warehouse-clerk'] || 'warehouse_clerk');
      sessions[0].token_id = currentUser.sid;
      return json(route, 200, { token: 'mock-token', user: currentUser });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      currentUser = null;
      return json(route, 200, { success: true });
    }

    if (path === '/api/auth/sessions/rotate' && method === 'POST') {
      if (!currentUser) {
        return json(route, 401, { message: 'Not authenticated' });
      }

      sessionRotationCount += 1;
      const previousSessionId = currentUser.sid;
      const nextSessionId = `${previousSessionId}-r${sessionRotationCount}`;
      currentUser = {
        ...currentUser,
        sid: nextSessionId
      };
      sessions[0] = {
        ...sessions[0],
        token_id: nextSessionId,
        rotation_reason: 'session_rotation',
        created_at: `2026-03-30T08:${String(sessionRotationCount).padStart(2, '0')}:00.000Z`
      };

      return json(route, 200, { token: `mock-token-${sessionRotationCount}`, user: currentUser });
    }

    if (path === '/api/auth/login-hints' && method === 'GET') {
      if (options.loginHintsFails) {
        return json(route, 503, { message: 'Login hint service unavailable' });
      }

      return json(route, 200, { captchaRequired: Boolean(options.captchaFails), lockedUntil: null });
    }

    if (path === '/api/auth/captcha' && method === 'GET') {
      if (options.captchaFails) {
        return json(route, 503, { message: 'Captcha service unavailable' });
      }
      return json(route, 200, { id: 'cap-1', svg: '<svg></svg>', expiresAt: '2026-03-31T23:59:59.000Z' });
    }

    if (path === '/api/auth/sessions' && method === 'GET') {
      return json(route, 200, sessions);
    }

    if (path.startsWith('/api/auth/sessions/') && path.endsWith('/revoke') && method === 'POST') {
      const sessionId = path.split('/')[4];
      const sessionIndex = sessions.findIndex((entry) => entry.token_id === sessionId);
      if (sessionIndex >= 0) {
        sessions.splice(sessionIndex, 1);
      }
      return json(route, 200, { success: true });
    }

    if (path === '/api/auth/change-password' && method === 'POST') {
      return json(route, 200, { success: true });
    }

    if (path === '/api/inbox' && method === 'GET') {
      return json(route, 200, inbox);
    }

    if (path.startsWith('/api/inbox/') && path.endsWith('/read') && method === 'POST') {
      const notificationId = path.split('/')[3];
      const notification = inbox.find((entry) => entry.id === notificationId);
      if (notification) {
        notification.read_at = '2026-03-30T11:30:00.000Z';
      }
      return json(route, 200, { success: true });
    }

    if (path === '/api/inbox/read-all' && method === 'POST') {
      for (const notification of inbox) {
        notification.read_at = notification.read_at || '2026-03-30T11:31:00.000Z';
      }
      return json(route, 200, { success: true });
    }

    if (path === '/api/search' && method === 'GET') {
      if (options.searchFails) {
        return json(route, 500, { message: 'Search backend unavailable' });
      }
      if (options.searchDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.searchDelayMs));
      }

      const item = (url.searchParams.get('item') || '').toLowerCase();
      const lot = (url.searchParams.get('lot') || '').toLowerCase();
      const warehouseId = (url.searchParams.get('warehouseId') || '').toLowerCase();
      const documentStatus = (url.searchParams.get('documentStatus') || '').toLowerCase();
      const dateFrom = url.searchParams.get('dateFrom');
      const dateTo = url.searchParams.get('dateTo');
      const sortBy = url.searchParams.get('sortBy') || 'updatedAt';
      const sortDir = url.searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc';
      const page = Number(url.searchParams.get('page') || '1');
      const pageSize = Number(url.searchParams.get('pageSize') || '25');

      let results = searchRows.filter((row) =>
        (!item || [row.item_name, row.sku, row.barcode].join(' ').toLowerCase().includes(item)) &&
        (!lot || row.lot_code.toLowerCase().includes(lot)) &&
        (!warehouseId || row.warehouse_id.toLowerCase().includes(warehouseId)) &&
        (!documentStatus || row.document_status.toLowerCase().includes(documentStatus)) &&
        (!dateFrom || row.updated_at >= `${dateFrom}T00:00:00.000Z`) &&
        (!dateTo || row.updated_at < `${dateTo}T23:59:59.999Z`)
      );

      const sorters: Record<string, (row: MockSearchRow) => string> = {
        itemName: (row) => row.item_name,
        lot: (row) => row.lot_code,
        warehouse: (row) => row.warehouse_name,
        documentStatus: (row) => row.document_status,
        updatedAt: (row) => row.updated_at
      };
      const sorter = sorters[sortBy] || sorters.updatedAt;
      results = [...results].sort((left, right) => {
        const result = sorter(left).localeCompare(sorter(right));
        return sortDir === 'asc' ? result : -result;
      });

      const total = results.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const pageStart = (page - 1) * pageSize;
      const pageRows = results.slice(pageStart, pageStart + pageSize);

      return json(route, 200, { results: pageRows, total, totalPages });
    }

    if (path === '/api/search/views' && method === 'GET') {
      return json(route, 200, savedViews);
    }

    if (path === '/api/search/views' && method === 'POST') {
      if (options.savedViewLimitReached) {
        return json(route, 409, { message: 'Saved view limit reached. Update an existing view or delete one before creating another.' });
      }

      const body = request.postDataJSON() as { viewName: string; filters: Record<string, unknown> };
      savedViews.unshift({
        id: `view-${savedViews.length + 1}`,
        view_name: body.viewName,
        filters: body.filters
      });
      return json(route, 201, {
        id: savedViews[0].id,
        view_name: body.viewName,
        filters: body.filters,
        created_at: '2026-04-04T09:00:00.000Z'
      });
    }

    if (path === '/api/inventory/scan' && method === 'POST') {
      const body = request.postDataJSON() as { code: string };
      if (body.code === 'bad-scan') {
        return json(route, 200, { kind: 'no_match', code: body.code, message: 'No matching item or lot found' });
      }

      if (body.code === 'BC-FIRST-RECEIPT' || body.code === 'SKU-FIRST') {
        if (!firstReceiptCompleted) {
          return json(route, 200, {
            kind: 'item_only',
            code: body.code,
            item: firstReceiptItem,
            receiving_warehouses: [
              { warehouse_id: 'wh-1', warehouse_name: 'Central Warehouse' },
              { warehouse_id: 'wh-2', warehouse_name: 'Secondary Warehouse' }
            ]
          });
        }

        return json(route, 200, {
          kind: 'single_position',
          code: body.code,
          match: {
            ...firstReceiptItem,
            lot_id: 'lot-first',
            lot_code: firstReceiptLotCode,
            quantity_on_hand: '1',
            warehouse_id: 'wh-2',
            warehouse_name: 'Secondary Warehouse',
            bin_id: 'bin-3',
            bin_code: 'BIN-B1',
            bin_quantity: '1'
          }
        });
      }

      if (body.code === 'BC-MULTI-LOT') {
        return json(route, 200, {
          kind: 'multiple_positions',
          code: body.code,
          matches: [
            {
              ...firstReceiptItem,
              item_id: 'item-multi',
              item_name: 'Multi Lot Tote',
              sku: 'SKU-MULTI',
              barcode: 'BC-MULTI-LOT',
              lot_id: 'lot-multi-1',
              lot_code: 'LOT-A',
              quantity_on_hand: '4',
              warehouse_id: 'wh-1',
              warehouse_name: 'Central Warehouse',
              bin_id: 'bin-1',
              bin_code: 'BIN-A1',
              bin_quantity: '2'
            },
            {
              ...firstReceiptItem,
              item_id: 'item-multi',
              item_name: 'Multi Lot Tote',
              sku: 'SKU-MULTI',
              barcode: 'BC-MULTI-LOT',
              lot_id: 'lot-multi-2',
              lot_code: 'LOT-B',
              quantity_on_hand: '7',
              warehouse_id: 'wh-1',
              warehouse_name: 'Central Warehouse',
              bin_id: 'bin-2',
              bin_code: 'BIN-A2',
              bin_quantity: '3'
            }
          ]
        });
      }

      return json(route, 200, {
        kind: 'single_position',
        code: body.code,
        match: {
          ...defaultScanMatch,
          lot_id: 'lot-1',
          lot_code: 'LOT-1',
          warehouse_id: 'wh-1',
          warehouse_name: 'Central Warehouse',
          bin_id: 'bin-1',
          bin_code: 'BIN-A1',
          quantity_on_hand: '18',
          bin_quantity: '18'
        }
      });
    }

    if (path === '/api/inventory/pick' && method === 'POST') {
      return json(route, 200, { success: true });
    }

    if (path === '/api/inventory/move' && method === 'POST') {
      return json(route, 200, { success: true });
    }

    if (path === '/api/inventory/receive' && method === 'POST') {
      const body = request.postDataJSON() as { itemId?: string; lotCode?: string };
      if (body.itemId === 'item-first') {
        firstReceiptCompleted = true;
        firstReceiptLotCode = body.lotCode || firstReceiptLotCode;
      }
      return json(route, 200, { success: true });
    }

    if (path === '/api/documents' && method === 'GET') {
      return json(route, 200, listDocuments(url.searchParams.get('status')));
    }

    if (path === '/api/documents' && method === 'POST') {
      const body = request.postDataJSON() as { warehouseId: string; type: string; payload?: Record<string, unknown>; documentNumber?: string };
      const warehouse = warehouses.find((entry) => entry.id === body.warehouseId);
      const nextId = `doc-${documents.length + 1}`;
      const nextNumber = body.documentNumber || `${body.type.toUpperCase().slice(0, 3)}-${1000 + documents.length + 1}`;
      const createdAt = '2026-03-30T11:00:00.000Z';
      documents.unshift({
        id: nextId,
        document_number: nextNumber,
        status: 'draft',
        type: body.type,
        warehouse_id: body.warehouseId,
        warehouse_name: warehouse?.name || body.warehouseId,
        updated_at: createdAt,
        created_by_name: currentUser?.displayName || 'Operator',
        approved_by_name: null,
        completed_at: null,
        payload: body.payload || {},
        workflow: [
          { from_status: null, to_status: 'draft', changed_by_name: currentUser?.displayName || 'Operator', notes: 'Created from UI', created_at: createdAt }
        ]
      });
      return json(route, 201, { id: nextId, documentNumber: nextNumber });
    }

    if (path.startsWith('/api/documents/') && method === 'GET') {
      const documentId = path.split('/')[3];
      const detail = documentDetail(documentId);
      if (!detail) {
        return json(route, 404, { message: 'Document not found' });
      }
      return json(route, 200, detail);
    }

    if (path.startsWith('/api/documents/') && path.endsWith('/transition') && method === 'POST') {
      const documentId = path.split('/')[3];
      const body = request.postDataJSON() as { toStatus: string; notes?: string };
      const document = documents.find((entry) => entry.id === documentId);
      if (!document) {
        return json(route, 404, { message: 'Document not found' });
      }
      const fromStatus = document.status;
      document.status = body.toStatus;
      document.updated_at = '2026-03-30T11:10:00.000Z';
      if (body.toStatus === 'approved') {
        document.approved_by_name = currentUser?.displayName || 'Operator';
      }
      document.workflow.push({
        from_status: fromStatus,
        to_status: body.toStatus,
        changed_by_name: currentUser?.displayName || 'Operator',
        notes: body.notes || null,
        created_at: document.updated_at
      });
      return json(route, 200, { success: true });
    }

    if (path.startsWith('/api/documents/') && path.endsWith('/execute-receiving') && method === 'POST') {
      const document = documents.find((entry) => entry.id === path.split('/')[3]);
      if (document) {
        document.status = 'completed';
        document.completed_at = '2026-03-30T11:15:00.000Z';
        document.updated_at = document.completed_at;
        document.workflow.push({
          from_status: 'approved',
          to_status: 'completed',
          changed_by_name: currentUser?.displayName || 'Operator',
          notes: 'Receiving executed',
          created_at: document.completed_at
        });
      }
      return json(route, 200, { lotIds: ['lot-200'] });
    }

    if (path.startsWith('/api/documents/') && path.endsWith('/execute-shipping') && method === 'POST') {
      const document = documents.find((entry) => entry.id === path.split('/')[3]);
      if (document) {
        document.status = 'completed';
        document.completed_at = '2026-03-30T11:20:00.000Z';
        document.updated_at = document.completed_at;
        document.workflow.push({
          from_status: 'approved',
          to_status: 'completed',
          changed_by_name: currentUser?.displayName || 'Operator',
          notes: 'Shipping executed',
          created_at: document.completed_at
        });
      }
      return json(route, 200, { pickedLotIds: ['lot-201'] });
    }

    if (path.startsWith('/api/documents/') && path.endsWith('/execute-transfer') && method === 'POST') {
      const document = documents.find((entry) => entry.id === path.split('/')[3]);
      if (document) {
        document.status = 'completed';
        document.completed_at = '2026-03-30T11:25:00.000Z';
        document.updated_at = document.completed_at;
        document.workflow.push({
          from_status: 'approved',
          to_status: 'completed',
          changed_by_name: currentUser?.displayName || 'Operator',
          notes: 'Transfer executed',
          created_at: document.completed_at
        });
      }
      return json(route, 200, { targetLotIds: ['lot-202'] });
    }

    if (path === '/api/warehouse-setup/options' && method === 'GET') {
      return json(route, 200, { departments, temperatureBands: ['ambient', 'chilled', 'frozen'] });
    }

    if (path === '/api/warehouses' && method === 'GET') {
      return json(route, 200, warehouses);
    }

    if (path === '/api/warehouses' && method === 'POST') {
      const body = request.postDataJSON() as { code: string; name: string; departmentId: string; address?: string };
      warehouses.push({
        id: `wh-${warehouses.length + 1}`,
        code: body.code,
        name: body.name,
        department_id: body.departmentId,
        department_name: 'District Ops',
        address: body.address || ''
      });
      return json(route, 201, { success: true });
    }

    if (path.startsWith('/api/warehouses/') && path.endsWith('/zones') && method === 'POST') {
      const warehouseId = path.split('/')[3];
      const body = request.postDataJSON() as { code: string; name: string };
      zones.push({ id: `zone-${zones.length + 1}`, warehouse_id: warehouseId, code: body.code, name: body.name });
      return json(route, 201, { success: true });
    }

    if (path.startsWith('/api/warehouses/') && path.endsWith('/tree') && method === 'GET') {
      const warehouseId = path.split('/')[3];
      return json(route, 200, bins.filter((bin) => bin.warehouse_id === warehouseId));
    }

    if (path.startsWith('/api/zones/') && path.endsWith('/bins') && method === 'POST') {
      const zoneId = path.split('/')[3];
      const zone = zones.find((entry) => entry.id === zoneId);
      const warehouse = warehouses.find((entry) => entry.id === zone?.warehouse_id);
      const body = request.postDataJSON() as any;
      bins.push({
        warehouse_id: warehouse?.id || 'wh-1',
        warehouse_name: warehouse?.name || 'Central Warehouse',
        zone_id: zoneId,
        zone_code: zone?.code || 'RECV',
        zone_name: zone?.name || 'Receiving',
        bin_id: `bin-${bins.length + 1}`,
        bin_code: body.code,
        temperature_band: body.temperatureBand,
        max_load_lbs: body.maxLoadLbs,
        max_length_in: body.maxLengthIn,
        max_width_in: body.maxWidthIn,
        max_height_in: body.maxHeightIn,
        is_active: body.isActive
      });
      return json(route, 201, { success: true });
    }

    if (path.startsWith('/api/zones/') && method === 'PATCH') {
      return json(route, 200, { success: true });
    }

    if (path.startsWith('/api/bins/') && path.endsWith('/timeline') && method === 'GET') {
      return json(route, 200, [{ action: 'created', changed_by_name: 'System Administrator', reason: 'Initial setup', created_at: '2026-03-30T09:30:00.000Z' }]);
    }

    if (path.startsWith('/api/bins/') && path.endsWith('/toggle') && method === 'POST') {
      return json(route, 200, { success: true });
    }

    if (path.startsWith('/api/bins/') && method === 'PATCH') {
      return json(route, 200, { success: true });
    }

    if (path === '/api/access-control/options' && method === 'GET') {
      return json(route, 200, { roles, warehouses, departments });
    }

    if (path === '/api/users' && method === 'GET') {
      return json(route, 200, users);
    }

    if (path === '/api/users' && method === 'POST') {
      const body = request.postDataJSON() as any;
      users.push({
        id: `u-${users.length + 1}`,
        username: body.username,
        display_name: body.displayName,
        is_active: body.isActive ?? true,
        locked_until: null,
        roles: body.roleCodes ?? [],
        warehouses: (body.warehouseIds ?? []).map((id: string) => warehouses.find((entry) => entry.id === id)?.name || id),
        warehouse_ids: body.warehouseIds ?? [],
        departments: (body.departmentIds ?? []).map((id: string) => departments.find((entry) => entry.id === id)?.name || id),
        department_ids: body.departmentIds ?? []
      });
      return json(route, 201, { success: true });
    }

    if (path.startsWith('/api/users/') && path.endsWith('/access-control') && method === 'PUT') {
      const userId = path.split('/')[3];
      const body = request.postDataJSON() as any;
      const user = users.find((entry) => entry.id === userId);
      if (user) {
        user.roles = body.roleCodes ?? [];
        user.warehouses = (body.warehouseIds ?? []).map((id: string) => warehouses.find((entry) => entry.id === id)?.name || id);
        user.warehouse_ids = body.warehouseIds ?? [];
        user.departments = (body.departmentIds ?? []).map((id: string) => departments.find((entry) => entry.id === id)?.name || id);
        user.department_ids = body.departmentIds ?? [];
      }
      return json(route, 200, { success: true });
    }

    if (path.startsWith('/api/users/') && path.endsWith('/unlock') && method === 'POST') {
      return json(route, 200, { success: true });
    }

    if (path.startsWith('/api/users/') && method === 'PATCH') {
      return json(route, 200, { success: true });
    }

    if (path === '/api/audit-log' && method === 'GET') {
      return json(route, 200, [
        {
          timestamp: '2026-03-30T09:45:00.000Z',
          action_type: 'access_control.updated',
          resource_type: 'user',
          resource_id: 'u-admin',
          ip_address: '127.0.0.1',
          details: { action: 'role_assignment' }
        }
      ]);
    }

    if (path === '/api/catalog/items' && method === 'GET') {
      return json(route, 200, [{ id: catalogItem.id, sku: catalogItem.sku, name: catalogItem.name }]);
    }

    if (path === '/api/catalog/items/item-1' && method === 'GET') {
      return json(route, 200, currentCatalogDetail());
    }

    if (path === '/api/catalog/items/item-1' && method === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      catalogItem.name = String(body.name ?? catalogItem.name);
      catalogItem.description = String(body.description ?? catalogItem.description);
      catalogItem.unit_of_measure = String(body.unitOfMeasure ?? catalogItem.unit_of_measure);
      catalogItem.temperature_band = String(body.temperatureBand ?? catalogItem.temperature_band);
      catalogItem.weight_lbs = Number(body.weightLbs ?? catalogItem.weight_lbs);
      catalogItem.length_in = Number(body.lengthIn ?? catalogItem.length_in);
      catalogItem.width_in = Number(body.widthIn ?? catalogItem.width_in);
      catalogItem.height_in = Number(body.heightIn ?? catalogItem.height_in);
      return json(route, 200, {
        ...catalogItem
      });
    }

    if (path === '/api/catalog/items/item-1/favorite' && method === 'POST') {
      const body = request.postDataJSON() as { favorite?: boolean };
      catalogFavorited = body.favorite ?? true;
      return json(route, 200, { success: true });
    }

    if (path === '/api/catalog/items/item-1/reviews' && method === 'POST') {
      const body = request.postDataJSON() as { rating: number; body: string };
      reviews.unshift({
        id: `review-${reviews.length + 1}`,
        author: currentUser?.displayName || 'Operator',
        rating: body.rating,
        body: body.body,
        created_at: '2026-03-30T11:05:00.000Z',
        followups: [],
        images: []
      });
      return json(route, 200, { success: true });
    }

    if (path === '/api/catalog/items/item-1/questions' && method === 'POST') {
      const body = request.postDataJSON() as { question: string };
      questions.unshift({
        id: `q-${questions.length + 1}`,
        question: body.question,
        asked_by: currentUser?.displayName || 'Operator',
        created_at: '2026-03-30T11:06:00.000Z',
        answers: []
      });
      return json(route, 201, { success: true });
    }

    if (path.startsWith('/api/catalog/questions/') && path.endsWith('/answers') && method === 'POST') {
      const questionId = path.split('/')[4];
      const question = questions.find((entry) => entry.id === questionId);
      const body = request.postDataJSON() as { body: string };
      const canAnswer = currentUser?.roleCodes.includes('catalog_editor') || currentUser?.roleCodes.includes('administrator');
      if (!canAnswer) {
        return json(route, 403, { message: 'Only catalog editors and administrators can publish answers' });
      }
      if (question) {
        question.answers.push({
          id: `answer-${question.answers.length + 1}`,
          body: body.body,
          answered_by: currentUser?.displayName || 'Operator',
          is_catalog_editor_answer: currentUser?.roleCodes.includes('catalog_editor') || currentUser?.roleCodes.includes('administrator'),
          created_at: '2026-03-30T11:07:00.000Z'
        });
      }
      return json(route, 201, { success: true });
    }

    if (path.startsWith('/api/catalog/reviews/') && path.endsWith('/followups') && method === 'POST') {
      const reviewId = path.split('/')[4];
      const review = reviews.find((entry) => entry.id === reviewId);
      const body = request.postDataJSON() as { body: string };
      if (review) {
        review.followups.push({
          body: body.body,
          created_at: '2026-03-30T11:08:00.000Z'
        });
      }
      return json(route, 201, { success: true });
    }

    if (path.startsWith('/api/catalog/reviews/') && path.endsWith('/images') && method === 'POST') {
      const reviewId = path.split('/')[4];
      const review = reviews.find((entry) => entry.id === reviewId);
      if (review) {
        review.images.push({
          content_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9sR0wFUAAAAASUVORK5CYII='
        });
      }
      return json(route, 201, { success: true });
    }

    if (path === '/api/moderation/reports' && method === 'POST') {
      const body = request.postDataJSON() as { targetType: string; targetId: string; reason: string };
      moderationCases.unshift({
        id: `case-${moderationCases.length + 1}`,
        reason: body.reason,
        target_type: body.targetType,
        reporter_name: currentUser?.displayName || 'Operator',
        reporter_status: 'submitted',
        moderation_status: 'new',
        target_id: body.targetId
      });
      inbox.unshift({
        id: `note-${inbox.length + 1}`,
        title: 'Abuse report submitted',
        body: `Report for ${body.targetType} is now in review.`,
        created_at: '2026-03-30T11:09:00.000Z',
        read_at: null
      });
      return json(route, 201, { success: true });
    }

    if (path === '/api/moderation/queue' && method === 'GET') {
      return json(route, 200, moderationCases);
    }

    if (path.startsWith('/api/moderation/reports/') && path.endsWith('/status') && method === 'POST') {
      const reportId = path.split('/')[4];
      const body = request.postDataJSON() as { reporterStatus: string; moderationStatus: string };
      const caseItem = moderationCases.find((entry) => entry.id === reportId);
      if (caseItem) {
        caseItem.reporter_status = body.reporterStatus;
        caseItem.moderation_status = body.moderationStatus;
      }
      inbox.unshift({
        id: `note-${inbox.length + 1}`,
        title: 'Case status updated',
        body: `Report ${reportId} is now ${body.reporterStatus}.`,
        created_at: '2026-03-30T11:12:00.000Z',
        read_at: null
      });
      return json(route, 200, { success: true });
    }

    if (path === '/api/bulk/templates/catalog-items' && method === 'GET') {
      return buffer(route, 200, 'sku,name,unit_of_measure\n', url.searchParams.get('format') === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv;charset=utf-8');
    }

    if (path === '/api/bulk/catalog-items/precheck' && method === 'POST') {
      if (options.precheckFails) {
        return json(route, 200, {
          summary: { totalRows: 1, validRows: 0, warningRows: 0, errorRows: 1 },
          rows: [{ rowNumber: 1, outcome: 'error', message: 'Duplicate barcode detected' }]
        });
      }

      return json(route, 200, {
        summary: { totalRows: 1, validRows: 1, warningRows: 0, errorRows: 0 },
        rows: [{ rowNumber: 1, outcome: 'valid', message: 'Ready to import' }]
      });
    }

    if (path === '/api/bulk/catalog-items/import' && method === 'POST') {
      if (options.importFails) {
        return json(route, 422, { message: 'Transactional import failed' });
      }

      const nextJobId = `job-${jobs.length + 1}`;
      jobs.unshift({ id: nextJobId, filename: 'catalog-items.csv', status: 'completed', created_at: '2026-03-30T10:00:00.000Z', created_by_name: currentUser?.displayName || 'Operator' });
      jobResultsById[nextJobId] = [{ row_number: 1, outcome: 'imported', message: 'Catalog item created' }];
      return json(route, 200, { status: 'completed', rows: [{ rowNumber: 1, message: 'Catalog item created' }] });
    }

    if (path === '/api/bulk/catalog-items/export' && method === 'GET') {
      if (options.exportDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.exportDelayMs));
      }
      if (options.exportFails) {
        return json(route, 403, { message: 'Export is not allowed for this role' });
      }

      return buffer(route, 200, 'sku,name\nSKU-001,Storage Tote\n', url.searchParams.get('format') === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv;charset=utf-8');
    }

    if (path === '/api/bulk/jobs' && method === 'GET') {
      return json(route, 200, jobs);
    }

    if (path.startsWith('/api/bulk/jobs/') && path.endsWith('/results') && method === 'GET') {
      const jobId = path.split('/')[4];
      return json(route, 200, jobResultsById[jobId] || []);
    }

    return json(route, 404, { message: `Unhandled mock API route: ${method} ${path}` });
  });
}
