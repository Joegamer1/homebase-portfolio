#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import getpass, os, re, tempfile
from pathlib import Path
path = Path('.env')
if not path.is_file():
    raise SystemExit('Run this on the HOMEBASE server with its existing .env file.')
key = getpass.getpass('OpenWeb Ninja JSearch API key (hidden): ').strip()
if not re.fullmatch(r'[A-Za-z0-9._=-]+', key):
    raise SystemExit('Invalid key format; configuration unchanged.')
lines = path.read_text().splitlines()
lines = [line for line in lines if not re.match(r'^\s*CAREER_JSEARCH_API_KEY\s*=', line)]
lines.append('CAREER_JSEARCH_API_KEY=' + key)
fd, temporary = tempfile.mkstemp(prefix='.env-career-', dir='.')
try:
    with os.fdopen(fd, 'w') as output:
        output.write('\n'.join(lines) + '\n')
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary):
        os.unlink(temporary)
print('JSearch key saved privately. Restarting discovery services.')
PY
docker compose up -d --no-build --no-deps --force-recreate api worker
