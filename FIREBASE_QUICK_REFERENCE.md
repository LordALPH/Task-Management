# Firebase Integration - Quick Reference

## 🎯 Essential Files Created

| File | Purpose | Key Exports |
|------|---------|------------|
| `lib/firebaseConfig.js` | Firebase initialization | `auth`, `db`, `storage` |
| `lib/firebaseService.js` | CRUD operations | `tasksService`, `usersService`, `assignmentsService`, `activityLogsService` |
| `lib/authHelper.js` | Authentication | `authHelper` (signup, signin, signout, getCurrentUser) |
| `lib/firestoreRules.js` | Security rules | Firestore rules configuration |
| `lib/middlewareHelpers.js` | API middleware | `requireAuth`, `requireAdmin`, validators |
| `context/AuthContext.js` | Global auth state | `AuthProvider`, `useAuth` hook |
| `pages/firebase-login.js` | Login/signup UI | Complete authentication form |
| `pages/tasks/index.js` | Task management | Task CRUD operations |
| `pages/admin/dashboard.js` | Admin dashboard | Analytics and management |
| `pages/api/tasks.js` | Tasks API | REST endpoints for tasks |
| `pages/api/users.js` | Users API | REST endpoints for users |

---

## 🔑 Key Code Snippets

### 1. Import Firebase Services
```javascript
import { tasksService, usersService } from "@/lib/firebaseService";
import { authHelper } from "@/lib/authHelper";
import { db } from "@/lib/firebaseConfig";
```

### 2. Create a Task
```javascript
const taskId = await tasksService.createTask({
  title: "Your Task",
  description: "Description",
  status: "pending",
  priority: "high",
  assignedTo: "employee_id",
  createdBy: "user_id"
});
```

### 3. Get All Tasks
```javascript
const tasks = await tasksService.getAllTasks();
// Or specific tasks:
const myTasks = await tasksService.getTasksByEmployee("employee_id");
```

### 4. Update Task
```javascript
await tasksService.updateTask("task_id", {
  status: "completed",
  progress: 100
});
```

### 5. Delete Task
```javascript
await tasksService.deleteTask("task_id");
```

### 6. User Authentication
```javascript
// Sign up
const user = await authHelper.signup("email@test.com", "password", {
  name: "John Doe",
  department: "Sales"
});

// Sign in
const { authUser, userData } = await authHelper.signin("email@test.com", "password");

// Get current user
const current = await authHelper.getCurrentUser();

// Sign out
await authHelper.signout();
```

### 7. Create User
```javascript
const userId = await usersService.createUser({
  email: "user@example.com",
  name: "Jane Doe",
  role: "employee",
  department: "Engineering"
});
```

### 8. Get Users
```javascript
// All users
const users = await usersService.getAllUsers();

// By role
const admins = await usersService.getUsersByRole("admin");

// By ID
const user = await usersService.getUserById("user_id");

// By email
const user = await usersService.getUserByEmail("user@example.com");
```

### 9. Log Activity
```javascript
await activityLogsService.logActivity({
  action: "Task Created",
  userId: "user_id",
  taskId: "task_id",
  details: "Task 'Project Alpha' created"
});
```

### 10. Get Activity Logs
```javascript
const logs = await activityLogsService.getActivityLogs(50);
```

---

## 📋 Firestore Security Rules Summary

| Resource | Read | Create | Update | Delete |
|----------|------|--------|--------|--------|
| **users** | Owner/Admin | Auth users | Owner/Admin | Admin only |
| **tasks** | All auth users | Auth users | Admin/Assigned | Admin only |
| **assignments** | All auth users | Admin only | Admin/Owner | Admin only |
| **activityLogs** | Admin only | Auth users | Admin only | Admin only |

---

## 🚀 Common Operations Checklist

### Setup Checklist
- [ ] Firebase project created
- [ ] Authentication enabled (Email/Password)
- [ ] Firestore Database created
- [ ] Security Rules applied
- [ ] Create first admin user
- [ ] Test login functionality

### Database Operations
- [ ] Create tasks
- [ ] Create users
- [ ] Assign tasks to employees
- [ ] Update task status
- [ ] View activity logs

### Dashboard Features
- [ ] Display all tasks
- [ ] Display all users
- [ ] Show task analytics
- [ ] View activity logs
- [ ] Manage users and tasks

---

## 🔐 Security Checklist

