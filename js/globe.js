// ======================================================
//  globe.js - Globe, Topology, Country IP Library
//  Loaded before app.js (classic script, global scope)
// ======================================================

// ══════════════════════════════════════════════════
//  GLOBE STATE (declared early to avoid TDZ across merged script blocks)
// ══════════════════════════════════════════════════
// Replicated from app.js — globe.js loads before app.js
var _isTauriDesktop = !!(window.__TAURI__ || window.__TAURI_INTERNALS__ || navigator.userAgent.toLowerCase().includes('tauri'));
const ipGeoCoords = {}; // ip → { lat, lon, country }
let globeReady = false;
let globeCtx, globeProjection, globePath;
let globeCountries = null, globeBorders = null, globeLand = null;
let globeWidth = 680, globeHeight = 440;
let globeMapDataReady = false;
let autoRotateOn = true;
let rafId = null;
let isDragging = false, lastDragX = 0, lastDragY = 0;
let wasDragged = false;
let currentLambda = 20, currentPhi = -15; // rotation angles
let globeZoom = 1.0; // scroll zoom multiplier
let hoveredCountryName = null;
let clickedDotIp = null;
let mapMode = 'globe';
let topologyHitTargets = [];
let traceRoutes = {};
const topologyFilters = { port: '', subnet: '', pingMax: '' };

