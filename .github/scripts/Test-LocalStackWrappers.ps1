[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$startScript = Join-Path $repositoryRoot 'Start-LocalStack.ps1'
$stopScript = Join-Path $repositoryRoot 'Stop-LocalStack.ps1'

function Assert-Contract {
    param(
        [Parameter(Mandatory)]
        [bool]$Condition,
        [Parameter(Mandatory)]
        [string]$Message
    )

    if (-not $Condition) {
        throw "LocalStack wrapper contract failed: $Message"
    }
}

function Get-ParsedScriptSource {
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile(
        $Path,
        [ref]$tokens,
        [ref]$parseErrors
    ) | Out-Null
    Assert-Contract ($parseErrors.Count -eq 0) "$Path must parse without errors."

    return Get-Content -LiteralPath $Path -Raw
}

function New-FakeDockerExecutable {
    param(
        [Parameter(Mandatory)]
        [string]$Directory
    )

    $isWindows = $env:OS -eq 'Windows_NT'
    $fakeDocker = Join-Path $Directory $(if ($isWindows) { 'docker.cmd' } else { 'docker' })
    if ($isWindows) {
        @'
@echo off
echo %*>> "%FAKE_DOCKER_LOG%"

if "%~1"=="version" (
  echo fake-server-version
  exit /b 0
)

if "%6"=="ps" if "%7"=="--status" if "%8"=="running" if "%9"=="--services" (
  if "%FAKE_DOCKER_PREEXISTING%"=="true" echo backend
  exit /b 0
)

set "CALLS="
for /f %%A in ('find /c /v "" ^< "%FAKE_DOCKER_LOG%"') do set "CALLS=%%A"
if "%FAKE_DOCKER_START_RESULT%"=="failure" if "%CALLS%"=="4" (
  echo simulated startup failure 1>&2
  exit /b 23
)

exit /b 0
'@ | Set-Content -LiteralPath $fakeDocker -NoNewline
    }
    else {
        @'
#!/usr/bin/env sh
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"

if [ "$1" = "version" ]; then
  printf '%s\n' 'fake-server-version'
  exit 0
fi

if [ "$1" != "compose" ]; then
  exit 64
fi

case " $* " in
  *" ps --status running --services "*)
    if [ "$FAKE_DOCKER_PREEXISTING" = "true" ]; then
      printf '%s\n' 'backend'
    fi
    exit 0
    ;;
  *" up --build --detach --wait --wait-timeout "*)
    if [ "$FAKE_DOCKER_START_RESULT" = "failure" ]; then
      printf '%s\n' 'simulated startup failure' >&2
      exit 23
    fi
    exit 0
    ;;
esac

exit 0
'@ | Set-Content -LiteralPath $fakeDocker -NoNewline

        & chmod +x $fakeDocker
        Assert-Contract ($LASTEXITCODE -eq 0) 'The fake Docker executable must be executable.'
    }
    return $fakeDocker
}

function Invoke-WrapperScenario {
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [Parameter(Mandatory)]
        [string]$ScriptPath,
        [Parameter(Mandatory)]
        [string]$FakeDockerDirectory,
        [string[]]$ScriptArguments = @(),
        [bool]$Preexisting = $false,
        [string]$StartResult = 'success'
    )

    $scenarioDirectory = Join-Path $TestDrive $Name
    New-Item -ItemType Directory -Path $scenarioDirectory | Out-Null
    $logPath = Join-Path $scenarioDirectory 'docker.log'
    New-Item -ItemType File -Path $logPath | Out-Null
    $outputPath = Join-Path $scenarioDirectory 'wrapper-output.txt'
    $previousPath = $env:PATH
    $previousLog = $env:FAKE_DOCKER_LOG
    $previousPreexisting = $env:FAKE_DOCKER_PREEXISTING
    $previousStartResult = $env:FAKE_DOCKER_START_RESULT

    try {
        $env:PATH = "$FakeDockerDirectory$([IO.Path]::PathSeparator)$previousPath"
        $env:FAKE_DOCKER_LOG = $logPath
        $env:FAKE_DOCKER_PREEXISTING = $Preexisting.ToString().ToLowerInvariant()
        $env:FAKE_DOCKER_START_RESULT = $StartResult
        $powerShellExecutable = Join-Path $PSHOME $(if ($env:OS -eq 'Windows_NT') { 'powershell.exe' } else { 'pwsh' })
        $previousErrorActionPreference = $ErrorActionPreference
        Push-Location $scenarioDirectory
        try {
            $ErrorActionPreference = 'Continue'
            & $powerShellExecutable -NoProfile -File $ScriptPath @ScriptArguments *> $outputPath
            $exitCode = $LASTEXITCODE
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
            Pop-Location
        }
    }
    finally {
        $env:PATH = $previousPath
        $env:FAKE_DOCKER_LOG = $previousLog
        $env:FAKE_DOCKER_PREEXISTING = $previousPreexisting
        $env:FAKE_DOCKER_START_RESULT = $previousStartResult
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Calls = @(Get-Content -LiteralPath $logPath)
        Output = Get-Content -LiteralPath $outputPath -Raw
    }
}

