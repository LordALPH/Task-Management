// Firebase Firestore Security Rules Configuration
// Apply these rules in Firebase Console: Firestore Database > Rules

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
      // Read: Admins can read all, users can read their own
      allow read: if isAuthenticated() && (isAdmin() || request.auth.uid == userId);
      
      // Create: Anyone can create their own profile
      allow create: if isAuthenticated() && request.auth.uid == userId;
      
      // Update: Users can update their own, admins can update anyone
      allow update: if isAuthenticated() && (isAdmin() || request.auth.uid == userId);
      
      // Delete: Only admins
      allow delete: if isAdmin();
    }
    
    // Tasks Collection Rules - PERMISSIVE for development
    match /tasks/{taskId} {
      // Read: All authenticated users can read
      allow read: if isAuthenticated();
      
      // Create: All authenticated users can create
      allow create: if isAuthenticated() && request.resource.data.keys().hasAll(['title']);
      
      // Update: Admins can update all, employees can update assigned tasks
      allow update: if isAuthenticated() && 
        (isAdmin() || (resource.data.assignedTo != null && request.auth.uid == resource.data.assignedTo));
      
      // Delete: Only admins
      allow delete: if isAdmin();
    }
    
    // Activity Logs Collection Rules - PERMISSIVE for development
    match /activityLogs/{logId} {
      // Read: All authenticated users
      allow read: if isAuthenticated();
      
      // Create: All authenticated users
      allow create: if isAuthenticated();
      
      // Update/Delete: Only admins
      allow update, delete: if isAdmin();
    }
    
    // Assignments Collection Rules
    match /assignments/{assignmentId} {
      // Read: All authenticated users
      allow read: if isAuthenticated();
      
      // Create: All authenticated users
      allow create: if isAuthenticated();
      
      // Update: Admins and assigned employees
      allow update: if isAuthenticated() && 
        (isAdmin() || request.auth.uid == resource.data.employeeId);
      
      // Delete: Only admins
      allow delete: if isAdmin();
    }
  }
}