// ══════════════════════════════════════════════════
//  COUNTRY IP LIBRARY
// ══════════════════════════════════════════════════
const COUNTRY_DB = [
  { flag:'🇵🇱', name:'Poland',         meta:'PL · Europe',      ranges:['31.0.0.0–31.15.255.255','46.0.0.0–46.31.255.255','83.0.0.0–83.31.255.255','89.64.0.0–89.79.255.255','91.192.0.0–91.207.255.255','5.172.0.0–5.175.255.255','195.114.0.0–195.115.255.255','212.0.0.0–212.15.255.255'] },
  { flag:'🇨🇳', name:'China',          meta:'CN · Asia',        ranges:['1.0.0.0–1.255.255.255','27.0.0.0–27.255.255.255','36.0.0.0–36.255.255.255','42.0.0.0–42.255.255.255','58.0.0.0–58.255.255.255','59.0.0.0–59.255.255.255','60.0.0.0–60.255.255.255','61.0.0.0–61.255.255.255','101.0.0.0–101.255.255.255','106.0.0.0–106.255.255.255','110.0.0.0–110.255.255.255','111.0.0.0–111.255.255.255','112.0.0.0–112.255.255.255','113.0.0.0–113.255.255.255','114.0.0.0–114.255.255.255','115.0.0.0–115.255.255.255','116.0.0.0–116.255.255.255','117.0.0.0–117.255.255.255','118.0.0.0–118.255.255.255','119.0.0.0–119.255.255.255','120.0.0.0–120.255.255.255','121.0.0.0–121.255.255.255','122.0.0.0–122.255.255.255','123.0.0.0–123.255.255.255','124.0.0.0–124.255.255.255','125.0.0.0–125.255.255.255','163.0.0.0–163.255.255.255','175.0.0.0–175.255.255.255','180.0.0.0–180.255.255.255','182.0.0.0–182.255.255.255','183.0.0.0–183.255.255.255','202.0.0.0–202.255.255.255','203.0.0.0–203.255.255.255','210.0.0.0–210.255.255.255','211.0.0.0–211.255.255.255','218.0.0.0–218.255.255.255','219.0.0.0–219.255.255.255','220.0.0.0–220.255.255.255','221.0.0.0–221.255.255.255','222.0.0.0–222.255.255.255','223.0.0.0–223.255.255.255'] },
  { flag:'🇷🇺', name:'Russia',         meta:'RU · Europe/Asia', ranges:['5.8.0.0–5.15.255.255','31.128.0.0–31.135.255.255','37.0.0.0–37.31.255.255','46.32.0.0–46.63.255.255','77.0.0.0–77.31.255.255','78.0.0.0–78.63.255.255','79.0.0.0–79.63.255.255','80.0.0.0–80.95.255.255','85.0.0.0–85.31.255.255','87.224.0.0–87.255.255.255','91.0.0.0–91.63.255.255','92.0.0.0–92.63.255.255','93.0.0.0–93.63.255.255','94.0.0.0–94.127.255.255','109.0.0.0–109.63.255.255','176.0.0.0–176.63.255.255','178.0.0.0–178.63.255.255','185.0.0.0–185.63.255.255','194.0.0.0–194.63.255.255','195.0.0.0–195.63.255.255','213.0.0.0–213.63.255.255','217.0.0.0–217.63.255.255'] },
  { flag:'🇺🇸', name:'United States',  meta:'US · Americas',    ranges:['3.0.0.0–3.255.255.255','4.0.0.0–4.255.255.255','8.0.0.0–8.255.255.255','12.0.0.0–12.255.255.255','13.0.0.0–13.255.255.255','15.0.0.0–15.255.255.255','16.0.0.0–16.255.255.255','18.0.0.0–18.255.255.255','20.0.0.0–20.255.255.255','23.0.0.0–23.255.255.255','34.0.0.0–34.255.255.255','35.0.0.0–35.255.255.255','40.0.0.0–40.255.255.255','44.0.0.0–44.255.255.255','45.0.0.0–45.255.255.255','50.0.0.0–50.255.255.255','52.0.0.0–52.255.255.255','54.0.0.0–54.255.255.255','64.0.0.0–64.255.255.255','65.0.0.0–65.255.255.255','66.0.0.0–66.255.255.255','67.0.0.0–67.255.255.255','68.0.0.0–68.255.255.255','69.0.0.0–69.255.255.255','70.0.0.0–70.255.255.255','71.0.0.0–71.255.255.255','72.0.0.0–72.255.255.255','73.0.0.0–73.255.255.255','74.0.0.0–74.255.255.255','75.0.0.0–75.255.255.255','98.0.0.0–98.255.255.255','99.0.0.0–99.255.255.255','100.0.0.0–100.255.255.255','104.0.0.0–104.255.255.255','107.0.0.0–107.255.255.255','108.0.0.0–108.255.255.255','173.0.0.0–173.255.255.255'] },
  { flag:'🇩🇪', name:'Germany',        meta:'DE · Europe',      ranges:['5.0.0.0–5.7.255.255','46.64.0.0–46.127.255.255','77.0.0.0–77.15.255.255','78.32.0.0–78.63.255.255','79.192.0.0–79.255.255.255','80.64.0.0–80.95.255.255','81.0.0.0–81.31.255.255','82.0.0.0–82.31.255.255','83.128.0.0–83.159.255.255','84.128.0.0–84.175.255.255','85.128.0.0–85.159.255.255','87.128.0.0–87.223.255.255','88.64.0.0–88.79.255.255','89.0.0.0–89.63.255.255','91.64.0.0–91.127.255.255','217.0.0.0–217.31.255.255'] },
  { flag:'🇫🇷', name:'France',         meta:'FR · Europe',      ranges:['5.48.0.0–5.63.255.255','37.0.0.0–37.15.255.255','78.192.0.0–78.255.255.255','80.8.0.0–80.15.255.255','81.64.0.0–81.95.255.255','82.224.0.0–82.255.255.255','86.192.0.0–86.255.255.255','88.160.0.0–88.191.255.255','90.0.0.0–90.63.255.255','92.128.0.0–92.191.255.255','176.128.0.0–176.159.255.255','193.0.0.0–193.15.255.255','194.0.0.0–194.15.255.255'] },
  { flag:'🇬🇧', name:'United Kingdom', meta:'GB · Europe',      ranges:['5.64.0.0–5.79.255.255','31.32.0.0–31.63.255.255','51.0.0.0–51.255.255.255','80.0.0.0–80.7.255.255','81.96.0.0–81.127.255.255','82.0.0.0–82.31.255.255','86.0.0.0–86.63.255.255','87.64.0.0–87.127.255.255','92.0.0.0–92.63.255.255','109.144.0.0–109.159.255.255','176.16.0.0–176.31.255.255','185.0.0.0–185.15.255.255','193.0.0.0–193.15.255.255'] },
  { flag:'🇯🇵', name:'Japan',          meta:'JP · Asia',        ranges:['1.0.0.0–1.7.255.255','14.0.0.0–14.127.255.255','27.0.0.0–27.63.255.255','49.0.0.0–49.63.255.255','60.32.0.0–60.63.255.255','101.0.0.0–101.127.255.255','110.0.0.0–110.127.255.255','111.64.0.0–111.127.255.255','112.64.0.0–112.127.255.255','114.144.0.0–114.175.255.255','118.0.0.0–118.63.255.255','119.0.0.0–119.63.255.255','122.0.0.0–122.63.255.255','123.0.0.0–123.63.255.255','124.0.0.0–124.63.255.255','125.0.0.0–125.63.255.255','126.0.0.0–126.255.255.255','150.0.0.0–150.127.255.255','153.0.0.0–153.127.255.255','163.0.0.0–163.127.255.255','180.0.0.0–180.127.255.255','182.0.0.0–182.63.255.255','183.0.0.0–183.63.255.255','202.0.0.0–202.63.255.255','203.0.0.0–203.63.255.255','210.128.0.0–210.191.255.255','211.0.0.0–211.63.255.255','218.32.0.0–218.63.255.255','219.96.0.0–219.127.255.255','220.96.0.0–220.127.255.255','221.0.0.0–221.63.255.255'] },
  { flag:'🇰🇷', name:'South Korea',    meta:'KR · Asia',        ranges:['1.208.0.0–1.255.255.255','14.32.0.0–14.63.255.255','27.96.0.0–27.127.255.255','39.0.0.0–39.63.255.255','49.0.0.0–49.63.255.255','58.0.0.0–58.63.255.255','59.0.0.0–59.63.255.255','61.32.0.0–61.63.255.255','110.0.0.0–110.63.255.255','111.0.0.0–111.63.255.255','112.160.0.0–112.191.255.255','113.192.0.0–113.255.255.255','114.0.0.0–114.63.255.255','115.128.0.0–115.191.255.255','116.32.0.0–116.63.255.255','117.0.0.0–117.63.255.255','118.0.0.0–118.63.255.255','119.192.0.0–119.255.255.255','121.0.0.0–121.63.255.255','122.32.0.0–122.63.255.255','123.192.0.0–123.255.255.255','124.0.0.0–124.63.255.255','125.128.0.0–125.191.255.255','175.192.0.0–175.255.255.255','180.64.0.0–180.127.255.255','182.192.0.0–182.255.255.255','183.96.0.0–183.127.255.255','203.224.0.0–203.255.255.255','210.192.0.0–210.255.255.255','211.192.0.0–211.255.255.255','219.240.0.0–219.255.255.255','220.64.0.0–220.95.255.255','221.128.0.0–221.191.255.255','222.96.0.0–222.127.255.255','223.192.0.0–223.255.255.255'] },
  { flag:'🇧🇷', name:'Brazil',         meta:'BR · Americas',    ranges:['18.128.0.0–18.191.255.255','45.160.0.0–45.191.255.255','138.0.0.0–138.63.255.255','143.0.0.0–143.63.255.255','177.0.0.0–177.255.255.255','179.32.0.0–179.63.255.255','179.192.0.0–179.255.255.255','186.192.0.0–186.255.255.255','187.0.0.0–187.255.255.255','189.0.0.0–189.127.255.255','191.0.0.0–191.255.255.255','200.128.0.0–200.191.255.255','201.0.0.0–201.63.255.255'] },
  { flag:'🇮🇳', name:'India',          meta:'IN · Asia',        ranges:['1.0.0.0–1.63.255.255','14.96.0.0–14.127.255.255','27.48.0.0–27.63.255.255','27.96.0.0–27.127.255.255','43.224.0.0–43.255.255.255','45.64.0.0–45.127.255.255','49.0.0.0–49.63.255.255','59.144.0.0–59.175.255.255','101.0.0.0–101.63.255.255','103.0.0.0–103.255.255.255','106.0.0.0–106.63.255.255','111.92.0.0–111.127.255.255','115.240.0.0–115.255.255.255','116.192.0.0–116.255.255.255','117.192.0.0–117.255.255.255','119.224.0.0–119.255.255.255','120.56.0.0–120.63.255.255','121.240.0.0–121.255.255.255','122.160.0.0–122.191.255.255','123.0.0.0–123.63.255.255','124.0.0.0–124.63.255.255','125.0.0.0–125.63.255.255','152.0.0.0–152.63.255.255','180.192.0.0–180.255.255.255','182.64.0.0–182.127.255.255','183.0.0.0–183.63.255.255','202.0.0.0–202.63.255.255','203.0.0.0–203.63.255.255','210.0.0.0–210.63.255.255','220.224.0.0–220.255.255.255','223.0.0.0–223.63.255.255'] },
  { flag:'🇦🇺', name:'Australia',      meta:'AU · Oceania',     ranges:['1.120.0.0–1.159.255.255','14.192.0.0–14.207.255.255','27.32.0.0–27.63.255.255','36.0.0.0–36.63.255.255','43.224.0.0–43.239.255.255','49.128.0.0–49.191.255.255','58.96.0.0–58.111.255.255','59.96.0.0–59.127.255.255','60.224.0.0–60.255.255.255','101.160.0.0–101.191.255.255','103.0.0.0–103.63.255.255','110.32.0.0–110.63.255.255','110.144.0.0–110.175.255.255','115.64.0.0–115.95.255.255','116.0.0.0–116.31.255.255','121.0.0.0–121.63.255.255','122.96.0.0–122.127.255.255','123.96.0.0–123.127.255.255','124.64.0.0–124.127.255.255','125.224.0.0–125.255.255.255','139.0.0.0–139.63.255.255','144.0.0.0–144.63.255.255','150.0.0.0–150.63.255.255','175.0.0.0–175.63.255.255','180.0.0.0–180.63.255.255','202.0.0.0–202.63.255.255','203.0.0.0–203.63.255.255','210.0.0.0–210.63.255.255','220.192.0.0–220.223.255.255','221.0.0.0–221.63.255.255'] },
  { flag:'🇳🇱', name:'Netherlands',    meta:'NL · Europe',      ranges:['37.32.0.0–37.47.255.255','46.16.0.0–46.31.255.255','77.160.0.0–77.175.255.255','80.96.0.0–80.127.255.255','82.160.0.0–82.175.255.255','84.80.0.0–84.95.255.255','85.144.0.0–85.159.255.255','87.208.0.0–87.223.255.255','89.160.0.0–89.175.255.255','92.64.0.0–92.79.255.255','94.0.0.0–94.15.255.255','145.0.0.0–145.63.255.255','188.0.0.0–188.15.255.255','194.0.0.0–194.15.255.255','195.0.0.0–195.15.255.255','212.0.0.0–212.15.255.255','213.0.0.0–213.15.255.255'] },
  { flag:'🇺🇦', name:'Ukraine',        meta:'UA · Europe',      ranges:['5.58.0.0–5.63.255.255','31.28.0.0–31.31.255.255','37.0.0.0–37.15.255.255','46.0.0.0–46.15.255.255','77.88.0.0–77.95.255.255','78.24.0.0–78.31.255.255','79.0.0.0–79.31.255.255','80.92.0.0–80.95.255.255','87.240.0.0–87.255.255.255','91.196.0.0–91.207.255.255','92.0.0.0–92.31.255.255','93.0.0.0–93.31.255.255','94.184.0.0–94.191.255.255','109.86.0.0–109.95.255.255','176.96.0.0–176.127.255.255','178.0.0.0–178.31.255.255','185.0.0.0–185.31.255.255','193.0.0.0–193.15.255.255','194.0.0.0–194.15.255.255','213.0.0.0–213.15.255.255'] },
  { flag:'🇨🇿', name:'Czech Republic', meta:'CZ · Europe',      ranges:['37.48.0.0–37.63.255.255','46.16.0.0–46.23.255.255','77.68.0.0–77.71.255.255','78.96.0.0–78.111.255.255','79.96.0.0–79.127.255.255','80.232.0.0–80.239.255.255','81.0.0.0–81.31.255.255','82.208.0.0–82.223.255.255','83.208.0.0–83.223.255.255','84.16.0.0–84.47.255.255','85.160.0.0–85.175.255.255','87.64.0.0–87.79.255.255','88.100.0.0–88.103.255.255','89.24.0.0–89.31.255.255','90.176.0.0–90.191.255.255','91.0.0.0–91.15.255.255','217.192.0.0–217.207.255.255'] },
  { flag:'🇸🇪', name:'Sweden',         meta:'SE · Europe',      ranges:['37.0.0.0–37.7.255.255','46.0.0.0–46.7.255.255','77.40.0.0–77.47.255.255','78.64.0.0–78.95.255.255','81.208.0.0–81.223.255.255','82.96.0.0–82.127.255.255','83.160.0.0–83.175.255.255','84.0.0.0–84.15.255.255','85.0.0.0–85.31.255.255','87.96.0.0–87.127.255.255','88.128.0.0–88.159.255.255','90.224.0.0–90.255.255.255','91.208.0.0–91.223.255.255','130.0.0.0–130.63.255.255','192.36.0.0–192.51.255.255','194.0.0.0–194.15.255.255','195.0.0.0–195.15.255.255','217.0.0.0–217.15.255.255'] },
  { flag:'🇳🇴', name:'Norway',         meta:'NO · Europe',      ranges:['37.24.0.0–37.31.255.255','46.8.0.0–46.15.255.255','77.8.0.0–77.23.255.255','78.160.0.0–78.175.255.255','80.160.0.0–80.175.255.255','81.160.0.0–81.175.255.255','84.208.0.0–84.223.255.255','85.96.0.0–85.111.255.255','88.85.0.0–88.95.255.255','91.148.0.0–91.163.255.255','109.160.0.0–109.175.255.255','176.16.0.0–176.31.255.255','185.0.0.0–185.15.255.255','193.0.0.0–193.15.255.255','217.0.0.0–217.15.255.255'] },
  { flag:'🇫🇮', name:'Finland',        meta:'FI · Europe',      ranges:['37.0.0.0–37.15.255.255','46.8.0.0–46.15.255.255','77.64.0.0–77.79.255.255','78.64.0.0–78.79.255.255','80.186.0.0–80.191.255.255','81.175.0.0–81.191.255.255','82.128.0.0–82.159.255.255','84.252.0.0–84.255.255.255','85.76.0.0–85.79.255.255','87.92.0.0–87.95.255.255','88.112.0.0–88.119.255.255','91.152.0.0–91.159.255.255','130.231.0.0–130.232.255.255','193.0.0.0–193.15.255.255','194.100.0.0–194.111.255.255','195.0.0.0–195.15.255.255','212.0.0.0–212.15.255.255'] },
  { flag:'🇹🇷', name:'Turkey',         meta:'TR · Europe/Asia', ranges:['5.24.0.0–5.31.255.255','31.0.0.0–31.15.255.255','37.0.0.0–37.15.255.255','46.0.0.0–46.15.255.255','78.160.0.0–78.175.255.255','79.0.0.0–79.63.255.255','80.0.0.0–80.31.255.255','81.192.0.0–81.207.255.255','82.0.0.0–82.63.255.255','84.0.0.0–84.31.255.255','85.0.0.0–85.63.255.255','86.0.0.0–86.63.255.255','87.0.0.0–87.63.255.255','88.0.0.0–88.63.255.255','88.224.0.0–88.255.255.255','89.0.0.0–89.63.255.255','90.0.0.0–90.63.255.255','91.0.0.0–91.63.255.255','176.0.0.0–176.63.255.255','178.0.0.0–178.63.255.255','193.0.0.0–193.63.255.255','195.0.0.0–195.63.255.255','212.0.0.0–212.63.255.255','213.0.0.0–213.63.255.255'] },
  { flag:'🇮🇷', name:'Iran',           meta:'IR · Asia',        ranges:['2.144.0.0–2.191.255.255','5.0.0.0–5.63.255.255','31.0.0.0–31.63.255.255','37.0.0.0–37.63.255.255','46.0.0.0–46.63.255.255','78.0.0.0–78.63.255.255','79.0.0.0–79.63.255.255','80.0.0.0–80.63.255.255','81.0.0.0–81.63.255.255','82.0.0.0–82.63.255.255','83.0.0.0–83.63.255.255','84.0.0.0–84.63.255.255','85.0.0.0–85.63.255.255','86.0.0.0–86.63.255.255','91.0.0.0–91.63.255.255','92.0.0.0–92.63.255.255','93.0.0.0–93.63.255.255','94.0.0.0–94.63.255.255','95.0.0.0–95.63.255.255','185.0.0.0–185.63.255.255'] },
  { flag:'🇸🇦', name:'Saudi Arabia',   meta:'SA · Asia',        ranges:['37.0.0.0–37.15.255.255','46.0.0.0–46.15.255.255','78.0.0.0–78.63.255.255','82.0.0.0–82.63.255.255','87.0.0.0–87.63.255.255','91.0.0.0–91.63.255.255','92.0.0.0–92.63.255.255','94.0.0.0–94.63.255.255','176.0.0.0–176.63.255.255','178.0.0.0–178.63.255.255','185.0.0.0–185.63.255.255','188.0.0.0–188.63.255.255','212.0.0.0–212.63.255.255'] },
  { flag:'🇿🇦', name:'South Africa',   meta:'ZA · Africa',      ranges:['41.0.0.0–41.255.255.255','102.0.0.0–102.63.255.255','105.0.0.0–105.63.255.255','154.0.0.0–154.63.255.255','197.0.0.0–197.63.255.255'] },
  { flag:'🇦🇷', name:'Argentina',      meta:'AR · Americas',    ranges:['45.64.0.0–45.95.255.255','138.0.0.0–138.63.255.255','170.0.0.0–170.63.255.255','181.0.0.0–181.63.255.255','186.0.0.0–186.63.255.255','190.0.0.0–190.127.255.255','191.0.0.0–191.63.255.255','200.0.0.0–200.63.255.255'] },
  { flag:'🇲🇽', name:'Mexico',         meta:'MX · Americas',    ranges:['5.0.0.0–5.63.255.255','45.64.0.0–45.95.255.255','131.0.0.0–131.63.255.255','148.0.0.0–148.63.255.255','177.0.0.0–177.63.255.255','179.0.0.0–179.63.255.255','187.0.0.0–187.63.255.255','189.128.0.0–189.191.255.255','200.0.0.0–200.63.255.255','201.0.0.0–201.63.255.255'] },
  { flag:'🇨🇦', name:'Canada',         meta:'CA · Americas',    ranges:['24.0.0.0–24.255.255.255','47.0.0.0–47.255.255.255','99.0.0.0–99.255.255.255','142.0.0.0–142.63.255.255','162.0.0.0–162.63.255.255','174.0.0.0–174.127.255.255','184.0.0.0–184.63.255.255','192.0.0.0–192.63.255.255','199.0.0.0–199.63.255.255','205.0.0.0–205.63.255.255','206.0.0.0–206.63.255.255','207.0.0.0–207.63.255.255','209.0.0.0–209.63.255.255'] },
  { flag:'🇮🇹', name:'Italy',          meta:'IT · Europe',      ranges:['2.32.0.0–2.63.255.255','5.0.0.0–5.63.255.255','37.0.0.0–37.15.255.255','46.0.0.0–46.63.255.255','78.0.0.0–78.63.255.255','79.0.0.0–79.63.255.255','80.0.0.0–80.63.255.255','81.0.0.0–81.63.255.255','82.0.0.0–82.63.255.255','83.0.0.0–83.63.255.255','84.0.0.0–84.63.255.255','85.0.0.0–85.63.255.255','87.0.0.0–87.63.255.255','88.0.0.0–88.63.255.255','89.0.0.0–89.63.255.255','90.0.0.0–90.63.255.255','91.0.0.0–91.63.255.255','93.0.0.0–93.63.255.255','94.0.0.0–94.63.255.255','95.0.0.0–95.63.255.255','151.0.0.0–151.63.255.255','176.0.0.0–176.63.255.255','188.0.0.0–188.63.255.255','193.0.0.0–193.63.255.255','212.0.0.0–212.63.255.255','217.0.0.0–217.63.255.255'] },
  { flag:'🇪🇸', name:'Spain',          meta:'ES · Europe',      ranges:['2.0.0.0–2.31.255.255','37.0.0.0–37.15.255.255','46.0.0.0–46.63.255.255','77.0.0.0–77.63.255.255','80.0.0.0–80.63.255.255','81.0.0.0–81.63.255.255','83.0.0.0–83.63.255.255','84.0.0.0–84.63.255.255','85.0.0.0–85.63.255.255','87.0.0.0–87.63.255.255','88.0.0.0–88.63.255.255','89.0.0.0–89.63.255.255','90.0.0.0–90.63.255.255','91.0.0.0–91.63.255.255','94.0.0.0–94.63.255.255','176.0.0.0–176.63.255.255','195.0.0.0–195.63.255.255','212.0.0.0–212.63.255.255'] },
];

