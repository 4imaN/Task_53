import type { APIRequestContext } from '@playwright/test';

type LoginActor = 'administrator' | 'manager' | 'moderator' | 'catalog-editor' | 'warehouse-clerk';

const ensureOk = async (response: Awaited<ReturnType<APIRequestContext['get']>>, message: string) => {
  if (response.ok()) {
    return;
  }

  throw new Error(`${message}: ${response.status()} ${await response.text()}`);
};

export const loginViaApi = async (
  request: APIRequestContext,
  actor: LoginActor,
  username: string,
  password: string
) => {
  const response = await request.post('/api/auth/login', {
    data: {
      username,
      password,
      loginActor: actor
    }
  });
  await ensureOk(response, 'API login failed');
  const body = await response.json() as { token?: string };
  if (!body.token) {
    throw new Error('API login did not return a token');
  }

  return body.token;
};

const getJson = async <T>(request: APIRequestContext, token: string, url: string): Promise<T> => {
  const response = await request.get(url, {
    headers: { authorization: `Bearer ${token}` }
  });
  await ensureOk(response, `GET ${url} failed`);
  return response.json() as Promise<T>;
};

const postJson = async <T>(request: APIRequestContext, token: string, url: string, data: unknown): Promise<T> => {
  const response = await request.post(url, {
    headers: { authorization: `Bearer ${token}` },
    data
  });
  await ensureOk(response, `POST ${url} failed`);
  return response.json() as Promise<T>;
};

export const createReceivingDocumentFixture = async (
  request: APIRequestContext,
  actor: LoginActor,
  username: string,
  password: string
) => {
  const token = await loginViaApi(request, actor, username, password);
  const warehouses = await getJson<Array<{ id: string }>>(request, token, '/api/warehouses');
  const items = await getJson<Array<{ id: string }>>(request, token, '/api/catalog/items');

  if (!warehouses.length) {
    throw new Error('No warehouses were returned from the live API');
  }
  if (!items.length) {
    throw new Error('No catalog items were returned from the live API');
  }

  const warehouseId = warehouses[0].id;
  const tree = await getJson<Array<{ bin_id: string | null }>>(request, token, `/api/warehouses/${warehouseId}/tree`);
  const targetBinId = tree.find((row) => row.bin_id)?.bin_id;
  if (!targetBinId) {
    throw new Error('No selectable target bin was returned from the live API');
  }

  const suffix = Date.now().toString();
  return postJson<{ id: string; documentNumber: string }>(request, token, '/api/documents', {
    warehouseId,
    type: 'receiving',
    documentNumber: `SMOKE-REC-${suffix}`,
    payload: {
      source: 'Playwright local smoke',
      lines: [
        {
          itemId: items[0].id,
          expectedQuantity: 1,
          targetBinId,
          lotCode: `SMOKE-LOT-${suffix}`
        }
      ]
    }
  });
};
