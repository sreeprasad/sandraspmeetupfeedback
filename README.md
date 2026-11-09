# Meetup feedback

Feedback form for the meetup run by Sreeprasad and Sandra. One question per screen, with NASA and Webb space photos.

- `public/index.html` is the form.
- `src/worker.js` saves answers to Cloudflare D1 and serves a password-protected results page.
- `schema.sql` creates the `responses` table.

## Deploy

1. `npx wrangler login`
2. `npx wrangler d1 create meetup-feedback`, then paste the printed `database_id` into `wrangler.jsonc`.
3. `npx wrangler d1 execute meetup-feedback --remote --file=schema.sql`
4. `npx wrangler secret put RESULTS_PASSWORD` and choose a password.
5. `npx wrangler deploy`

The form is at the URL wrangler prints. Results are at `/results` (any username, the password from step 4), and `/results.csv` downloads everything.

## Run locally

```
npx wrangler d1 execute meetup-feedback --local --file=schema.sql
echo 'RESULTS_PASSWORD=test' > .dev.vars
npx wrangler dev
```

Photo credits are shown on each screen. NASA photos are public domain; the full Moon photo is by Gregory H. Revera, CC BY-SA 3.0.
