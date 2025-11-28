<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Dashboard</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="dashboard">
        <header class="dashboard-header">
            <h1>Admin Dashboard</h1>
            <nav class="navbar">
                <ul>
                    <li><a href="#employee-progress" class="active" onclick="showTab('employee-progress')">Employee Progress</a></li>
                    <li><a href="#all-tasks" onclick="showTab('all-tasks')">All Tasks</a></li>
                    <li><a href="#member-add" onclick="showTab('member-add')">Member Add/Task Assigned</a></li>
                </ul>
            </nav>
        </header>

        <div class="tab-content">
            <div id="employee-progress" class="tab active">
                <!-- Existing Employee Progress Code -->
                <h2>Employee Progress</h2>
                <p>Content for Employee Progress goes here...</p>
            </div>
            <div id="all-tasks" class="tab">
                <!-- Existing All Tasks Code -->
                <h2>All Tasks</h2>
                <p>Content for All Tasks goes here...</p>
            </div>
            <div id="member-add" class="tab">
                <!-- Existing Member Add/Task Assigned Code -->
                <h2>Member Add/Task Assigned</h2>
                <p>Content for Member Add/Task Assigned goes here...</p>
            </div>
        </div>
    </div>

    <script src="script.js"></script>
</body>
</html>