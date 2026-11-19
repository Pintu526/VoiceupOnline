[CmdletBinding()]
param(
  [switch]$Execute
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$DevelopmentProjectRef = "ravweavcfrpiykfgtmbf"
$ProhibitedProductionProjectRef = "seseeabxmnsrhghthemd"
$WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$LinkedProjectRefPath = Join-Path $WorkspaceRoot "supabase\.temp\project-ref"

if (-not (Test-Path -LiteralPath $LinkedProjectRefPath -PathType Leaf)) {
  throw "Supabase linked-project marker is missing."
}

$LinkedProjectRef = (Get-Content -LiteralPath $LinkedProjectRefPath -Raw).Trim()
if ($LinkedProjectRef -eq $ProhibitedProductionProjectRef) {
  throw "Production project is prohibited."
}
if ($LinkedProjectRef -ne $DevelopmentProjectRef) {
  throw "Linked project does not match VoiceUp Development."
}

$RequiredFiles = @(
  "supabase\functions\voiceup-public-signing\index.ts",
  "supabase\functions\voiceup-public-signing\logic.ts",
  "supabase\functions\voiceup-participation-receipts\index.ts"
)
foreach ($RequiredFile in $RequiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $WorkspaceRoot $RequiredFile) -PathType Leaf)) {
    throw "Required Edge Function source is missing: $RequiredFile"
  }
}

$ReceiptWorkerSource = Get-Content -LiteralPath (
  Join-Path $WorkspaceRoot "supabase\functions\voiceup-participation-receipts\index.ts"
) -Raw
$PublicSigningSource = Get-Content -LiteralPath (
  Join-Path $WorkspaceRoot "supabase\functions\voiceup-public-signing\index.ts"
) -Raw
if (
  $ReceiptWorkerSource -notmatch "VOICEUP_RECEIPT_WORKER_SECRET" -or
  $ReceiptWorkerSource -notmatch "authorizedWorkerRequest" -or
  $PublicSigningSource -notmatch "VOICEUP_RECEIPT_WORKER_SECRET"
) {
  throw "Dedicated receipt-worker authentication boundary is missing from source."
}

if (-not $Execute) {
  Write-Output "PASS: Development project fence and local function sources verified."
  Write-Output "Dry run only. Re-run with -Execute after required Development Edge and Vault secrets are configured and the activation SQL succeeds."
  exit 0
}

$SupabaseCli = Get-Command "supabase.cmd" -ErrorAction Stop
$RequiredEdgeSecrets = @(
  "RESEND_API_KEY",
  "VOICEUP_RECEIPT_FROM_EMAIL",
  "VOICEUP_RECEIPT_FROM_NAME",
  "VOICEUP_PUBLIC_ORIGIN",
  "VOICEUP_RECEIPT_WORKER_SECRET"
)

$SecretOutput = & $SupabaseCli.Source secrets list `
  --project-ref $DevelopmentProjectRef `
  --output-format json `
  --log-level error
if ($LASTEXITCODE -ne 0) {
  throw "Development secret metadata lookup failed."
}
$SecretResponse = $SecretOutput | ConvertFrom-Json
$ConfiguredSecretNames = @($SecretResponse.secrets | ForEach-Object { $_.name })
$MissingSecretNames = @($RequiredEdgeSecrets | Where-Object {
  $ConfiguredSecretNames -notcontains $_
})
if ($MissingSecretNames.Count -gt 0) {
  throw "Required Development Edge secrets are missing: $($MissingSecretNames -join ', ')"
}

# The receipt worker deliberately disables gateway JWT verification because its
# dedicated non-privileged trigger secret is validated in constant time by the
# handler. Database RPCs remain service-role-only inside the Edge runtime.
& $SupabaseCli.Source functions deploy voiceup-participation-receipts `
  --project-ref $DevelopmentProjectRef `
  --no-verify-jwt `
  --use-api `
  --workdir $WorkspaceRoot
if ($LASTEXITCODE -ne 0) {
  throw "Receipt worker deployment failed. Public signing was not changed."
}

# Preserve the existing authenticated gateway boundary for public signing.
& $SupabaseCli.Source functions deploy voiceup-public-signing `
  --project-ref $DevelopmentProjectRef `
  --use-api `
  --workdir $WorkspaceRoot
if ($LASTEXITCODE -ne 0) {
  throw "Public signing deployment failed. Receipt worker is deployed but inert unless called with its dedicated secret."
}

$FunctionOutput = & $SupabaseCli.Source functions list `
  --project-ref $DevelopmentProjectRef `
  --output-format json `
  --log-level error
if ($LASTEXITCODE -ne 0) {
  throw "Post-deployment function metadata verification failed."
}
$FunctionRows = @(($FunctionOutput | ConvertFrom-Json).functions)
$ReceiptWorker = $FunctionRows | Where-Object {
  $_.slug -eq "voiceup-participation-receipts"
} | Select-Object -First 1
$PublicSigning = $FunctionRows | Where-Object {
  $_.slug -eq "voiceup-public-signing"
} | Select-Object -First 1

if ($null -eq $ReceiptWorker -or $ReceiptWorker.status -ne "ACTIVE" -or $ReceiptWorker.verify_jwt -ne $false) {
  throw "Receipt worker deployment metadata is not active with handler-owned authentication."
}
if ($null -eq $PublicSigning -or $PublicSigning.status -ne "ACTIVE" -or $PublicSigning.verify_jwt -ne $true) {
  throw "Public signing deployment metadata did not preserve JWT verification."
}

Write-Output "PASS: both VoiceUp customer-journey Edge Functions are active on Development with the expected authentication boundaries."
