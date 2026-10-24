# Supabase Account Sync Setup

The app uses Supabase Auth for accounts and stores each account's expense history and budget settings in a row protected by Row Level Security (RLS).

1. Create a Supabase project.
2. In the Supabase SQL Editor, run `supabase-setup.sql`.
3. In Supabase Authentication settings, set the site URL to your deployed Netlify URL and add that URL and its `/login.html` path to the allowed redirect URLs.
4. Copy the project URL and public anon/publishable key from Project Settings > API into `supabase-config.js`.
5. Keep `currency-data.js` with the rest of the project; signup and account settings use it to map supported locations to display currencies.
6. Deploy the project to Netlify. Never put a `service_role` key in frontend code or public site files.
7. Create an account and confirm its email if confirmation is enabled. New expenses sync automatically; signing into the same account on another device loads the same history.

The username, country, and currency are stored as Supabase Auth user metadata. Passwords are managed by Supabase Auth and are not saved by this app in local storage. The first time an account is opened in a browser that already has local expenses, the app asks whether to upload those expenses. Currency conversion uses built-in estimates in `currency-data.js`, not live market rates; expense amounts remain stored in NGN and are converted for display.

The setup SQL adds the `preferences` JSONB column for the overall budget and category limits. If the table already exists, rerun the SQL to add this column safely; existing expense rows are preserved. Budget settings then load across devices with the signed-in account.

The dashboard's Spendy helper provides local summaries and rules-based tips. Optional Gemini AI advice is available through a Netlify Function; voice entry uses browser speech recognition and requires microphone permission. Depending on the browser, speech recognition may process audio through that browser provider.

## Optional Gemini AI Advice

The dashboard includes an opt-in Gemini advice button. The Gemini key stays in a Netlify Function and must never be added to browser JavaScript or `supabase-config.js`.

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/api-keys).
2. In Netlify, add `GEMINI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` under the site's environment-variable settings. Optionally set `GEMINI_MODEL`; the function defaults to `gemini-3.8-flash`.
3. Deploy the project with Netlify Functions enabled. Deploy from a connected Git repository or using Netlify CLI; a static drag-and-drop deploy or Live Server does not run the function.
4. Sign in and choose **AI insight** in Spendy. During local development, run the site with Netlify CLI (`npx netlify dev`) and provide the same secrets through your local environment.

Each AI request first verifies the signed-in Supabase session, then sends the user's question plus the current month's aggregate total, budget, currency, count, and category totals. It does not send transaction descriptions, emails, or individual line items. The Gemini request sets `store: false`, but Google still processes the request. API quotas and charges depend on the Google AI Studio project and can change; configure usage limits and never commit the Gemini key.

Use HTTPS (Netlify provides it by default), and log out on shared devices. The inactivity lock is a visual app gate, not encryption for data in the browser. The legacy custom cloud URL controls remain separate from account sync; only use them with an endpoint you control. Accounts created by the old local-only signup form are not migrated, but their local expense history can be uploaded after creating a new Supabase account.