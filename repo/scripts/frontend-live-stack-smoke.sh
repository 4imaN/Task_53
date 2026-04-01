#!/bin/sh
set -eu

if [ -z "${OMNISTOCK_E2E_USERNAME:-}" ] || [ -z "${OMNISTOCK_E2E_PASSWORD:-}" ]; then
  echo "Set OMNISTOCK_E2E_USERNAME and OMNISTOCK_E2E_PASSWORD before running this smoke."
  exit 1
fi

ACTOR="${OMNISTOCK_E2E_ACTOR:-administrator}"

docker compose exec -T omnistock-frontend sh -lc "wget -qO- http://127.0.0.1 | grep -q 'OmniStock'"

docker compose exec -T omnistock-api sh -lc "
  OMNISTOCK_E2E_USERNAME='$OMNISTOCK_E2E_USERNAME' \
  OMNISTOCK_E2E_PASSWORD='$OMNISTOCK_E2E_PASSWORD' \
  OMNISTOCK_E2E_ACTOR='$ACTOR' \
  node -e \"
    const username = process.env.OMNISTOCK_E2E_USERNAME;
    const password = process.env.OMNISTOCK_E2E_PASSWORD;
    const loginActor = process.env.OMNISTOCK_E2E_ACTOR;

    const loginResponse = await fetch('http://127.0.0.1:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password, loginActor })
    });

    if (!loginResponse.ok) {
      const body = await loginResponse.text();
      throw new Error('Login failed: ' + loginResponse.status + ' ' + body);
    }

    const loginBody = await loginResponse.json();
    const token = loginBody.token;

    const meResponse = await fetch('http://127.0.0.1:3000/api/auth/me', {
      headers: { authorization: 'Bearer ' + token }
    });
    if (!meResponse.ok) {
      throw new Error('auth/me failed: ' + meResponse.status);
    }

    const usersResponse = await fetch('http://127.0.0.1:3000/api/users', {
      headers: { authorization: 'Bearer ' + token }
    });
    if (!usersResponse.ok) {
      throw new Error('users failed: ' + usersResponse.status);
    }

    const searchResponse = await fetch('http://127.0.0.1:3000/api/search?page=1&pageSize=10&sortBy=updatedAt&sortDir=desc', {
      headers: { authorization: 'Bearer ' + token }
    });
    if (!searchResponse.ok) {
      throw new Error('search failed: ' + searchResponse.status);
    }

    const me = await meResponse.json();
    const users = await usersResponse.json();
    const search = await searchResponse.json();

    if (!Array.isArray(users) || !Array.isArray(search.results)) {
      throw new Error('Unexpected API payload shape');
    }

    console.log(JSON.stringify({
      username: me.username,
      roles: me.roleCodes,
      users: users.length,
      searchRows: search.results.length,
      total: search.total
    }));
  \"
"
