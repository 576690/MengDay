#!/usr/bin/env bash
# Restore into a disposable local Supabase stack on the runner, never the source.
set -euo pipefail
umask 077
backup_dir=$(cd "${1:?Pass the plaintext backup directory}" && pwd)
drill=$(mktemp -d "$RUNNER_TEMP/mengday-restore.XXXXXX")
cleanup() {
  local status=$?
  if [[ "$status" != 0 ]]; then
    mkdir -p "$RUNNER_TEMP/mengday-diagnostics"
    for logfile in "$drill"/*.log; do
      [[ -s "$logfile" ]] || continue
      age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" \
        --output "$RUNNER_TEMP/mengday-diagnostics/restore-$(basename "$logfile").age" "$logfile" >/dev/null 2>&1 || true
    done
  fi
  (cd "$drill" && supabase stop --no-backup >/dev/null 2>&1) || true
  rm -rf -- "$drill"
}
trap cleanup EXIT

# Strip the production connection from all subprocesses used for the drill.
unset SUPABASE_DB_URL PGDATABASE PGHOST PGPORT PGUSER PGPASSWORD
export PGSSLMODE=disable PGCONNECT_TIMEOUT=30
cd "$drill"
supabase init >/dev/null 2>&1
if ! supabase start > "$drill/start.log" 2>&1; then
  echo '::error::Disposable Supabase restore environment could not start.'
  exit 1
fi
export PGDATABASE='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
if ! psql --dbname "$PGDATABASE" -X --single-transaction --set ON_ERROR_STOP=1 \
  --file "$backup_dir/roles.sql" \
  --file "$backup_dir/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$backup_dir/data.sql" \
  --file "$backup_dir/auth-triggers.sql" > "$drill/restore.log" 2>&1; then
  echo '::error::Restore drill failed. Source database was not modified.'
  exit 1
fi

# COPY text encodes newlines inside fields, so physical lines count rows.
for table in auth.users auth.identities public.user_states public.sync_operations; do
  expected=$(awk -v table="$table" '
    /^COPY / { line=$0; gsub(/"/, "", line); active=(index(line, "COPY " table " ")==1); next }
    active && /^\\\.$/ { active=0; next }
    active { count++ }
    END { print count+0 }
  ' "$backup_dir/data.sql")
  actual=$(psql --dbname "$PGDATABASE" -X -At --set ON_ERROR_STOP=1 -c "select count(*) from $table" 2> "$drill/check.log")
  if [[ "$actual" != "$expected" ]]; then
    echo "::error::Restore row count differs for $table."
    exit 1
  fi
done
if ! psql --dbname "$PGDATABASE" -X --set ON_ERROR_STOP=1 > "$drill/check.log" 2>&1 <<'SQL'
DO $$ BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.user_states'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.sync_operations'::regclass) THEN
    RAISE EXCEPTION 'RLS missing';
  END IF;
  IF has_table_privilege('anon', 'public.user_states', 'SELECT')
     OR has_table_privilege('authenticated', 'public.sync_operations', 'SELECT') THEN
    RAISE EXCEPTION 'Unexpected table grants';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='mengday_password_changed') THEN
    RAISE EXCEPTION 'Password change trigger missing';
  END IF;
END $$;
SQL
then
  echo '::error::Restored access controls or Auth trigger did not pass validation.'
  exit 1
fi
echo 'Restore drill passed: SQL restored, four table counts matched, RLS/grants and Auth trigger verified.'