// ── Country dialog state ──
let selectedCountryIdx = -1;
let selectedRangeIdx   = -1;

function openCountriesDlg() {
  selectedCountryIdx = -1;
  selectedRangeIdx   = -1;
  document.getElementById('countrySearch').value = '';
  document.getElementById('btnCountryUse').disabled    = true;
  document.getElementById('btnCountryUseAll').disabled = true;
  document.getElementById('countryName').textContent   = '—';
  document.getElementById('countryMeta').textContent   = '';
  document.getElementById('countryRanges').innerHTML   = '';
  renderCountryList('');
  document.getElementById('dlgCountriesOverlay').classList.add('open');
  if (typeof window.bringToFront === 'function') window.bringToFront(document.querySelector('#dlgCountriesOverlay .dlg95'));
  setTimeout(() => document.getElementById('countrySearch').focus(), 50);
}
function closeCountriesDlg() {
  document.getElementById('dlgCountriesOverlay').classList.remove('open');
}

function renderCountryList(query) {
  const box = document.getElementById('countryListBox');
  box.innerHTML = '';
  const q = query.toLowerCase();
  COUNTRY_DB.forEach((c, i) => {
    if (q && !c.name.toLowerCase().includes(q) && !c.meta.toLowerCase().includes(q)) return;
    const row = document.createElement('div');
    row.className = 'country-item' + (i === selectedCountryIdx ? ' active' : '');
    row.innerHTML = `<span class="flag-emoji">${c.flag}</span> <span>${c.name}</span> <span class="country-ranges-count">${c.ranges.length} ranges</span>`;
    row.addEventListener('click', () => selectCountry(i));
    box.appendChild(row);
  });
}

