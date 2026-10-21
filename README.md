# HRCRM Mobile

React Native **CLI** (bare) companion app for [HRCRM](https://github.com/kamalUniyal06/hrcrm.ai). It talks to the **same backend endpoints** as the web app (branch `dev2`): the auth backend on `app.hrcrm.ai` and the CRM Smart Gateway on `flight.hrcrm.ai`.

## What it does

| Role | Screens |
|---|---|
| **Employee** | Home (clock in / lunch / clock out, attendance stats, announcements), Attendance calendar, Leave (balances, requests, holidays, apply with attachment), Increment request, Account |
| **Candidate** | Home (hiring journey, next interview, applications), Jobs (browse + apply), Interviews, Profile (view / edit) |
| **HR admin** | Dashboard (team attendance today, needs-action list), Leave approvals (approve / reject), Candidates (paged list + detail), People directory (+ per-employee attendance), Interview board (pass / fail with feedback), System alerts (publish, responses, delete), Increment requests, Offboarding |

Role is decided exactly like the web app: `userInfo.status === "admin"` → admin, `userInfo.phase === "Employment"` → employee, otherwise candidate.

## Setup

Requirements: Node 22+, JDK 17, Android SDK with platform 37, build-tools 37.0.0, NDK 27.1.12297006 and CMake 3.22.1 (`sdkmanager "platforms;android-37" "build-tools;37.0.0" "ndk;27.1.12297006" "cmake;3.22.1"`).

```bash
npm install
cp .env.example .env      # fill in the keys below
npm run start:fresh       # Metro, with a cache reset so .env is picked up
npm run android           # builds and installs the debug app (needs JDK + SDK on PATH)
.\scripts\run-android.ps1 # Windows: same, but sets JAVA_HOME / ANDROID_HOME / PATH itself and builds only the connected device's ABI
.scriptsun-android.ps1  # Windows: same, but sets JAVA_HOME / ANDROID_HOME / PATH itself and builds only the connected device ABI
```

`.env` needs the same values the web app uses in its `.env`:

| Web (`VITE_*`) | Mobile (`.env`) | Used for |
|---|---|---|
| `VITE_SMARTGATEWAY_SECRET_KEY` | `EXPO_PUBLIC_SMARTGATEWAY_SECRET_KEY` | Signs every Smart Gateway request (`X-Api-Token`) |
| `VITE_FETCHGPC_X_API_KEY` | `EXPO_PUBLIC_FETCHGPC_X_API_KEY` | `hrc` entry point: clock in/out, leave with attachment |
| – | `GOOGLE_WEB_CLIENT_ID` (optional) | Native Google account dialog, see below |

Values are inlined at bundle time by `react-native-dotenv`; after editing `.env` restart Metro with `npm run start:fresh`.

iOS: `cd ios && pod install`, then `npm run ios` (requires macOS). Add the Ionicons font to `Info.plist` with `npx rnvi-update-plist package.json ios/HrcrmMobile/Info.plist`.

## Verifying without a device

```bash
npm run lint   # ESLint (React Native config)
npm test       # Jest: utils, API contracts, session/token logic, native Google fallback,
               #       route-name consistency, and render smoke tests for every screen
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output /tmp/index.bundle
```

The Jest run mocks the Smart Gateway (`src/services/api`), AsyncStorage, WebView, Google Sign-In, the document picker and the icon font (see `__mocks__/`), so it exercises the real screens, stores and API modules against canned CRM records.

## How login works

The web app signs in with Google / Microsoft through `app.hrcrm.ai/public/index.php?controller=auth&action=googleLogin` and keeps a `PHPSESSID` cookie.

**Web flow (works today, no setup).** The phone does the same inside a WebView (`src/components/AuthWebView.js`): the `frontend` return URL points at `action=me`, so after OAuth the WebView lands on the session JSON and the app reads `user`, `userInfo` and the short-lived `crm_access_token`. Microsoft always uses this flow.

**Native Google dialog (`src/services/googleAuth.js`).** When `GOOGLE_WEB_CLIENT_ID` is set, "Continue with Google" opens the Google Play Services account picker and posts the returned ID token to `controller=auth&action=googleTokenLogin`. That route must be added to the auth backend: verify the token against the web client ID, open the PHP session for that email and reply with the same JSON as `action=me`. Google Cloud needs an Android OAuth client with package `ai.hrcrm.mobile` and the SHA-1 of each signing key (`cd android && gradlew signingReport`). Until both exist the app falls back to the web flow automatically.

**Session.** The CRM token (RS256 JWT, ~10 min) is cached in memory and mirrored to AsyncStorage together with the user snapshot, so the app opens straight to the right tabs. Refresh (`src/services/crmAuth.js`) tries a native `fetch` first (Android shares the WebView cookie jar) and falls back to a hidden WebView (`SessionBridge.js`) that holds the cookies.

## Endpoints (same as web)

- `GET  app.hrcrm.ai/public/index.php?controller=auth&action=me|logout`
- `POST flight.hrcrm.ai/index.php?entryPoint=smart_gateway` — `{ action: fetch|fetch_related|create|update|delete|get_stats, module, ... }` with `Authorization: Bearer <crm token>` and `X-Api-Token`
- `POST flight.hrcrm.ai/index.php?entryPoint=hrc&type=daily_activity` — `{ email, action: login|lunch_in|lunch_out|logout }`
- `POST flight.hrcrm.ai/index.php?entryPoint=hrc&type=create_leave` — multipart leave request

Modules used: `hrc_daily_activity`, `hrc_employees`, `hrc_leaves`, `hrc_holidays`, `hrc_limit_management`, `hrc_system_alert`, `hrc_employee_response`, `hrc_increment*`, `hrc_salaries`, `hrc_candidates` (+ related `hrc_skills`, `hrc_experience`, `hrc_education`, `hrc_job_applications`, `hrc_interviews`), `hrc_job_postings`, `hrc_interviews`, `hrc_resignation`.

## Project layout

```
App.js                      providers, splash, session bootstrap
index.js                    AppRegistry entry (app name from app.json)
android/ ios/               native projects (package ai.hrcrm.mobile)
src/config.js               URLs and .env keys
src/services/               crmAuth (token), crmClient (axios + interceptors), api (http / fetchGpc), googleAuth, storage
src/api/                    one module per feature, ported from the web app
src/store/                  zustand: auth session, toasts
src/hooks/queries.js        shared React Query hooks
src/components/             TodayAttendanceCard, AlertsPrompt, AuthWebView, SessionBridge, ui/
src/screens/                auth/, employee/, candidate/, admin/, shared/
src/navigation/             role-based tab navigators
src/utils/                  dates, attendance maths, record helpers
```
