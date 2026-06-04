(function () {
  var LICENSE_TEXT = [
    "MIT License",
    "",
    "Copyright (c) Michal Stankiewicz",
    "",
    "Permission is hereby granted, free of charge, to any person obtaining a copy",
    "of this software and associated documentation files (the \"Software\"), to deal",
    "in the Software without restriction, including without limitation the rights",
    "to use, copy, modify, merge, publish, distribute, sublicense, and/or sell",
    "copies of the Software, and to permit persons to whom the Software is",
    "furnished to do so, subject to the following conditions:",
    "",
    "The above copyright notice and this permission notice shall be included in all",
    "copies or substantial portions of the Software.",
    "",
    "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR",
    "IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,",
    "FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE",
    "AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER",
    "LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,",
    "OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE",
    "SOFTWARE."
  ].join("\n");

  var RESULTS_IP_SAMPLE_ROWS = [
    {
      ip: "83.9.186.53",
      ping: "23 ms",
      hostname: "83.9.186.53.ipv4.supermedia.pl",
      flag: "PL",
      isp: "Orange Polska Spolka Akcyjna",
      as: "AS5617",
      deviceIdentification: "Router / CPE",
      statusClass: "is-up",
      ports: [
        {
          port: ":34567",
          httpPageTitle: "IP Camera Stream",
          accessSnapshot: "/admin/video/snapshot/files/status/stream/mjpeg:34567"
        },
        {
          port: ":80",
          httpPageTitle: "Web Admin",
          accessSnapshot: "/admin/video/snapshot/files/status/stream/mjpeg:80"
        },
        {
          port: ":443",
          httpPageTitle: "Secure Web Admin",
          accessSnapshot: "/admin/video/snapshot/files/status/stream/mjpeg:443"
        },
        {
          port: ":631",
          httpPageTitle: "Print / IPP",
          accessSnapshot: "/admin/video/snapshot/files/status/stream/mjpeg:631"
        }
      ]
    },
    {
      ip: "83.9.186.185",
      ping: "4 ms",
      hostname: "83.9.186.185.ipv4.supermedia.pl",
      flag: "PL",
      isp: "Orange Polska Spolka Akcyjna",
      as: "AS5617",
      deviceIdentification: "Gateway",
      statusClass: "is-up",
      ports: [
        {
          port: ":80",
          httpPageTitle: "Home Panel",
          accessSnapshot: "/admin/video/snapshot/files/status/stream/mjpeg:80"
        },
        {
          port: ":443",
          httpPageTitle: "Secure Home Panel",
          accessSnapshot: "/admin/video/snapshot/files/status/stream/mjpeg:443"
        }
      ]
    }
  ];

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.panelContentConfig = {
    versions: {},
    languageManager: {},
    importTool: {},
    licenseText: LICENSE_TEXT,
    resultsIp: {
      sampleRows: RESULTS_IP_SAMPLE_ROWS,
      headers: {}
    }
  };
})();