function selectCountry(idx) {
  selectedCountryIdx = idx;
  selectedRangeIdx   = -1;
  const c = COUNTRY_DB[idx];
  document.getElementById('countryName').textContent = `${c.flag} ${c.name}`;
  document.getElementById('countryMeta').textContent = c.meta;
  document.getElementById('btnCountryUseAll').disabled = false;
  document.getElementById('btnCountryUse').disabled    = true;

  const rangesEl = document.getElementById('countryRanges');
  rangesEl.innerHTML = '';
  c.ranges.forEach((r, ri) => {
    const row = document.createElement('div');
    row.className = 'range-item';
    const [from, to] = r.split('–');
    const size = ipToNum(to) - ipToNum(from) + 1;
    row.innerHTML = `<span>${r}</span><span class="range-size">${size.toLocaleString()} IPs</span>`;
    row.addEventListener('click', () => {
      selectedRangeIdx = ri;
      document.querySelectorAll('.range-item').forEach((el,i) => {
        el.classList.toggle('active', i === ri);
      });
      document.getElementById('btnCountryUse').disabled = false;
    });
    rangesEl.appendChild(row);
  });

  renderCountryList(document.getElementById('countrySearch').value);
}

document.getElementById('countrySearch').addEventListener('input', function() {
  renderCountryList(this.value);
});

document.getElementById('btnCountryUse').addEventListener('click', () => {
  if (selectedCountryIdx < 0 || selectedRangeIdx < 0) return;
  const range = COUNTRY_DB[selectedCountryIdx].ranges[selectedRangeIdx];
  const [from, to] = range.split('–');
  setIP('f', from); setIP('t', to);
  closeCountriesDlg();
  setStatus(`Range set: ${range}`, 'ok');
});

document.getElementById('btnCountryUseAll').addEventListener('click', () => {
  if (selectedCountryIdx < 0) return;
  // Use first range as start, last as end
  const ranges = COUNTRY_DB[selectedCountryIdx].ranges;
  const from = ranges[0].split('–')[0];
  const to   = ranges[ranges.length - 1].split('–')[1];
  setIP('f', from); setIP('t', to);
  closeCountriesDlg();
  setStatus(`Range set: ${from} – ${to} (${ranges.length} blocks)`, 'ok');
});

// ── Init language ──
document.getElementById('menuCountries').addEventListener('click', () => {
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
  openCountriesDlg();
});

// ══════════════════════════════════════════════════
//  GLOBE
// ══════════════════════════════════════════════════

// ISO numeric → country name
const ISO_NAMES = {
  4:'Afghanistan',8:'Albania',12:'Algeria',24:'Angola',32:'Argentina',36:'Australia',
  40:'Austria',50:'Bangladesh',56:'Belgium',68:'Bolivia',76:'Brazil',100:'Bulgaria',
  116:'Cambodia',120:'Cameroon',124:'Canada',144:'Sri Lanka',152:'Chile',156:'China',
  170:'Colombia',203:'Czech Republic',208:'Denmark',218:'Ecuador',818:'Egypt',
  231:'Ethiopia',246:'Finland',250:'France',276:'Germany',288:'Ghana',300:'Greece',
  348:'Hungary',356:'India',360:'Indonesia',364:'Iran',368:'Iraq',372:'Ireland',
  376:'Israel',380:'Italy',392:'Japan',398:'Kazakhstan',404:'Kenya',410:'South Korea',
  422:'Lebanon',434:'Libya',484:'Mexico',504:'Morocco',508:'Mozambique',524:'Nepal',
  528:'Netherlands',554:'New Zealand',566:'Nigeria',578:'Norway',586:'Pakistan',
  604:'Peru',608:'Philippines',616:'Poland',620:'Portugal',634:'Qatar',642:'Romania',
  643:'Russia',682:'Saudi Arabia',703:'Slovakia',706:'Somalia',710:'South Africa',
  724:'Spain',752:'Sweden',756:'Switzerland',760:'Syria',764:'Thailand',792:'Turkey',
  800:'Uganda',804:'Ukraine',784:'United Arab Emirates',826:'United Kingdom',
  840:'United States',858:'Uruguay',704:'Vietnam',887:'Yemen',716:'Zimbabwe',
  566:'Nigeria',196:'Cyprus',188:'Costa Rica',191:'Croatia',414:'Kuwait',
  788:'Tunisia',862:'Venezuela',170:'Colombia',320:'Guatemala',340:'Honduras',
  388:'Jamaica',591:'Panama',630:'Puerto Rico',686:'Senegal',729:'Sudan',
  860:'Uzbekistan',894:'Zambia',266:'Gabon',24:'Angola',694:'Sierra Leone'
};

function openGlobe() {
  if (openToolNativeWindow('globe')) return;
  const win = document.getElementById('globeWin');
  win.style.display = 'block';
  if (typeof window.bringToFront === 'function') window.bringToFront(win);
  if (!globeReady) {
    mapMode = 'globe';
    initGlobe();
  } else {
    setMapMode('globe');
    startRotation();
  }
}

function openTopology() {
  if (openToolNativeWindow('topology')) return;
  const win = document.getElementById('globeWin');
  win.style.display = 'block';
  if (typeof window.bringToFront === 'function') window.bringToFront(win);
  if (!globeReady) initGlobe();
  setMapMode('topology');
}

function closeGlobe() {
  isDragging = false;
  wasDragged = false;
  const tooltip = document.getElementById('globeTooltip');
  if (tooltip) tooltip.style.display = 'none';
  hoveredCountryName = null;
  if (_toolMode === 'globe' || _toolMode === 'topology') {
    closeMainWindow();
    return;
  }
  document.getElementById('globeWin').style.display = 'none';
  stopRotation();
}

function stopRotation() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}
function startRotation() {
  stopRotation();
  function frame() {
    if (mapMode === 'globe' && autoRotateOn && !isDragging) {
      currentLambda += 0.15;
      if (currentLambda > 180) currentLambda -= 360;
    }
    drawCurrentMap();
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}

async function initGlobe() {
  const canvas = document.getElementById('globeCanvas');
  globeCtx = canvas.getContext('2d');
  globeWidth  = canvas.width;
  globeHeight = canvas.height;
  globeReady = true;
  syncMapModeUI();
  setupGlobeEvents(canvas);
  drawCurrentMap();
  startRotation();

  if (globeMapDataReady) return;

  document.getElementById('globeStatusText').textContent = mapMode === 'globe'
    ? 'Loading map data…'
    : 'Topology view · Click host to preview · Rings show subnet depth';

  try {
    const world = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r=>r.json());
    globeCountries = topojson.feature(world, world.objects.countries);
    globeBorders   = topojson.mesh(world, world.objects.countries, (a,b)=>a!==b);
    globeLand      = topojson.feature(world, world.objects.land);
    globeMapDataReady = true;
    syncMapModeUI();
    drawCurrentMap();
  } catch(e) {
    if (mapMode === 'globe') {
      document.getElementById('globeStatusText').textContent = `Map load error: ${e.message}`;
    }
  }
}

