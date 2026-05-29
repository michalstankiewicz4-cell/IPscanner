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
            return String(entry.cidr || entry.range || entry.network || entry.address || "");
          }
          return String(entry || "");
        }).filter(Boolean).join(", ");
      }

      return "-";
    }

    function pickCountryFromItem(item) {
      if (!item || typeof item !== "object") return "-";
      return String(item.country_code || item.countryCode || item.country || item.code || "-").toUpperCase();
    }

    function renderIpLibraryRows(data) {
      var rows = Array.isArray(data) ? data : [];
      if (!rows.length) {
        return '<tr><td colspan="2" class="v1-iplib-empty">' + escapeHtml(tr("ipLibraryTableEmpty")) + "</td></tr>";
      }

      return rows.map(function (item) {
        return '<tr><td class="v1-iplib-col-country">' + escapeHtml(pickCountryFromItem(item)) + '</td><td class="v1-iplib-col-address">' + escapeHtml(pickAddressFromItem(item)) + "</td></tr>";
      }).join("");
    }

    function renderExtensionList(items) {
      var list = Array.isArray(items) ? items : [];
      if (!list.length) {
        return '<div class="v1-import-empty">No imported tools yet.</div>';
      }

      return list.map(function (item) {
        var id = item && item.id ? String(item.id) : "";
        var version = item && item.version ? String(item.version) : "";
        var name = item && item.name ? String(item.name) : "";
        return '<div class="v1-import-item"><strong>' + escapeHtml(id) + '</strong><span>@ ' + escapeHtml(version) + '</span><div>' + escapeHtml(name) + "</div></div>";
      }).join("");
    }

    return {
      renderIpLibraryRows: renderIpLibraryRows,
      renderExtensionList: renderExtensionList,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createPanelRenderersRuntime = createPanelRenderersRuntime;
})();
