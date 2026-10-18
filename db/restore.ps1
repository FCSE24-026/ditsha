param(
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [string]$ContainerName = "ditsha-backend-db-1",
    [string]$DbUser = "postgres",
    [string]$DbName = "ditsha"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $BackupFile)) {
    Write-Error "Backup file not found at $BackupFile"
    exit 1
}

Write-Host "WARNING: Restoring backup will apply SQL dump to '$DbName' in container '$ContainerName'."
Write-Host "Restoring database '$DbName' from '$BackupFile'..."

Get-Content $BackupFile | docker exec -i $ContainerName psql -U $DbUser -d $DbName

Write-Host "Database restore script completed."
