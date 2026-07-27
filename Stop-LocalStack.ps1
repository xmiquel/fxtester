<#
.SYNOPSIS
Stops the local Docker Compose application stack.

.DESCRIPTION
Stops and removes the repository's Compose containers and network. It does not
remove Docker volumes or the read-only host-mounted market database.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ComposeFile = Join-Path $PSScriptRoot 'docker-compose.yml'

function Invoke-Compose {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    & docker compose --project-directory $PSScriptRoot --file $ComposeFile @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose command failed (exit code $LASTEXITCODE): docker compose $($Arguments -join ' ')"
    }
}

try {
    & docker version --format '{{.Server.Version}}' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker is not available. Start Docker Desktop and try again.'
    }

    Write-Host 'Stopping the local stack...'
    Invoke-Compose -Arguments @('down')
    Write-Host 'Local stack stopped. Docker volumes and the host market database were preserved.' -ForegroundColor Green
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