function syncMapModeUI() {
  const globeBtn = document.getElementById('btnMapGlobe');
  const topoBtn = document.getElementById('btnMapTopology');
  const autoRotateWrap = document.getElementById('globeAutoRotateWrap');
  const statusText = document.getElementById('globeStatusText');
  globeBtn.classList.toggle('pressed', mapMode === 'globe');
  topoBtn.classList.toggle('pressed', mapMode === 'topology');
  autoRotateWrap.style.display = mapMode === 'globe' ? 'flex' : 'none';
  statusText.textContent = mapMode === 'globe'
    ? 'Drag to rotate · Click country to scan · Click dot to preview'
    : 'Topology view · Click host to preview · Rings show subnet depth';
}

function setMapMode(mode) {
  mapMode = mode;
  hoveredCountryName = null;
  const tooltip = document.getElementById('globeTooltip');
  if (tooltip) tooltip.style.display = 'none';
  const canvas = document.getElementById('globeCanvas');
  if (canvas) canvas.style.cursor = mode === 'globe' ? 'grab' : 'default';
  syncMapModeUI();
  drawCurrentMap();
}

function drawCurrentMap() {
  if (mapMode === 'topology') drawTopology();
  else drawGlobe();
}

function getFilteredHosts() {
  const subnetNeedle = topologyFilters.subnet.trim();
  const pingLimit = topologyFilters.pingMax === '' ? null : Number(topologyFilters.pingMax);

  return Object.entries(foundHostsMap)
    .map(([ip, ports]) => {
      const parts = ip.split('.');
      return {
        ip,
        ports,
        portCount: ports.length,
        ping: foundPingMap[ip] ?? null,
        subnet: parts.slice(0, 3).join('.') + '.0/24',
        hostOctet: Number(parts[3]) || 0
      };
    })
    .filter(host => {
      if (topologyFilters.port && !host.ports.includes(Number(topologyFilters.port))) return false;
      if (subnetNeedle && !host.subnet.includes(subnetNeedle) && !host.ip.includes(subnetNeedle)) return false;
      if (pingLimit !== null && Number.isFinite(pingLimit)) {
        if (host.ping === null || host.ping > pingLimit) return false;
      }
      return true;
    });
}

function refreshTopologyFilterOptions() {
  const select = document.getElementById('topoPortFilter');
  if (!select) return;
  const current = topologyFilters.port;
  const ports = Array.from(new Set(Object.values(foundHostsMap).flat())).sort((a, b) => a - b);
  select.innerHTML = `<option value="">${t('filterAllPorts')}</option>` + ports.map(port => `<option value="${port}">${port}</option>`).join('');
  select.value = current;
}

function updateTopologyStatus(hosts, traceCount) {
  if (mapMode !== 'topology') return;
  const statusText = document.getElementById('globeStatusText');
  const filterSummary = [];
  if (topologyFilters.port) filterSummary.push(`${t('filterPortLabel')} ${topologyFilters.port}`);
  if (topologyFilters.subnet.trim()) filterSummary.push(`${t('filterSubnetLabel')} ${topologyFilters.subnet.trim()}`);
  if (topologyFilters.pingMax !== '') filterSummary.push(`${t('filterPingLabel')} ≤ ${topologyFilters.pingMax}ms`);
  const traceLabel = traceCount ? ` · ${traceCount} ${t('traceRoutesLabel')}` : '';
  statusText.textContent = filterSummary.length
    ? `${t('topologyFilteredStatus', hosts.length)} · ${filterSummary.join(' · ')}${traceLabel}`
    : `${t('topologyStatus', hosts.length)}${traceLabel}`;
}

function getProjection() {
  return d3.geoOrthographic()
    .scale(Math.min(globeWidth, globeHeight) * 0.46 * globeZoom)
    .translate([globeWidth/2, globeHeight/2])
    .rotate([currentLambda, currentPhi, 0])
    .clipAngle(90);
}