- [ ] Firestore Rules applied correctly
- [ ] Authentication required for all operations
- [ ] User roles implemented (admin, manager, employee)
- [ ] Sensitive data not exposed in API
- [ ] Activity logging enabled
- [ ] Rate limiting in place (if needed)
- [ ] Input validation implemented

---

## 🐛 Debugging Tips

### Check Authentication
```javascript
import { auth } from "@/lib/firebaseConfig";

console.log("Current auth user:", auth.currentUser);
console.log("Auth UID:", auth.currentUser?.uid);
```

### Check Firestore Connection
```javascript
import { db } from "@/lib/firebaseConfig";
console.log("Firestore instance:", db);

// Try reading a collection
const { getDocs, collection } = require("firebase/firestore");
const snap = await getDocs(collection(db, "users"));
console.log("Users count:", snap.size);
```

### Check User Permissions
```javascript
const user = await authHelper.getCurrentUser();
console.log("Current user:", user);
console.log("User role:", user?.userData?.role);
```

### Check Task Creation
```javascript
try {
  const taskId = await tasksService.createTask({
    title: "Test",
    status: "pending",
    createdBy: "test-user"
  });
  console.log("Task created successfully:", taskId);
} catch (error) {
  console.error("Task creation failed:", error.message);
}
```

---

## 📚 File Locations

### Configuration
- Firebase Config: `lib/firebaseConfig.js`
- Firestore Rules: `lib/firestoreRules.js`

### Services
- Task Service: `lib/firebaseService.js` → `tasksService`
- User Service: `lib/firebaseService.js` → `usersService`
- Auth Service: `lib/authHelper.js` → `authHelper`

### Pages
- Login: `pages/firebase-login.js`
- Tasks: `pages/tasks/index.js`
- Admin Dashboard: `pages/admin/dashboard.js`

### APIs
- Tasks API: `pages/api/tasks.js`
- Users API: `pages/api/users.js`

---

## 🎓 Learning Path

### Beginner
1. Read `FIREBASE_SETUP.md`
2. View `pages/firebase-login.js` for authentication flow
3. Understand `lib/firebaseConfig.js`

### Intermediate
1. Study `lib/firebaseService.js`
2. Review `pages/tasks/index.js` implementation
3. Learn Firestore rules in `lib/firestoreRules.js`

### Advanced
1. Implement custom queries
2. Add real-time listeners with `onSnapshot`
3. Optimize database indexes
4. Implement advanced security rules

---

## 🔗 Navigation Map

### User Flows
```
Login → firebase-login.js
  ├── Admin → admin/dashboard.js
  └── Employee → tasks/index.js
```

### API Routes
```
/api/tasks
  ├── GET (all or by ID)
  ├── POST (create)
  ├── PUT (update)
  └── DELETE (remove)

/api/users
  ├── GET (all or by ID)
  ├── POST (create)
  ├── PUT (update)
  └── DELETE (remove)
```

### Data Flow
```
Component → Service → Firestore → Security Rules → Database
Components ← Activity Logs ← Firestore ← Database
```

---

## ⚠️ Important Notes

1. **Credentials are Safe**: Firebase API keys in `firebaseConfig.js` are restricted to specific APIs in Firebase Console
2. **Database Security**: All access is controlled by Firestore Security Rules
3. **User Authentication**: Required for all operations except signup
4. **Activity Tracking**: All operations are logged for audit purposes
5. **Permissions**: Users can only modify their own data unless they're admins

---

## 🎯 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| "Permission denied" | Check user role and Firestore rules |
| "User not found" | Verify user email exists in Firebase Auth |
| "Task not appearing" | Check user has read permissions in rules |
| "Can't update task" | Verify user is task owner or admin |
| "Can't delete user" | Only admins can delete users |

---

## 📞 Quick Links

- [Full Integration Guide](FIREBASE_INTEGRATION_GUIDE.md)
- [Firebase Setup Steps](FIREBASE_SETUP.md)
- [Security Rules File](lib/firestoreRules.js)
- [Service Functions](lib/firebaseService.js)
- [Auth Helpers](lib/authHelper.js)

---

## ✅ Success Indicators

When properly configured, you should see:
- ✅ Successful login with Firebase credentials
- ✅ Tasks display in task list
- ✅ Admin dashboard shows statistics
- ✅ Activity logs record all operations
- ✅ Users can create and manage tasks
- ✅ No permission errors in console

Happy coding! 🎉
