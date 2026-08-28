# OSINT NET Auditor - Documentation

## Table of Contents

- [1. Shell](#shell)
  - [1.1. Top bar menu](#11-top-bar-menu)
  - [1.2. Left shortcut menu](#12-left-shortcut-menu)
  - [1.3. Down information bar](#13-down-information-bar)
  - [1.4. left section](#14-left-section)
  - [1.5. right section](#15-right-section)
  - [1.6. Central section](#16-central-section)
  - [1.7. Down section](#17-down-section)
    - [1.7.1. Terminal](#171-terminal)
    - [1.7.2. Macro](#172-macro)
    - [1.7.3. Console](#173-console)
- [2. Sessions](#sessions)
- [3. Options](#options)
- [4. Tools](#41-mail-xss-tester)
  - [4.1. Mail XSS Tester](#41-mail-xss-tester)




## Shell

*(to be written)*

### 1.1. Top bar menu

*(to be written)*

### 1.2. Left shortcut menu

*(to be written)*

### 1.3. Down information bar

*(to be written)*

### 1.4. left section

*(to be written)*

### 1.5. right section

*(to be written)*

### 1.6. Central section

*(to be written)*

### 1.7. Down section

*(to be written)*

#### 1.7.1. Terminal

*(to be written)*

#### 1.7.2. Macro

*(to be written)*

#### 1.7.3. Console

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
