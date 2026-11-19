# CAPSERA — Live Academic Demonstration Runbook

This runbook supports an **8–10 minute full academic demonstration** (plus a **3-minute backup walkthrough**) running against the dedicated **`capsera_demo`** PostgreSQL database without modifying `capsera_db` or `capsera_cp03_test`.

---

## 1. Local Demo Startup & Environment

Start the backend against `capsera_demo` using your own PostgreSQL role via `DB_USER` (defaults below to your OS username `$USER`; replace with your local PostgreSQL username if different, and use port `5002` when macOS ControlCenter occupies `5000` or another local process occupies `5001`):

```bash
# Terminal 1 — Backend API connected to capsera_demo
DATABASE_URL="" NODE_ENV=development PORT=5002 CLIENT_ORIGIN=http://localhost:5173 \
  DB_NAME=capsera_demo DB_USER="${DB_USER:-$USER}" node server/src/index.js

# Terminal 2 — Vite Frontend proxying /api/v1 -> http://127.0.0.1:5002
VITE_API_BASE_URL=/api/v1 VITE_DEV_PROXY_TARGET=http://127.0.0.1:5002 npm --prefix client run dev -- --port 5173 --strictPort
```

Verify the active database before presenting:
- `GET http://localhost:5173/api/v1/health?db=true` -> confirm `"name": "capsera_demo"` and `"status": "CONNECTED"`.

---

## 2. Recommended Browser Setup

Open **three browser windows or profiles** (or 1 regular + 1 incognito window) so role switching stays instant:
1. **Window 1 (Admin):** `http://localhost:5173/login`
2. **Window 2 (Trainer / Trainee):** `http://localhost:5173/login`
3. **Window 3 (Public Visitor — Incognito):** `http://localhost:5173/certificates/verify`

---

## 3. Seeded Demo Accounts (Synthetic `@example.com`)

**Initial seeding vs. active passwords:**
- **Initial seeding (teammate local setups):** When seeding a fresh `capsera_demo` database, initial passwords are supplied via environment variables (`ADMIN_PASSWORD` for Admin; `DEMO_PASSWORD` for all seeded `@example.com` demo users). Teammates who do not have access to the primary presenter's macOS Keychain should set their own `ADMIN_PASSWORD` and `DEMO_PASSWORD` when running `seed:admin` and `seed:demo` locally.
- **Rotated active passwords (this demo machine):** After initial seeding, the active demo account passwords on this machine were rotated and are stored securely in **macOS Keychain** (never print, commit, or display plaintext passwords in slides or logs):
  - `CAPSERA Demo Admin` / `admin@example.com`
  - `CAPSERA Demo Users` / `demo-users`

| Role | Email | Status | Initial Seed Env Var | Demo Purpose |
|---|---|---|---|---|
| `ADMIN` | `admin@example.com` | `ACTIVE` | `ADMIN_PASSWORD` | Dashboard metrics, approvals, skills, announcements |
| `TRAINER` | `demo-trainer-2@example.com` | `ACTIVE` | `DEMO_PASSWORD` | Author of *Weather Data Analysis with Python* (Published) & *Visualizing Climate Trends* (Draft) |
| `TRAINER` | `demo-trainer-1@example.com` | `ACTIVE` | `DEMO_PASSWORD` | Author of *Introduction to Weather Forecasting* (Published); top match for *Weather Forecasting* |
| `TRAINEE` | `demo-trainee-1@example.com` | `ACTIVE` | `DEMO_PASSWORD` | Primary live learner (unenrolled in Course A; enrolls, completes lessons, passes quiz, earns certificate live) |
| `TRAINEE` | `demo-trainee-2@example.com` | `ACTIVE` | `DEMO_PASSWORD` | Demonstrates partial progress (`33%` on *Weather Data Analysis with Python*) |
| `TRAINEE` | `demo-trainee-3@example.com` | `ACTIVE` | `DEMO_PASSWORD` | Backup learner with pre-completed *Introduction to Weather Forecasting* + issued certificate (`CAP-3135-4F07-382B`) |
| `TRAINEE` | `demo-pending-trainee@example.com` | `PENDING` | `DEMO_PASSWORD` | Live Admin approval demo |
| `TRAINER` | `demo-pending-trainer@example.com` | `PENDING` | `DEMO_PASSWORD` | Backup pending account for approval/rejection demo |

