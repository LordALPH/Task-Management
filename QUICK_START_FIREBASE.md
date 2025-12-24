# 🚀 Quick Start Guide

## Start Development Server
```bash
npm run dev
```

## Login URLs
- Main Login: http://localhost:3000/login
- Admin Dashboard: http://localhost:3000/admin
- Employee Dashboard: http://localhost:3000/employee

## Verify Firebase Config
```bash
./verify-firebase-config.sh
```

## Environment Variables Location
`.env.local` (already configured ✅)

## Need to Create Users?
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **task-management-6b83c**
3. Authentication → Add user
4. Firestore → Create user document with role

## User Roles
- `admin` - Full access, redirects to /admin
- `employee` - Limited access, redirects to /employee

## Troubleshooting
- Restart dev server after env changes
- Check browser console for errors
- Verify users exist in both Authentication AND Firestore

For detailed setup info, see [FIREBASE_LOGIN_SETUP.md](./FIREBASE_LOGIN_SETUP.md)
