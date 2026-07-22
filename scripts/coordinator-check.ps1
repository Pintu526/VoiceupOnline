$ErrorActionPreference = "Stop"

$expectedBranch = "feature/coordinator-world-class-v1"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$failures = [System.Collections.Generic.List[string]]::new()
$skips = [System.Collections.Generic.List[string]]::new()

function Add-Failure([string]$Message) {
  $script:failures.Add($Message)
  Write-Host "FAIL: $Message" -ForegroundColor Red
}

function Invoke-CheckedCommand([string]$Label, [scriptblock]$Command) {
  Write-Host "`n== $Label ==" -ForegroundColor Cyan
  try {
    & $Command
    if ($LASTEXITCODE -ne 0) {
      Add-Failure "$Label exited with code $LASTEXITCODE."
    } else {
      Write-Host "PASS: $Label" -ForegroundColor Green
    }
  } catch {
    Add-Failure "$Label failed: $($_.Exception.Message)"
  }
}

function Get-ChangedPaths {
  $paths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  @(
    (& git diff --name-only HEAD --),
    (& git ls-files --others --exclude-standard)
  ) | ForEach-Object {
    if ($_ -is [array]) {
      $_ | ForEach-Object { if ($_) { [void]$paths.Add(($_ -replace '\\', '/')) } }
    } elseif ($_) {
      [void]$paths.Add(($_ -replace '\\', '/'))
    }
  }
  return $paths
}

function Test-ProtectedPath([string]$Path) {
  $exactPaths = @(
    "src/App.tsx",
    "src/layouts/AppShell.tsx",
    "src/backend.ts",
    "src/utils/auth.ts",
    "src/pages/CampaignAdminLoginPage.tsx",
    "src/pages/OnboardingWizard.tsx",
    "src/secureFieldUploadAuth.ts",
    "src/scanApproval.ts",
    "src/pages/app/ScansTab.tsx",
    "src/mobileScanCapture.ts",
    "src/confirmationQueue.ts",
    "src/pages/PublicCampaignPage.tsx",
    "src/pages/app/CampaignsTab.tsx",
    "src/utils/campaign.ts",
    "src/utils/campaignAdminProvisioning.ts",
    "src/utils/subscription.ts",
    "src/pages/app/SubscriptionEntitlementsPanel.tsx",
    "supabase/functions/_shared/voiceup.ts",
    "supabase/migrations/20260720010000_field_collection_atomic_approval.sql",
    "supabase/migrations/20260720020000_coordinator_network_v1.sql"
  )
  $protectedPrefixes = @(
    "src/authorization/",
    "src/documentIntelligence/",
    "src/documentCamera/",
    "src/entitlements/",
    "supabase/functions/voiceup-trial-onboarding/",
    "supabase/functions/voiceup-auth-context/",
    "supabase/functions/voiceup-public-campaign/",
    "supabase/functions/voiceup-otp/"
  )
  return $exactPaths -contains $Path -or ($protectedPrefixes | Where-Object { $Path.StartsWith($_, [System.StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
}

Push-Location $repositoryRoot
try {
  Write-Host "Coordinator Management Phase Gate" -ForegroundColor White
  Write-Host "Repository: $repositoryRoot"

  $branch = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0) {
    Add-Failure "Unable to determine the current Git branch."
  } elseif ($branch -ne $expectedBranch) {
    Add-Failure "Current branch is '$branch'; expected '$expectedBranch'."
  } else {
    Write-Host "PASS: Current branch is $expectedBranch" -ForegroundColor Green
  }

  Write-Host "`n== Git status ==" -ForegroundColor Cyan
  & git status --short
  if ($LASTEXITCODE -ne 0) { Add-Failure "git status failed." }

  $protectedChanges = @(Get-ChangedPaths | Where-Object { Test-ProtectedPath $_ } | Sort-Object)
  Write-Host "`n== Protected-file fence ==" -ForegroundColor Cyan
  if ($protectedChanges.Count -gt 0) {
    $protectedChanges | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Add-Failure "Protected files have changed. Stop and review before continuing."
  } else {
    Write-Host "PASS: No protected files changed." -ForegroundColor Green
  }

  if (-not (Test-Path -LiteralPath "package.json")) {
    Add-Failure "package.json was not found."
  } else {
    $package = Get-Content -LiteralPath "package.json" -Raw | ConvertFrom-Json
    $npm = if (Get-Command npm.cmd -ErrorAction SilentlyContinue) { "npm.cmd" } else { "npm" }
    $commands = @(
      @{ Name = "validate"; Label = "npm run validate"; Arguments = @("run", "validate") },
      @{ Name = "test"; Label = "npm test"; Arguments = @("test") },
      @{ Name = "typecheck"; Label = "npm run typecheck"; Arguments = @("run", "typecheck") },
      @{ Name = "build"; Label = "npm run build"; Arguments = @("run", "build") }
    )
    foreach ($command in $commands) {
      if ($null -eq $package.scripts.PSObject.Properties[$command.Name]) {
        $message = "$($command.Label) skipped because package.json has no '$($command.Name)' script."
        $skips.Add($message)
        Write-Host "SKIP: $message" -ForegroundColor Yellow
        continue
      }
      $arguments = $command.Arguments
      Invoke-CheckedCommand $command.Label { & $npm @arguments }
    }
  }

  Invoke-CheckedCommand "git diff --check" { & git diff --check }

  Write-Host "`n== Coordinator check summary ==" -ForegroundColor Cyan
  if ($skips.Count -gt 0) {
    Write-Host "Skipped commands:" -ForegroundColor Yellow
    $skips | ForEach-Object { Write-Host "  $_" }
  }
  if ($failures.Count -gt 0) {
    Write-Host "FAIL ($($failures.Count) failure(s))" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
  }
  Write-Host "PASS" -ForegroundColor Green
  exit 0
} finally {
  Pop-Location
}
