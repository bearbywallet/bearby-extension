# Makefile for building ZilPay browser extension for Manifest V2 and V3

# Default target: build both versions
all: clean build-mv2 hash-mv2 zip-mv2 clean build-mv3 hash-mv3 zip-mv3

# Clean the dist directory
clean:
	rm -rf dist

# Build for Manifest V2
build-mv2:
	mkdir -p dist
	MANIFEST=2 bun run build

# Compute SHA256 checksums for Manifest V2 (macOS-compatible)
hash-mv2:
	find dist -type f -exec shasum -a 256 {} \; | sort > shasummv2.sha

# Zip the contents of the dist directory for Manifest V2 (without including the dist folder)
zip-mv2:
	(cd dist && zip -r ../mv2.zip ./)

# Build for Manifest V3
build-mv3:
	mkdir -p dist
	MANIFEST=3 bun run build

# Compute SHA256 checksums for Manifest V3 (macOS-compatible)
hash-mv3:
	find dist -type f -exec shasum -a 256 {} \; | sort > shasummv3.sha

# Zip the contents of the dist directory for Manifest V3 (without including the dist folder)
zip-mv3:
	(cd dist && zip -r ../mv3.zip ./)

.PHONY: all clean build-mv2 hash-mv2 zip-mv2 build-mv3 hash-mv3 zip-mv3
