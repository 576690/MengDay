#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL in GitHub Actions secrets}"
: "${BACKUP_AGE_RECIPIENT:?Set BACKUP_AGE_RECIPIENT in GitHub Actions variables}"
: "${RUNNER_TEMP:?Run this script on a GitHub Actions runner}"

work=$(mktemp -d "$RUNNER_TEMP/mengday-backup.XXXXXX")
cleanup() {
  local status=$?
  if [[ "$status" != 0 && -s "$work/command.log" ]]; then
    mkdir -p "$RUNNER_TEMP/mengday-diagnostics"
    age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" \
      --output "$RUNNER_TEMP/mengday-diagnostics/export.log.age" "$work/command.log" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT
mkdir -p "$work/plain" "$RUNNER_TEMP/mengday-encrypted"
export PGDATABASE="$SUPABASE_DB_URL" PGSSLMODE=require PGCONNECT_TIMEOUT=30

# Capture database client errors privately: connection strings and SQL data must
# never enter Actions logs, even on a failed dump.
quiet() {
  local label="$1"
  shift
  if ! "$@" >"$work/command.log" 2>&1; then
    echo "::error::$label failed. Check the database credentials, connectivity and client compatibility."
    for reason in 'password authentication failed' 'Tenant or user not found' 'could not translate host name' 'Connection timed out' 'No such file or directory' 'invalid URI' 'server version mismatch'; do
      if grep -qiF "$reason" "$work/command.log"; then
        echo "::error::Diagnostic category: $reason"
      fi
    done
    return 1
  fi
  echo "$label completed."
}

quiet 'Database connection' psql --dbname "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -c 'select 1'
quiet 'Roles backup' supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f "$work/plain/roles.sql"
quiet 'Schema backup' supabase db dump --db-url "$SUPABASE_DB_URL" -f "$work/plain/schema.sql"
quiet 'Data backup' supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy -x 'storage.buckets_vectors' -x 'storage.vector_indexes' -f "$work/plain/data.sql"

# Supabase's regular schema dump excludes auth. MengDay has a custom password
# change trigger on auth.users which must be restored separately.
if ! psql --dbname "$SUPABASE_DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select pg_get_triggerdef(oid) || ';' from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal and tgname = 'mengday_password_changed'" >"$work/plain/auth-triggers.sql" 2>"$work/command.log"; then
  echo '::error::Auth trigger export failed.'
  exit 1
fi
for file in roles.sql schema.sql data.sql auth-triggers.sql; do
  test -s "$work/plain/$file" || { echo "::error::Missing or empty backup component: $file"; exit 1; }
done
grep -q 'mengday_password_changed' "$work/plain/auth-triggers.sql"
for table in 'auth.users' 'auth.identities' 'public.user_states' 'public.sync_operations'; do
  # Accept both quoted and unquoted identifiers without printing any row data.
  tr -d '"' < "$work/plain/data.sql" | grep -E "^COPY ${table//./\\.} " > /dev/null
done

cp -R supabase/migrations "$work/plain/migrations"
if [[ "${RESTORE_DRILL:-false}" == true ]]; then
  bash scripts/restore-backup-drill.sh "$work/plain"
fi
printf 'MengDay logical database backup\nUTC: %s\nAutomation commit: %s\nSupabase CLI: %s\n' \
  "$(date -u +%FT%TZ)" "${GITHUB_SHA:-unknown}" "$(supabase --version)" > "$work/plain/manifest.txt"
(cd "$work/plain" && sha256sum roles.sql schema.sql data.sql auth-triggers.sql migrations/*.sql > SHA256SUMS)
tar -czf "$work/backup.tar.gz" -C "$work/plain" .

archive="mengday-$(date -u +%Y%m%dT%H%M%SZ)-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}.tar.gz.age"
age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$RUNNER_TEMP/mengday-encrypted/$archive" "$work/backup.tar.gz"
(cd "$RUNNER_TEMP/mengday-encrypted" && sha256sum "$archive" > "$archive.sha256")
echo 'Encrypted backup is ready for upload.'
