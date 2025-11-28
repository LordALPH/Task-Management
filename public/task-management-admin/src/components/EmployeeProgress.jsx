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
                    <li><a href="#employee-progress" class="active">Employee Progress</a></li>
                    <li><a href="#all-tasks">All Tasks</a></li>
                    <li><a href="#member-add-task">Member Add/Task Assigned</a></li>
                </ul>
            </nav>
        </header>
        <main class="dashboard-content">
            <section id="employee-progress" class="tab-content active">
                <!-- Employee Progress Content -->
                <h2>Employee Progress</h2>
                <p>Content for Employee Progress goes here.</p>
                <!-- Existing functionality can be integrated here -->
            </section>
            <section id="all-tasks" class="tab-content">
                <!-- All Tasks Content -->
                <h2>All Tasks</h2>
                <p>Content for All Tasks goes here.</p>
                <!-- Existing functionality can be integrated here -->
            </section>
            <section id="member-add-task" class="tab-content">
                <!-- Member Add/Task Assigned Content -->
                <h2>Member Add/Task Assigned</h2>
                <p>Content for Member Add/Task Assigned goes here.</p>
                <!-- Existing functionality can be integrated here -->
            </section>
        </main>
    </div>
    <script src="script.js"></script>
</body>
</html>