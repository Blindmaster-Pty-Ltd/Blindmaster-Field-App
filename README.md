# Blindmaster Field App: stage 1 (sandbox)

A web app for the installation team, sales and the office. It works on phones, iPads and desktop computers. Each person signs in and sees their appointments for the day. Each appointment shows its type, address, customer, job requirements, crew, Drive folders and directions, with one-tap Google Maps navigation and a route map for the day.

Stage 1 reads a **test Google Calendar** through a **sandbox Apps Script**. It does not touch the live Job Report, Daily Installation Report or their scripts.

```
GitHub Pages (this repo)  ──►  Sandbox Apps Script (/exec)  ──►  Test Google Calendar
   index.html, js/, css/          apps-script/Code.gs              fake appointments
```

## Layouts
The app picks its layout from the screen width, and switches when an iPad is rotated:

| Screen | Layout |
|---|---|
| Phone (under 768px) | Single column with tabs along the bottom. Tapping an appointment opens it full screen. |
| iPad / tablet (768–1279px) | Icon rail on the left, schedule list, and the selected appointment beside it (like the Mail app). |
| Desktop / office (1280px and up) | Full sidebar, schedule list, and appointment details with the map alongside. |

**Office Overview:** office staff open the app on the **Overview**, a snapshot of the numbers for a day, week or month:
- jobs done (of jobs scheduled)
- jobs incomplete (return visits)
- reports outstanding
- hours on site
- travel time
- kilometres
- reports on time (%)
- late reports

Below that is a table by person and a "Needs attention" list. **Print snapshot** produces a one-page A4 landscape page you can also save as a PDF.

Where the numbers come from:
- **Scheduled jobs:** the calendar.
- **Everything else:** a **Report log** Google Sheet with one row per submitted Job Report or Daily Installation Report. In the sandbox, run `seedSampleReportLog` to create it with sample data. When this goes live, the existing JR and DIR scripts will add a row to it whenever a report is submitted. The DIR already works out hours, km and travel time.
- **On time:** a JR counts as on time if it's submitted by midnight on the job day (`JR_GRACE_HOURS`, default 0). A DIR counts as on time if it's submitted by 9am the next day (`DIR_GRACE_HOURS`, default 9).

**Weather:** the day screen shows the forecast for the Northern Beaches (high, low, conditions, rain chance and wind gusts). Each appointment shows the forecast for its suburb during the booked hours. A **wind warning** appears when gusts reach `WIND_WARN_KMH` (default 40 km/h), and a **storm warning** appears when thunderstorms are forecast. Forecasts come from Open-Meteo, which is free and needs no account or key. They show for up to 14 days ahead.

**Office role:** give office staff `"role":"office"` in `STAFF_JSON`. They then see every appointment on the calendar, not just their own, plus a **Team** board with one column per person showing that person's day. Sales staff on an install appear in that installer's column labelled "3rd", "4th" and so on.

## Setup checklist (about 30 minutes)

### 1. Create the repo and turn on GitHub Pages
1. On GitHub, create **blindmaster-pty-ltd/Blindmaster-Field-App**. Private is fine on a paid plan. On the free plan, Pages needs the repo to be public.
2. Upload everything in this folder **except** the `apps-script` folder. Keeping the script in the repo is fine too, since it holds no secrets.
3. Go to Settings › Pages, set Source to *Deploy from a branch*, choose `main` and `/ (root)`, then Save.
4. The app address will be `https://blindmaster-pty-ltd.github.io/Blindmaster-Field-App/`.

### 2. Create the test calendar
1. In Google Calendar, open Other calendars and choose **+ › Create new calendar**. Name it **Field App – Sandbox**.
2. Open its settings › *Integrate calendar* and copy the **Calendar ID**.
3. Share it with testers (*See all event details*).

### 3. Create the sandbox Apps Script
1. Go to script.google.com and create a **New project** named **Field App – Sandbox API**. This must be a new project, not your live JR or Daily Installation Report project.
2. Paste `apps-script/Code.gs` into `Code.gs`. Then add two more script files (**+ › Script**) named `ProjectChat` and `FieldChat`, and paste in `apps-script/ProjectChat.gs` and `apps-script/FieldChat.gs`. They run the project chat.
3. In Project settings, tick *Show appsscript.json*, then paste in `apps-script/appsscript.json`.
4. In Project settings › **Script properties**, add:

| Property | Value |
|---|---|
| `CALENDAR_ID` | the test calendar ID |
| `ALLOWED_DOMAIN` | `blindmaster.com.au` |
| `ALLOW_DEV_LOGIN` | `true` (sandbox only: lets testers sign in with just their email until Google sign-in is set up) |
| `STAFF_JSON` | `{"lewis@blindmaster.com.au":{"name":"Lewis Hillard","role":"installer"},"troy@blindmaster.com.au":{"name":"Troy Breglec","role":"installer"}}` (add sales staff with `"role":"sales"` and office staff with `"role":"office"`) |
| `JR_FORM_URL` | your Job Report form URL with `{jr}` where the job number goes, e.g. `https://blindmaster-pty-ltd.github.io/Blindmaster-Job-Report/blindmaster-job-report.html?jr={jr}` |
| `OAUTH_CLIENT_ID` | add later, in step 5 |
| `FIREBASE_PROJECT_ID` | `blindmaster-field` |
| `APP_URL` | `https://blindmaster-pty-ltd.github.io/Blindmaster-Field-App/` (chat emails link here) |

