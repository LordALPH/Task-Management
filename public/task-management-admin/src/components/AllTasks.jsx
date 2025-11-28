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
            <div class="branding">
                <img src="logo.png" alt="Logo" class="logo">
            </div>
        </header>
        <nav class="tab-navigation">
            <button class="tab-button active" onclick="openTab(event, 'employeeProgress')">Employee Progress</button>
            <button class="tab-button" onclick="openTab(event, 'allTasks')">All Tasks</button>
            <button class="tab-button" onclick="openTab(event, 'memberAddTask')">Member Add/Task Assigned</button>
        </nav>
        <div class="tab-content">
            <div id="employeeProgress" class="tab active">
                <!-- Existing Employee Progress Code -->
                <h2>Employee Progress</h2>
                <p>Content for Employee Progress goes here.</p>
            </div>
            <div id="allTasks" class="tab">
                <!-- Existing All Tasks Code -->
                <h2>All Tasks</h2>
                <p>Content for All Tasks goes here.</p>
            </div>
            <div id="memberAddTask" class="tab">
                <!-- Existing Member Add/Task Assigned Code -->
                <h2>Member Add/Task Assigned</h2>
                <p>Content for Member Add/Task Assigned goes here.</p>
            </div>
        </div>
    </div>
    <script src="script.js"></script>
</body>
</html>