# microsoft-store/

Holds a copy of the current release's NSIS installer, committed directly
into the repo (not attached as a GitHub Release asset) so it can be served
from `raw.githubusercontent.com` without a redirect.

Why: GitHub Release asset download URLs (`.../releases/download/...`)
always 302-redirect to a signed, time-limited CDN URL - the Microsoft
Store submission form rejects that with "The package URL redirects to
another URL. Provide a download URL without redirection." `raw.
githubusercontent.com/<owner>/<repo>/<ref>/<path>` serves whatever's
actually committed at that path with no redirect, which the Store accepts.

This file gets **overwritten** with each new Store submission attempt, not
kept as full version history (that's what GitHub Releases already is) -
keeps repo size bounded. Only exists here if/while pursuing Microsoft
Store distribution.

Direct URL for the current file:
`https://raw.githubusercontent.com/michalstankiewicz4-cell/IPscanner/main/microsoft-store/OSINTNETAuditor_2.8.3_x64-setup.exe`
