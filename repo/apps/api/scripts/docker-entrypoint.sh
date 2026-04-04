#!/bin/sh
set -eu

SECRET_DIR="${OMNISTOCK_SECRET_DIR:-/run/omnistock-secrets}"

read_secret_if_missing() {
  var_name="$1"
  file_name="$2"
  file_path="${SECRET_DIR}/${file_name}"

  eval "current_value=\${${var_name}:-}"
  if [ -n "${current_value}" ]; then
    return
  fi

  if [ ! -f "${file_path}" ]; then
    return
  fi

  secret_value="$(tr -d '\r\n' < "${file_path}")"
  if [ -n "${secret_value}" ]; then
    export "${var_name}=${secret_value}"
  fi
}

: "${POSTGRES_DB:=omnistock}"
: "${POSTGRES_USER:=omnistock}"
: "${POSTGRES_HOST:=omnistock-db}"
: "${POSTGRES_PORT:=5432}"
export POSTGRES_DB POSTGRES_USER POSTGRES_HOST POSTGRES_PORT

read_secret_if_missing POSTGRES_PASSWORD postgres_password
read_secret_if_missing JWT_SECRET jwt_secret
read_secret_if_missing ENCRYPTION_KEY encryption_key
read_secret_if_missing DEFAULT_ADMIN_PASSWORD default_admin_password

if [ -z "${DATABASE_URL:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
  export DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
fi

: "${DEFAULT_ADMIN_USERNAME:=admin}"
export DEFAULT_ADMIN_USERNAME

required_vars="DATABASE_URL JWT_SECRET ENCRYPTION_KEY DEFAULT_ADMIN_PASSWORD"
for var_name in ${required_vars}; do
  eval "value=\${${var_name}:-}"
  if [ -z "${value}" ]; then
    echo "Missing required runtime configuration: ${var_name}" >&2
    echo "Either provide it as an environment variable or ensure ${SECRET_DIR} has the expected secret files." >&2
    exit 1
  fi
done

wait-for-postgres.sh
npm run migrate
npm run bootstrap:admin
exec node dist/index.js
