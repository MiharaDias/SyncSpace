# SyncSpace — Manual UI Test Plan

> **How to use this document**
> Work through each section top-to-bottom. Mark every item ✅ PASS, ❌ FAIL, or ⚠️ SKIP.
> Record the browser console error or screenshot path in the Notes column.
>
> **Prerequisites**
> - Backend running on `http://localhost:5000`
> - Frontend running on `http://localhost:5173`
> - At least one administrator account already created (first-registered user)
> - Open DevTools → Network tab and Console tab side-by-side

---

## 0 · Environment Check

| # | Step | Expected | Notes |
|---|------|----------|-------|
| 0.1 | Navigate to `http://localhost:5173` | App loads, Login page visible | |✅
| 0.2 | Navigate to `http://localhost:5000/api/health` | `{"status":"ok"}` JSON response | |✅
| 0.3 | Check browser console for errors on initial load | No red errors | |✅

---

## 1 · Authentication

### 1.1 Register

| # | Step | Expected |
|---|------|----------|
| 1.1.1 | Click "Create your account" / Register link | Register page renders |✅
| 1.1.2 | Fill Full Name, Username, Email, Password (<8 chars), leave departments empty → Submit | Error: "at least 8 characters and contain…" |✅
| 1.1.3 | Enter valid password (e.g. `Test1234`) but no departments → Submit | Submit button disabled (can't click) |
| 1.1.4 | Select role **Administrator** | All 11 department checkboxes auto-check ✓ |✅
| 1.1.5 | Deselect role back to **User** | Departments stay selected (not auto-cleared) |✅
| 1.1.6 | Re-select **Administrator**, fill all fields, Submit | "Registration Submitted" pending-approval page |
| 1.1.7 | Register a second user with role **Manager** | Pending approval page |
| 1.1.8 | Try to register with the same email again | Error: "Email already registered" |
| 1.1.9 | Try to register with password `nodigits` | Error about letter+digit |

### 1.2 Login

| # | Step | Expected |
|---|------|----------|
| 1.2.1 | Login with correct admin credentials | Redirects to Dashboard |
| 1.2.2 | Logout (sidebar bottom) | Redirected to Login page |
| 1.2.3 | Login with wrong password | "Invalid credentials" error |
| 1.2.4 | Login with non-existent email | "Invalid credentials" (not "user not found") |
| 1.2.5 | Attempt to navigate to `/dashboard` while logged out | Redirected to Login |

### 1.3 Google OAuth (if configured)

| # | Step | Expected |
|---|------|----------|
| 1.3.1 | Click "Continue with Google" on Login page | Redirects to Google's auth page |
| 1.3.2 | Complete Google sign-in with a new account | Redirects to `/google-signup` for profile completion |
| 1.3.3 | Complete signup, submit | Pending approval page OR dashboard if first user |

---

## 2 · Admin Panel

> Login as **administrator** before this section.

### 2.1 Pending Approvals

| # | Step | Expected |
|---|------|----------|
| 2.1.1 | Navigate to Admin panel | Approval tab shows badge count of pending users |
| 2.1.2 | Pending users list shows the Manager and User registered in §1.1 | Both names visible |
| 2.1.3 | Click **Approve** on the Manager user | User disappears from list; badge count decreases |
| 2.1.4 | Click **Reject** on a pending user → confirm | User disappears from list |
| 2.1.5 | Refresh Admin panel | Badge count reflects current state |

### 2.2 Users Tab

| # | Step | Expected |
|---|------|----------|
| 2.2.1 | Click "Users" tab | All users listed with role badges |
| 2.2.2 | Click "→ manager" on the approved regular user | Role badge updates to Manager |
| 2.2.3 | Verify badge shows "Pending" on an un-approved user | Badge visible |

### 2.3 Meetings Tab

| # | Step | Expected |
|---|------|----------|
| 2.3.1 | Click "Meetings" tab | List of meetings (may be empty) |
| 2.3.2 | After creating meetings in §5, return here and cancel one | Meeting shows "Cancelled" badge |

### 2.4 Stats Cards

| # | Step | Expected |
|---|------|----------|
| 2.4.1 | Stats row shows 5 stat cards | Total Users, Pending Approvals, Active Meetings, Total Tasks, Completed Tasks all show numbers |

### 2.5 Activity Logs

| # | Step | Expected |
|---|------|----------|
| 2.5.1 | Click "Activity Logs" tab | Meeting Logs and Task Logs panels render (may be empty) |
| 2.5.2 | After creating and acting on meetings/tasks, revisit | Entries appear |

---

## 3 · Dashboard

| # | Step | Expected |
|---|------|----------|
| 3.1 | Navigate to Dashboard | Page loads with stats, upcoming meetings, recent tasks |
| 3.2 | Stats cards reflect actual DB data | Numbers non-negative and sensible |
| 3.3 | "New Meeting" shortcut opens meeting creation dialog | Dialog visible |
| 3.4 | Recent tasks list links to Tasks page | Tasks page loads on click |

---

## 4 · Calendar

### 4.1 Basic Navigation

| # | Step | Expected |
|---|------|----------|
| 4.1.1 | Navigate to Calendar | Week view visible |
| 4.1.2 | Click **Month** tab | Month grid renders |
| 4.1.3 | Click **Day** tab | Single-day hourly view renders |
| 4.1.4 | Click **Today** button | Jumps back to current date |
| 4.1.5 | Click **◀ / ▶** navigation arrows | Moves to previous/next week/month/day |

### 4.2 Events Display

| # | Step | Expected |
|---|------|----------|
| 4.2.1 | SyncSpace meetings created in §5 appear on calendar | Blue/green/purple event blocks visible |
| 4.2.2 | Manually-created busy slots appear | Dark-grey blocks visible |
| 4.2.3 | Click any event block | EventDetailModal opens with meeting details |
| 4.2.4 | Close modal | Returns to calendar |

### 4.3 Create from Calendar

| # | Step | Expected |
|---|------|----------|
| 4.3.1 | Click on an empty time slot in week view | Context menu appears: "New Meeting" / "Mark Busy" |
| 4.3.2 | Click "Mark Busy" → fill form → Save | Busy block appears on calendar |
| 4.3.3 | Click "New Meeting" from context menu | Meeting dialog opens with time pre-filled |

### 4.4 Google Calendar Sync

| # | Step | Expected |
|---|------|----------|
| 4.4.1 | Connect Google Calendar in Settings (§10.2) first | Google events appear as "Busy" blocks after sync |
| 4.4.2 | Click **Sync** button (top right of calendar) | Spinner animation plays, calendar refreshes |
| 4.4.3 | If Google Calendar not connected, Sync returns gracefully | No crash, calendar still shows correctly |
| 4.4.4 | Google events show as "Busy" colour (#475569), not as meetings | Darker grey vs blue |

---

## 5 · Meetings

### 5.1 Create Meeting

| # | Step | Expected |
|---|------|----------|
| 5.1.1 | Click "New Meeting" button | Dialog opens |
| 5.1.2 | Submit without title | Error: title required |
| 5.1.3 | Fill: Title="Team Standup", start=tomorrow 9 AM, duration=30 min, add attendees | Form submits |
| 5.1.4 | Meeting appears in Meetings list | Card with title, time, status "active" |
| 5.1.5 | Create another meeting with recurrence = **daily**, end after 3 days | 3 extra recurring meeting entries created |
| 5.1.6 | Create meeting with **required** and **optional** attendees | Both sets of attendees listed in meeting detail |

### 5.2 Meeting List & Search

| # | Step | Expected |
|---|------|----------|
| 5.2.1 | Navigate to Meetings page | All meetings listed |
| 5.2.2 | Type partial title in search box | List filters in real-time |
| 5.2.3 | Check "Upcoming" / "Organised" / "Attending" tabs | Correct meetings under each tab |

### 5.3 Respond to Meeting (as attendee)

| # | Step | Expected |
|---|------|----------|
| 5.3.1 | Login as the Manager user | |
| 5.3.2 | Navigate to Meetings → "Attending" tab | Meeting from 5.1.3 listed with "Pending" status |
| 5.3.3 | Click "Respond" → Accept | Status changes to "Accepted" (green badge) |
| 5.3.4 | Respond to another meeting → Decline → fill rejection reason | Status changes to "Declined" |
| 5.3.5 | Decline without filling rejection reason | Submit button stays disabled |

### 5.4 Cancel Meeting

| # | Step | Expected |
|---|------|----------|
| 5.4.1 | Login as organizer; open meeting detail | "Cancel" button visible |
| 5.4.2 | Click Cancel → confirm | Meeting shows "Cancelled" badge; disappears from active list |
| 5.4.3 | Attendees receive "Meeting Cancelled" notification | Notification bell shows new count |

### 5.5 Edit Meeting

| # | Step | Expected |
|---|------|----------|
| 5.5.1 | Open a meeting as organizer → Edit button | Form pre-filled |
| 5.5.2 | Change title, save | Updated title visible in list |

### 5.6 Availability Check

| # | Step | Expected |
|---|------|----------|
| 5.6.1 | In New Meeting dialog, add attendees, set time | "Check Availability" section shows conflict summary |
| 5.6.2 | Set time that conflicts with an existing meeting | Conflict warning shown |
| 5.6.3 | "Suggested Slots" button | Returns alternative time slots with no conflicts |

---

## 6 · Tasks

### 6.1 Task List (My Tasks)

| # | Step | Expected |
|---|------|----------|
| 6.1.1 | Navigate to Tasks | "My Tasks" page loads |
| 6.1.2 | Filter by Status dropdown | List filters correctly |
| 6.1.3 | Filter by Priority | List filters correctly |

### 6.2 Create Task (Standalone)

| # | Step | Expected |
|---|------|----------|
| 6.2.1 | Click "New Task" | Dialog opens |
| 6.2.2 | Submit with empty title | Error: "title required" or button disabled |
| 6.2.3 | Fill Title="Test Task", priority=high, due date=tomorrow | Task created |
| 6.2.4 | Task appears in list with correct priority badge | Correct |

### 6.3 Task Detail

| # | Step | Expected |
|---|------|----------|
| 6.3.1 | Click a task card | Task detail modal/panel opens |
| 6.3.2 | Change status via dropdown | Status updates, card badge updates |
| 6.3.3 | Add a comment → Send | Comment appears in thread |
| 6.3.4 | Add sub-deadline (milestone) → save | Sub-deadline appears with checkbox |
| 6.3.5 | Mark sub-deadline complete | Checkbox checked, progress shows |

### 6.4 Delete Task

| # | Step | Expected |
|---|------|----------|
| 6.4.1 | Admin/manager deletes task | Task removed from list |
| 6.4.2 | Regular user tries to delete another's task | 403 or button hidden |

---

## 7 · Projects

### 7.1 Project List

| # | Step | Expected |
|---|------|----------|
| 7.1.1 | Navigate to Projects | Project cards displayed (or "No projects" state) |
| 7.1.2 | Each card shows progress circle, task counts, member count | Correct |

### 7.2 Create Project

| # | Step | Expected |
|---|------|----------|
| 7.2.1 | Click "New Project" | Dialog opens |
| 7.2.2 | Submit empty name | Error: name required |
| 7.2.3 | Fill Name="Website Redesign", visibility=department, select departments, dates | Project created |
| 7.2.4 | Project card appears in list with 0% progress | Correct |

### 7.3 Project Board (Tasks)

| # | Step | Expected |
|---|------|----------|
| 7.3.1 | Open project → Board tab | Kanban columns visible (default statuses or custom) |
| 7.3.2 | Click "Add Task" | Task dialog with project statuses |
| 7.3.3 | Fill task → Submit | Task card appears in correct Kanban column |
| 7.3.4 | Task creation with status "In Progress" succeeds | No 500 error (23514 fix working) |
| 7.3.5 | Click task card → status dropdown changes status | Task moves to correct column on refresh |
| 7.3.6 | Add comment in task quick-view | Comment appears |

### 7.4 Member Management

| # | Step | Expected |
|---|------|----------|
| 7.4.1 | Open project → Members tab | Current members listed |
| 7.4.2 | Click "Add Member" | Search input appears |
| 7.4.3 | Type 2+ letters of a user's name | Dropdown shows matching users |
| 7.4.4 | Select user from dropdown | Name fills input, "Add Member" button enables |
| 7.4.5 | Click "Add Member" | User appears in members list; notification sent |
| 7.4.6 | Try to add the same user again | 409 "Already a member" (not a crash) |
| 7.4.7 | Click trash icon on a non-creator member | Member removed from list |

### 7.5 Custom Statuses

| # | Step | Expected |
|---|------|----------|
| 7.5.1 | Open project → Settings tab | "Custom Statuses" section visible |
| 7.5.2 | Add status name "Blocked" with red color | Status appears in Kanban board |
| 7.5.3 | Delete custom status | Column removed; tasks in that status moved to fallback |

### 7.6 Analytics Tab

| # | Step | Expected |
|---|------|----------|
| 7.6.1 | Open project → Analytics tab | Progress ring, stats grid, status breakdown |
| 7.6.2 | With tasks in various statuses, breakdown chart reflects reality | Counts match |
| 7.6.3 | Member performance section shows completion rates | Non-empty if tasks assigned |

### 7.7 Edit & Delete Project

| # | Step | Expected |
|---|------|----------|
| 7.7.1 | Open Settings tab → Edit project | Change name, save | Updated |
| 7.7.2 | Change status to "On Hold" | Badge updates |
| 7.7.3 | Delete project (confirm) | Returns to project list, project gone |

---

## 8 · Notifications

| # | Step | Expected |
|---|------|----------|
| 8.1 | Bell icon in top bar shows unread count | Number badge visible after meeting/project actions |
| 8.2 | Click bell icon / navigate to Notifications | Notifications page lists items |
| 8.3 | Click a single notification | Marked as read; count decreases |
| 8.4 | Click "Mark all read" | All notifications marked; count goes to 0 |
| 8.5 | Notification for meeting invite has "Accept"/"Decline" buttons | Buttons render on invite notifications |
| 8.6 | Accept meeting via notification | Meeting response updated; redirected to meeting |

---

## 9 · Manager Panel

> Login as **Manager** role before this section.

| # | Step | Expected |
|---|------|----------|
| 9.1 | Navigate to Manager panel | Page loads (not 403) |
| 9.2 | "Department Users" section lists users in manager's department | Correct |
| 9.3 | "Team Calendar" section shows team busy/meeting overview | Calendar view for each user |
| 9.4 | "Meeting Stats" section shows meeting counts | Numbers |
| 9.5 | "Task Overview" section shows task distribution | Non-empty if tasks exist |
| 9.6 | Login as regular user; navigate to `/manager` | 403 or redirected |

---

## 10 · Settings

### 10.1 Profile

| # | Step | Expected |
|---|------|----------|
| 10.1.1 | Navigate to Settings | Profile info shows current name/email |
| 10.1.2 | Edit full name → Save | Name updates in top bar immediately |
| 10.1.3 | Click Logout | Redirected to login; JWT cleared |

### 10.2 Google Calendar

| # | Step | Expected |
|---|------|----------|
| 10.2.1 | If not connected: "Connect Google Calendar" button visible | Correct |
| 10.2.2 | Click Connect → redirect to Google | Google OAuth page opens |
| 10.2.3 | Authorise → redirect back to `/settings?google_connected=true` | Success toast: "Google Calendar connected (email@gmail.com)" |
| 10.2.4 | Connected email address shown | Correct |
| 10.2.5 | Click Disconnect → confirm | Connected status cleared, button resets |
| 10.2.6 | If Google OAuth not configured: "Google OAuth not configured" error | Graceful error, no crash |

---

## 11 · Busy Slots

| # | Step | Expected |
|---|------|----------|
| 11.1 | Calendar → click slot → "Mark Busy" | Dialog opens with pre-filled time |
| 11.2 | Fill reason="Doctor appointment", all-day=off → Save | Block appears on calendar |
| 11.3 | Create all-day busy slot | Block spans full day row |
| 11.4 | Click busy block → EventDetailModal shows reason | Correct |
| 11.5 | Delete busy slot from modal | Block removed from calendar |

---

## 12 · Security & Edge Cases

| # | Step | Expected |
|---|------|----------|
| 12.1 | Open DevTools → Application → localStorage; inspect token | JWT stored |
| 12.2 | Manually alter the token to garbage → reload any authenticated page | Redirected to login (401 handled) |
| 12.3 | As regular user, navigate to `/admin` | 403 or redirected |
| 12.4 | Try to create a meeting with a start time in the past | Allowed (no hard block needed) or shows warning |
| 12.5 | Submit form with very long strings (500+ chars in name fields) | Backend 400 error shown in UI |
| 12.6 | XSS check: enter `<script>alert(1)</script>` as a task title | Title renders as literal text (not executed) |

---

## 13 · Cross-Role Workflow (End-to-End)

| # | Step | Expected |
|---|------|----------|
| 13.1 | Admin creates project "Q3 Launch", sets visibility=users | Only admin sees it initially |
| 13.2 | Admin adds Manager as member | Manager receives "Added to Project" notification |
| 13.3 | Manager logs in, opens project, adds task "Write copy" | Task visible on board |
| 13.4 | Admin assigns task to Regular User | Regular User gets notification |
| 13.5 | Regular User logs in, goes to My Tasks | "Write copy" task visible |
| 13.6 | Regular User changes status to "In Progress" | Board updates for Admin and Manager |
| 13.7 | Regular User marks task "Completed" | Progress ring on project card increases |
| 13.8 | Admin checks project Analytics | 1/1 tasks completed, 100% progress |
| 13.9 | Admin schedules meeting with Manager+Regular User as attendees | Both get invite notifications |
| 13.10 | Manager accepts, Regular User declines with reason | Meeting shows mixed responses |
| 13.11 | Admin checks Activity Logs in Admin panel | Meeting actions logged |

---

## 14 · Recurring Meeting Smoke Test

| # | Step | Expected |
|---|------|----------|
| 14.1 | Create meeting with recurrence=**Weekly**, end date = 4 weeks out | Meeting created, no 500 error |
| 14.2 | Calendar shows 4 total instances (current + 3 recurring) | Correct count |
| 14.3 | Create meeting with recurrence=**Monthly**, end date = 3 months | 3 instances created |
| 14.4 | Create meeting with recurrence=**Daily**, end date = 2 days out | 2 instances created |

---

## 15 · Regression Checklist (Known Fixes)

| Fix | Test | Expected |
|-----|------|----------|
| `recurring.py` timezone bug | Create recurring meeting from a timezone-aware client (any browser sends ISO with Z) | No 500 TypeError |
| `add_member` false 409 | Add member to project | Success 200, no false "Already a member" error |
| Admin panel pending users | Register new user; check admin pending tab | User appears immediately |
| `Promise.allSettled` admin | Admin panel loads even if one endpoint fails | Other tabs still show data |
| Google Calendar "Scope changed" | Connect Google Calendar | Redirect succeeds, no scope error |
| Google Calendar sync button | Click Sync on calendar | Spinner → calendar refreshes |
| Auto-select departments for admin | Register, change role to Administrator | All departments auto-checked |
| 23514 task status check | Create task with status "Not Started" or "In Progress" | Task created successfully |

---

## Reporting

After completing a test run, fill in:

- **Date**: _______________
- **Tester**: _______________
- **Backend version / commit**: _______________
- **Browser**: _______________
- **Total tests**: 100+
- **Passed**: ___
- **Failed**: ___
- **Skipped**: ___

List all FAILs here with steps to reproduce, screenshot paths, and console error text.
