# Projekt amatorski wykonany wyłącznie przy użyciu vibe-codingu w celach naukowych.
# An amateur project made solely using vibe-coding for scientific purposes.

# NetRecon IP Scanner — aplikacja desktopowa (Tauri)

## Uruchomienie / Installation

### Gotowy installer (zalecane) / Ready-to-use installer (recommended)

1. Pobierz najnowszy plik instalacyjny z zakładki [Releases](../../releases):
   - `NetRecon IP Scanner_x.x.x_x64_en-US.msi` — instalator MSI (Windows)
   - `NetRecon IP Scanner_x.x.x_x64-setup.exe` — instalator NSIS (Windows)
2. Uruchom pobrany plik i postępuj zgodnie z instrukcjami instalatora.
3. Po instalacji uruchom **NetRecon IP Scanner** ze Start Menu lub skrótu na pulpicie.

---

### Budowanie ze źródeł / Build from source

**Wymagania / Requirements:**
- [Node.js](https://nodejs.org/) v18+
- [Rust](https://rustup.rs/) (stable)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (komponenty C++)

**Kroki / Steps:**
```bash
git clone https://github.com/michalstankiewicz4-cell/IPscanner.git
cd IPscanner
git checkout tauri
npm install
npm run tauri:build
```

Gotowy plik EXE oraz instalatory pojawią się w:
`src-tauri/target/release/bundle/`

---

<img width="1042" height="852" alt="image" src="https://github.com/user-attachments/assets/c7b0f7dd-f0b3-4882-aaed-b8c919045ea1" />
.
<img width="1917" height="898" alt="image" src="https://github.com/user-attachments/assets/e1a90638-6705-48fc-9b84-6c1a6aeb9546" />
.
<img width="886" height="530" alt="image" src="https://github.com/user-attachments/assets/55e608d6-f24a-4443-82a7-9a6cdfa253ac" />
.
<img width="1072" height="838" alt="image" src="https://github.com/user-attachments/assets/94146e40-5993-4cbd-9333-e0390b89f56d" />
.
<img width="1919" height="1123" alt="image" src="https://github.com/user-attachments/assets/8fb27d15-d021-4be7-8478-7d1a359e215b" />
.
<img width="1691" height="1020" alt="image" src="https://github.com/user-attachments/assets/82023340-5d0c-451b-aea0-1c7bbf8d99d9" />
.
<img width="1633" height="947" alt="image" src="https://github.com/user-attachments/assets/38156ec6-386f-4f38-9e35-ea88002f7042" />
.
<img width="806" height="472" alt="image" src="https://github.com/user-attachments/assets/e93c4357-28b4-488f-8ed3-078502c0d488" />
.
<img width="1096" height="642" alt="image" src="https://github.com/user-attachments/assets/6c1d1269-e19c-4942-bb82-8aab3a58166a" />

W przygotowaniu/soon: (in windows application)

Security alerts, powiadamianie o skanowaniu

1. Skaner IP – (Asset Management)

Wykrywanie urządzeń (Live Host Discovery): Szybkie skanowanie zakresów adresów IP (np. 192.168.1.1-254) w celu znalezienia wszystkich podłączonych urządzeń (przewodowych i Wi-Fi).

Identyfikacja zasobów: Pobieranie nazwy hosta (hostname), adresu IP, adresu MAC oraz producenta karty sieciowej.

Skanowanie portów: Wykrywanie otwartych portów (TCP/UDP) na urządzeniach, co pozwala zidentyfikować uruchomione usługi.

Analiza usług i systemu: Identyfikacja wersji systemu operacyjnego (OS Fingerprinting) oraz działających usług (np. serwery WWW, bazy danych).

Inwentaryzacja zasobów współdzielonych: Wykrywanie udostępnionych folderów, drukarek i zasobów sieciowych.

Zdalne zarządzanie: Możliwość zdalnego włączania/wyłączania komputerów (Wake-on-LAN) oraz łączenia się przez RDP/Radmin.

Eksport danych: Generowanie raportów (CSV, XML) z inwentaryzacji.

2. Sniffer LAN – Możliwości Bezpieczeństwa (Security & Monitoring)

Sniffer LAN przechwytuje i analizuje pakiety w czasie rzeczywistym, działając w trybie "promiscuous mode".

Monitorowanie ruchu w czasie rzeczywistym: Analiza przepływu danych pomiędzy hostami w sieci.

Wykrywanie zagrożeń (IDS): Identyfikacja podejrzanych działań, takich jak ataki typu Man-in-the-Middle (MITM), ARP spoofing, czy skanowanie portów przez intruzów.

Analiza protokołów: Szczegółowa dekodowanie pakietów (HTTP, DNS, DHCP, FTP, TCP/IP), co pozwala zrozumieć, jakie dane są przesyłane.

Wykrywanie wycieków danych: Monitorowanie, czy wrażliwe informacje nie są przesyłane otwartym tekstem (niezaszyfrowane hasła, loginy).

Diagnostyka problemów (Troubleshooting): Identyfikacja wąskich gardeł, analizowanie opóźnień (latency) i zgubionych pakietów.

Filtrowanie ruchu: Możliwość skupienia się na konkretnym adresie IP, porcie lub protokole.
