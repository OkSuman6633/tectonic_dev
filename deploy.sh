#!/usr/bin/env bash
# Tectonic GCP Deployment Script (Bash / Cloud Shell / macOS / Linux)
# Run after completing GCP account setup and gcloud init

set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || echo "")}"
REGION="${2:-us-central1}"
SERVICE_NAME="${3:-tectonic}"

echo "========================================"
echo "   Tectonic GCP Deployment Script"
echo "========================================"
echo ""

if ! command -v gcloud &> /dev/null; then
    echo "ERROR: gcloud CLI not found. Please install it first."
    exit 1
fi

if [ -z "$PROJECT_ID" ]; then
    echo "ERROR: No project configured. Run 'gcloud init' or pass project ID as first argument."
    exit 1
fi

echo "Project ID:   $PROJECT_ID"
echo "Region:       $REGION"
echo "Service Name: $SERVICE_NAME"
echo ""

# Step 1: Enable APIs
echo "[1/5] Enabling required APIs..."
APIS=(
    "cloudbuild.googleapis.com"
    "run.googleapis.com"
    "secretmanager.googleapis.com"
    "containerregistry.googleapis.com"
    "artifactregistry.googleapis.com"
)
for api in "${APIS[@]}"; do
    echo "  Enabling $api..."
    gcloud services enable "$api" --quiet
done
echo "  Done!"
echo ""

# Step 2: Check secrets
echo "[2/5] Checking secrets..."
if ! gcloud secrets describe google-api-key --project="$PROJECT_ID" &>/dev/null; then
    echo "  Secret 'google-api-key' not found."
    read -rsp "  Enter your Gemini API Key: " API_KEY
    echo ""
    if [ -z "$API_KEY" ]; then
        echo "ERROR: API key is required."
        exit 1
    fi
    printf "%s" "$API_KEY" | gcloud secrets create google-api-key --data-file=- --project="$PROJECT_ID"
    echo "  Secret 'google-api-key' created!"
else
    echo "  Secret 'google-api-key' exists."
fi

if ! gcloud secrets describe tectonic-auth-secret --project="$PROJECT_ID" &>/dev/null; then
    echo "  Creating sign-in token secret 'tectonic-auth-secret'..."
    openssl rand -hex 32 | tr -d '\n' | gcloud secrets create tectonic-auth-secret --data-file=- --project="$PROJECT_ID"
    echo "  Secret 'tectonic-auth-secret' created!"
else
    echo "  Secret 'tectonic-auth-secret' exists."
fi
echo ""

# Step 3: Setting up IAM permissions
echo "[3/5] Setting up permissions..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
SERVICE_ACCOUNT="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
CLOUDBUILD_SA="$PROJECT_NUMBER@cloudbuild.gserviceaccount.com"

for secret in "google-api-key" "tectonic-auth-secret"; do
    gcloud secrets add-iam-policy-binding "$secret" \
        --member="serviceAccount:$SERVICE_ACCOUNT" \
        --role="roles/secretmanager.secretAccessor" \
        --project="$PROJECT_ID" \
        --quiet &>/dev/null || true
done

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$CLOUDBUILD_SA" \
    --role="roles/run.admin" \
    --quiet &>/dev/null || true

gcloud iam service-accounts add-iam-policy-binding "$SERVICE_ACCOUNT" \
    --member="serviceAccount:$CLOUDBUILD_SA" \
    --role="roles/iam.serviceAccountUser" \
    --project="$PROJECT_ID" \
    --quiet &>/dev/null || true

echo "  Done!"
echo ""

# Step 4: Build and deploy
echo "[4/5] Building and deploying via Cloud Build..."
gcloud builds submit --config=cloudbuild.yaml --substitutions=_REGION="$REGION",_SERVICE_NAME="$SERVICE_NAME" --project="$PROJECT_ID"
echo "  Done!"
echo ""

# Step 5: Get URL
echo "[5/5] Getting service URL..."
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project="$PROJECT_ID" --format="value(status.url)" 2>/dev/null || echo "")

echo ""
echo "========================================"
echo "   DEPLOYMENT SUCCESSFUL!"
echo "========================================"
echo ""
echo "Your application is live at:"
echo "  $SERVICE_URL"
echo ""
