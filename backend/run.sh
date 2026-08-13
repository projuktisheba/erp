#!/bin/bash

# Navigate to backend directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

echo "=========================================="
echo " Starting Backend API Server..."
echo "=========================================="

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "Error: 'go' command not found. Please ensure Go is installed and in your PATH."
    exit 1
fi

# Run the Go API
go run main.go