function drawGlobe() {
  if (!globeReady || !globeCtx) return;
  topologyHitTargets = [];
  if (!globeMapDataReady) {
    const ctx = globeCtx;
    ctx.clearRect(0, 0, globeWidth, globeHeight);
    ctx.fillStyle = '#0a1628';
    ctx.fillRect(0, 0, globeWidth, globeHeight);
    ctx.fillStyle = '#d8e7ff';
    ctx.textAlign = 'center';
    ctx.font = '12px MS Sans Serif';
    ctx.fillText('Loading world atlas...', globeWidth / 2, globeHeight / 2 - 6);
    ctx.font = '10px MS Sans Serif';
    ctx.fillStyle = '#8fb3ff';
    ctx.fillText('Topology view is already available.', globeWidth / 2, globeHeight / 2 + 14);
    return;
  }
  const proj = getProjection();
  const path = d3.geoPath(proj, globeCtx);
  const ctx  = globeCtx;

  ctx.clearRect(0, 0, globeWidth, globeHeight);

  // Ocean
  ctx.beginPath();
  path({type:'Sphere'});
  const grad = ctx.createRadialGradient(globeWidth*0.42, globeHeight*0.38, 0, globeWidth/2, globeHeight/2, Math.min(globeWidth,globeHeight)*0.46);
  grad.addColorStop(0,'#1a3a6b');
  grad.addColorStop(1,'#0a1628');
  ctx.fillStyle = grad;
  ctx.fill();

  // Land
  if (globeLand) {
    ctx.beginPath();
    path(globeLand);
    ctx.fillStyle = '#2d5a27';
    ctx.fill();
  }

  // Countries — highlight hovered
  if (globeCountries) {
    globeCountries.features.forEach(f => {
      const name = ISO_NAMES[+f.id];
      if (name === hoveredCountryName) {
        ctx.beginPath(); path(f);
        ctx.fillStyle = 'rgba(255,220,50,0.5)';
        ctx.fill();
      }
    });
  }

  // Borders
  if (globeBorders) {
    ctx.beginPath();
    path(globeBorders);
    ctx.strokeStyle = 'rgba(100,180,100,0.5)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Graticule
  ctx.beginPath();
  path(d3.geoGraticule()());
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Globe outline
  ctx.beginPath();
  path({type:'Sphere'});
  ctx.strokeStyle = 'rgba(100,160,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // IP dots
  const proj2 = proj;
  Object.entries(ipGeoCoords).forEach(([ip, geo]) => {
    const [x, y] = proj2([geo.lon, geo.lat]);
    if (x === undefined || isNaN(x)) return;
    // Check if point is on visible hemisphere
    const angle = d3.geoDistance([geo.lon, geo.lat], proj2.invert([globeWidth/2, globeHeight/2]));
    if (angle > Math.PI/2) return; // behind globe

    // Glow
    const glow = ctx.createRadialGradient(x,y,0,x,y,10);
    glow.addColorStop(0,'rgba(255,80,80,0.8)');
    glow.addColorStop(1,'rgba(255,80,80,0)');
    ctx.beginPath(); ctx.arc(x,y,10,0,2*Math.PI);
    ctx.fillStyle = glow; ctx.fill();

    // Dot
    ctx.beginPath(); ctx.arc(x,y,4,0,2*Math.PI);
    ctx.fillStyle   = '#ff5050';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1;
    ctx.fill(); ctx.stroke();
  });
}

function buildTopologyModel() {
  const hosts = getFilteredHosts();

  const subnetMap = new Map();
  hosts.forEach(host => {
    if (!subnetMap.has(host.subnet)) subnetMap.set(host.subnet, []);
    subnetMap.get(host.subnet).push(host);
  });

  const subnets = Array.from(subnetMap.entries())
    .map(([subnet, subnetHosts]) => ({
      subnet,
      hosts: subnetHosts.sort((a, b) => a.hostOctet - b.hostOctet)
    }))
    .sort((a, b) => b.hosts.length - a.hosts.length || a.subnet.localeCompare(b.subnet));

  return { hosts, subnets };
}

function topologyHostColor(host) {
  if (host.ports.some(p => [443, 8443, 9443].includes(p))) return '#66ffb3';
  if (host.ports.some(p => [554, 8080, 8000, 37777].includes(p))) return '#ffd166';
  if (host.ports.some(p => [22, 23, 3389, 5900].includes(p))) return '#ff8a80';
  return '#8ec5ff';
}

function hexToRgba(hex, alpha) {
  const raw = hex.replace('#', '');
  const normalized = raw.length === 3 ? raw.split('').map(ch => ch + ch).join('') : raw;
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawTopology() {
  if (!globeCtx) return;
  const ctx = globeCtx;
  const { hosts, subnets } = buildTopologyModel();
  const visibleHostSet = new Set(hosts.map(host => host.ip));
  const allTraceTargets = Object.keys(traceRoutes);
  const externalTraceTargets = allTraceTargets.filter(ip => !visibleHostSet.has(ip));
  topologyHitTargets = [];

  ctx.clearRect(0, 0, globeWidth, globeHeight);

  const bg = ctx.createLinearGradient(0, 0, globeWidth, globeHeight);
  bg.addColorStop(0, '#faf7ef');
  bg.addColorStop(1, '#ddd6c4');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, globeWidth, globeHeight);

  const centerX = globeWidth / 2;
  const centerY = globeHeight / 2;
  const maxRadius = Math.min(globeWidth, globeHeight) * 0.43;

  for (let ring = 1; ring <= 7; ring++) {
    const radius = (maxRadius / 7) * ring;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = ring % 2 ? 'rgba(90,90,90,0.12)' : 'rgba(120,120,120,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  const centerGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 48);
  centerGlow.addColorStop(0, 'rgba(255,80,80,0.75)');
  centerGlow.addColorStop(1, 'rgba(255,80,80,0)');
  ctx.beginPath();
  ctx.arc(centerX, centerY, 48, 0, Math.PI * 2);
  ctx.fillStyle = centerGlow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(centerX, centerY, 11, 0, Math.PI * 2);
  ctx.fillStyle = '#ff3b30';
  ctx.strokeStyle = '#4a120f';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1b1b1b';
  ctx.font = 'bold 11px MS Sans Serif';
  ctx.textAlign = 'center';
  ctx.fillText('LOCAL SCANNER', centerX, centerY + 28);
  ctx.font = '10px MS Sans Serif';
  ctx.fillStyle = '#4a4a4a';
  ctx.fillText(`${hosts.length} active hosts`, centerX, centerY + 42);

  if (!hosts.length && !externalTraceTargets.length) {
    ctx.fillStyle = '#5a5a5a';
    ctx.font = '12px MS Sans Serif';
    ctx.fillText('No scan data yet. Run a scan to populate topology.', centerX, centerY - 70);
    return;
  }

  if (!hosts.length) {
    ctx.fillStyle = '#5a5a5a';
    ctx.font = '12px MS Sans Serif';
    ctx.fillText('No scan data yet. Showing trace routes only.', centerX, centerY - 70);
  }

  subnets.forEach((subnetEntry, subnetIndex) => {
    const baseAngle = (-Math.PI / 2) + (subnetIndex / Math.max(subnets.length, 1)) * Math.PI * 2;
    const subnetRadius = maxRadius * 0.45;
    const subnetX = centerX + Math.cos(baseAngle) * subnetRadius;
    const subnetY = centerY + Math.sin(baseAngle) * subnetRadius;

    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(subnetX, subnetY);
    ctx.strokeStyle = 'rgba(80,120,210,0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(subnetX, subnetY, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#5674c9';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#24325a';
    ctx.font = '10px MS Sans Serif';
    ctx.textAlign = subnetX < centerX ? 'right' : 'left';
    ctx.fillText(subnetEntry.subnet, subnetX + (subnetX < centerX ? -12 : 12), subnetY + 3);

    const spread = Math.min(Math.PI / 2.3, 0.24 * Math.max(subnetEntry.hosts.length - 1, 1));
    subnetEntry.hosts.forEach((host, hostIndex) => {
      const t = subnetEntry.hosts.length === 1 ? 0.5 : hostIndex / (subnetEntry.hosts.length - 1);
      const angle = baseAngle - spread / 2 + spread * t;
      const hostRadius = maxRadius * (0.7 + Math.min(hostIndex * 0.015, 0.16));
      const hostX = centerX + Math.cos(angle) * hostRadius;
      const hostY = centerY + Math.sin(angle) * hostRadius;
      const color = topologyHostColor(host);
      const nodeRadius = Math.max(4, Math.min(8, 4 + host.portCount * 0.65));

      ctx.beginPath();
      ctx.moveTo(subnetX, subnetY);
      ctx.lineTo(hostX, hostY);
      ctx.strokeStyle = 'rgba(120,120,120,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const glow = ctx.createRadialGradient(hostX, hostY, 0, hostX, hostY, nodeRadius * 3.2);
      glow.addColorStop(0, hexToRgba(color, 0.72));
      glow.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.beginPath();
      ctx.arc(hostX, hostY, nodeRadius * 2.8, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(hostX, hostY, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.strokeStyle = '#1f1f1f';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      if (host.portCount >= 2 || subnetEntry.hosts.length <= 4) {
        ctx.fillStyle = '#1f1f1f';
        ctx.font = '10px MS Sans Serif';
        ctx.textAlign = hostX < centerX ? 'right' : 'left';
        ctx.fillText(host.ip, hostX + (hostX < centerX ? -10 : 10), hostY + 3);
      }

      topologyHitTargets.push({
        type: 'host',
        x: hostX,
        y: hostY,
        radius: Math.max(10, nodeRadius + 5),
        data: host
      });
    });

    topologyHitTargets.push({
      type: 'subnet',
      x: subnetX,
      y: subnetY,
      radius: 12,
      data: subnetEntry
    });
  });

  // Draw traces to hosts already in scanned results
  allTraceTargets.filter(ip => visibleHostSet.has(ip)).forEach(targetIp => {
    const target = topologyHitTargets.find(item => item.type === 'host' && item.data.ip === targetIp);
    if (!target) return;
    drawTraceRoute(ctx, centerX, centerY, target, traceRoutes[targetIp]);
  });

  // Draw traces to external targets (not in scanned hosts) as dedicated edge nodes
  externalTraceTargets.forEach((targetIp, idx) => {
    const angle = (-Math.PI / 2) + (idx / Math.max(externalTraceTargets.length, 1)) * Math.PI * 2;
    const edgeRadius = maxRadius * 0.92;
    const nodeX = centerX + Math.cos(angle) * edgeRadius;
    const nodeY = centerY + Math.sin(angle) * edgeRadius;

    // Draw edge node
    ctx.beginPath();
    ctx.arc(nodeX, nodeY, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#4488ff';
    ctx.strokeStyle = '#002299';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#002299';
    ctx.font = 'bold 10px MS Sans Serif';
    ctx.textAlign = nodeX < centerX ? 'right' : 'left';
    ctx.fillText(targetIp, nodeX + (nodeX < centerX ? -13 : 13), nodeY + 3);

    const fakeTarget = { x: nodeX, y: nodeY, radius: 9, data: { ip: targetIp } };
    topologyHitTargets.push({ type: 'host', x: nodeX, y: nodeY, radius: 14, data: { ip: targetIp } });
    drawTraceRoute(ctx, centerX, centerY, fakeTarget, traceRoutes[targetIp]);
  });

  updateTopologyStatus(hosts, allTraceTargets.length);
}

function drawTraceRoute(ctx, centerX, centerY, target, route) {
  if (!Array.isArray(route) || !route.length) return;
  const dx = target.x - centerX;
  const dy = target.y - centerY;
  const totalLength = Math.hypot(dx, dy) || 1;
  let prevX = centerX;
  let prevY = centerY;

  route.forEach((hop, index) => {
    const factor = (index + 1) / (route.length + 1);
    const jitter = ((index % 2 === 0 ? 1 : -1) * 10) + (hop.hop % 3) * 2;
    const normalX = -dy / totalLength;
    const normalY = dx / totalLength;
    const hopX = centerX + dx * factor + normalX * jitter;
    const hopY = centerY + dy * factor + normalY * jitter;

    ctx.beginPath();
    ctx.moveTo(prevX, prevY);
    ctx.lineTo(hopX, hopY);
    ctx.strokeStyle = 'rgba(255,128,0,0.8)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(hopX, hopY, 4, 0, Math.PI * 2);
    ctx.fillStyle = hop.star ? '#c0c0c0' : '#ff9f1a';
    ctx.strokeStyle = '#5d3b00';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    topologyHitTargets.push({
      type: 'trace-hop',
      x: hopX,
      y: hopY,
      radius: 9,
      data: { ...hop, targetIp: target.data.ip }
    });

    prevX = hopX;
    prevY = hopY;
  });

  ctx.beginPath();
  ctx.moveTo(prevX, prevY);
  ctx.lineTo(target.x, target.y);
  ctx.strokeStyle = 'rgba(255,128,0,0.8)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
}

function parseTraceOutput(text) {
  const hops = [];
  const lines = text.split(/\r?\n/);

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const hopMatch = trimmed.match(/^(\d+)\s+/);
    if (!hopMatch) return;
    const hop = Number(hopMatch[1]);
    const ipMatches = [...trimmed.matchAll(/(?:\d{1,3}\.){3}\d{1,3}/g)].map(match => match[0]);
    const msMatches = [...trimmed.matchAll(/(<?\d+)\s*ms/gi)].map(match => match[1]);
    const star = !ipMatches.length;
    const ip = ipMatches[ipMatches.length - 1] || null;
    const latency = msMatches.length
      ? Math.max(...msMatches.map(value => Number(String(value).replace('<', '')) || 0))
      : null;
    const labelSource = trimmed.replace(/^\d+\s+/, '').replace(/\s+/g, ' ').trim();
    hops.push({
      hop,
      ip,
      ms: latency,
      star,
      label: star ? '*' : labelSource
    });
  });

  return hops;
}

function saveTraceRoutes() {
  try {
    localStorage.setItem('netrecon_trace_routes', JSON.stringify(traceRoutes));
  } catch {}
}

function restoreTraceRoutes() {
  try {
    const raw = localStorage.getItem('netrecon_trace_routes');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') traceRoutes = parsed;
  } catch {}
}

function openTraceDlg(defaultIp = '') {
  document.getElementById('traceTargetIp').value = defaultIp;
  document.getElementById('traceInput').value = '';
  document.getElementById('traceParseStatus').textContent = t('traceDlgHint');
  document.getElementById('dlgTraceOverlay').classList.add('open');
  if (typeof window.bringToFront === 'function') window.bringToFront(document.getElementById('dlgTrace'));
}

function closeTraceDlg() {
  document.getElementById('dlgTraceOverlay').classList.remove('open');
}

function importTraceRoute(closeAfter = true) {
  const targetIp = document.getElementById('traceTargetIp').value.trim();
  const text = document.getElementById('traceInput').value;
  const status = document.getElementById('traceParseStatus');
  if (!isIPv4(targetIp)) {
    status.textContent = t('traceErrTarget');
    status.className = 'status-error';
    return;
  }
  const hops = parseTraceOutput(text);
  if (!hops.length) {
    status.textContent = t('traceErrParse');
    status.className = 'status-error';
    return;
  }
  traceRoutes[targetIp] = hops;
  saveTraceRoutes();
  status.textContent = t('traceImported', hops.length, targetIp);
  status.className = 'status-success';
  if (typeof appendCmdLog === 'function') appendCmdLog(`Tracert import: ${targetIp}  hops: ${hops.length}`, 'tracert');
  if (mapMode !== 'topology') setMapMode('topology');
  drawCurrentMap();
  setStatus(t('traceImportedStatus', targetIp, hops.length), 'ok');
  if (closeAfter) setTimeout(closeTraceDlg, 350);
}

async function autoTraceRoute() {
  const targetInput = document.getElementById('traceTargetIp');
  const target = targetInput.value.trim();
  const status = document.getElementById('traceParseStatus');
  const btn = document.getElementById('btnTraceAuto');

  if (!target) {
    status.textContent = t('traceErrTargetOrHost');
    status.className = 'status-error';
    return;
  }

  if (!_tauriInvoke) {
    status.textContent = t('traceAutoDesktopOnly');
    status.className = 'status-error';
    return;
  }

  btn.disabled = true;
  status.textContent = t('traceAutoRunning');
  status.className = 'status-ok';

  try {
    const result = await _tauriInvoke('run_traceroute', { target });
    const output = (result && typeof result === 'object') ? (result.output || '') : String(result || '');
    const resolvedIp = (result && typeof result === 'object')
      ? (result.resolved_ip || result.resolvedIp || '')
      : '';
    if (resolvedIp) targetInput.value = resolvedIp;
    document.getElementById('traceInput').value = output;
    if (typeof appendCmdLog === 'function') appendCmdLog(`Tracert auto: ${target}${resolvedIp && resolvedIp !== target ? ' -> '+resolvedIp : ''}`, 'tracert');
    importTraceRoute(false);
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err || 'unknown error');
    status.textContent = t('traceAutoFailed', msg);
    status.className = 'status-error';
    if (typeof appendCmdLog === 'function') appendCmdLog(`Tracert failed: ${msg}`, 'tracert');
  } finally {
    btn.disabled = false;
  }
}

function setupGlobeEvents(canvas) {
  const tooltip = document.getElementById('globeTooltip');
  const win = document.getElementById('globeWin');

  function positionTooltip(clientX, clientY) {
    const wr = win.getBoundingClientRect();
    tooltip.style.left = (clientX - wr.left + 14) + 'px';
    tooltip.style.top  = (clientY - wr.top  -  4) + 'px';
  }

  // Hit-test country against the actually rendered orthographic shape,
  // so detection works only on the visible/front hemisphere.
  function pickCountryAt(mx, my, proj) {
    if (!globeCountries || !globeCtx) return null;
    const hitPath = d3.geoPath(proj, globeCtx);
    for (const f of globeCountries.features) {
      globeCtx.beginPath();
      hitPath(f);
      if (globeCtx.isPointInPath(mx, my)) {
        return ISO_NAMES[+f.id] || `ID:${f.id}`;
      }
    }
    return null;
  }
  // Drag rotation
  let dragStartX = 0, dragStartY = 0;
  canvas.addEventListener('mousedown', e => {
    isDragging = true;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    wasDragged = false;
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (isDragging) {
      const dx = e.clientX - lastDragX;
      const dy = e.clientY - lastDragY;
      currentLambda += dx * 0.4;
      currentPhi     = Math.max(-90, Math.min(90, currentPhi - dy * 0.4));
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      if (Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > 4) wasDragged = true;
    } else {
      // Skip hover logic when globe window is not visible
      if (document.getElementById('globeWin').style.display === 'none') return;
      const rect = canvas.getBoundingClientRect();
      const insideCanvas =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      // Never keep tooltip active when cursor is outside globe canvas.
      if (!insideCanvas) {
        tooltip.style.display = 'none';
        hoveredCountryName = null;
        canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
        return;
      }

      // Hover: check country
      const mx = (e.clientX - rect.left) * (globeWidth  / rect.width);
      const my = (e.clientY - rect.top)  * (globeHeight / rect.height);

      if (mapMode === 'topology') {
        const target = topologyHitTargets.find(item => Math.hypot(mx - item.x, my - item.y) <= item.radius);
        if (target) {
          tooltip.style.display = 'block';
          positionTooltip(e.clientX, e.clientY);
          tooltip.textContent = target.type === 'host'
            ? `${target.data.ip} [${target.data.ports.join(', ')}]${target.data.ping ? ` · ${target.data.ping}ms` : ''}`
            : target.type === 'trace-hop'
              ? `Hop ${target.data.hop}${target.data.ip ? ` · ${target.data.ip}` : ''}${target.data.ms ? ` · ${target.data.ms}ms` : ''}`
              : `${target.data.subnet} · ${target.data.hosts.length} hosts`;
          canvas.style.cursor = 'pointer';
        } else {
          tooltip.style.display = 'none';
          canvas.style.cursor = 'default';
        }
        return;
      }

      const proj = getProjection();
      const found = pickCountryAt(mx, my, proj);
      // Check IP dots
      let foundIp = null;
      Object.entries(ipGeoCoords).forEach(([ip, geo]) => {
        const [x,y] = proj([geo.lon, geo.lat]);
        if (Math.hypot(mx-x, my-y) < 8) foundIp = ip;
      });

      if (foundIp) {
        tooltip.style.display = 'block';
        positionTooltip(e.clientX, e.clientY);
        const ports = foundHostsMap[foundIp]?.join(', ') || '';
        tooltip.textContent = `${foundIp}${ports ? ' ['+ports+']' : ''}`;
        canvas.style.cursor = 'pointer';
        hoveredCountryName = null;
      } else if (found) {
        tooltip.style.display = 'block';
        positionTooltip(e.clientX, e.clientY);
        const inDb = COUNTRY_DB.find(c=>c.name===found);
        tooltip.textContent = found + (inDb ? ' — click to scan' : '');
        canvas.style.cursor = 'pointer';
        hoveredCountryName = found;
      } else {
        tooltip.style.display = 'none';
        hoveredCountryName = null;
        canvas.style.cursor = isDragging ? 'grabbing' : 'grab';
      }
    }
  });
  window.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
  });
  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
    hoveredCountryName = null;
  });

  // Scroll zoom (globe mode only)
  canvas.addEventListener('wheel', e => {
    if (mapMode !== 'globe') return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    globeZoom = Math.min(5.0, Math.max(0.3, globeZoom + delta));
    drawCurrentMap();
  }, { passive: false });

  // Click
  canvas.addEventListener('click', e => {
    if (wasDragged) { wasDragged = false; return; }
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (globeWidth  / rect.width);
    const my = (e.clientY - rect.top)  * (globeHeight / rect.height);

    if (mapMode === 'topology') {
      const target = topologyHitTargets.find(item => item.type === 'host' && Math.hypot(mx - item.x, my - item.y) <= item.radius);
      if (target) {
        const ports = target.data.ports || [80];
        const proto = (ports[0]===443||ports[0]===8443)?'https':'http';
        openPreview(`${proto}://${target.data.ip}:${ports[0]}/`);
        document.getElementById('globeWin').style.zIndex = 699;
        return;
      }
      const hopTarget = topologyHitTargets.find(item => item.type === 'trace-hop' && Math.hypot(mx - item.x, my - item.y) <= item.radius);
      if (hopTarget?.data?.ip) {
        navigator.clipboard?.writeText(hopTarget.data.ip);
        setStatus(t('traceHopCopied', hopTarget.data.ip), 'ok');
      }
      return;
    }

    const proj = getProjection();

    // Check IP dots first
    let clickedIp = null;
    Object.entries(ipGeoCoords).forEach(([ip, geo]) => {
      const [x,y] = proj([geo.lon, geo.lat]);
      if (Math.hypot(mx-x, my-y) < 8) clickedIp = ip;
    });
    if (clickedIp) {
      const ports = foundHostsMap[clickedIp] || [80];
      const proto = (ports[0]===443||ports[0]===8443)?'https':'http';
      openPreview(`${proto}://${clickedIp}:${ports[0]}/`);
      document.getElementById('globeWin').style.zIndex = 699;
      return;
    }

    // Check country (visible/front hemisphere only)
    const clickedCountry = pickCountryAt(mx, my, proj);
    if (clickedCountry) openScanCountryDlg(clickedCountry);
  });

  // Touch support
  canvas.addEventListener('touchstart', e => {
    isDragging = true;
    lastDragX = e.touches[0].clientX;
    lastDragY = e.touches[0].clientY;
  }, {passive:true});
  canvas.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - lastDragX;
    const dy = e.touches[0].clientY - lastDragY;
    currentLambda += dx * 0.4;
    currentPhi     = Math.max(-90, Math.min(90, currentPhi - dy * 0.4));
    lastDragX = e.touches[0].clientX;
    lastDragY = e.touches[0].clientY;
  }, {passive:true});
  canvas.addEventListener('touchend', () => { isDragging = false; }, {passive:true});

  // Auto-rotate checkbox
  document.getElementById('globeAutoRotate').addEventListener('change', function() {
    autoRotateOn = this.checked;
  });
}

