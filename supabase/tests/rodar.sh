#!/usr/bin/env bash
# Recria um banco local, aplica as migrações e roda os testes de permissão.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/rodar.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
P="psql -v ON_ERROR_STOP=1 -q -o /dev/null"
$P -c "drop database if exists dc_teste" 2>/dev/null; $P -c "create database dc_teste"
$P -d dc_teste -f supabase/tests/stub_supabase.sql
for m in supabase/migrations/*.sql; do $P -d dc_teste -f "$m" 2>&1 | grep -v 'already exists' || true; done
$P -d dc_teste -f supabase/tests/permissoes.sql 2>&1 | sed -E 's/^psql:[^ ]+ (NOTICE:  )?//'
