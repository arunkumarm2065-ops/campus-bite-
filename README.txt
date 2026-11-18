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
   Only active admins can create profiles or change role/active fields; users can read their own profile and edit non-privileged fields. Students can read their own Firestore orders, shop owners can read their shop's orders, and admins can read all orders.
   Assign each owner a stable shop ID; owners with the same shop ID share that shop's menu and orders.
   The shared campusbite/state document is still readable and writable by signed-in users; data stored there is not isolated by these collection rules.
5. Serve index.html over HTTP(S), e.g. VS Code Live Server or Firebase Hosting.

The app uses Firestore collection `campusbite`, document `state` as the shared live application state.
Admin-created Student/Owner accounts are created through a secondary Firebase Auth app so the Admin session stays signed in. Passwords are never stored in Firestore.
