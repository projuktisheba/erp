#!/usr/bin/env bash
set -euo pipefail

# Determine script & backend root directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$BACKEND_DIR"

OUTPUT_DIR="$BACKEND_DIR/bin"
OUTPUT_BINARY="$OUTPUT_DIR/erp_backend_linux"
GOOS="${GOOS:-linux}"
GOARCH="${GOARCH:-amd64}"

echo "=========================================="
echo " Building Go Backend for Linux ($GOOS/$GOARCH)..."
echo "=========================================="

# Check if Go compiler is installed
if ! command -v go &> /dev/null; then
    echo "[ERROR] 'go' executable not found in PATH."
    exit 1
fi

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Clean prior Linux build artifact if exists
if [ -f "$OUTPUT_BINARY" ]; then
    rm -f "$OUTPUT_BINARY"
fi

# Build static Linux binary without CGO dependency
echo "[INFO] Compiling main.go with CGO_ENABLED=0 GOOS=$GOOS GOARCH=$GOARCH..."
CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" go build \
    -ldflags="-s -w" \
    -o "$OUTPUT_BINARY" \
    "$BACKEND_DIR/main.go"

# Make binary executable
chmod +x "$OUTPUT_BINARY"

echo "=========================================="
echo "[SUCCESS] Build completed successfully!"
echo "Binary Location: $OUTPUT_BINARY"
if command -v ls &> /dev/null; then
    ls -lh "$OUTPUT_BINARY"
fi
echo "=========================================="