**`STAFF_JSON` with several roles and contractors:** give each person a main `role` and, if they wear several hats, a `roles` list. Owen and other contractors are listed by the Google account they sign in with, for example their Gmail. Being listed is what lets them in. Set `"active":false` to switch someone off.
```
{"simon@blindmaster.com.au":{"name":"Simon","role":"office","roles":["office","pm","installer","sales"]},
 "troy@blindmaster.com.au":{"name":"Troy Breglec","role":"installer","roles":["installer","pm","sales"]},
 "owen.example@gmail.com":{"name":"Owen","role":"installer"}}
```
Keep this list matching the Firestore `staff` collection for now. A later version will read the Firestore list, so there's only one to keep.

5. Run **`seedSampleDay`** once from the editor and approve the permissions. It adds test appointments for today and tomorrow, with you as a guest. Then run **`seedSampleReportLog`**, which creates the sample report log for the office Overview and saves its ID as `REPORT_LOG_ID`.
6. Go to Deploy › **New deployment** › Web app, with *Execute as:* **Me** and *Who has access:* **Anyone**. Copy the `/exec` URL.
   - From now on, only use Manage deployments › ✏️ Edit › *New version*. A new deployment changes the URL.

### 4. Point the app at the script
Edit `js/config.js` in the repo:
```js
API_URL: 'https://script.google.com/macros/s/XXXX/exec',
```
Commit, wait a minute for Pages to update, then open the app address on your phone. Sign in with your Blindmaster email.

### 5. Switch on Google sign-in (before wider testing)
Use the sign-in client that Firebase already created, so one Google sign-in covers both the app and the project chat.

1. Go to **console.cloud.google.com**. At the top, choose the project **blindmaster-field**.
2. Open **APIs & Services › Credentials**. Under OAuth 2.0 Client IDs, click **Web client (auto created by Google Service)**.
3. Under **Authorised JavaScript origins**, click **Add URI** and add `https://blindmaster-pty-ltd.github.io`. Click **Save**.
4. Copy the **Client ID** and paste it in two places: `GOOGLE_CLIENT_ID` in `js/config.js`, and the `OAUTH_CLIENT_ID` script property.
5. So that Owen can sign in with his Gmail: open **APIs & Services › OAuth consent screen** (it may be called **Google Auth Platform › Audience**). If the user type is **Internal**, change it to **External**, and if it shows **Testing**, click **Publish app**. Only people on your staff list can get in either way.
6. Set `ALLOW_DEV_LOGIN` to `false`.

Until this is done, testers sign in by email only, and the chat shows a one-time **Sign in with Google** button on each device.

### 6. Project chat
The chat is stored in Firebase (project `blindmaster-field`). Its setup, rules and staff list are in the `firebase` folder (`SETUP.md`). Once the script properties above are in place:

1. Use **Manage deployments › Edit › New version**, and approve the new permissions (Firestore and sending email).
2. Open the app and load a day. Each appointment with a JR or OPP number gets a **Project chat** link. Everyone on the appointment's crew is added to that chat automatically, and the office sees every chat under **Chats**.
3. An **Important** message emails the project's members and staff with the `office` or `pm` role.

## How appointments are written in the calendar
The app shows an appointment to everyone who is a **guest** on the event, or who is listed on a `Crew:` line. The event **location** is the address used for maps. The **description** uses one item per line:

```
Type: Installation
JR: 28874
OPP: 1042
Customer: Jane Nguyen
Phone: 0400 000 000
Access: Side gate, code 1234
Folder: https://drive.google.com/drive/folders/...        (opportunity folder)
Project folder: https://drive.google.com/drive/folders/... (project folder)
Notes: Call 30 minutes before arrival
- Folding-arm awning, motorised
- Masonry fixings, brick wall
```

The type is one of: Installation, Service, Warehouse, Site consult, Check measure, Project visit or Showroom. If there is no `Type:` line, the app guesses from the title. Sales staff added as the 3rd, 4th or 5th guest on an Installation see it labelled "3rd installer" and so on.

## Testing on a phone
- Open the app address in Safari or Chrome and add it to the home screen. It then opens full screen like an app.
- Try the following:
  - signing in
  - today and the next day
  - opening an appointment
  - Navigate, Call and On my way
  - the route map
  - turning on flight mode, to check the last loaded schedule still shows
- Clear the test data with `clearSampleDays`, and add new data with `seedSampleDay` or by creating events by hand.

## What's next
- Stage 2: job items, van load list, and opportunity and project folders from NetSuite.
- Stage 3: notes, sketches, photos and video saved to Collateral subfolders, plus receipts.
- Stage 4: load list lock, confirmations and the 8:00 office alert.
- Stage 5: proposals from the costing templates.
- Project chat: photos and videos saved to the project's Drive folder, phone notifications for Important messages, open Important items on the office Overview, and adding someone (e.g. Craig) to a chat by hand.
