# HRCRM Mobile

React Native (Expo) companion app for [HRCRM](https://github.com/kamalUniyal06/hrcrm.ai). It talks to the **same backend endpoints** as the web app (branch `dev2`): the auth backend on `app.hrcrm.ai` and the CRM Smart Gateway on `flight.hrcrm.ai`.

## What it does

| Role | Screens |
|---|---|
| **Employee** | Home (clock in / lunch / clock out, attendance stats, announcements), Attendance calendar, Leave (balances, requests, holidays, apply with attachment), Increment request, Account |
| **Candidate** | Home (hiring journey, next interview, applications), Jobs (browse + apply), Interviews, Profile (view / edit) |
| **HR admin** | Dashboard (team attendance today, needs-action list), Leave approvals (approve / reject), Candidates (paged list + detail), People directory (+ per-employee attendance), Interview board (pass / fail with feedback), System alerts (publish, responses, delete), Increment requests, Offboarding |

Role is decided exactly like the web app: `userInfo.status === "admin"` → admin, `userInfo.phase === "Employment"` → employee, otherwise candidate.

## Setup

```bash
npm install
cp .env.example .env     # then fill in the two keys below
npx expo start
```

`.env` needs the same values the web app uses in its `.env`:

| Web (`VITE_*`) | Mobile (`EXPO_PUBLIC_*`) | Used for |
|---|---|---|
| `VITE_SMARTGATEWAY_SECRET_KEY` | `EXPO_PUBLIC_SMARTGATEWAY_SECRET_KEY` | Signs every Smart Gateway request (`X-Api-Token`) |
| `VITE_FETCHGPC_X_API_KEY` | `EXPO_PUBLIC_FETCHGPC_X_API_KEY` | `hrc` entry point: clock in/out, leave with attachment |

Scan the QR code with **Expo Go** (Android / iOS). Every native module used here (WebView, SecureStore, DocumentPicker) is bundled in Expo Go, so no development build is needed. For a store build use `npx eas-cli build`.

## How login works

The web app signs in with Google / Microsoft through `app.hrcrm.ai/public/index.php?controller=auth&action=googleLogin` and keeps a `PHPSESSID` cookie. The phone does the same inside a WebView (`src/components/AuthWebView.js`): the `frontend` return URL points at `action=me`, so after OAuth the WebView lands on the session JSON and the app reads `user`, `userInfo` and the short-lived `crm_access_token`.

Token refresh (`src/services/crmAuth.js`) tries a native `fetch` first (Android shares the WebView cookie jar) and falls back to a hidden WebView (`SessionBridge.js`) that holds the cookies. The CRM token lives only in memory; the user snapshot is kept in SecureStore so the app opens straight to the right tabs.

## Endpoints (same as web)

- `GET  app.hrcrm.ai/public/index.php?controller=auth&action=me|logout`
- `POST flight.hrcrm.ai/index.php?entryPoint=smart_gateway` — `{ action: fetch|fetch_related|create|update|delete|get_stats, module, ... }` with `Authorization: Bearer <crm token>` and `X-Api-Token`
- `POST flight.hrcrm.ai/index.php?entryPoint=hrc&type=daily_activity` — `{ email, action: login|lunch_in|lunch_out|logout }`
- `POST flight.hrcrm.ai/index.php?entryPoint=hrc&type=create_leave` — multipart leave request

Modules used: `hrc_daily_activity`, `hrc_employees`, `hrc_leaves`, `hrc_holidays`, `hrc_limit_management`, `hrc_system_alert`, `hrc_employee_response`, `hrc_increment*`, `hrc_salaries`, `hrc_candidates` (+ related `hrc_skills`, `hrc_experience`, `hrc_education`, `hrc_job_applications`, `hrc_interviews`), `hrc_job_postings`, `hrc_interviews`, `hrc_resignation`.

## Project layout

```
App.js                      providers, splash, session bootstrap
src/config.js               URLs and env keys
src/services/               crmAuth (token), crmClient (axios + interceptors), api (http / fetchGpc)
src/api/                    one module per feature, ported from the web app
src/store/                  zustand: auth session, toasts
src/hooks/queries.js        shared React Query hooks
src/components/             TodayAttendanceCard, AlertsPrompt, AuthWebView, SessionBridge, ui/
src/screens/                auth/, employee/, candidate/, admin/, shared/
src/navigation/             role-based tab navigators
src/utils/                  dates, attendance maths, record helpers
```
