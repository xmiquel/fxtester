<#
.SYNOPSIS
Starts the local Docker Compose application stack.

.DESCRIPTION
Builds and starts the repository's backend and frontend services in detached mode.
The Docker Compose file remains the source of truth for environment variables,
including MARKET_DATABASE_PATH, IMAGE_VERSION, and BUILD_REVISION.
#>

[CmdletBinding()]
param(
    [ValidateRange(1, 600)]
    [int]$WaitTimeoutSeconds = 90
)

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

function Test-ComposeHasRunningServices {
    $services = & docker compose --project-directory $PSScriptRoot --file $ComposeFile ps --status running --services
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose command failed (exit code $LASTEXITCODE): docker compose ps --status running --services"
    }

    return [bool]($services | Where-Object { $_.Trim() })
}

function Write-RecoveryDiagnostics {
    Write-Host ''
    Write-Host 'Startup did not complete; the local stack was not reported as ready.' -ForegroundColor Red
    Write-Host 'Current Compose service state:'
    & docker compose --project-directory $PSScriptRoot --file $ComposeFile ps
    Write-Host ''
    Write-Host 'Recent backend and frontend logs:'
    & docker compose --project-directory $PSScriptRoot --file $ComposeFile logs --tail 200 backend frontend
    Write-Host ''
    Write-Host 'Inspect live logs with:'
    Write-Host "  docker compose --project-directory `"$PSScriptRoot`" --file `"$ComposeFile`" logs --follow backend frontend"
}

function Write-ExistingStackRecovery {
    param(
        [Parameter(Mandatory)]
        [int]$TimeoutSeconds
    )

    Write-Host 'The existing Compose stack was left running; automatic cleanup was skipped to avoid stopping it.' -ForegroundColor Yellow
    Write-Host 'Inspect its current status with:'
    Write-Host "  docker compose --project-directory `"$PSScriptRoot`" --file `"$ComposeFile`" ps"
    Write-Host 'Inspect its recent logs with:'
    Write-Host "  docker compose --project-directory `"$PSScriptRoot`" --file `"$ComposeFile`" logs --tail 200 backend frontend"
    Write-Host 'After correcting the failure, retry the health-gated startup with:'
    Write-Host "  docker compose --project-directory `"$PSScriptRoot`" --file `"$ComposeFile`" up --build --detach --wait --wait-timeout $TimeoutSeconds"
    Write-Host 'To intentionally stop this existing stack, preserving Docker volumes and the host market database, run:'
    Write-Host "  docker compose --project-directory `"$PSScriptRoot`" --file `"$ComposeFile`" down"
}

$startAttempted = $false
$hadRunningServices = $false

try {
    & docker version --format '{{.Server.Version}}' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker is not available. Start Docker Desktop and try again.'
    }

    Write-Host 'Validating Docker Compose configuration...'
    Invoke-Compose -Arguments @('config', '--quiet')

    $hadRunningServices = Test-ComposeHasRunningServices
    Write-Host 'Building and starting the local stack...'
    $startAttempted = $true
    Invoke-Compose -Arguments @('up', '--build', '--detach', '--wait', '--wait-timeout', "$WaitTimeoutSeconds")

    Write-Host ''
    Write-Host 'Local stack is ready: all Compose-defined services reached their configured running or healthy state.' -ForegroundColor Green
    Invoke-Compose -Arguments @('ps')
    Write-Host ''
    Write-Host 'Open the application: http://localhost:5173'
    Write-Host 'Check backend readiness: http://localhost:8000/ready'
    Write-Host 'Inspect logs with:'
    Write-Host "  docker compose --project-directory `"$PSScriptRoot`" --file `"$ComposeFile`" logs --follow backend frontend"
}
catch {
    $startupError = $_
    if ($startAttempted) {
        Write-RecoveryDiagnostics
        if ($hadRunningServices) {
            Write-ExistingStackRecovery -TimeoutSeconds $WaitTimeoutSeconds
        }
        else {
            Write-Host 'Cleaning up containers and the network from the failed start. Docker volumes and the host-mounted market database are preserved.' -ForegroundColor Yellow
            & docker compose --project-directory $PSScriptRoot --file $ComposeFile down
            if ($LASTEXITCODE -ne 0) {
                Write-Warning 'Cleanup did not complete. Run the stop script after reviewing the diagnostics above.'
            }
        }
    }
    Write-Error $startupError.Exception.Message
    exit 1
}
