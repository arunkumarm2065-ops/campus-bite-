CampusBite Firebase Live

Firebase project: campus-bite-demo

Services used:
- Firebase Authentication (Email/Password)
- Cloud Firestore real-time listener (onSnapshot)
- Firebase Storage is NOT used

Setup:
1. Enable Authentication > Email/Password.
2. Create the admin Authentication user.
3. Create Firestore users/{ADMIN_UID} with username=admin, name=CampusBite Admin, role=admin, active=true.
4. Publish firestore.rules.
5. Serve index.html over HTTP(S), e.g. VS Code Live Server or Firebase Hosting.

The app uses Firestore collection `campusbite`, document `state` as the shared live application state.
Admin-created Student/Owner accounts are created through a secondary Firebase Auth app so the Admin session stays signed in. Passwords are never stored in Firestore.
