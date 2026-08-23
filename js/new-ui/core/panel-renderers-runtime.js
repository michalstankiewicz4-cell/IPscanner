(function () {
  function createPanelRenderersRuntime(deps) {
    var escapeHtml = deps.escapeHtml;
    var tr = deps.tr;

    function pickAddressFromItem(item) {
      if (!item || typeof item !== "object") return "-";

      if (item.cidr) return String(item.cidr);
      if (item.range) return String(item.range);
      if (item.network) return String(item.network);
      if (item.address) return String(item.address);
      if (item.ip_range) return String(item.ip_range);

      if (Array.isArray(item.ranges) && item.ranges.length) {
        return item.ranges.slice(0, 3).map(function (entry) {
          if (entry && typeof entry === "object") {
            return String(entry.cidr || entry.range || entry.network || entry.address || entry.ip_range || "");
          }
          return String(entry || "").trim();
        }).filter(Boolean).join(", ");
      }

      return "-";
    }

    function extractRanges(item) {
      if (!item || typeof item !== "object") return [];

      var direct = String(item.cidr || item.range || item.network || item.address || item.ip_range || "").trim();
      if (direct) return [direct];

      if (Array.isArray(item.ranges) && item.ranges.length) {
        return item.ranges.map(function (entry) {
          if (entry && typeof entry === "object") {
            return String(entry.cidr || entry.range || entry.network || entry.address || entry.ip_range || "").trim();
          }
          return String(entry || "").trim();
        }).filter(Boolean);
      }

      return [];
    }

    function pickCountryFromItem(item) {
      if (!item || typeof item !== "object") return "-";
      return String(
        item.country_code ||
        item.countryCode ||
        item.country ||
        item.code ||
        item.flag ||
        item.name ||
        "-"
      ).toUpperCase();
    }

    function renderIpLibraryRows(data) {
      var rows = Array.isArray(data) ? data : [];
      if (!rows.length) {
        return '<tr><td colspan="2" class="v1-iplib-empty">' + escapeHtml(tr("ipLibraryTableEmpty")) + "</td></tr>";
      }

      var html = [];
      rows.forEach(function (item) {
        var country = pickCountryFromItem(item);
        var ranges = extractRanges(item);

        if (!ranges.length) {
          html.push('<tr><td class="v1-iplib-col-country">' + escapeHtml(country) + '</td><td class="v1-iplib-col-address">' + escapeHtml(pickAddressFromItem(item)) + "</td></tr>");
          return;
        }

        ranges.forEach(function (address) {
          html.push('<tr><td class="v1-iplib-col-country">' + escapeHtml(country) + '</td><td class="v1-iplib-col-address">' + escapeHtml(address) + "</td></tr>");
        });
      });

      return html.join("");
    }

    return {
      renderIpLibraryRows: renderIpLibraryRows,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelRenderersRuntime = createPanelRenderersRuntime;
})();
