# GradeWay — Round Rock ISD Home Access Center Client

GradeWay is a beautiful, reimagined web client for the Round Rock ISD Home Access Center (HAC), built using **React, Vite, and Node.js**. It features a modern user interface, unweighted GPA calculation from academic transcripts, class schedules, and what-if grade projection calculators.

---

## Features

- 🔑 **Secure Authentication:** Proxies and authenticates directly with Round Rock ISD access center servers using secure session cookie jars.
- 👥 **Multi-Student Context Switching:** Automatically detects parents with multiple students in the district and displays an elegant profile picker.
- 📊 **Transcript GPA Calculator:** Dynamically parses the student's historical transcript (`Grades -> Transcript`) to calculate unweighted GPAs from Grade 9 records.
- 🗓️ **Class Schedule & Attendance Tracker:** Syncs classes, room numbers, periods, instructors, and keeps track of registered absences.
- 🧮 **What-If Calculator:** Simulates hypothetical scores on individual class assignments to project final semester grades.

---

## Project Structure

```bash
├── server.js              # Express API Scraper Proxy (Handles authentication and Cheerio scraping)
├── src/
│   ├── main.jsx           # App entry point
│   ├── App.jsx            # Core React Application & Screens (Login, Overview, GPA, Class Detail, etc.)
│   ├── App.css            # Base styles and variables
│   └── index.css          # Design system, typography, and glassmorphism styling
├── vite.config.js         # Vite configuration
└── package.json           # Node project configuration and launch scripts
```

---

## Getting Started

### Prerequisites

Ensure you have **Node.js** (v18 or higher) and **npm** installed on your system.

### 1. Install Dependencies

Install all frontend and backend dependencies from the root directory:

```bash
npm install
```

### 2. Start the Development Server

Run both the Vite frontend server and the Express scraping proxy server concurrently in development mode:

```bash
npm run dev
```

- **Frontend Application:** Run at [http://localhost:5173](http://localhost:5173)
- **Scraper Proxy API:** Runs at [http://localhost:3001](http://localhost:3001)

---

## Scraper Diagnostics & Debugging

To make development and debugging easier, the Express backend automatically writes intermediate scraper responses directly to the root workspace directory for analysis:

- `picker_get.html` — The raw HTML response of the Home Access Center student picker page.
- `picker_switch.html` — The redirect/selection confirmation HTML after switching student context.
- `transcript.html` — The parsed historical transcript WebForms iframe content.
- `schedule.html` — The student schedule page HTML.
- `attendance.html` — The student calendar/attendance page HTML.
- `reportcard.html` — The fallback report card page HTML.
