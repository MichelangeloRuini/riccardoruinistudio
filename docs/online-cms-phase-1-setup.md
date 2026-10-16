# Online CMS Phase 1 setup

The integration is disabled unless `PROJECT_INQUIRIES_ENABLED=true`. Keep it disabled until the steps below and the privacy review are complete.

The repository is prepared for a static Vercel site plus Node.js functions in `api/`. The browser never receives a Supabase key: authentication and database traffic are proxied by the server functions, and admin tokens are stored only in `HttpOnly`, `SameSite=Strict` cookies.

## 1. Create separate Supabase environments

Use different Supabase projects for Preview and Production. Never copy real client data into Preview.

In each project:

1. Run `supabase/migrations/001_project_inquiries.sql` in the SQL Editor.
2. In Authentication settings, disable public user sign-ups.
3. Create each administrator manually in Authentication > Users.
4. Copy the administrator UUID and authorize it explicitly:

   ```sql
   insert into public.admin_users (user_id)
   values ('ADMIN_AUTH_USER_UUID');
   ```

5. Confirm that email/password authentication is enabled.
6. Configure an appropriate password policy. Enable MFA before Production if it is compatible with the selected Supabase Auth flow; Phase 1 currently uses email/password.
7. Verify that the Data API exposes `public` but does not expose the `private` schema.

Do not add an insert policy for `anon` on `project_inquiries`. Public writes pass through the server function only.

The migration deliberately keeps the admin membership helper in the non-exposed `private` schema, grants administrators only `SELECT` plus `UPDATE (status)`, and limits the `service_role` database role to inquiry inserts plus the persistent rate-limit table/RPC used by Start a Project and CMS login. Keep the Supabase secret key server-side: it maps to `service_role` and bypasses RLS.

## 2. Configure Vercel

Use the Vercel project with Framework Preset **Other** and keep the repository root as the Root Directory. Do not configure a public output directory; Vercel serves the static site and discovers the Node.js functions in `api/`.

Create the variables documented in `.env.example` separately for Preview and Production. Use the matching Supabase project in each environment; never reuse Preview keys in Production or vice versa. The Supabase secret key and rate-limit secret are server-side secrets. They must never use a `NEXT_PUBLIC_`, `VITE_`, or other public prefix.

| Variable | Preview | Production |
| --- | --- | --- |
| `SUPABASE_URL` | Preview project URL | Production project URL |
| `SUPABASE_ANON_KEY` | Preview `sb_publishable_...` key | Production `sb_publishable_...` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Preview `sb_secret_...` key | Production `sb_secret_...` key |
| `ALLOWED_ORIGINS` | Exact Preview aliases | Exact Production origins |
| `RATE_LIMIT_SECRET` | Unique random value | A different unique random value |
| `PROJECT_INQUIRIES_ENABLED` | Start as `false` | Keep `false` until separately approved |

The environment-variable names are retained for Vercel compatibility, but their values use Supabase's current publishable and secret key formats. The API client sends API keys only in the `apikey` header and reserves `Authorization: Bearer` for Supabase Auth user JWTs. Legacy JWT-based `anon` and `service_role` keys remain supported during migration.

The `sb_secret_...` value must exist only in Vercel's encrypted server-side environment and must never be placed in browser code, source control, URLs or logs. After a leaked legacy `service_role` key has been replaced everywhere and the Preview integration is verified, deactivate that legacy key in Supabase.

Generate each rate-limit secret locally with `openssl rand -hex 32`, then paste it directly into the corresponding Vercel environment-variable field. Do not put the generated value in a shell command, issue tracker, chat, repository file, or build log.

Set `ALLOWED_ORIGINS` to comma-separated exact HTTPS origins without paths, wildcards, or trailing slashes. Vercel automatically accepts the current `VERCEL_URL`; custom aliases must still be listed. State-changing endpoints reject requests whose `Origin` header is missing or not allowlisted.

Keep `PROJECT_INQUIRIES_ENABLED=false` while configuring and testing. Enable it in Preview only after the privacy notice is linked and the checks below pass. Enabling Production requires a separate authorization.

Enable Vercel Deployment Protection for Preview deployments. The online CMS still validates every request server-side; deployment protection is an additional layer.

The checked-in `vercel.json` applies no-store and security headers to the API/CMS, routes inquiry detail URLs to the dynamic function, and returns 404 for the retired local CMS surfaces. The checked-in `.vercelignore` excludes local CMS code, tests, migrations, tools, temporary uploads and every `.env*` file from deployment.

## 3. Privacy and retention

Before collecting data, obtain approved legal copy and link the Start a Project flow to the privacy notice without changing its visual hierarchy. Define and document a retention period for project inquiries. A scheduled database task can archive or delete records only after that policy is approved.

Rate-limit rows contain only keyed hashes, not raw IP addresses. Schedule periodic cleanup, for example:

```sql
delete from public.project_inquiry_rate_limits
where expires_at < now() - interval '1 day';
```

Record the approved inquiry-retention interval here before enabling collection:

```text
Project inquiry retention: NOT YET APPROVED
Policy owner: NOT YET ASSIGNED
Privacy notice URL: NOT YET PROVIDED
```

## 4. Verification checklist

- Invalid, oversized and cross-origin requests are rejected.
- Five submissions per IP hash per 15 minutes are accepted; later attempts return 429.
- Ten CMS login attempts per IP hash per 15 minutes are accepted; later attempts return 429.
- A valid inquiry appears in the CMS only after database insertion succeeds.
- Anonymous requests to every `/api/admin/*` data endpoint return 401.
- A valid non-admin Supabase user receives 403.
- Admin login, token refresh, expired sessions and logout work.
- New, read and archived filters and status transitions persist after reload.
- Browser bundles and responses contain no Supabase keys or secrets.
- `/admin.html`, `/admin-server.js`, `/admin.js` and `/cms/*` return 404 on the new deployment.
- Campaigns, Search and all public layouts match the current site.

Run the local automated checks before any Preview deployment:

```sh
npm test
git diff --check
```

The Supabase/Vercel integration checks require a protected Preview deployment and non-production test data. Test them from the real allowlisted Preview origin; direct requests without an `Origin` header are intentionally rejected. Inspect the browser Network and Application panels to confirm that no Supabase key or token appears in response bodies, JavaScript, local storage, or session storage. Admin tokens should appear only as inaccessible `HttpOnly` cookies scoped to `/api/admin`.

Do not promote or enable the Production environment until this checklist has been completed with non-production data.
