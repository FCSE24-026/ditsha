param(
    [string]$ContainerName = "ditsha-backend-db-1",
    [string]$DbUser = "postgres",
    [string]$DbName = "ditsha",
    [string]$BackupFile = ""
)

$ErrorActionPreference = "Stop"

if (-not $BackupFile) {
    $Timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $BackupFile = Join-Path $PSScriptRoot "backups\ditsha_backup_$Timestamp.sql"
}

$BackupDir = Split-Path -Path $BackupFile -Parent
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

Write-Host "Creating backup of database '$DbName' from container '$ContainerName'..."
docker exec -t $ContainerName pg_dump -U $DbUser $DbName > $BackupFile

if ((Test-Path $BackupFile) -and ((Get-Item $BackupFile).Length -gt 0)) {
    Write-Host "Backup successfully created at $BackupFile (Size: $((Get-Item $BackupFile).Length) bytes)"
} else {
    Write-Error "Backup failed or generated an empty file."
    exit 1
}
