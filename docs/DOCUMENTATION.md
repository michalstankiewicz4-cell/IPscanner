# OSINT NET Auditor - Documentation

## Table of Contents

- [1. Shell](#shell)
  - [1.1. Top bar menu](#11-top-bar-menu)
    - [1.1.1. File](#111-file)
    - [1.1.2. Options](#112-options)
    - [1.1.3. Tools](#113-tools)
  - [1.2. Left shortcut menu](#12-left-shortcut-menu)
    - [1.2.1. Community](#121-community)
    - [1.2.2. Result data list](#122-result-data-list)
  - [1.3. Down information bar](#13-down-information-bar)
    - [1.3.1. Loader](#131-loader)
    - [1.3.2. Processes](#132-processes)
    - [1.3.3. Loading progress bar](#133-loading-progress-bar)
    - [1.3.4. Domain verification status](#134-domain-verification-status)
    - [1.3.5. Version information](#135-version-information)
    - [1.3.6. Active tab](#136-active-tab)
  - [1.4. Left section](#14-left-section)
  - [1.5. Right section](#15-right-section)
  - [1.6. Central section](#16-central-section)
    - [1.6.1. Tab](#161-tab)
    - [1.6.2. Window](#162-window)
  - [1.7. Down section](#17-down-section)
    - [1.7.1. Terminal](#171-terminal)
    - [1.7.2. Macro](#172-macro)
    - [1.7.3. Console](#173-console)
- [2. Sessions](#sessions)
- [3. Options](#options)
  - [3.1. Country IP Library](#31-country-ip-library)
  - [3.2. Port presets](#32-port-presets)
  - [3.3. Language](#33-language)
  - [3.4. General](#34-general)
  - [3.5. Community Catalog](#35-community-catalog)
  - [3.6. Agent identity](#36-agent-identity)
- [4. Tools](#tools)
  - [4.1. AI Assistant](#41-ai-assistant)
  - [4.2. ShellCraft](#42-shellcraft)
  - [4.3. IP Scanner](#43-ip-scanner)
  - [4.4. Network Monitor](#44-network-monitor)
  - [4.5. Email Recon](#45-email-recon)
  - [4.6. Topology](#46-topology)
  - [4.7. Desktop Preview](#47-desktop-preview)
  - [4.8. Globe](#48-globe)
  - [4.9. Browser](#49-browser)
  - [4.10. Mail XSS Tester](#410-mail-xss-tester)
  - [4.11. HTTPS Auditor](#411-https-auditor)
  - [4.12. Reverse IP Lookup](#412-reverse-ip-lookup)
  - [4.13. Google Dork Finder](#413-google-dork-finder)
  - [4.14. WiFi](#414-wifi)
- [5. Creating addons](#creating-addons)




## Shell

*(to be written)*

### 1.1. Top bar menu

*(to be written)*

#### 1.1.1. File

*(to be written)*

#### 1.1.2. Options

*(to be written)*

#### 1.1.3. Tools

*(to be written)*

### 1.2. Left shortcut menu

*(to be written)*

#### 1.2.1. Community

*(to be written)*

#### 1.2.2. Result data list

*(to be written)*

### 1.3. Down information bar

*(to be written)*

#### 1.3.1. Loader

*(to be written)*

#### 1.3.2. Processes

*(to be written)*

#### 1.3.3. Loading progress bar

*(to be written)*

#### 1.3.4. Domain verification status

*(to be written)*

#### 1.3.5. Version information

*(to be written)*

#### 1.3.6. Active tab

*(to be written)*

### 1.4. left section

*(to be written)*

### 1.5. right section

*(to be written)*

### 1.6. Central section

*(to be written)*

#### 1.6.1. Tab

*(to be written)*

#### 1.6.2. Window

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

### 3.1. Country IP Library

*(to be written)*

### 3.2. Port presets

*(to be written)*

### 3.3. Language

*(to be written)*

### 3.4. General

*(to be written)*

### 3.5. Community Catalog

*(to be written)*

### 3.6. Agent identity

*(to be written)*

## Tools

### 4.1. AI Assistant

*(to be written)*

### 4.2. ShellCraft

*(to be written)*

### 4.3. IP Scanner

*(to be written)*

### 4.4. Network Monitor

*(to be written)*

### 4.5. Email Recon

*(to be written)*

### 4.6. Topology

*(to be written)*

### 4.7. Desktop Preview

*(to be written)*

### 4.8. Globe

*(to be written)*

### 4.9. Browser

*(to be written)*

### 4.10. Mail XSS Tester

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

### 4.11. HTTPS Auditor

*(to be written)*

### 4.12. Reverse IP Lookup

*(to be written)*

### 4.13. Google Dork Finder

*(to be written)*

### 4.14. WiFi

*(to be written)*

## Creating addons

*(to be written)*
