#!/bin/bash
set -e

cd www && npm install --omit=dev --prefer-offline 2>/dev/null || npm install --omit=dev
