# Firebase Integration - Complete Implementation Guide

## 📋 Table of Contents
1. [Quick Start](#quick-start)
2. [File Structure](#file-structure)
3. [Firebase Console Setup](#firebase-console-setup)
4. [Database Schema](#database-schema)
5. [API Usage Examples](#api-usage-examples)
6. [Security Rules](#security-rules)
7. [Common Issues & Solutions](#common-issues--solutions)

---

## 🚀 Quick Start

### 1. Firebase Configuration Already Set
Your Firebase credentials are configured in:
- **File**: `lib/firebaseConfig.js`
- **Contains**: Firebase project initialization and service exports

### 2. Install Firebase SDK (if needed)
```bash
npm install firebase firebase-admin
```

### 3. Enable Services in Firebase Console
All required services are already integrated:
- ✅ Authentication (Email/Password)
- ✅ Firestore Database
- ✅ Storage (for file attachments)
- ✅ Activity Logging

---

## 📁 File Structure

```
/workspaces/Task-Management/
├── lib/
│   ├── firebaseConfig.js          # Firebase initialization
│   ├── firebaseService.js         # CRUD operations for tasks, users, etc.
│   ├── authHelper.js              # Authentication helpers
│   └── firestoreRules.js          # Security rules configuration
├── context/
│   └── AuthContext.js             # Global authentication state
├── pages/
│   ├── firebase-login.js          # Firebase login/signup page
│   ├── tasks/index.js             # Task management page
│   ├── admin/
│   │   └── dashboard.js           # Admin dashboard
│   └── api/
│       ├── tasks.js               # Tasks API endpoint
│       └── users.js               # Users API endpoint
└── FIREBASE_SETUP.md              # Setup documentation
```

---

## 🔧 Firebase Console Setup

### Step 1: Enable Authentication
```
Firebase Console → Authentication → Sign-in method
1. Email/Password → Enable
2. Save
```

### Step 2: Create Firestore Database
```
Firebase Console → Firestore Database
1. Create Database
2. Select: Start in Production Mode
3. Choose nearest region
4. Click Create
```

### Step 3: Apply Security Rules
```
Firebase Console → Firestore Database → Rules
1. Copy content from lib/firestoreRules.js
2. Paste into Rules editor
3. Click Publish
```

### Step 4: Enable Storage (Optional)
```
Firebase Console → Storage → Get Started
1. Accept default rules
2. Click Done
```

---

## 💾 Database Schema

### Collections Overview

#### 1. Users Collection
```javascript
/users/{userId}
{
  uid: "firebase-auth-uid",
  email: "user@example.com",
  name: "John Doe",
  role: "admin|manager|employee",
  department: "Sales",
  phone: "+1-555-0100",
  profilePicture: "url-to-image",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### 2. Tasks Collection
```javascript
/tasks/{taskId}
{
  title: "Complete Project",
  description: "Finish the React project",
  status: "pending|in-progress|completed",
  priority: "low|medium|high",
  assignedTo: "user-id",
  createdBy: "user-id",
  dueDate: Timestamp,
  attachments: ["url1", "url2"],
  comments: ["comment1", "comment2"],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### 3. Assignments Collection
```javascript
/assignments/{assignmentId}
{
  employeeId: "user-id",
  taskId: "task-id",
  progress: 75,  // 0-100
  startDate: Timestamp,
  endDate: Timestamp,
  status: "active|completed",
  notes: "Assignment notes",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### 4. Activity Logs Collection
```javascript
/activityLogs/{logId}
{
  action: "Task Created",
  userId: "user-id",
  taskId: "task-id",  // optional
  details: "Description of the action",
  timestamp: Timestamp
}
```

---

## 📖 API Usage Examples

### Authentication

#### Sign Up
```javascript
import { authHelper } from "@/lib/authHelper";

const user = await authHelper.signup(
  "user@example.com",
  "password123",
  {
    name: "John Doe",
    department: "Sales",
    phone: "+1-555-0100"
  }
);
```

#### Sign In
```javascript
const { authUser, userData } = await authHelper.signin(
  "user@example.com",
  "password123"
);
```

#### Get Current User
```javascript
const currentUser = await authHelper.getCurrentUser();
console.log(currentUser.userData.role);
```

#### Sign Out
```javascript
await authHelper.signout();
```

---

### Tasks Service

#### Create Task
```javascript
import { tasksService } from "@/lib/firebaseService";

const taskId = await tasksService.createTask({
  title: "New Task",
  description: "Task description",
  status: "pending",
  priority: "high",
  assignedTo: "employee-id",
  createdBy: "admin-id",
  dueDate: new Date("2025-12-31")
});
```

#### Get All Tasks
```javascript
const tasks = await tasksService.getAllTasks();
```

#### Get Task by ID
```javascript
const task = await tasksService.getTaskById("task-id");
```

#### Get Tasks by Employee
```javascript
const employeeTasks = await tasksService.getTasksByEmployee("employee-id");
```

#### Get Tasks by Status
```javascript
const completedTasks = await tasksService.getTasksByStatus("completed");
```

#### Update Task
```javascript
await tasksService.updateTask("task-id", {
  status: "completed",
  progress: 100,
  updatedBy: "user-id"
});
```

#### Delete Task
```javascript
await tasksService.deleteTask("task-id");
```

#### Bulk Create Tasks
```javascript
const taskIds = await tasksService.bulkCreateTasks([
  { title: "Task 1", status: "pending", ... },
  { title: "Task 2", status: "pending", ... },
  { title: "Task 3", status: "pending", ... }
]);
```

---

### Users Service

#### Create User
```javascript
import { usersService } from "@/lib/firebaseService";

const userId = await usersService.createUser({
  email: "user@example.com",
  name: "Jane Doe",
  role: "employee",
  department: "Engineering"
});
```

#### Get All Users
```javascript
const users = await usersService.getAllUsers();
```

#### Get User by ID
```javascript
const user = await usersService.getUserById("user-id");
```

#### Get User by Email
```javascript
const user = await usersService.getUserByEmail("user@example.com");
```

#### Get Users by Role
```javascript
const admins = await usersService.getUsersByRole("admin");
const employees = await usersService.getUsersByRole("employee");
```

#### Update User
```javascript
await usersService.updateUser("user-id", {
  name: "Updated Name",
  department: "New Department",
  updatedBy: "admin-id"
});
```

#### Delete User
```javascript
await usersService.deleteUser("user-id");
```

#### Bulk Create Users
```javascript
const userIds = await usersService.bulkCreateUsers([
  { email: "user1@example.com", name: "User 1", role: "employee" },
  { email: "user2@example.com", name: "User 2", role: "employee" }
]);
```

---

### Assignments Service

#### Create Assignment
```javascript
import { assignmentsService } from "@/lib/firebaseService";

const assignmentId = await assignmentsService.createAssignment({
  employeeId: "employee-id",
  taskId: "task-id",
  progress: 0,
  startDate: new Date(),
  status: "active"
});
```

#### Get Assignments for Employee
```javascript
const assignments = await assignmentsService.getAssignmentsForEmployee("employee-id");
```

#### Update Assignment Progress
```javascript
await assignmentsService.updateAssignmentProgress("assignment-id", {
  progress: 75,
  notes: "Almost done"
});
```

---

### Activity Logs Service

#### Log Activity
```javascript
import { activityLogsService } from "@/lib/firebaseService";

await activityLogsService.logActivity({
  action: "Task Created",
  userId: "user-id",
  taskId: "task-id",
  details: "Task 'Project Alpha' was created"
});
```

#### Get Activity Logs
```javascript
const logs = await activityLogsService.getActivityLogs(100);
```

---

## 🔒 Security Rules

Your security rules ensure:

### User Permissions
- ✅ Users can only read/update their own profile
- ✅ Admins can manage all users
- ✅ New users default to "employee" role

### Task Permissions
- ✅ All authenticated users can read tasks
- ✅ Users can only update their assigned tasks
- ✅ Only admins can delete tasks

### Log Permissions
- ✅ Only admins can view activity logs
- ✅ All authenticated users can create logs
- ✅ Only admins can delete logs

### Override Rules in Firestore Rules Tab:
```
Firebase Console → Firestore Database → Rules
```

---

## 🛠️ Common Issues & Solutions

### Issue: "Permission denied" Error

**Solution 1: Check User Authentication**
```javascript
const user = await authHelper.getCurrentUser();
if (!user) {
  // User not authenticated, redirect to login
  router.push("/firebase-login");
}
```

**Solution 2: Verify Firestore Rules**
- Go to Firestore Rules tab in Firebase Console
- Ensure rules from `lib/firestoreRules.js` are applied
- Click "Publish" if not yet published

**Solution 3: Check User Role**
```javascript
const isAdmin = await authHelper.isAdmin(userId);
if (!isAdmin) {
  // User doesn't have admin role
}
```

---

### Issue: "User Not Found" in Login

**Solution:**
```javascript
// First, create the user
await authHelper.signup(
  "admin@task-management.com",
  "SecurePassword123",
  {
    name: "Admin User",
    department: "Management"
  }
);

// Then update role in Firestore (if needed)
await usersService.updateUser(userId, { role: "admin" });
```

---

### Issue: Tasks Not Appearing in Dashboard

**Solution 1: Ensure Tasks Are Being Created**
```javascript
const taskId = await tasksService.createTask({
  title: "Test Task",
  status: "pending",
  createdBy: currentUser.userData.id,
  assignedTo: currentUser.userData.id
});
console.log("Task created:", taskId);
```

**Solution 2: Check Read Permissions**
- Verify user is authenticated
- Check Firestore rules allow reading tasks

**Solution 3: Refresh Data**
```javascript
// Force refresh
const tasks = await tasksService.getAllTasks();
setTasks([...tasks]);
```

---

### Issue: "Email already in use"

**Solution:**
```javascript
// Use a different email or check if user exists
const existingUser = await usersService.getUserByEmail(email);
if (existingUser) {
  // User already exists, use signin instead
  await authHelper.signin(email, password);
}
```

---

## 📱 Integration in Components

### Example: Using Tasks in a React Component
```javascript
import { useState, useEffect } from "react";
import { tasksService } from "@/lib/firebaseService";

export default function TaskList() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const data = await tasksService.getAllTasks();
        setTasks(data);
      } catch (error) {
        console.error("Error fetching tasks:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {tasks.map((task) => (
        <div key={task.id}>
          <h3>{task.title}</h3>
          <p>{task.description}</p>
          <span>{task.status}</span>
        </div>
      ))}
    </div>
  );
}
```

---

## ✅ Verification Checklist

- [ ] Firebase Config file (`lib/firebaseConfig.js`) created
- [ ] Firebase Services file (`lib/firebaseService.js`) created
- [ ] Auth Helper file (`lib/authHelper.js`) created
- [ ] Firestore Rules Applied in Firebase Console
- [ ] Authentication enabled in Firebase Console
- [ ] Firestore Database created
- [ ] User account created (for testing)
- [ ] Tasks API route created
- [ ] Users API route created
- [ ] Login page created
- [ ] Admin dashboard created
- [ ] Task list page created

---

## 🎯 Next Steps

1. **Create Initial Admin Account**
   - Visit `/firebase-login`
   - Create new account with admin email
   - Update role to "admin" in Firestore dashboard

2. **Invite Employees**
   - Use `/firebase-login` to create employee accounts
   - Or use bulk upload feature

3. **Start Creating Tasks**
   - Visit `/tasks` page
   - Create and manage tasks
   - Assign to employees

4. **Monitor Activity**
   - Visit `/admin/dashboard`
   - View analytics and activity logs

---

## 📞 Support

For issues:
1. Check [Common Issues](#common-issues--solutions) section
2. Review [Security Rules](#security-rules)
3. Check browser console for error messages
4. Verify Firebase Console settings

---

## 📚 Documentation Links

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/start)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Firebase Best Practices](https://firebase.google.com/docs/rules/best-practices)
