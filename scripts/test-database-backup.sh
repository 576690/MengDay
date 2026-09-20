#!/usr/bin/env bash
# Integration test: real age encryption/decryption, isolated database fixtures.
set -euo pipefail
umask 077
root=$(pwd)
test_dir=$(mktemp -d)
trap 'rm -rf -- "$test_dir"' EXIT
mkdir -p "$test_dir/bin" "$test_dir/runner"
age-keygen -o "$test_dir/key.txt" 2>/dev/null
export BACKUP_AGE_RECIPIENT
BACKUP_AGE_RECIPIENT=$(age-keygen -y "$test_dir/key.txt")
export SUPABASE_DB_URL='postgresql://test:DO_NOT_LOG_THIS_PASSWORD@example.invalid/postgres'
export RUNNER_TEMP="$test_dir/runner" GITHUB_RUN_ID=test GITHUB_RUN_ATTEMPT=1

cat > "$test_dir/bin/psql" <<'MOCK'
#!/usr/bin/env bash
if [[ "$*" == *pg_get_triggerdef* ]]; then
  echo 'CREATE TRIGGER mengday_password_changed BEFORE UPDATE ON auth.users EXECUTE FUNCTION public.finish_password_change();'
else
  echo '1'
fi
MOCK
cat > "$test_dir/bin/supabase" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == '--version' ]]; then echo fixture; exit 0; fi
if [[ "${FAIL_DUMP:-}" == 1 ]]; then
  echo "$SUPABASE_DB_URL" >&2
  exit 1
fi
output=''
while [ "$#" -gt 0 ]; do
  if [[ "$1" == '-f' ]]; then shift; output="$1"; fi
  shift
done
case "$output" in
  */data.sql)
    printf 'COPY "auth"."users" (id) FROM stdin;\n\\.\nCOPY "auth"."identities" (id) FROM stdin;\n\\.\nCOPY "public"."user_states" (user_id) FROM stdin;\n\\.\nCOPY "public"."sync_operations" (user_id) FROM stdin;\n\\.\n' > "$output"
    if [[ "${MISSING_AUTH:-}" == 1 ]]; then echo '-- incomplete dump' > "$output"; fi
    ;;
  *) echo '-- fixture SQL' > "$output" ;;
esac
MOCK
chmod +x "$test_dir/bin/psql" "$test_dir/bin/supabase"
export PATH="$test_dir/bin:$PATH"

bash "$root/scripts/backup-database.sh" > "$test_dir/success.log" 2>&1
archive=$(find "$RUNNER_TEMP/mengday-encrypted" -name '*.age' -print -quit)
test -s "$archive"
(cd "$RUNNER_TEMP/mengday-encrypted" && sha256sum --check ./*.sha256)
age --decrypt -i "$test_dir/key.txt" -o "$test_dir/backup.tar.gz" "$archive"
mkdir "$test_dir/restored"
tar -xzf "$test_dir/backup.tar.gz" -C "$test_dir/restored"
(cd "$test_dir/restored" && sha256sum --check SHA256SUMS)
test -s "$test_dir/restored/auth-triggers.sql"
test -s "$test_dir/restored/manifest.txt"
test -z "$(find "$RUNNER_TEMP" -maxdepth 1 -name 'mengday-backup.*' -print -quit)"

# A modified ciphertext must not authenticate.
cp "$archive" "$test_dir/tampered.age"
printf x >> "$test_dir/tampered.age"
if age --decrypt -i "$test_dir/key.txt" -o "$test_dir/tampered.tar.gz" "$test_dir/tampered.age" 2>/dev/null; then
  echo 'FAIL: tampered ciphertext accepted'; exit 1
fi

for mode in FAIL_DUMP MISSING_AUTH; do
  mkdir "$test_dir/$mode"
  if env "$mode=1" RUNNER_TEMP="$test_dir/$mode" bash "$root/scripts/backup-database.sh" > "$test_dir/$mode.log" 2>&1; then
    echo "FAIL: $mode was not detected"; exit 1
  fi
  test -z "$(find "$test_dir/$mode" -type f ! -name '*.age' -print -quit)"
  test -z "$(find "$test_dir/$mode/mengday-encrypted" -type f -print -quit)"
  if [[ "$mode" == FAIL_DUMP ]]; then
    age --decrypt -i "$test_dir/key.txt" -o "$test_dir/diagnostic.log" "$test_dir/$mode/mengday-diagnostics/export.log.age"
    grep -q DO_NOT_LOG_THIS_PASSWORD "$test_dir/diagnostic.log"
  fi
  if grep -q DO_NOT_LOG_THIS_PASSWORD "$test_dir/$mode.log"; then
    echo 'FAIL: credential leaked in log'; exit 1
  fi
done
echo 'PASS: encrypted round trip, manifest checksums, tamper rejection, incomplete dump rejection, log redaction and plaintext cleanup.'
