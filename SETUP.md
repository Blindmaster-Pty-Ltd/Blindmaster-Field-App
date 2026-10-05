# Firebase setup for BM Project Chat (about 15–20 minutes)

The Firebase project sits under Simon's Google account. Everything below is done in a web browser.

## 1. Create the project
1. Go to **console.firebase.google.com** and sign in as Simon.
2. Click **Create a project**.
3. Name it **blindmaster-field**. Firebase may add letters to the end to make it unique, so write down the final **Project ID**.
4. Turn **Google Analytics off**. The app doesn't need it.
5. Click **Create project**.

## 2. Create the database
1. Open **Build › Firestore Database** and click **Create database**.
2. For location, choose **australia-southeast1 (Sydney)**. This can't be changed later.
3. Choose **Start in production mode**, then click **Create**.

## 3. Add the access rules
1. Open **Firestore Database › Rules**.
2. Replace everything with the contents of `firestore.rules`.
3. Click **Publish**. If the console shows a red error, send me a screenshot. I couldn't test-run the rules here, so the console's check is the first real test.

## 4. Turn on Google sign-in (for the Field App)
1. Open **Build › Authentication** and click **Get started**.
2. Under **Sign-in method**, choose **Google** and switch it on.
3. Set the support email to simon@blindmaster.com.au, then click **Save**.
4. Under **Settings › Authorised domains**, click **Add domain** and add `blindmaster-pty-ltd.github.io`.

The access rules block anyone who isn't on the staff list (step 6), whatever Google account they sign in with.

## 5. Register the web app
1. Go to **Project settings** (the gear icon) **› General**. Under **Your apps**, click the **</>** (Web) icon.
2. Name it **Field App**. Leave Hosting unticked, then click **Register app**.
3. Copy the `firebaseConfig` block (apiKey, authDomain, projectId and so on) and send it to me. It isn't a secret, since it's built into every web app; the access rules are what protect the data.

## 6. Add the staff list
Open **Firestore Database › Data** and click **Start collection**.

- **Collection ID:** `staff`
- **Each person:** one document, even if they have several roles. The **Document ID** is their email in lower case, for example `jan@blindmaster.com.au`. Give it these fields:

| Field | Type | Value |
|---|---|---|
| `name` | string | Troy Breglec |
| `role` | string | their main role, e.g. `installer` |
| `roles` | array (add each item as a string) | every role, e.g. `installer`, `pm`, `sales` |
| `active` | boolean | true |

**What each role does:**

| Role | Effect |
|---|---|
| `office` (or `admin`) | Sees and posts in every project chat; gets every Important email. Keep to Simon, Jan and Sammie |
| `pm` | Gets the Important emails |
| `installer`, `sales`, `warehouse`, `marketing` | Label only. They see the chats for projects they're booked on (added automatically from the appointment crew) |

**Who to add:**

| Who | role | roles |
|---|---|---|
| Simon | `office` | `office`, `pm`, `installer`, `sales` |
| Jan | `office` | `office` |
| Sammie (operations and marketing) | `office` | `office`, `marketing` |
| Troy, Andrew | `installer` | `installer`, `pm`, `sales` |
| Lewis, Mark | `installer` | `installer` |
| Craig (warehouse) | `warehouse` | `warehouse` |
| Owen (contractor) | `installer` | `installer` |
| Other sales staff | `sales` | `sales` |

**Contractors without a Blindmaster account (Owen):** use the Google account he'll sign in with, e.g. his Gmail, in lower case, as the Document ID. The staff list decides who gets in, so being listed is what gives him access. When he finishes with Blindmaster, set `active` to false. That switches off the app and the chat straight away.

## 7. Stay on the free plan
Leave the project on the free **Spark** plan, so no billing details are needed. As far as I know, a team your size stays well inside its daily limits for chat messages. Photos and videos don't count, because they're stored in Google Drive.

## 8. Let the Job Report script write to the chat (when you update the JR)
The JR's Apps Script posts with the Google account that **owns and deploys** the script.

- **If that's Simon's account:** nothing more to do.
- **If it's another account** (for example a Blindmaster team account):
  1. Go to **Project settings › Users and permissions › Add member**.
  2. Add that account with the **Editor** role.

Then in the JR Apps Script project:

1. Add the file `ProjectChat.gs`.
2. In **Project settings › Script properties**, add `FIREBASE_PROJECT_ID` = your Project ID from step 1.
3. Add these to the `oauthScopes` list in `appsscript.json`:
   - `https://www.googleapis.com/auth/datastore`
   - `https://www.googleapis.com/auth/script.external_request`
   - `https://www.googleapis.com/auth/script.send_mail`
4. Run `testProjectChat` once from the editor and approve the permissions. Then check **Firestore › Data**: you should see `projects › JR-90002 › messages` with one test entry.
5. Use **Manage deployments › Edit › New version** so the /exec URL stays the same.

## What lives where

```
Firestore (blindmaster-field)
├── staff/{email}                      name, role, active
├── jrIndex/{jrNumber}                 projectKey (finds the chat from a JR number)
└── projects/{projectKey}              OPP-1042 (or JR-28874 until the opportunity is linked)
    ├── memberEmails, oppNumber, jrNumber, lastMessage, openImportantCount, updatedAt
    ├── messages/{messageId}           one per message (see the spec)
    └── reads/{email}                  when each person last read the chat (unread counts)

Google Drive
└── … › Project [#] › Chat             photos and videos posted in the chat
```
