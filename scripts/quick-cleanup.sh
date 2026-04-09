#!/bin/bash
# Quick cleanup script for crawler outputs and test artifacts

echo "🧹 Cleaning up previous test artifacts..."

# Remove crawler output
rm -rf ./output/*

# Remove test crawled screenshots and diffs
rm -rf ./test/crawled/*
rm -rf ./test/diffs/*

# Ensure directories exist
mkdir -p ./output
mkdir -p ./test/crawled
mkdir -p ./test/diffs
mkdir -p ./test/baselines
mkdir -p ./reports

echo "✅ Cleanup complete."
