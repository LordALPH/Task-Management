# Firebase Setup Guide for Task Management Application

## Overview
This guide will help you set up Firebase for your Task Management application with proper authentication, Firestore database, and security rules.

## Step 1: Firebase Project Setup (Already Created)

Your Firebase project credentials are configured in `lib/firebaseConfig.js`:
- Project ID: `task-management-6b83c`
- API Key: Configured
- Auth Domain: `task-management-6b83c.firebaseapp.com`

## Step 2: Enable Firebase Services

### 2.1 Authentication
1. Go to Firebase Console → Authentication
2. Click "Get Started"
3. Enable these sign-in methods:
   - Email/Password
   - (Optional) Google Sign-in
   - (Optional) Facebook Sign-in

### 2.2 Firestore Database
1. Go to Firebase Console → Firestore Database
2. Click "Create Database"
3. Choose "Start in Production Mode"
4. Select your region (closest to your users)
5. Click "Create"

### 2.3 Storage
1. Go to Firebase Console → Storage
2. Click "Get Started"
3. Accept the default rules for now
4. Click "Done"

## Step 3: Apply Firestore Security Rules

1. In Firebase Console, go to Firestore Database → Rules
2. Replace all content with the rules from `lib/firestoreRules.js`
3. Click "Publish"

**Important Security Features:**
- Users can only read/update their own data (except admins)
- Admins can manage all tasks and users
- Activity logs are admin-read-only
- All operations require authentication

## Step 4: Create Admin User (Manual Setup)

### Option A: Firebase Console
1. Go to Authentication → Users
2. Click "Add User"
3. Enter email and password
4. Go to Firestore → users collection
5. Create a document with the user's ID and set role to "admin"

### Option B: Using the Application

```javascript
// Run this once in your app to create an admin
import { authHelper } from "@/lib/authHelper";

await authHelper.signup("admin@task-management.com", "SecurePassword123", {
  name: "Admin User",
  role: "admin",
  department: "Management"
});

// Then manually update the role in Firestore to "admin"
```

## Step 5: Database Schema

### Users Collection
```
/users/{uid}
  - uid: string (Firebase Auth UID)
  - email: string
  - name: string
  - role: string (admin | manager | employee)
  - department: string
  - phone: string
  - profilePicture: string (URL)
  - createdAt: timestamp
  - updatedAt: timestamp
```

### Tasks Collection
```
/tasks/{taskId}
  - title: string
  - description: string
  - status: string (pending | in-progress | completed)
  - priority: string (low | medium | high)
  - assignedTo: string (user ID)
  - createdBy: string (user ID)
  - dueDate: timestamp
  - attachments: array
  - comments: array
  - createdAt: timestamp
  - updatedAt: timestamp
```

### Assignments Collection
```
/assignments/{assignmentId}
  - employeeId: string
  - taskId: string
  - progress: number (0-100)
  - startDate: timestamp
  - endDate: timestamp
  - status: string
  - notes: string
  - createdAt: timestamp
  - updatedAt: timestamp
```

### Activity Logs Collection
```
/activityLogs/{logId}
  - action: string
  - userId: string
  - taskId: string (optional)
  - details: string
  - timestamp: timestamp
```

## Step 6: Use Firebase Services in Your App

### Import Services
```javascript
import { tasksService, usersService } from "@/lib/firebaseService";
import { authHelper } from "@/lib/authHelper";
```

### Create a Task
```javascript
const taskId = await tasksService.createTask({
  title: "Complete Project",
  description: "Finish the React project",
  status: "pending",
  priority: "high",
  assignedTo: "employee_id",
  createdBy: "admin_id",
  dueDate: new Date("2025-12-31"),
});
```

### Get All Tasks
```javascript
const tasks = await tasksService.getAllTasks();
```

### Get Tasks by Employee
```javascript
const employeeTasks = await tasksService.getTasksByEmployee("employee_id");
```

### Update a Task
```javascript
await tasksService.updateTask("task_id", {
  status: "completed",
  updatedBy: "user_id"
});
```

### Create a User
```javascript
const userId = await usersService.createUser({
  email: "employee@example.com",
  name: "John Doe",
  role: "employee",
  department: "Sales"
});
```

## Step 7: API Routes

The application includes API routes for backend operations:

### Tasks API
- `GET /api/tasks` - Get all tasks
- `GET /api/tasks?taskId=id` - Get single task
- `POST /api/tasks` - Create task
- `PUT /api/tasks?taskId=id` - Update task
- `DELETE /api/tasks?taskId=id` - Delete task

### Users API
- `GET /api/users` - Get all users
- `GET /api/users?userId=id` - Get single user
- `POST /api/users` - Create user
- `PUT /api/users?userId=id` - Update user
- `DELETE /api/users?userId=id` - Delete user

## Step 8: Admin Dashboard Integration

Update your admin dashboard components to use Firebase:

```javascript
// In your admin component
import { tasksService, usersService } from "@/lib/firebaseService";

useEffect(() => {
  const fetchData = async () => {
    const tasks = await tasksService.getAllTasks();
    const users = await usersService.getAllUsers();
    setTasks(tasks);
    setUsers(users);
  };
  fetchData();
}, []);
```

## Step 9: Bulk Operations

### Bulk Create Tasks
```javascript
const taskIds = await tasksService.bulkCreateTasks([
  { title: "Task 1", status: "pending", ... },
  { title: "Task 2", status: "pending", ... },
]);
```

### Bulk Create Users
```javascript
const userIds = await usersService.bulkCreateUsers([
  { email: "user1@example.com", name: "User 1", ... },
  { email: "user2@example.com", name: "User 2", ... },
]);
```

## Important Security Notes

1. **Never expose API keys in client-side code** - Your keys are already in firebaseConfig.js (this is client-side only, which is expected for Firebase)
2. **Always verify user permissions** - The Firestore rules handle this
3. **Use environment variables** for sensitive configuration in production
4. **Enable API key restrictions** in Firebase Console:
   - Go to Project Settings → API Keys
   - Restrict each key to specific APIs

## Troubleshooting

### "Permission denied" Errors
- Check that your Firestore rules are applied correctly
- Verify user authentication status
- Check that user role is set correctly in database

### "Insufficient permissions" for Admin Operations
- Ensure the user has "admin" role in the users collection
- Check that rules include proper admin checks

### Tasks Not Showing in Dashboard
- Verify tasks are in the "tasks" collection
- Check that user has read permissions in Firestore rules
- Ensure data is being fetched with proper await/async

### Users Collection Issues
- Make sure user role is set when creating users
- Verify uid matches Firebase Auth UID for auth users

## Next Steps

1. Update your login page to use `authHelper.signin()`
2. Update your admin components to fetch data using the services
3. Add role-based access control to pages
4. Implement real-time listeners for live updates
5. Add error handling and loading states to your components

## Reference Files

- `lib/firebaseConfig.js` - Firebase initialization
- `lib/firebaseService.js` - CRUD operations
- `lib/authHelper.js` - Authentication helpers
- `lib/firestoreRules.js` - Security rules
- `pages/api/tasks.js` - Tasks API route
- `pages/api/users.js` - Users API route