// ── Scan Country Dialog ──
let scanCountryTarget = null;
function openScanCountryDlg(countryName) {
  scanCountryTarget = countryName;
  const entry = COUNTRY_DB.find(c => c.name === countryName);
  document.getElementById('scDlgTitle').textContent = `Scan ${countryName}?`;
  document.getElementById('scDlgIcon').textContent = entry?.flag || '🌍';
  if (entry) {
    document.getElementById('scDlgInfo').textContent = `${entry.ranges.length} IP ranges found in database.`;
    document.getElementById('scDlgRanges').textContent = 'First range: ' + entry.ranges[0];
  } else {
    document.getElementById('scDlgInfo').textContent = 'Country not in preset database — cannot auto-scan.';
    document.getElementById('scDlgRanges').textContent = '';
  }
  document.getElementById('scDlgYes').disabled = !entry;
  document.getElementById('dlgScanCountry').style.display = 'block';
  if (typeof window.bringToFront === 'function') window.bringToFront(document.getElementById('dlgScanCountry'));
}
function closeScanCountryDlg() {
  document.getElementById('dlgScanCountry').style.display = 'none';
}
document.getElementById('scDlgYes').addEventListener('click', () => {
  const entry = COUNTRY_DB.find(c => c.name === scanCountryTarget);
  if (!entry) return;
  const from = entry.ranges[0].split('–')[0];
  const to   = entry.ranges[entry.ranges.length-1].split('–')[1];
  setIP('f', from); setIP('t', to);
  closeScanCountryDlg(); closeGlobe();
  setStatus(`Range set: ${entry.flag} ${entry.name} — ${entry.ranges.length} ranges.`, 'ok');
});