---

## 4. Full 8–10 Minute Walkthrough

### Part A — Admin Governance & Platform Overview (~2.5 min)
1. **Log in as Admin** (`admin@example.com` using the active Admin password — `$ADMIN_PASSWORD` on a fresh local seed, or `CAPSERA Demo Admin` / `admin@example.com` in macOS Keychain on this machine).
   - *Expected:* Redirects to `/admin/dashboard` with live PostgreSQL KPI cards (users, courses, enrollments, certificates, assessment performance).
2. **Approve a Pending User:** Click **User Management** (`/admin/users`, defaults to `PENDING`). Click **Approve** on `demo-pending-trainee@example.com`.
   - *Expected:* Success notice appears; switching Status to `ACTIVE` shows the user as `ACTIVE` and persists on reload.
3. **Inspect Skill Catalogue:** Click **Skill Catalogue** (`/admin/skills`).
   - *Expected:* Displays the 5 canonical skills (*Weather Forecasting*, *Python for Meteorological Data*, *Data Visualization*, *Remote Sensing Fundamentals*, *Climate Data Analysis*).
4. **Publish an Announcement:** Click **Announcements** (`/admin/announcements`), enter a short title/body, and click **Publish Now**.
   - *Expected:* Appears immediately in the published feed on Trainee/Trainer dashboards.

### Part B — Trainer Authoring & Assessment Builder (~2 min)
5. **Log in as Trainer** (`demo-trainer-2@example.com` using the active demo user password — `$DEMO_PASSWORD` on a fresh local seed, or `CAPSERA Demo Users` / `demo-users` in macOS Keychain on this machine).
   - *Expected:* Trainer Dashboard (`/`) shows authored courses count, published/draft counts, expertise count, and published announcements.
6. **Inspect Courses, Lessons & Resources:** Click **My Courses** (`/trainer/courses`) -> open **Manage Lessons** on **Weather Data Analysis with Python**.
   - *Expected:* Shows 3 ordered lessons and 2 attached study resources (and *Visualizing Climate Trends* in `DRAFT` status).
7. **Inspect Assessment Builder:** Click **Assessments** (`/assessments/manage`), choose **Weather Data Analysis with Python** in the Course selector.
   - *Expected:* Navigates to `/courses/:id/assessments/manage` and displays published **Python Weather Data Proficiency Check** (15 min, 3 MCQs, 60% pass threshold).

### Part C — Trainee Learning, Assessment, Certificate & Matching (~4.5 min)
8. **Log in as Trainee** (`demo-trainee-1@example.com` using the active demo user password — `$DEMO_PASSWORD` on a fresh local seed, or `CAPSERA Demo Users` / `demo-users` in macOS Keychain on this machine).
   - *Expected:* Trainee Dashboard (`/`) displays mapped skills, empty enrollment prompt, and live announcements.
9. **Browse Catalogue & Enroll:** Click **Course Catalogue** (`/courses`) -> open **Weather Data Analysis with Python** -> click **Enroll in Course**.
   - *Expected:* Badge updates to `Enrolled`; lessons and quiz unlock.
10. **Complete Lessons & View Resources:** Click **Start Lesson** -> show attached study resource -> click **Mark as Complete** on Lessons 1, 2, and 3.
    - *Expected:* Completion banner notifies that all lessons are complete and a required assessment remains.
11. **Attempt & Pass Timed MCQ Quiz:** Click **Go to Assessments** -> **Take Quiz** -> **Start Assessment Now**.
    - *Expected:* Live countdown timer ticks (`15:00` downward). Select answers (`A`, `B`, `C`), click **Finish & Submit** -> **Yes, Submit Answers**.
    - *Expected:* Auto-graded **Scorecard** shows `100% PASSED`, instructor explanations, and *Course Completion Credit Unlocked*.
12. **Confirm Progress & Automatic Certificate:** Open **My Learning** (`100% Finished`), then **My Certificates** (`/certificates`).
    - *Expected:* New `VALID` certificate with unique `CAP-XXXX-XXXX-XXXX` code appears automatically.
