# Community Addon Guidelines

Rules for having your GitHub repository listed in OSINT NET Auditor's
in-app **Community Catalog** (Options → Community Catalog). If your repo
doesn't follow these, it can be removed from the catalog (see
[Moderation](#moderation) below) even if it was previously shown or
Verified.

## How discovery works

- The app searches GitHub for public repos tagged with the topic
  `osintnetauditor-addon`.
- Your repo needs a `manifest.json` at the root of its default branch,
  matching the app's extension manifest schema (`id` is required; `name`,
  `version`, `description`, `permissions`, `contributions` are optional).
  A repo with a missing or invalid manifest is silently skipped, not shown
  with an error.
- An optional `icon.png` and `main.js` (the program source, run on
  install) at the repo root are picked up automatically if present.
- A `LICENSE` file and `README` are detected via the GitHub API and linked
  automatically on the addon's page — include a `LICENSE` file so this
  works.
- An optional `DOCUMENTATION.md` at the repo root (exact filename) is
  linked the same way. The addon's page always shows `[README]`
  `[LICENSE]` `[DOCUMENTATION]` — any of the three your repo doesn't have
  shows a ⚠️ next to it instead of disappearing, so it's obvious which
  ones are missing.

## Requirements to be listed

1. The repo is public and tagged with the `osintnetauditor-addon` topic.
2. `manifest.json` is valid — `id` must be present and stable across
   updates (it's used as the local install id; avoid picking one that
   collides with a built-in tool or another popular addon).
3. The addon does what its manifest `description` says. Don't publish a
   manifest that misrepresents what the code actually does.
4. `permissions` currently only supports `"powershell"`. If your addon
   requests it, explain in your README exactly what it's used for — it
   lets the addon run PowerShell commands on the installing user's
   machine, so undocumented use of it is treated as a rule violation on
   its own.
5. `main.js` (if you ship one) runs automatically every time the app
   starts, not just on install — that's the only way it can register your
   addon's tools/commands, so the run itself is expected and fine. What
   isn't: using that automatic run for anything beyond registering your
   addon's declared functionality. No network requests, data collection,
   or PowerShell execution the moment the app boots — those may only
   happen after the user takes an action that clearly invokes your addon
   (opening its tool, clicking its button, etc.), never silently in the
   background at startup.
6. No malware, obfuscated/minified-to-hide code, telemetry or data
   exfiltration without clear disclosure, cryptomining, or anything else
   that could damage a user's system or compromise their privacy.
7. No impersonating the official app, another addon, or another person or
   project — that includes misleading names, icons, or descriptions.
8. Follow GitHub's own Acceptable Use Policies and applicable law (no
   illegal content, no DMCA-infringing material, etc.).

## Ratings, comments & replies

- Rating or commenting requires signing in with GitHub inside the app.
  One rating per GitHub account per repo.
- The addon's author (the repo owner's GitHub login) can post one reply
  to each review.
- Keep reviews about the addon itself. Abusive, off-topic, or spam
  comments may be removed by moderation.

## Moderation

The catalog is moderated by the app maintainer (GitHub:
`michalstankiewicz4-cell`), who may at their discretion:

- Mark an addon **Verified** — this means it was reviewed at least once,
  not that every future update to it is pre-approved.
- **Block an addon** — it's hidden from everyone except the maintainer
  (who can still see and unblock it); existing ratings are kept.
- **Block an author account** — hides every addon that account has listed
  in the catalog, not just one repo.
- Remove individual ratings or comments that violate the rules above.

Blocking is typically triggered by malware/security concerns, a broken or
misleading manifest, abusive conduct, impersonation, or repeated
violations of the rules above. If you just want your own addon removed,
simply remove the `osintnetauditor-addon` topic from your repo — no need
to ask, it drops out of discovery on its own the next time the catalog
refreshes.

## No warranty, no automatic review

Being listed — even Verified — does not mean the app maintainer has
audited the addon's code for security. Installing any community addon
runs its code, including PowerShell commands if it requests that
permission. Install at your own risk; the Community Catalog is a
discovery tool, not an endorsement.

## Questions or disputes

Open an issue on the
[OSINT NET Auditor repo](https://github.com/michalstankiewicz4-cell/IPscanner/issues)
or reach the maintainer via GitHub.
