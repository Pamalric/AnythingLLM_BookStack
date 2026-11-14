# Sauvegarde locale de la base SQLite BookStack Sync
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Db = Join-Path $Root "data\bookstack-sync.db"
$OutDir = Join-Path $Root "data\backups"
if (-not (Test-Path $Db)) { throw "Base introuvable: $Db" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Dest = Join-Path $OutDir "bookstack-sync-$Stamp.db"
Copy-Item -Path $Db -Destination $Dest -Force
foreach ($ext in @("-wal", "-shm")) {
  $side = "$Db$ext"
  if (Test-Path $side) {
    Copy-Item -Path $side -Destination "$Dest$ext" -Force
  }
}
Write-Host "Backup OK: $Dest"
