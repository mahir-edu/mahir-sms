# Mahir School Management System Development Guide

This guide contains critical, highly-specific operational facts and commands for working on the Mahir SMS project. Only these facts should be referenced during development, as they govern the system's unique architecture and workflow.

## 🛠️ Development Workflow & Commands
The system utilizes Astro with a Node adapter and relies on Firebase services.

### Lifecycle Commands (via npm scripts)
- **Start Development Server:** `npm run dev` (Uses `astro dev`)
- **Build Project:** `npm run build` (Uses `astro build`)
- **Preview Local Build:** `npm run preview` (Uses `astro preview`)
- **Start Production Server:** `npm run start` (Runs the server entry point: `node ./dist/server/entry.mjs`)
- **Database Seeding:** `npm run seed` (Runs the necessary database setup: `node scripts/seed-db.mjs`)

### Environment & Architecture Notes
- The application is designed as a server-side rendered system (`output: 'server'`).
- **Role Context:** The application manages distinct, highly-structured roles: Central (HQ) Admin, Pemancar school Admin, Teacher, Student, and Parent. Any logic must respect these boundaries.
- **Backend Dependency:** The system is built around **Firebase** (Firestore, Authentication, Email Notifications) and requires proper initialization via service accounts or environment variables.

