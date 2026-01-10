#!/bin/bash

# -----------------------------
# Configuration
# -----------------------------
VPS_HOST="203.161.48.179"
REMOTE_PATH="/home/samiul/apps/bin/erp-qatar-backend"
# Note: Ensure the target filename in the path includes the binary name
TARGET_FILE="$REMOTE_PATH/app" 
SERVICE_NAME="erpqatarapi.service"
PING_URL="https://erp-qatar-api.pssoft.xyz/api/v1/ping"

# -----------------------------
# Step 1: Remove old binary locally
# -----------------------------
echo "Removing old binary..."
rm -f app app.exe

# -----------------------------
# Step 2: Build the Go app (FOR LINUX)
# -----------------------------
echo "Building app for Linux..."
# FIXED: Added GOOS and GOARCH for cross-compilation
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o app
if [[ $? -ne 0 ]]; then
    echo "Build failed. Exiting."
    exit 1
fi

# -----------------------------
# Step 3: Stop the service on VPS
# -----------------------------
echo "Stopping remote service..."
ssh samiul@"$VPS_HOST" "sudo systemctl stop $SERVICE_NAME"
if [[ $? -ne 0 ]]; then
    echo "Failed to stop service. Exiting."
    exit 1
fi

# -----------------------------
# Step 4: Copy the new binary to VPS
# -----------------------------
echo "Uploading new binary..."
# Note: Ensure REMOTE_PATH points to the folder, not the file, or adjust accordingly.
# If REMOTE_PATH is the folder:
scp app samiul@"$VPS_HOST":"$REMOTE_PATH/"

if [[ $? -ne 0 ]]; then
    echo "SCP failed. Exiting."
    exit 1
fi

# -----------------------------
# Step 5: Permission & Restart
# -----------------------------
# echo "Setting permissions and restarting..."
# # FIXED: Added chmod +x to ensure the file is executable on Linux
ssh samiul@"$VPS_HOST" "chmod +x $TARGET_FILE && sudo systemctl restart $SERVICE_NAME && sudo systemctl status $SERVICE_NAME --no-pager"

if [[ $? -ne 0 ]]; then
    echo "Failed to restart service."
    exit 1
fi

# -----------------------------
# Step 6: Ping the endpoint
# -----------------------------
echo "Pinging API..."
# Added a small sleep to give the service a second to boot up
sleep 2
curl -s -o /dev/null -w "Status Code: %{http_code}\n" "$PING_URL"