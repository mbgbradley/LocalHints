# LocalHints: step-by-step guide (written for a 15-year-old)

You do not need to be an expert. Do one step at a time, and do not skip the "check it worked" lines.
If something goes wrong, copy the red error message and ask Claude: "I got this error, what does it mean?"

**Words you will see**
- **Repository (repo):** a folder of your project stored on GitHub.
- **Deploy:** put your website on the internet so anyone can open it.
- **Environment variable:** a secret setting (like a password) that lives outside your code.
- **Database:** a place on the internet that remembers information, even when you close your browser.

---

## Part 1: Put the project on GitHub

1. Go to **github.com** and make a free account (or sign in).
2. Click the **+** at the top right, then **New repository**.
3. Name it `localhints`. Leave it **Private** for now. Click **Create repository**.
4. Click **uploading an existing file**.
5. Unzip `localhints.zip` on your computer. Open the unzipped folder.
6. Select everything inside (the folders `app`, `components`, `data`, `docs`, `lib`, `public`, `types`, and the files like `package.json`) and drag it into the GitHub page.
7. Wait for the uploads to finish. Click **Commit changes**.

Check it worked: you can see `package.json` and the `app` folder on your repository's main page.
(Tip: `.gitignore` and `.env.example` start with a dot and can be hidden on your computer. Turn on "show hidden files" if you do not see them. The project still works without them, but add them if you can.)

## Part 2: Put the website on the internet (Vercel)

1. Go to **vercel.com** and sign up with your GitHub account.
2. Click **Add New → Project** and choose your `localhints` repository. Click **Import**.
3. Open **Environment Variables** and add these three (this is the safe way to change the Admin password):
   - `ADMIN_USERNAME` = a new name (not "Admin")
   - `ADMIN_PASSWORD` = a long password nobody can guess
   - `SESSION_SECRET` = a long random mash of letters and numbers (at least 40 characters)
4. Click **Deploy** and wait about two minutes.
5. Click the link Vercel gives you and open it on your phone.

Check it worked: the home page shows deals and a **Map** button. Go to `/admin` and sign in with your new login. The yellow "default password" warning should be gone.

If the deploy fails, open the red log, copy the error and ask Claude about it.

## Part 3: Try everything the site already does

Do this in ONE browser, because the data is saved inside the browser for now.

1. Go to `/business`, tap **Create account**, and make a business.
2. Go to `/admin`, sign in, and **approve** your business.
3. Go back to `/business`, sign in, and tap **Approve & go live** on the first deal.
4. Go to the home page. Your deal is on the list and on the map. Tap it and save the pass.
5. Back in `/business` (Pro features need Pro, or ask Admin to start a **pilot** for your business), try a **Neighborhood Drop**.

## Part 4: Make it remember things for real (Supabase database)

Right now each phone keeps its own data, so an owner on one phone and the admin on another can't see each other. A database fixes that.

1. Go to **supabase.com**, sign up, and click **New project**. Pick a name and a password. Save the password.
2. Wait until it says the project is ready.
3. In the left menu, click **SQL Editor** and ask Claude: "Write the SQL to create tables for accounts, businesses, deals, passes, drops and notifications that match `types/localhints.ts`, with PostGIS turned on." Paste what Claude gives you and press **Run**.
4. In **Project Settings → API**, copy the **Project URL** and the **anon key**.
5. In Vercel, add them as environment variables: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
6. Ask Claude: "Replace the action bodies in `lib/store.tsx` with Supabase calls. Keep the same `useStore()` functions so no other file changes." Upload the new `lib/store.tsx` to GitHub (open the file on GitHub, click the pencil, paste, commit). Vercel redeploys by itself.

Check it worked: sign up on your phone, then see that business in the Admin page on your laptop.

## Part 5: Real sign-in for businesses

1. In Supabase, open **Authentication** and turn on **Email**.
2. Ask Claude: "Switch business sign-up and sign-in in `lib/store.tsx` and `BusinessAuth.tsx` to Supabase Auth."
3. Commit the changes and let Vercel redeploy.

Check it worked: you can sign up on one device and sign in on another.

## Part 6: Take payments for Pro (Stripe)

1. Go to **stripe.com** and make an account. Stay in **Test mode**.
2. Create a Product called "LocalHints Pro" with a monthly price of $29 and a yearly price of $290.
3. Copy your **secret key** into Vercel as `STRIPE_SECRET_KEY`. Never put it in the code or share it.
4. Ask Claude: "Make `upgradeTier` open Stripe Checkout and update the business when Stripe's webhook says the payment worked."
5. Pay with Stripe's test card `4242 4242 4242 4242` (any future date, any numbers).

Check it worked: the business flips to Pro after the test payment.

## Part 7: Add the pass to Apple Wallet and Google Wallet

This is the hardest part. Take it slowly, and do Google first because it is quicker.

**Google Wallet**
1. Sign up at **pay.google.com/business/console** and create a Google Wallet issuer account.
2. In Google Cloud, create a **service account** and download its key (a JSON file). Put its contents in Vercel as a secret variable. Never upload the file to GitHub.
3. Ask Claude: "Use `googleOfferObject()` in `lib/wallet.ts` to build a Save to Google Wallet link and put it on the Add to Google Wallet button."

**Apple Wallet**
1. Join the **Apple Developer Program** (it costs $99 a year, so ask a parent or guardian).
2. Create a **Pass Type ID** and a certificate. Download the certificate and Apple's WWDR certificate.
3. Ask Claude: "Use `applePassJson()` in `lib/wallet.ts` to build a signed `.pkpass` file in an API route, and add the web-service routes Apple needs for updates."
4. Keep your certificates in Vercel's secret variables. Never upload them to GitHub.

Check it worked: tap the button on a real phone and the pass lands in the wallet. Apple Wallet needs an iPhone, and Google Wallet needs an Android phone.

## Part 8: Make Neighborhood Drops really reach people

Read `docs/WALLET_RADIUS_PUSH.md` first. It is short and explains why a shopper has to tap "Add".

1. In the shopper's Profile, add a clear "Nearby deal alerts" switch (it already exists) and save the shopper's rough location in Supabase.
2. Ask Claude: "Write a Supabase function that finds shoppers within the drop radius using `ST_DWithin`, and send each one a web push notification."
3. Make the notification open the pass page, where they tap Add to Wallet.
4. Test with your own phone and a friend's phone. Always get permission before sending anyone alerts.

Check it worked: you send a drop and your friend's phone buzzes with the deal.

## Part 9: Be safe and responsible

- Never put passwords, keys or certificates in your code or on GitHub. Only use Vercel environment variables.
- Only send alerts to people who said yes, and let them say stop.
- Ask a parent, guardian or teacher to review before you collect real people's information or take real money.
- Keep the Admin page's login private and strong.

## Cheat sheet: when to ask Claude

| You want to | Say this |
|---|---|
| Fix an error | "I got this error: (paste it). What does it mean and how do I fix it?" |
| Change how it looks | "Make the deal cards bigger and use a green button." |
| Add a feature | "Add (feature). Keep the same style and tell me which files to upload." |
| Understand code | "Explain `lib/store.tsx` like I'm 15." |
