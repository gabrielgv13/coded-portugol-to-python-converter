#!/bin/bash

# Coded Portugol to Python Converter - Setup Script
# Optimized for GitHub Codespaces and Linux environments

echo "🚀 Starting setup..."

# Check if Node.js is installed
if ! command -v node &> /dev/null
then
    echo "❌ Node.js is not installed. Please install it first."
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "✅ Environment ready!"
echo "▶️  Run 'npm run dev' to start the application."
