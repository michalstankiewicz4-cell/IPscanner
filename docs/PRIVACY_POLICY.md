# Privacy Policy — OSINT NET Auditor

Last updated: 2026-09-27

This document describes what OSINT NET Auditor actually does with data,
tool by tool. It's written to match the real code, not a generic template —
if a feature isn't listed here, it doesn't send anything anywhere.

## 1. Data we (the developer) collect

**Community Catalog (GitHub sign-in, ratings, comments).** Signing in uses
GitHub OAuth via [Supabase](https://supabase.com) (Supabase Auth). This
gives us your GitHub login, avatar URL, and whatever public profile fields
GitHub includes in the OAuth response. If you rate or comment on an addon,
that rating/comment is stored in our Supabase database, linked to your
GitHub login — it's shown publicly to everyone browsing the catalog, the
same as a public GitHub comment would be. Addon authors can reply to
reviews on their own addon.

**Anonymous install counter.** Installing an addon from the Community
Catalog records one row (addon name + a random device id generated locally,
stored in `localStorage`) so its listed install count can go up. This id
isn't tied to your GitHub account or any other identity we hold.

**Nothing else about you is collected by us.** No analytics, no crash
reporting, no telemetry. We don't know you're running the app unless you
sign in to the Community Catalog.

## 2. Data sent to third parties when you actively use a specific tool

These tools exist to look things up — using them necessarily sends the
target you typed (an email, IP, domain, URL) to the relevant external
service. Nothing happens until you type something in and run the tool.

| Tool | Sent to | What's sent |
|---|---|---|
| Email Recon | HaveIBeenPwned, EmailRep, Gravatar, GitHub, XposedOrNot, LeakCheck (whichever sources you've enabled) | the email address you typed |
| Reverse IP Lookup | Cloudflare DNS-over-HTTPS, HackerTarget, RDAP registries | the IP address you typed |
| HTTPS Auditor | the target URL you typed | an HTTP request to that site, same as opening it in a browser |
| Browser Inspect | the site you point it at | your browsing traffic to that site, proxied through the app to display it |
| Mail XSS Tester / Mail verification | the mailbox provider you configure (Gmail or Onet SMTP) and the recipient address you specify | an email, sent directly over SMTP using credentials you enter each session |
| Google Dork Finder | Google (via your own default browser) | the query you built — the app only opens a browser tab, it never talks to Google itself |
| Update check | GitHub's Releases API | nothing about you — it's a plain, anonymous request for the latest version number |

None of the above is stored by us. We don't see your Email Recon targets,
your scan results, or your Mail XSS Tester credentials — they go straight
from your machine to the service in question.

## 3. Data that never leaves your device

- IP/port scan results, session files (`.sqlite3`), Port Presets, IP
  Library — all local, never uploaded anywhere.
- Gmail/Onet app passwords typed into Mail XSS Tester or mail
  verification — used only to open an SMTP connection for that send, never
  written to disk, never sent to us.
- General settings, remembered UI state, language packs — plain
  `localStorage`, local to your machine/browser profile.
- WiFi tool (nearby networks, saved profile passwords) — reads local
  Windows networking info only, nothing is transmitted.

## 4. Children

This app isn't directed at children and isn't knowingly used to collect
data from them.

## 5. Your rights

If you've signed in to the Community Catalog, you can ask us to show you
or delete the rating/comment data tied to your GitHub account by opening
an issue on the
[GitHub repo](https://github.com/michalstankiewicz4-cell/IPscanner/issues)
or reaching the maintainer directly. Note that ratings/comments are public
by design (like a GitHub review) — deleting your account data won't
retroactively un-show replies others already made to your comment.

## 6. Third-party privacy policies

- [Supabase](https://supabase.com/privacy)
- [GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement)
- [Have I Been Pwned](https://haveibeenpwned.com/Privacy)
- [Cloudflare](https://www.cloudflare.com/privacypolicy/)
- Google/Gmail, if you configure it as your SMTP provider: [Google Privacy Policy](https://policies.google.com/privacy)
- Onet, if you configure it as your SMTP provider: [Onet Privacy Policy](https://prywatnosc.onet.pl/)

## 7. Changes

This file is version-controlled — see its
[git history](https://github.com/michalstankiewicz4-cell/IPscanner/commits/main/docs/PRIVACY_POLICY.md)
for what changed and when.

## 8. Contact

Open an issue on the
[OSINT NET Auditor repo](https://github.com/michalstankiewicz4-cell/IPscanner/issues)
or reach the maintainer via GitHub.
