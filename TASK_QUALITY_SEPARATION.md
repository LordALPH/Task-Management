# Task Closing vs Quality of Work - Separation Guide

## Current Issue
Task Closing and Quality of Work are currently using the same `closingMark` field, but they should be separate features with independent marking systems.

## Required Changes

### 1. State Variables (Add after line 103)
```javascript
const [qualityMarksDraft, setQualityMarksDraft] = useState({});
const [savingQualityMarkTaskId, setSavingQualityMarkTaskId] = useState("");
```

### 2. Update closeQualityPanel Function (around line 342)
```javascript
const closeQualityPanel = () => {
  setShowQualityPanel(false);
  setSelectedMemberForQuality("");
  setQualityMarksDraft({});
  setSavingQualityMarkTaskId("");
};
```

### 3. Add saveQualityMark Function (after closeQualityPanel)
```javascript
const saveQualityMark = async (taskId, value) => {
  const markNum = Number(value);
  if (Number.isNaN(markNum) || markNum < 0 || markNum > 100) {
    alert("Please enter a valid mark between 0 and 100");
    return;
  }
  try {
    setSavingQualityMarkTaskId(taskId);
    await updateDoc(doc(db, "tasks", taskId), { qualityMark: markNum, qualityMarkedAt: serverTimestamp() });
    setQualityMarksDraft((prev) => ({ ...prev, [taskId]: markNum }));
    alert("✓ Quality mark saved successfully");
  } catch (err) {
    alert("Failed to save quality mark: " + (err?.message || err));
  } finally {
    setSavingQualityMarkTaskId("");
  }
};
```

### 4. Update memberSummaries useMemo (around line 293)
Change from `t.closingMark` to `t.qualityMark`:
```javascript
if (typeof t.qualityMark === "number") grouped[key].marks.push(t.qualityMark);
```

### 5. Update Quality Panel Member Tasks Calculation (around line 1653)
```javascript
const markedTasks = memberTasks.filter(t => typeof t.qualityMark === 'number');
const totalMarks = markedTasks.reduce((sum, t) => sum + (t.qualityMark || 0), 0);
```

### 6. Update Quality Panel Input Fields (around line 1765)
```javascript
value={(qualityMarksDraft[task.id] ?? task.qualityMark ?? "")}
onChange={(e) => setQualityMarksDraft((prev) => ({ ...prev, [task.id]: e.target.value }))}
```

### 7. Update Quality Panel Save Button (around line 1772)
```javascript
onClick={() => saveQualityMark(task.id, qualityMarksDraft[task.id] ?? task.qualityMark ?? 0)}
disabled={savingQualityMarkTaskId === task.id}
>
{savingQualityMarkTaskId === task.id ? "Saving..." : "Save"}
```

## Summary
- **Task Closing**: Uses `closingMark` field - for marking task completion
- **Quality of Work**: Uses `qualityMark` field - for assessing work quality
- Both are independent and stored separately in Firebase
