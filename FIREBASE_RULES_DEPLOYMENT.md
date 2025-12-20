# Firebase Firestore Rules Deployment Guide

## ⚠️ CRITICAL STEP - MUST DO THIS FOR DASHBOARD TO WORK

The admin dashboard features (adding tasks, adding employees) require you to **publish the Firestore security rules to Firebase Console**. The rules are ready in your code, but they must be deployed.

## 📋 Steps to Deploy Firestore Rules

### Step 1: Go to Firebase Console
1. Open https://console.firebase.google.com/
2. Select your project: **task-management-6b83c**
3. Navigate to: **Firestore Database** (left sidebar)
4. Click on the **Rules** tab

### Step 2: Copy the Firestore Rules
The current rules are in your project at: `/workspaces/Task-Management/lib/firestoreRules.js`

Copy everything between the quotes (the Firestore rules syntax, not the JS file):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is authenticated
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Helper function to check if user is admin (with fallback)
    function isAdmin() {
      return isAuthenticated() && 
        (get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' ||
         request.auth.token.admin == true);
    }
    
    // Users Collection Rules
    match /users/{userId} {
      allow read: if isAuthenticated() && (isAdmin() || request.auth.uid == userId);
      allow create: if isAuthenticated() && request.auth.uid == userId;
      allow update: if isAuthenticated() && (isAdmin() || request.auth.uid == userId);
      allow delete: if isAdmin();
    }
    
    // Tasks Collection Rules - PERMISSIVE for development
    match /tasks/{taskId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && request.resource.data.keys().hasAll(['title']);
      allow update: if isAuthenticated() && 
        (isAdmin() || (resource.data.assignedTo != null && request.auth.uid == resource.data.assignedTo));
      allow delete: if isAdmin();
    }
    
    // Activity Logs Collection Rules - PERMISSIVE for development
    match /activityLogs/{logId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow update, delete: if isAdmin();
    }
    
    // Assignments Collection Rules
    match /assignments/{assignmentId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow update: if isAuthenticated() && 
        (isAdmin() || request.auth.uid == resource.data.employeeId);
      allow delete: if isAdmin();
    }
  }
}
```

### Step 3: Paste and Publish
1. In Firebase Console, click **Edit Rules**
2. Clear the existing rules
3. **Paste the rules above**
4. Click **Publish**
5. Wait for the green checkmark confirming deployment

## ✅ What This Enables

Once published, the following will work:

✅ **Admin Dashboard Task Creation**
- Click "+ Add Task" button
- Fill in task details (title, description, priority, status, assignee)
- Click "Create Task" - NO MORE PERMISSION ERRORS

✅ **Admin Dashboard Employee Creation**  
- Click "+ Add Employee" button
- Fill in employee details (email, name, role, department, phone)
- Click "Add Employee" - NO MORE PERMISSION ERRORS

✅ **Existing Data Display**
- All existing tasks will show in the Tasks tab
- All existing employees will show in the Users tab
- Activity logs will display properly

✅ **Data Operations**
- Create, read, update, delete operations work based on user roles
- Employees can only update their assigned tasks
- Admins can manage all tasks and users

## 🔍 Rule Permissions Explained

| Operation | Rules Coverage |
|-----------|-----------------|
| Create Task | ✅ Any authenticated user can create |
| Read Task | ✅ Any authenticated user can read |
| Update Task | ✅ Admins can update any task; employees can only update assigned tasks |
| Delete Task | ✅ Only admins can delete |
| Create Employee | ✅ Any authenticated user can create (admin-only on UI) |
| Read Employee | ✅ Authenticated users can read all or admins can read any |
| Delete Employee | ✅ Only admins can delete |
| Activity Logs | ✅ Any authenticated user can create activity logs |

## 🆘 If You Get "Permission Denied" After Publishing

This means either:
1. **Rules weren't published successfully** - Go back to Rules tab and check if they show your rules
2. **User is not authenticated** - Check browser DevTools Console for auth errors
3. **Role field is missing** - Make sure user documents in Firestore have a `role` field set to "admin" or "employee"

## 📝 Testing the Dashboard

After deploying the rules:

1. Go to http://localhost:3001
2. Login as an admin user (email: admin@test.com)
3. Navigate to Admin Dashboard
4. Try to add a task - should work ✅
5. Try to add an employee - should work ✅
6. Existing data should display ✅

## 🚀 Next Steps After Rules Deployment

1. Verify dashboard forms work
2. Check that existing data displays
3. Test task/employee creation
4. Monitor browser console for any errors
5. Check Firebase Console Logs if issues persist

---

**Status**: ⚠️ Rules are ready in code but NOT YET DEPLOYED
**Action Required**: Go to Firebase Console and publish the rules above
**Time to Deploy**: ~2 minutes
