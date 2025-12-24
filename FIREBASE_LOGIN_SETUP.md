# 🔥 Firebase Login Setup - Complete Guide

## ✅ Configuration Complete

Your Firebase credentials have been successfully configured! Here's what was set up:

### 📁 Files Created/Updated

1. **`.env.local`** - Your Firebase credentials (secured, not committed to Git)
2. **`lib/firebaseConfig.js`** - Updated to use environment variables
3. **`.env.example`** - Template for other developers
4. **`verify-firebase-config.sh`** - Script to verify configuration

### 🔐 Security Notes

- ✅ `.env.local` is already excluded from Git (via `.gitignore`)
- ✅ Firebase credentials are now stored securely in environment variables
- ✅ No hardcoded credentials in your codebase

---

## 🚀 Getting Started

### 1. Start the Development Server

```bash
npm run dev
```

Your app will be available at: http://localhost:3000

### 2. Login Routes

- **Admin/Employee Login**: `/login`
- **Alternative Login**: `/firebase-login`
- **Employee Dashboard**: `/employee`
- **Admin Dashboard**: `/admin`

---

## 👤 Authentication Flow

### How Login Works:

1. User enters email and password at `/login`
2. Firebase Authentication validates credentials
3. System fetches user role from Firestore (`users` collection)
4. User is redirected based on their role:
   - **Admin** → `/admin`
   - **Employee** → `/employee`

### User Data Structure:

```javascript
{
  uid: "user-id",
  email: "user@example.com",
  displayName: "User Name",
  role: "admin" | "employee",
  department: "Department Name",
  phone: "Phone Number",
  createdAt: "ISO Date",
  updatedAt: "ISO Date"
}
```

---

## 🔧 Firebase Configuration

Your Firebase project is configured with:

- **Project ID**: `task-management-6b83c`
- **Auth Domain**: `task-management-6b83c.firebaseapp.com`
- **Storage Bucket**: `task-management-6b83c.firebasestorage.app`

### Environment Variables:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=***
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=task-management-6b83c.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=task-management-6b83c
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=task-management-6b83c.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=***
NEXT_PUBLIC_FIREBASE_APP_ID=***
```

---

## 🧪 Testing Login

### Test the Configuration:

1. Run verification script:
   ```bash
   ./verify-firebase-config.sh
   ```

2. Start dev server:
   ```bash
   npm run dev
   ```

3. Navigate to login page:
   ```
   http://localhost:3000/login
   ```

### Creating Test Users:

You need to create users in Firebase:

#### Option 1: Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `task-management-6b83c`
3. Go to **Authentication** → **Users** → **Add User**
4. Create user with email/password
5. Go to **Firestore Database** → **users** collection
6. Add a document with the user's UID containing:
   ```json
   {
     "uid": "firebase-user-id",
     "email": "test@example.com",
     "displayName": "Test User",
     "role": "admin",
     "department": "IT",
     "createdAt": "2024-12-24T00:00:00.000Z"
   }
   ```

#### Option 2: Use Sign Up Flow
If you have a signup page, use it to create users programmatically.

---

## 🛠️ Troubleshooting

### Issue: "No user data found"
**Solution**: Ensure the user document exists in Firestore `users` collection with the correct UID.

### Issue: "Wrong password" or "User not found"
**Solution**: 
- Check if the user exists in Firebase Authentication
- Verify the email/password are correct
- Check Firebase Console for user status

### Issue: Not redirecting after login
**Solution**: 
- Check browser console for errors
- Verify the `role` field in Firestore is set to `"admin"` or `"employee"`
- Clear browser cache and cookies

### Issue: Environment variables not loading
**Solution**: 
- Restart the dev server after creating `.env.local`
- Ensure `.env.local` is in the root directory
- Verify variable names start with `NEXT_PUBLIC_`

---

## 📚 Key Files Reference

### Authentication Context
- **File**: `context/AuthContext.js`
- **Purpose**: Global authentication state management

### Auth Helper
- **File**: `lib/authHelper.js`
- **Purpose**: Firebase authentication operations (signin, signup, signout)

### Firebase Configuration
- **File**: `lib/firebaseConfig.js`
- **Purpose**: Firebase SDK initialization with environment variables

### Login Page
- **File**: `pages/app old/login/page.js`
- **Purpose**: User login interface with role-based routing

---

## 🔒 Firebase Security Rules

Ensure your Firestore security rules allow authenticated users to read their own data:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    match /tasks/{taskId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
                     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

---

## 📞 Need Help?

1. Check the error in the browser console
2. Review Firebase Console logs
3. Verify all environment variables are set
4. Restart the development server

---

## ✨ Next Steps

1. ✅ Firebase configuration is complete
2. ✅ Environment variables are set up
3. ✅ Authentication flow is ready

**You can now:**
- Start the dev server: `npm run dev`
- Create test users in Firebase Console
- Test the login functionality
- Build your application features!

---

**Happy Coding! 🚀**