13. **Public Verification (Logged Out):** Copy the certificate code into **Window 3 (Incognito)** at `/certificates/verify` and click **Verify Certificate**.
    - *Expected:* Displays `VALID` status, learner name, course title, and issue date without exposing private user data.
14. **Skill Mapping & Trainer Recommendations:** Open **My Skills** (`/skills`) to show canonical mappings, then **Find Trainers** (`/trainers/recommendations`) and select **Weather Forecasting**.
    - *Expected:* Deterministic ranking displays **Demo Trainer One** (`Expert`, `8.5 years`) ahead of **Demo Trainer Two** (`Advanced`, `2.5 years`) with explainable match reasons.

---

## 5. Short 3-Minute Backup Walkthrough

If time is limited or a live step is interrupted:
1. **Admin (`/admin/dashboard` & `/admin/users`):** Show live DB metrics and one-click `PENDING` -> `ACTIVE` approval (`45s`).
2. **Pre-Completed Learner (`demo-trainee-3@example.com`):** Show `/my-learning` (`100%` on *Introduction to Weather Forecasting*), `/certificates` (real issued certificate `CAP-3135-4F07-382B`), and verify that code in Incognito at `/certificates/verify/CAP-3135-4F07-382B` (`60s`).
3. **Trainer & Matching:** Show `/trainers/recommendations` for *Weather Forecasting* (deterministic ranking) and `/courses/:id/assessments/results` as `demo-trainer-1@example.com` (`75s`).

---

## 6. Recovery & Safe Demo Reset

- **If a live step fails:** Use `demo-trainee-3@example.com` (already completed Course B with certificate `CAP-3135-4F07-382B`) and `demo-trainee-2@example.com` (already `33%` progress on Course A) as instant backups.
- **How to rerun cleanly against `capsera_demo`:**
  1. Re-running `DATABASE_URL="" NODE_ENV=development DB_NAME=capsera_demo node server/scripts/seed-demo-content.js` is idempotent and non-destructive: it skips existing records (never creating duplicate skills, courses, lessons, quizzes, or announcements) and preserves any existing trainer/trainee competency mappings, lesson progress, and trainee feedback edits.
  2. To reset only `demo-trainee-1` and `demo-pending-trainee` before another rehearsal, remove `demo-trainee-1`'s Course A enrollment/attempt/certificate rows in `capsera_demo` and set `demo-pending-trainee@example.com` back to `PENDING` (never drop or touch `capsera_db` or `capsera_cp03_test`).

---

## 7. Architecture Talking Points (Evaluator Q&A)

- **React + Vite Frontend:** Role-isolated portal shells (`AdminLayout`, `TrainerLayout`, `TraineeLayout`), clean client-side route guards, responsive design (`1440px` to `375px`), and consistent inline SVG icons (`UiIcon.jsx`) with zero emojis.
- **Express REST API (`/api/v1`):** Modular domain layout (`auth`, `users`, `profiles`, `courses`, `enrollments`, `assessments`, `competency`, `certificates`, `announcements`, `admin`), Zod input validation, `helmet`, explicit-origin `cors`, and auth rate limiting.
- **PostgreSQL + Transactions:** 6 ordered DDL migrations with foreign keys, unique constraints, and `withTransaction` atomic commits for quiz grading, enrollment progress, competency replacement (`FOR UPDATE`), and certificate issuance.
- **Role-Based Authorization:** Server-side `authenticate` verifies JWT signatures AND queries PostgreSQL `users.status` on every protected request so suspended/pending users are blocked immediately; services enforce course ownership (`trainer_id === actor.id` or `ADMIN`).
- **Skill Mapping & Deterministic Matching:** Canonical admin-managed skill catalogue prevents duplicate/free-text fragmentation; recommendations rank active trainers deterministically by exact skill match, proficiency level (`1–4`), and years of experience with human-readable explanations.
- **Server-Owned Assessment Scoring & Automatic Certificates:** Answer keys are stripped from trainee quiz payloads before submission; grading runs strictly server-side inside a transaction and triggers automatic, duplicate-safe certificate issuance + `CERTIFICATE_ISSUED` audit logging once all lessons and required assessments are cleared.
