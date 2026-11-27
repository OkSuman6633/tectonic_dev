# Tectonic GCP Deployment Script
# Run this after completing GCP account setup and gcloud init

param(
    [string]$ProjectId = "",
    [string]$Region = "us-central1",
    [string]$ServiceName = "tectonic",
    [string]$StateBucket = ""
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   Tectonic GCP Deployment Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if gcloud is installed
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: gcloud CLI not found. Please install it first." -ForegroundColor Red
    Write-Host "Download from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    exit 1
}

# Get project ID
if ([string]::IsNullOrEmpty($ProjectId)) {
    $ProjectId = gcloud config get-value project 2>$null
    if ([string]::IsNullOrEmpty($ProjectId)) {
        Write-Host "ERROR: No project configured. Run 'gcloud init' first." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Project ID: $ProjectId" -ForegroundColor Green
Write-Host "Region: $Region" -ForegroundColor Green
Write-Host "Service: $ServiceName" -ForegroundColor Green
Write-Host ""

# Step 1: Enable APIs
Write-Host "[1/5] Enabling required APIs..." -ForegroundColor Yellow
$apis = @(
    "cloudbuild.googleapis.com",
    "run.googleapis.com", 
    "secretmanager.googleapis.com",
    "containerregistry.googleapis.com",
    "artifactregistry.googleapis.com",
    "storage.googleapis.com"
)

foreach ($api in $apis) {
    Write-Host "  Enabling $api..."
    gcloud services enable $api --quiet 2>$null
}
Write-Host "  Done!" -ForegroundColor Green
Write-Host ""

# Step 2: Check for secret
Write-Host "[2/5] Checking secrets..." -ForegroundColor Yellow
$secretExists = gcloud secrets describe google-api-key 2>$null
if (-not $secretExists) {
    Write-Host "  Secret 'google-api-key' not found." -ForegroundColor Yellow
    Write-Host ""
    $apiKey = Read-Host "  Enter your Gemini API Key"
    if ([string]::IsNullOrEmpty($apiKey)) {
        Write-Host "ERROR: API key is required." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Creating secret..."
    $apiKey | gcloud secrets create google-api-key --data-file=- 2>$null
    Write-Host "  Secret created!" -ForegroundColor Green
} else {
    Write-Host "  Secret exists." -ForegroundColor Green
}
Write-Host ""

# Sign-in tokens are signed with this secret; keeping it in Secret Manager means users stay signed in
# across restarts and redeploys. Generated once, never shown.
$authSecretExists = gcloud secrets describe tectonic-auth-secret --format="value(name)" 2>$null
if (-not $authSecretExists) {
    Write-Host "  Creating sign-in token secret..."
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    -join ($bytes | ForEach-Object { $_.ToString("x2") }) | gcloud secrets create tectonic-auth-secret --data-file=- 2>$null
}

$apifySecretExists = gcloud secrets describe apify-token --format="value(name)" 2>$null
if (-not $apifySecretExists) {
    $apifyToken = $env:APIFY_TOKEN
    if ([string]::IsNullOrWhiteSpace($apifyToken) -and (Test-Path ".env")) {
        $match = Select-String -Path ".env" -Pattern "^APIFY_TOKEN=(.+)$" | Select-Object -First 1
        if ($match) { $apifyToken = $match.Matches[0].Groups[1].Value.Trim() }
    }
    if ([string]::IsNullOrWhiteSpace($apifyToken)) {
        $apifyToken = Read-Host "  Enter your Apify API token (or press Enter to skip)"
    }
    if (-not [string]::IsNullOrWhiteSpace($apifyToken)) {
        Write-Host "  Creating secret 'apify-token'..."
        $apifyToken.Trim() | gcloud secrets create apify-token --data-file=- 2>$null
        $apifySecretExists = "apify-token"
    } else {
        Write-Host "  Skipping 'apify-token' (not provided)." -ForegroundColor DarkYellow
    }
} else {
    Write-Host "  Secret 'apify-token' exists." -ForegroundColor Green
}

# Step 3: Grant permissions
Write-Host "[3/5] Setting up permissions..." -ForegroundColor Yellow
$projectNumber = (gcloud projects describe $ProjectId --format="value(projectNumber)")
$serviceAccount = "$projectNumber-compute@developer.gserviceaccount.com"
$cloudBuildSa = "$projectNumber@cloudbuild.gserviceaccount.com"

# Grant Cloud Run service account access to secrets
$secretsToBind = @("google-api-key", "tectonic-auth-secret")
if ($apifySecretExists) { $secretsToBind += "apify-token" }
foreach ($secret in $secretsToBind) {
    gcloud secrets add-iam-policy-binding $secret `
        --member="serviceAccount:$serviceAccount" `
        --role="roles/secretmanager.secretAccessor" `
        --quiet 2>$null
}
if ($apifySecretExists) {
    gcloud secrets add-iam-policy-binding apify-token `
        --member="serviceAccount:$cloudBuildSa" `
        --role="roles/secretmanager.viewer" `
        --quiet 2>$null
}

# Grant Cloud Build permission to deploy to Cloud Run
if ([string]::IsNullOrEmpty($StateBucket)) {
    $StateBucket = "$ProjectId-tectonic-state"
}
Write-Host "  Checking persistent state bucket (gs://$StateBucket)..."
gcloud storage buckets describe "gs://$StateBucket" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Creating free-tier GCS state bucket in $Region..."
    gcloud storage buckets create "gs://$StateBucket" --location=$Region --uniform-bucket-level-access --quiet
}

gcloud storage buckets add-iam-policy-binding "gs://$StateBucket" `
    --member="serviceAccount:$serviceAccount" `
    --role="roles/storage.objectAdmin" `
    --quiet 2>$null

gcloud storage buckets add-iam-policy-binding "gs://$StateBucket" `
    --member="serviceAccount:$cloudBuildSa" `
    --role="roles/storage.admin" `
    --quiet 2>$null

gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$cloudBuildSa" `
    --role="roles/run.admin" `
    --quiet 2>$null

gcloud iam service-accounts add-iam-policy-binding $serviceAccount `
    --member="serviceAccount:$cloudBuildSa" `
    --role="roles/iam.serviceAccountUser" `
    --quiet 2>$null

Write-Host "  Done!" -ForegroundColor Green
Write-Host ""

# Step 4: Build and deploy
Write-Host "[4/5] Building and deploying (this takes 5-15 minutes)..." -ForegroundColor Yellow
Write-Host "  Submitting build to Cloud Build..."
$apifySecretArg = if ($apifySecretExists) { "APIFY_TOKEN=apify-token:latest" } else { "" }
gcloud builds submit --config=cloudbuild.yaml "--substitutions=_REGION=$Region,_SERVICE_NAME=$ServiceName,_STATE_BUCKET=$StateBucket,_APIFY_SECRET=$apifySecretArg"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Build failed. Check logs above." -ForegroundColor Red
    exit 1
}
Write-Host "  Done!" -ForegroundColor Green
Write-Host ""

# Step 5: Get URL
Write-Host "[5/5] Getting service URL..." -ForegroundColor Yellow
$serviceUrl = gcloud run services describe $ServiceName --region $Region --format="value(status.url)" 2>$null

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your application is live at:" -ForegroundColor White
Write-Host $serviceUrl -ForegroundColor Cyan
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  View logs:    gcloud run services logs tail $ServiceName --region $Region"
Write-Host "  Delete:       gcloud run services delete $ServiceName --region $Region"
Write-Host ""
