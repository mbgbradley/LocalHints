# LocalHints: step-by-step setup (written for a 15-year-old)

You only need a web browser. You do not need to install anything. Do one step at a time, and do the
"check it worked" line before moving on. If something goes wrong, copy the error message and ask Claude:
"I got this error, what does it mean?"

**Words you will see**
- **Repository (repo):** your project's folder on GitHub.
- **GitHub Pages:** free GitHub hosting that turns your `docs` folder into a website.
- **Cloudflare Worker:** a small program that runs on the internet and acts as the "brain" and "memory" of the site.
- **KV:** Cloudflare's simple storage. Our Worker saves all the businesses and deals there.
- **Secret / variable:** a private setting (like a password) stored outside your code.

**How the pieces fit:** the three pages (`index.html`, `business.html`, `admin.html`) live on GitHub Pages. They
talk to your Worker, which saves everything in KV. Until you connect a Worker, the site runs in **demo mode**
(sample data, saved only in your own browser).

---

## Part 1: Put the project on GitHub

1. Go to **github.com**, sign in, click **+** (top right) → **New repository**. Name it `localhints`. Click **Create repository**.
2. Click **uploading an existing file**.
3. Unzip `localhints.zip`. Open the folder and drag **everything inside** (the folders `docs`, `worker`, `guides` and the files) into the page.
   - Tip: GitHub keeps folders when you drag them in. If a hidden file like `.gitignore` does not show on your computer, that is okay.
4. Click **Commit changes**.

Check it worked: your repo shows the folders `docs`, `worker` and `guides`.

## Part 2: Turn on the website (GitHub Pages)

1. In your repo click **Settings** → **Pages** (left menu).
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Branch: `main`. Folder: **/docs**. Click **Save**.
4. Wait about a minute and refresh. GitHub shows your site address, like `https://yourname.github.io/localhints/`.

Check it worked: open that address. You see "Deals near you" with a yellow **Demo mode** bar. Tap a deal, tap
**Add to wallet**, and a pass appears. Try `/business.html` (tab **Sign in**, tap a demo account) and `/admin.html`
(username `Admin`, password `Admin`).

## Part 3: Build the Worker (the brain)

1. Go to **dash.cloudflare.com** and make a free account.
2. Left menu: **Workers & Pages** → **Create** → **Create Worker**. Name it `localhints-api`. Click **Deploy**.
3. Click **Edit code**. Delete everything in the editor.
4. In GitHub, open `worker/worker-single-file.js`, click the **Copy raw file** button, and paste it all into the Cloudflare editor.
5. Click **Deploy**.
6. Go back to the Worker's page → **Settings** → **Bindings** → **Add** → **KV namespace**.
   - If you do not have one, click **Create a namespace** and name it `localhints-data`.
   - **Variable name** must be exactly `LH_KV`. Choose your namespace. Save and deploy.
7. Copy your Worker address (it looks like `https://localhints-api.yourname.workers.dev`).

Check it worked: open `YOUR-WORKER-ADDRESS/api/health` in your browser. You see `{"ok":true,"mode":"live",...}`.

## Part 4: Set your secrets (do this before sharing anything)

In the Worker: **Settings** → **Variables and Secrets** → **Add**. Add each one, choose type **Secret**:

| Name | What to put |
|---|---|
| `ADMIN_USERNAME` | A new admin name (not "Admin") |
| `ADMIN_PASSWORD` | A long password nobody can guess |
| `SESSION_SECRET` | A long mash of random letters and numbers (40+ characters) |
| `ALLOWED_ORIGIN` | Your site, like `https://yourname.github.io` (no `/localhints` and no slash at the end) |

Click **Deploy** after adding them.

Check it worked: the old `Admin` / `Admin` login no longer works on the live site, and the red warning on the
admin page disappears.

## Part 5: Connect the website to the Worker

1. In GitHub, open `docs/js/config.js` and click the pencil (**Edit**).
2. Change `API_BASE: ''` to your Worker address: `API_BASE: 'https://localhints-api.yourname.workers.dev'`
3. Click **Commit changes**. Wait a minute for Pages to update.
4. Refresh your site (on a phone, close and reopen it).

Check it worked: the yellow **Demo mode** bar is gone, and there are no deals yet. That is correct. It is the
real, empty site.

Now try the whole loop with real data:
1. `/business.html` → **Create account** → make a business.
2. `/admin.html` → sign in with your new login → open the business → **Approve**.
3. Business → **Overview** → **Edit deal** (it is the deal we drafted for you) → **Save & go live**.
4. Open the shopper page. Your deal is there, on the list and the map. Save it.
5. Business → **Overview** → type the pass code → **Redeem**.

To fill the site with sample data for testing, use Admin → **Settings** → **Load demo data**.

## Part 6: Turn on Google address checking

When a business types its address, we match it to Google's list of real addresses so every business is listed the same way.

1. Go to **console.cloud.google.com**, create a project, and add billing (Google gives free monthly credit; ask a parent or guardian).
2. **APIs & Services** → **Library** → search **Geocoding API** → **Enable**.
3. **Credentials** → **Create credentials** → **API key**. Click **Restrict key** and allow **only** the Geocoding API.
4. In the Worker, add a Secret named `GOOGLE_MAPS_API_KEY` with your key. Deploy.

Check it worked: on the sign-up page, type an address and tap **Check address with Google**. You see "We matched
this address" with the full, tidy version. In Admin → Settings, "Google address check" says Connected.

## Part 7: Turn on "Save to Google Wallet"

1. Sign up for the **Google Wallet API** at **pay.google.com/business/console** and note your **Issuer ID**.
2. In Google Cloud, create a **service account**, give it access in the Wallet console, and download its **JSON key**.
3. Add three Secrets on the Worker: `GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL` (the `client_email` from the JSON), and `GOOGLE_WALLET_PRIVATE_KEY` (the `private_key` from the JSON, pasted exactly).
4. Deploy and test the **Google Wallet** button on an Android phone.

Never put these keys in GitHub. Only in Cloudflare Secrets.

## Part 8: Apple Wallet (later)

Apple Wallet needs the Apple Developer Program ($99 a year, so ask a parent or guardian), a Pass Type ID, and a
signing step. Read `guides/WALLET_RADIUS_PUSH.md` first, then ask Claude: "Help me build the signed .pkpass for Apple Wallet."

## Part 9: Payments for Pro (later)

Right now, on the live site, tapping "Upgrade to Pro" sends a request that you see in Admin (a yellow
"Wants Pro" tag). You switch them with **Change to Pro**. When you are ready for real payments, ask Claude to
connect **Stripe**.

## Staying safe

- Never put passwords or keys in GitHub. Use Cloudflare Secrets.
- Only send alerts to shoppers who turned them on.
- Ask a parent, guardian or teacher to check before you collect real people's information or take real money.

## Changing things later

Edit files right in GitHub (open the file → pencil → Commit changes). The site updates in about a minute.
If you change `docs/js/engine.js` (the business rules), ask Claude to regenerate `worker/worker-single-file.js`,
then paste it into Cloudflare again.

| You want to | Ask Claude |
|---|---|
| Fix an error | "I got this error: (paste it). What does it mean and how do I fix it?" |
| Change how it looks | "Make the deal cards bigger and the buttons orange. Tell me which file to edit." |
| Add a feature | "Add (feature). Tell me which files to change." |
| Understand code | "Explain `docs/js/engine.js` like I'm 15." |
