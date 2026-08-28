# OSINT NET Auditor - Documentation

## Table of Contents

- [1. Shell](#shell)
- [2. Sessions](#sessions)
- [3. Options](#options)
- [4. Tools](#41-mail-xss-tester)
  - [4.1. Mail XSS Tester](#41-mail-xss-tester)




## Shell

*(to be written)*

## Sessions

*(to be written)*

## Options

*(to be written)*

## Tools

### 4.1. Mail XSS Tester

Mail XSS Tester crafts a test HTML email containing one or more tracking
payloads, each tagged with a random token unique to that session so hits
can't be confused with an unrelated run.

Clicking "Start tunnel" does two things: it starts a small local HTTP
server (the "beacon") that just logs whatever hits it, and exposes that
server to the internet through a temporary Cloudflare Quick Tunnel - a
real public `https://*.trycloudflare.com` URL, no account needed. The
generated email's payloads point at that public URL.

Send the email to a webmail account you own and open it there. If the
mail client fetches a remote image, runs a script, or otherwise reaches
out to one of the embedded payload URLs without you clicking anything,
the beacon receives a hit (method, timestamp, User-Agent, requester IP)
and it shows up live in the app's results list - a practical way to see
whether a given webmail client executes or auto-loads content from an
email body that it probably shouldn't.

Stopping the tunnel (or closing the app) tears down both the tunnel and
the local beacon server, so nothing is left listening once the test is
done.
