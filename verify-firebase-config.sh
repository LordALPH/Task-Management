#!/bin/bash

# Firebase Configuration Verification Script

echo "🔥 Verifying Firebase Configuration..."
echo ""

# Check if .env.local exists
if [ -f ".env.local" ]; then
    echo "✅ .env.local file found"
else
    echo "❌ .env.local file not found"
    exit 1
fi

# Check if all required environment variables are set
echo ""
echo "Checking environment variables..."

required_vars=(
    "NEXT_PUBLIC_FIREBASE_API_KEY"
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
    "NEXT_PUBLIC_FIREBASE_APP_ID"
)

source .env.local

all_set=true
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ $var is not set"
        all_set=false
    else
        echo "✅ $var is set"
    fi
done

echo ""
if [ "$all_set" = true ]; then
    echo "✅ All Firebase environment variables are configured!"
    echo ""
    echo "🚀 You can now start your development server with: npm run dev"
else
    echo "❌ Some environment variables are missing. Please check your .env.local file."
    exit 1
fi

echo ""
echo "📝 Firebase Project ID: $NEXT_PUBLIC_FIREBASE_PROJECT_ID"
echo "🔑 Auth Domain: $NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
