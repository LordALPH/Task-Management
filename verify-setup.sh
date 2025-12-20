#!/bin/bash

echo "🔍 Firebase Task Management - Setup Verification"
echo "=================================================="
echo ""

# Check if node_modules exist
if [ -d "node_modules" ]; then
  echo "✅ Dependencies installed"
else
  echo "❌ Dependencies not installed. Run: npm install"
fi

# Check required files
echo ""
echo "📁 Checking required files..."

files=(
  "lib/firebaseConfig.js"
  "lib/firebaseService.js"
  "lib/authHelper.js"
  "lib/middlewareHelpers.js"
  "lib/firestoreRules.js"
  "context/AuthContext.js"
  "pages/api/tasks.js"
  "pages/api/users.js"
  "pages/admin/dashboard.js"
  "pages/employee/tasks.js"
  "pages/login.js"
  ".env.local"
)

missing=0
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ $file - MISSING"
    missing=$((missing+1))
  fi
done

echo ""
if [ $missing -eq 0 ]; then
  echo "✨ All required files are present!"
else
  echo "⚠️  $missing file(s) missing"
fi

# Check Firebase config
echo ""
echo "🔐 Firebase Configuration Check..."
if grep -q "AIzaSyDcaT8jVKMrn-6TEHAjC-6e_dLJ5z50aPo" ".env.local" 2>/dev/null; then
  echo "  ✅ Firebase credentials configured"
else
  echo "  ❌ Firebase credentials not found"
fi

# Check package.json dependencies
echo ""
echo "📦 Checking npm dependencies..."
if grep -q "firebase" package.json; then
  echo "  ✅ Firebase SDK included"
else
  echo "  ❌ Firebase SDK not found"
fi

if grep -q "next" package.json; then
  echo "  ✅ Next.js included"
else
  echo "  ❌ Next.js not found"
fi

echo ""
echo "=================================================="
echo "🚀 Ready to start development server?"
echo "Run: npm run dev"
echo ""
