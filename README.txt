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

--- Campus Wallet, admin wallet monitor, order tools, scrolling banner ---
New files (load order is already set at the bottom of index.html): wallet.js, order-tools.js
Changed files: index.html (placeOrder pays from the wallet), master-control.js (scrolling banner),
               mascot.js (mascots can read an announcement), firestore.rules (wallets + walletTxns)

Firestore collections added:
- wallets/{studentUid}   balance, studentId, studentName, updatedAt
- walletTxns/{autoId}    immutable ledger: type (topup | payment | refund | admin_credit), amount, balanceAfter, token, note, createdAt...
Re-publish firestore.rules after copying it. No indexes are needed.

Student
- 👛 balance chip in the header opens the wallet (add money + history). "Campus Wallet" at checkout takes the money
  from this balance; the order, the balance change and the ledger line are saved in ONE transaction.
- My Orders has a Sort menu (newest, oldest, amount high/low, active first); the choice is remembered.
Admin
- Wallet tab: money held, spent/added today, every student's balance (+ Add money), a searchable ledger
  and a "Refunds due" list for cancelled wallet orders. Click an order # anywhere to see the customer.
- Order History: click the order # to see the customer name, ID and full order details.
- The existing Refund button also returns wallet money to the student's wallet.
Announcement
- Admin > Master Control > Announcement banner: type a message, Save. It scrolls across the top for everyone
  (hover/touch pauses it) and a mascot reads it aloud once per browser session (again if the text changes).

DEMO TOP-UP: there is no payment gateway, so students can add money to their own wallet for testing
(max Rs 2000 per top-up, Rs 5000 balance). For real use set ALLOW_STUDENT_TOPUP = false in wallet.js AND
demoTopUpAllowed() to return false in firestore.rules; then only admins add money (Admin > Wallet > Add money).