// ── Update dots when new IP found ──
function updateGlobeDots() {
  refreshTopologyFilterOptions();
  if (document.getElementById('globeWin').style.display !== 'none' && globeReady) drawCurrentMap();
}

// ── Globe button ──
document.getElementById('btnGlobe').addEventListener('click', openGlobe);
document.getElementById('btnTopologyToolbar').addEventListener('click', openTopology);
document.getElementById('btnMapGlobe').addEventListener('click', () => setMapMode('globe'));
document.getElementById('btnMapTopology').addEventListener('click', () => setMapMode('topology'));
document.getElementById('btnAutoTraceTopology').addEventListener('click', () => {
  const defaultIp = selectedRowEl?.dataset?.ip || Object.keys(foundHostsMap)[0] || '';
  openTraceDlg(defaultIp);
  autoTraceRoute();
});
document.getElementById('btnClearGraph').addEventListener('click', () => {
  traceRoutes = {};
  saveTraceRoutes();
  drawCurrentMap();
  setStatus(t('graphCleared'), 'ok');
});
document.getElementById('btnTraceAuto').addEventListener('click', autoTraceRoute);
document.getElementById('btnTraceSave').addEventListener('click', importTraceRoute);
document.getElementById('topoPortFilter').addEventListener('change', e => {
  topologyFilters.port = e.target.value;
  drawCurrentMap();
});
document.getElementById('topoSubnetFilter').addEventListener('input', e => {
  topologyFilters.subnet = e.target.value;
  drawCurrentMap();
});
document.getElementById('topoPingMax').addEventListener('input', e => {
  topologyFilters.pingMax = e.target.value;
  drawCurrentMap();
});
document.getElementById('btnClearTopoFilters').addEventListener('click', () => {
  topologyFilters.port = '';
  topologyFilters.subnet = '';
  topologyFilters.pingMax = '';
  document.getElementById('topoPortFilter').value = '';
  document.getElementById('topoSubnetFilter').value = '';
  document.getElementById('topoPingMax').value = '';
  drawCurrentMap();
});
(function() {
  const win = document.getElementById('mainWin');
  const bar = win ? win.querySelector('.titlebar') : null;
  let ox = 0;
  let oy = 0;
  let dragging = false;
  let activePointerId = null;

  if (!win || !bar || _isTauriDesktop) return;

  const stopDragging = () => {
    dragging = false;
    activePointerId = null;
    document.body.style.cursor = '';
  };

  bar.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' && e.button !== 0) return;
    if (e.target.closest('.titlebar-btns')) return;

    const r = win.getBoundingClientRect();
    dragging = true;
    activePointerId = e.pointerId;
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;

    win.style.transform = 'none';
    win.style.left = r.left + 'px';
    win.style.top = r.top + 'px';
    document.body.style.cursor = 'move';
    bar.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });

  window.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== activePointerId) return;

    const maxLeft = Math.max(0, window.innerWidth - win.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - 36);
    const nextLeft = Math.min(Math.max(0, e.clientX - ox), maxLeft);
    const nextTop = Math.min(Math.max(0, e.clientY - oy), maxTop);

    win.style.left = nextLeft + 'px';
    win.style.top = nextTop + 'px';
  });

  window.addEventListener('pointerup', e => {
    if (e.pointerId === activePointerId) stopDragging();
  });

  window.addEventListener('pointercancel', e => {
    if (e.pointerId === activePointerId) stopDragging();
  });
})();
(function() {
  const win = document.getElementById('globeWin');
  const bar = document.getElementById('globeTitlebar');
  let ox=0, oy=0, dragging=false;
  if (!win || !bar) return;
  bar.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.target.closest('.titlebar-btns, .title-btn, button')) return;
    dragging = true;
    const r = win.getBoundingClientRect();
    ox = e.clientX - r.left; oy = e.clientY - r.top;
    win.style.transform = 'none';
    win.style.left = r.left+'px'; win.style.top = r.top+'px';
    e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const maxLeft = Math.max(0, window.innerWidth  - win.offsetWidth);
    const maxTop  = Math.max(0, window.innerHeight - 28);
    win.style.left = Math.min(Math.max(0, e.clientX - ox), maxLeft) + 'px';
    win.style.top  = Math.min(Math.max(0, e.clientY - oy), maxTop)  + 'px';
  });
  window.addEventListener('mouseup', () => { dragging = false; });
})();

