#!/bin/sh
set -eu

host="omnistock-db"
port="5432"

until nc -z "$host" "$port"; do
  echo "Waiting for PostgreSQL at $host:$port..."
  sleep 2
done
