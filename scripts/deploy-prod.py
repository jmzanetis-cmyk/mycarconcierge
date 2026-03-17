#!/usr/bin/env python3
"""
Deploy My Car Concierge to Netlify Production.

Usage:
    NETLIFY_AUTH_TOKEN=<token> python3 scripts/deploy-prod.py

Environment variables:
    NETLIFY_AUTH_TOKEN  - Netlify personal access token (required)
    NETLIFY_SITE_ID     - Netlify site ID (optional, defaults to production site)
"""
import os
import sys
import hashlib
import json
import subprocess
import shutil
from pathlib import Path

SITE_ID = os.environ.get('NETLIFY_SITE_ID', '9d5045cd-8b8e-4949-868a-8a92fa54d2e0')
TOKEN = os.environ.get('NETLIFY_AUTH_TOKEN')

if not TOKEN:
    print("ERROR: NETLIFY_AUTH_TOKEN environment variable is required")
    sys.exit(1)

REPO_ROOT = Path(__file__).parent.parent
WWW_DIR = REPO_ROOT / 'www'
FUNC_DIR = REPO_ROOT / 'netlify' / 'functions'

def run_deploy():
    # Check for netlify CLI
    netlify_cli = REPO_ROOT / 'node_modules' / '.bin' / 'netlify'
    if not netlify_cli.exists():
        print("Installing netlify-cli...")
        subprocess.run(['npm', 'install', '--no-save', 'netlify-cli'], cwd=str(REPO_ROOT), check=True)

    # Install function dependencies
    print("Installing function dependencies...")
    subprocess.run(['npm', 'install', '--production'], cwd=str(FUNC_DIR), check=True)

    # Deploy using CLI
    env = os.environ.copy()
    env['NETLIFY_AUTH_TOKEN'] = TOKEN
    env['NETLIFY_SITE_ID'] = SITE_ID

    print(f"Deploying to Netlify site {SITE_ID}...")
    cmd = [
        str(netlify_cli), 'deploy',
        '--prod',
        '--dir', str(WWW_DIR),
        '--functions', str(FUNC_DIR),
        '--message', 'Manual deploy from Replit',
    ]

    result = subprocess.run(cmd, env=env, cwd=str(REPO_ROOT))
    if result.returncode != 0:
        print("Deploy failed!")
        sys.exit(1)
    print("Deploy complete!")

if __name__ == '__main__':
    run_deploy()