function Assert-ComposeCall {
    param(
        [Parameter(Mandatory)]
        [string[]]$Calls,
        [Parameter(Mandatory)]
        [string]$ExpectedArguments,
        [Parameter(Mandatory)]
        [string]$Message
    )

    $expectedPrefix = "compose --project-directory $repositoryRoot --file $(Join-Path $repositoryRoot 'docker-compose.yml')"
    Assert-Contract (
        @($Calls | Where-Object { $_ -eq "$expectedPrefix $ExpectedArguments" }).Count -eq 1
    ) $Message
}

$TestDrive = Join-Path ([IO.Path]::GetTempPath()) ("fxtester-localstack-wrapper-test-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $TestDrive | Out-Null

try {
    Get-ParsedScriptSource -Path $startScript | Out-Null
    Get-ParsedScriptSource -Path $stopScript | Out-Null
    $fakeDockerDirectory = Join-Path $TestDrive 'fake-docker'
    New-Item -ItemType Directory -Path $fakeDockerDirectory | Out-Null
    New-FakeDockerExecutable -Directory $fakeDockerDirectory | Out-Null

    $successfulStart = Invoke-WrapperScenario -Name 'successful-start' -ScriptPath $startScript -FakeDockerDirectory $fakeDockerDirectory
    Assert-Contract ($successfulStart.ExitCode -eq 0) 'A successful fake Docker start must succeed.'
    Assert-ComposeCall -Calls $successfulStart.Calls -ExpectedArguments 'config --quiet' -Message 'Start must validate the explicitly scoped Compose configuration.'
    Assert-ComposeCall -Calls $successfulStart.Calls -ExpectedArguments 'ps --status running --services' -Message 'Start must inspect the explicitly scoped pre-existing service state.'
    Assert-ComposeCall -Calls $successfulStart.Calls -ExpectedArguments 'up --build --detach --wait --wait-timeout 90' -Message 'Start must health-gate an explicitly scoped Compose startup.'
    Assert-ComposeCall -Calls $successfulStart.Calls -ExpectedArguments 'ps' -Message 'A successful start must report explicitly scoped Compose status.'

    $customTimeoutStart = Invoke-WrapperScenario -Name 'custom-timeout-start' -ScriptPath $startScript -FakeDockerDirectory $fakeDockerDirectory -ScriptArguments @('-WaitTimeoutSeconds', '120')
    Assert-Contract ($customTimeoutStart.ExitCode -eq 0) 'A valid custom timeout start must succeed.'
    Assert-ComposeCall -Calls $customTimeoutStart.Calls -ExpectedArguments 'up --build --detach --wait --wait-timeout 120' -Message 'Start must pass a valid custom timeout to Compose.'

    foreach ($invalidTimeout in @(0, 601)) {
        $invalidTimeoutStart = Invoke-WrapperScenario -Name "invalid-timeout-$invalidTimeout" -ScriptPath $startScript -FakeDockerDirectory $fakeDockerDirectory -ScriptArguments @('-WaitTimeoutSeconds', "$invalidTimeout")
        Assert-Contract ($invalidTimeoutStart.ExitCode -ne 0) "Timeout $invalidTimeout must be rejected."
        Assert-Contract ($invalidTimeoutStart.Calls.Count -eq 0) "Timeout $invalidTimeout must be rejected before Docker is invoked."
    }

    $failedFreshStart = Invoke-WrapperScenario -Name 'failed-fresh-start' -ScriptPath $startScript -FakeDockerDirectory $fakeDockerDirectory -StartResult 'failure'
    Assert-Contract ($failedFreshStart.ExitCode -ne 0) 'A failed fake Docker start must fail.'
    Assert-ComposeCall -Calls $failedFreshStart.Calls -ExpectedArguments 'ps' -Message 'A failed start must collect explicitly scoped status diagnostics.'
    Assert-ComposeCall -Calls $failedFreshStart.Calls -ExpectedArguments 'logs --tail 200 backend frontend' -Message 'A failed start must collect explicitly scoped logs diagnostics.'
    Assert-ComposeCall -Calls $failedFreshStart.Calls -ExpectedArguments 'down' -Message 'A failed fresh start must safely clean up with Compose down.'
    Assert-Contract (@($failedFreshStart.Calls | Where-Object { $_ -match '(?:^| )(--volumes|-v)(?: |$)' }).Count -eq 0) 'Failure cleanup must preserve Docker volumes.'

    $failedExistingStart = Invoke-WrapperScenario -Name 'failed-existing-start' -ScriptPath $startScript -FakeDockerDirectory $fakeDockerDirectory -Preexisting $true -StartResult 'failure'
    Assert-Contract ($failedExistingStart.ExitCode -ne 0) 'A failed start with pre-existing services must fail.'
    Assert-ComposeCall -Calls $failedExistingStart.Calls -ExpectedArguments 'ps' -Message 'A failed start with pre-existing services must collect explicitly scoped status diagnostics.'
    Assert-ComposeCall -Calls $failedExistingStart.Calls -ExpectedArguments 'logs --tail 200 backend frontend' -Message 'A failed start with pre-existing services must collect explicitly scoped logs diagnostics.'
    Assert-Contract (@($failedExistingStart.Calls | Where-Object { $_ -eq 'compose --project-directory ' + $repositoryRoot + ' --file ' + (Join-Path $repositoryRoot 'docker-compose.yml') + ' down' }).Count -eq 0) 'A failed start with pre-existing services must not tear down the existing stack.'
    Assert-Contract ($failedExistingStart.Output -match [regex]::Escape('The existing Compose stack was left running')) 'A failed start with pre-existing services must state that the stack was left running.'
    Assert-Contract ($failedExistingStart.Output -match [regex]::Escape("docker compose --project-directory `"$repositoryRoot`" --file `"$(Join-Path $repositoryRoot 'docker-compose.yml')`" ps")) 'Existing-stack recovery output must include a working-directory-independent status command.'
    Assert-Contract ($failedExistingStart.Output -match [regex]::Escape("docker compose --project-directory `"$repositoryRoot`" --file `"$(Join-Path $repositoryRoot 'docker-compose.yml')`" logs --tail 200 backend frontend")) 'Existing-stack recovery output must include a working-directory-independent logs command.'
    Assert-Contract ($failedExistingStart.Output -match [regex]::Escape("docker compose --project-directory `"$repositoryRoot`" --file `"$(Join-Path $repositoryRoot 'docker-compose.yml')`" up --build --detach --wait --wait-timeout 90")) 'Existing-stack recovery output must include a working-directory-independent retry command.'
    Assert-Contract ($failedExistingStart.Output -match [regex]::Escape("docker compose --project-directory `"$repositoryRoot`" --file `"$(Join-Path $repositoryRoot 'docker-compose.yml')`" down")) 'Existing-stack recovery output must include an explicit, data-preserving manual rollback command.'

    $stoppedStack = Invoke-WrapperScenario -Name 'stop' -ScriptPath $stopScript -FakeDockerDirectory $fakeDockerDirectory
    Assert-Contract ($stoppedStack.ExitCode -eq 0) 'A successful fake Docker stop must succeed.'
    Assert-ComposeCall -Calls $stoppedStack.Calls -ExpectedArguments 'down' -Message 'Stop must use explicitly scoped Compose down.'
    Assert-Contract (@($stoppedStack.Calls | Where-Object { $_ -match '(?:^| )(--volumes|-v)(?: |$)' }).Count -eq 0) 'Stop must preserve Docker volumes.'
}
finally {
    Remove-Item -LiteralPath $TestDrive -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host 'LocalStack PowerShell wrapper behavioral contract passed.'
