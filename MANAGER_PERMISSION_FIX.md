# Manager Panel Permission Fix

## Issue
**Error**: `FirebaseError: Missing or insufficient permissions`
**When**: Clicking the "Manager" button in the admin dashboard
**Root Cause**: The `behaviorMarks` collection was being accessed without proper Firestore Security Rules

## Solution Applied

### Changes Made
Updated [lib/firestoreRules.rules](lib/firestoreRules.rules) to add security rules for the `behaviorMarks` collection:

```firestore
// Behavior Marks Collection Rules (for manager panel)
match /behaviorMarks/{markId} {
  // Read: All authenticated users can read
  allow read: if isAuthenticated();
  
  // Create: Only admins can create behavior marks
  allow create: if isAdmin();
  
  // Update: Only admins can update behavior marks
  allow update: if isAdmin();
  
  // Delete: Only admins can delete behavior marks
  allow delete: if isAdmin();
}
```

### Why This Fixes It
1. **Read permissions**: All authenticated users can read behavior marks
2. **Write permissions**: Only admins can create, update, or delete behavior marks
3. **Security**: Prevents unauthorized modifications while allowing data visibility

## Implementation in Admin Dashboard
The Manager panel in [pages/app old/admin/page.js](pages/app old/admin/page.js) performs these operations:
- **openManagerPanel()** (line 349): Reads from `behaviorMarks` collection via `getDocs(collection(db, "behaviorMarks"))`
- **saveBehaviorMark()** (line 372): Writes to `behaviorMarks` collection via `setDoc(doc(db, "behaviorMarks", key), ...)`

## Next Steps
1. **Deploy Firebase Rules**: Apply these rules in your Firebase Console:
   - Go to: Firestore Database → Rules tab
   - Copy the complete content from [lib/firestoreRules.rules](lib/firestoreRules.rules)
   - Click "Publish"

2. **Test the Manager Panel**:
   - Log in as admin
   - Click the "Manager" button
   - Verify you can see and add behavior marks without errors

## Related Features
- **Behavior Tracking**: Managers can track employee behavior with marks (0-100)
- **Remarks**: Optional remarks for each behavior mark record
- **Date-based tracking**: Records are indexed by userId and date

## Files Modified
- [lib/firestoreRules.rules](lib/firestoreRules.rules) - Added behaviorMarks collection rules
