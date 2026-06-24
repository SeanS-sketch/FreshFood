# FreshFood

Production-ready pantry tracker — Firebase Auth, Firestore sync, shopping list, recipes, notifications, and admin dashboard. Built for **GitHub Pages** (static hosting) with Firebase v10 CDN modules.

## Project structure

```
FreshFood/
├── index.html          # Main app shell (preserved v3 UI)
├── css/app.css         # Styles + toast/loading enhancements
├── js/
│   ├── app.js          # Entry point
│   ├── firebase.js     # Firebase init
│   ├── config/firebase-config.js  # ← paste your config here
│   ├── auth.js         # Sign up, login, verification, password reset
│   ├── firestore-service.js
│   ├── pantry.js       # Fridge/cabinet + dynamic expiry
│   ├── shopping.js     # Shopping list
│   └── …
├── firestore.rules     # Security rules
├── firebase.json       # Firebase project config
└── functions/          # Cloud Functions (support/welcome email)
```

## Setup (required manual steps)

### 1. Firebase config

Open `js/config/firebase-config.js` and replace placeholders with your **Firebase Console → Project settings → Web app** config:

```javascript
export const firebaseConfig = {
  apiKey: '…',
  authDomain: '…',
  projectId: '…',
  // …
};
```

### 2. Firebase Console

- **Authentication** → Enable **Email/Password**
- **Firestore** → Create database (production mode)
- Deploy rules: `firebase deploy --only firestore:rules`
- **Authorized domains** → Add your GitHub Pages domain (e.g. `youruser.github.io`)

### 3. Cloud Functions (email)

```bash
cd functions && npm install
firebase functions:secrets:set GMAIL_USER      # e.g. freshfood.support@gmail.com
firebase functions:secrets:set GMAIL_APP_PASSWORD  # Gmail App Password
firebase deploy --only functions
```

Functions: `sendSupportEmail`, `sendWelcomeEmail`. Password reset and email verification use **Firebase Auth** built-in emails.

### 4. Admin user

In Firestore, set `users/{uid}/profile.role` to `"admin"` for supervisor accounts.

### 5. GitHub Pages

Push repo to GitHub → Settings → Pages → deploy from `main` branch root (or `/docs` if you prefer). Ensure `index.html` is at the site root.

## Features

| Area | Behavior |
|------|----------|
| **Expiry** | Stores `purchaseDate` + `expirationDate` only; days computed at render time |
| **Pantry** | Fresh / Soon / Expired sections, search, sort, bulk edit/delete, favorites |
| **Auth** | Email verification required before login; remember me; password reset |
| **Shopping** | Firestore-synced list; move items to pantry |
| **Support** | Firestore ticket + Cloud Function emails to freshfood.support@gmail.com |
| **Admin** | User counts, feedback, support ticket management |

## Local preview

Use a local server (ES modules require HTTP):

```bash
npx serve .
```

Optional Firebase emulators: add `?emulators=1` to the URL.

## License

Private project — Brian / FreshFood.
