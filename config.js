// Field app settings. Edit these after setting up the sandbox (see README).
window.FIELD_APP_CONFIG = {
  // Sandbox Apps Script web app URL (ends in /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycby8NMk1Bs9bwDznUcBFfhYP5kr2JkDIDi2_Oe8kHKwl2ZFJxBfRrTaCS3n-is8HAkGwnA/exec',

  // Google OAuth web client ID for "Sign in with Google"
  // Leave blank to use email-only test sign-in (needs ALLOW_DEV_LOGIN=true in the script)
  GOOGLE_CLIENT_ID: '',

  // Shown on the sign-in screen so testers know this is not the live app
  ENVIRONMENT: 'Sandbox',

  // Daily Installation Report form (opened from the end-of-day card). {email} and {date} are filled in.
  DIR_FORM_URL: 'https://blindmaster-pty-ltd.github.io/Blindmaster-Job-Report/blindmaster-daily-report.html',

  // Warehouse address, used as the route start
  WAREHOUSE: '4/10 Orchard Road, Brookvale NSW 2100',

  // Weather (Open-Meteo): area for the daily forecast, and the wind gust limit for warnings
  WEATHER_LAT: -33.75,
  WEATHER_LON: 151.28,
  WIND_WARN_KMH: 40,

  OFFICE_PHONE: '02 9909 6700',

  // Project chat (Firebase project blindmaster-field). Not a secret: the Firestore rules protect the data.
  FIREBASE: {
    apiKey: 'AIzaSyB1kuVhwVKVSgbswYcmGNJRCyNF8y_ksoM',
    authDomain: 'blindmaster-field.firebaseapp.com',
    projectId: 'blindmaster-field',
    storageBucket: 'blindmaster-field.firebasestorage.app',
    messagingSenderId: '109655414089',
    appId: '1:109655414089:web:c30b1cc265660ad5c07698'
  }
};
