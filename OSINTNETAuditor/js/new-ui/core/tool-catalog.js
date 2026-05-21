(function () {
  var toolCatalog = {
    "scan-runner": {
      title: "Scan Runner",
      text: "Zakres IP, port presets, rownolegly probing i zapis wynikow.",
      points: ["IP range + presets", "Concurrency control", "Export/import results"]
    },
    topology: {
      title: "Topology Map",
      text: "Widok relacji hostow, filtrowanie po porcie i czasie odpowiedzi.",
      points: ["Canvas graph", "Live filters", "Node hover telemetry"]
    },
    globe: {
      title: "World Globe",
      text: "Mapa geolokalizacji hostow i punktow komunikacji.",
      points: ["D3 globe", "Country markers", "Geo enrichment"]
    },
    console: {
      title: "Command Console",
      text: "Szybkie komendy typu ping/traceroute i makra diagnostyczne.",
      points: ["Command templates", "Output panel", "Macro execution"]
    },
    "wifi-detector": {
      title: "WiFi Detector",
      text: "Lista sieci, profile i szczegoly parametrow WLAN.",
      points: ["SSID scan", "Profile fallback", "Signal metrics"]
    },
    "wifi-radar": {
      title: "WiFi Radar",
      text: "Radar sily sygnalu i rozmieszczenia sieci lokalnych.",
      points: ["Polar view", "Signal trend", "Network focus"]
    },
    "bt-detector": {
      title: "Bluetooth Detector",
      text: "Skan BLE i klasycznych urzadzen BT z podstawowa telemetria.",
      points: ["BLE + Classic", "RSSI sorting", "Address parse"]
    },
    gnss: {
      title: "GNSS Monitor",
      text: "Podglad NMEA: satelity, fix type, polozenie i HDOP.",
      points: ["Serial sampling", "NMEA parse", "Satellite table"]
    },
    lte: {
      title: "LTE Monitor",
      text: "AT snapshot modemu: RSRP, RSRQ, SINR, band i operator.",
      points: ["Auto modem detect", "AT command profile", "Signal KPIs"]
    },
    sniffer: {
      title: "Network Sniffer",
      text: "Przeglad aktywnych polaczen TCP/UDP i mapowania procesow.",
      points: ["PID mapping", "State filters", "Connection timeline"]
    },
    imgmeta: {
      title: "Image Metadata",
      text: "EXIF/XMP/IPTC parser i inspekcja kontenera plikow obrazu.",
      points: ["Metadata extraction", "GPS decoding", "Container boundary"]
    },
    "phone-lookup": {
      title: "Phone Lookup",
      text: "Agregacja danych numeru telefonu i zrodel API.",
      points: ["NumVerify bridge", "OpenCell placeholders", "Result export"]
    },
    "ai-assistant": {
      title: "AI Security Assistant",
      text: "Prompt presets i analiza bezpieczenstwa przez multi-provider AI.",
      points: ["Provider switch", "Secure key mode", "Preset prompts"]
    },
    "scan-watch": {
      title: "IP Scan Watch",
      text: "Heurystyka wykrywania podejrzanych skanow na podstawie netstat.",
      points: ["Sliding window", "Remote IP scoring", "Alert shortlist"]
    },
    macro: {
      title: "Macro Folder",
      text: "Przechowywanie i uruchamianie gotowych sekwencji komend.",
      points: ["Macro list", "Template actions", "Fast replay"]
    },
    speed: {
      title: "Speed Test",
      text: "Panel testow przepustowosci i latencji lacza.",
      points: ["Download ping", "Upload ping", "Session compare"]
    },
    proto: {
      title: "Prototype",
      text: "Eksperymentalna przestrzen testowa dla nowych modulow UI.",
      points: ["Sandbox view", "Feature spikes", "Design probes"]
    },
    settings: {
      title: "Options",
      text: "Ustawienia aplikacji, domyslne wartosci skanowania i preferencje UI.",
      points: ["Default scan values", "Language and presets", "Customization"]
    },
    "import-tool": {
      title: "Import Tool",
      text: "Importowanie, lista i usuwanie tooli oraz rozszerzen z JSON manifestu.",
      points: ["Paste manifest JSON", "List installed tools", "Uninstall by id"]
    },
    "language-manager": {
      title: "Language Manager",
      text: "Dodawanie, aktywacja i przeglad slownikow jezykowych.",
      points: ["Add custom dictionaries", "Activate language", "List available languages"]
    },
    versions: {
      title: "Versions",
      text: "Historia zmian i wydan aplikacji.",
      points: ["Release history", "Major updates", "Quality fixes"]
    },
    about: {
      title: "About",
      text: "Informacje o projekcie i autorze.",
      points: ["Project summary", "Author details", "Support links"]
    },
    license: {
      title: "License",
      text: "Informacje o licencji i warunkach uzycia.",
      points: ["MIT license", "Permission notice", "Copyright notice"]
    },
    "results-manage": {
      title: "Manage Results",
      text: "Export, import, and clear saved scan results.",
      points: ["Export JSON", "Import JSON", "Clear results"]
    },
    "results-ip": {
      title: "IP Scan Results",
      text: "Table of discovered hosts, open ports, and enrichment data.",
      points: ["IP + hostname", "Open ports", "Enrichment data"]
    },
    "results-wifi": {
      title: "WiFi Devices",
      text: "List of discovered WiFi networks with signal details.",
      points: ["SSID + BSSID", "Signal strength", "Channel info"]
    },
    "results-bt": {
      title: "Bluetooth Devices",
      text: "List of discovered BLE and Classic Bluetooth devices.",
      points: ["BLE + Classic", "RSSI values", "Device address"]
    }
  };

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.toolCatalog = toolCatalog;
})();
