#!/usr/bin/env bash
set -euo pipefail
# Functional smoke for the workspace image. Homologation hosts are unreachable here.
php -r 'foreach (["dblib","odbc","mysql"] as $d) { if (!in_array($d, PDO::getAvailableDrivers(), true)) { fwrite(STDERR, "missing $d\n"); exit(1);} } echo "pdo_drivers ok\n";'
php -m | grep -qi pdo_sqlsrv && { echo "pdo_sqlsrv must be absent"; exit 1; } || true
php -r 'echo "charset canary: José Descrição\n";'
echo "smoke placeholders: select 1 / accented text / datetime / decimal run against homologation from inside the network."
