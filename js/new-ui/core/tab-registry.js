(function () {
  // Single shared instance (not a per-caller factory like the other
  // `createXRuntime(deps)` runtimes) - navigation-runtime.js registers
  // "left"/"right" here, and a future CS migration would register
  // "center" on this same instance, since all 3 sections need to share
  // one registry rather than each holding a separate one.
  //
  // Shared "tab chrome" engine for LS/CS/RS: open/close/activate a tab and
  // keep its section's activation invariant (something's always active if
  // anything's open), driven generically through a per-section adapter
  // instead of the 3 independently hand-copied implementations this
  // replaces. Content (what a tab actually shows) is explicitly out of
  // scope - each section's onOpen/onClose/onActivate hook owns whatever
  // extra, section-specific behavior existed before (see navigation-
  // runtime.js's "left"/"right" adapter registration).
  //
  // Data (which tabs exist, their icon/label/section) lives in
  // tool-catalog.js's ui.{showInLeftPanel,showAsTab,showInRightPanel,
  // order/leftOrder/rightOrder} fields - this file only knows how to
  // open/close/activate/render a tab given its section + id, not the list
  // of tabs itself.
  function createTabRegistry() {
    var sections = {};

    function registerSection(id, adapter, hooks) {
      sections[id] = { adapter: adapter, hooks: hooks || {} };
    }

    function getSection(id) {
      var s = sections[id];
      if (!s) throw new Error('tab-registry: unknown section "' + id + '"');
      return s;
    }

    function fillId(template, id) {
      return template.replace("{id}", id);
    }

    function wrapEl(section, id) {
      var s = getSection(section);
      return document.querySelector(fillId(s.adapter.wrapSelector, id));
    }

    function allWraps(section) {
      var s = getSection(section);
      return Array.from(document.querySelectorAll(s.adapter.wrapListSelector));
    }

    function idOf(section, wrap) {
      var s = getSection(section);
      return wrap.getAttribute(s.adapter.idAttr) || "";
    }

    function isOpenWrap(section, wrap) {
      var s = getSection(section);
      if (wrap.classList.contains(s.adapter.closedClass)) return false;
      if (wrap.hasAttribute("hidden")) return false;
      return true;
    }

    function isTabOpen(section, id) {
      if (!id) return false;
      var wrap = wrapEl(section, id);
      return !!wrap && isOpenWrap(section, wrap);
    }

    function getOpenTabs(section) {
      return allWraps(section)
        .filter(function (wrap) { return isOpenWrap(section, wrap); })
        .map(function (wrap) { return idOf(section, wrap); })
        .filter(Boolean);
    }

    function getActiveTab(section) {
      var s = getSection(section);
      var wrap = allWraps(section).find(function (w) { return w.classList.contains(s.adapter.activeClass); });
      return wrap ? idOf(section, wrap) : "";
    }

    // Mirrors each section's original "which tab to fall back to when the
    // active one closes" logic: an optional preference list first (LS had
    // one, RS didn't - adapter.fallbackOrder is simply absent for RS), then
    // first-open-in-DOM-order.
    function firstOpenTab(section, excludedId) {
      var s = getSection(section);
      var preferred = Array.isArray(s.adapter.fallbackOrder) ? s.adapter.fallbackOrder : [];
      for (var i = 0; i < preferred.length; i += 1) {
        var tool = preferred[i];
        if (!tool || tool === excludedId) continue;
        if (isTabOpen(section, tool)) return tool;
      }
      var wrap = allWraps(section).find(function (w) {
        if (!isOpenWrap(section, w)) return false;
        var tool = idOf(section, w);
        return !!tool && tool !== excludedId;
      });
      return wrap ? idOf(section, wrap) : "";
    }

    function setPaneVisible(section, id, visible) {
      var s = getSection(section);
      if (!s.adapter.paneSelector) return;
      var pane = document.querySelector(fillId(s.adapter.paneSelector, id));
      if (!pane) return;
      if (s.adapter.paneVisibility === "active-class") {
        pane.classList.toggle(s.adapter.paneActiveClass, visible);
      } else {
        pane.hidden = !visible;
      }
    }

    function setActiveTab(section, id) {
      var s = getSection(section);
      var nextId = String(id || "");
      allWraps(section).forEach(function (wrap) {
        var wrapId = idOf(section, wrap);
        var isActive = !!nextId && wrapId === nextId;
        wrap.classList.toggle(s.adapter.activeClass, isActive);
        setPaneVisible(section, wrapId, isActive);
      });
      if (s.hooks.onActivate) s.hooks.onActivate(nextId);
    }

    function syncActivationInvariant(section) {
      var open = getOpenTabs(section);
      if (!open.length) {
        setActiveTab(section, "");
        return;
      }
      var activeId = getActiveTab(section);
      if (!activeId || open.indexOf(activeId) === -1) {
        setActiveTab(section, open[0]);
      }
    }

    function setWrapOpen(section, id, isOpen) {
      var s = getSection(section);
      var wrap = wrapEl(section, id);
      if (!wrap) return false;
      wrap.classList.toggle(s.adapter.closedClass, !isOpen);
      if (isOpen) wrap.removeAttribute("hidden");
      else wrap.setAttribute("hidden", "hidden");
      return true;
    }

    function openTab(section, id) {
      if (!id) return false;
      var ok = setWrapOpen(section, id, true);
      if (!ok) return false;
      var s = getSection(section);
      if (s.hooks.onOpen) s.hooks.onOpen(id);
      syncActivationInvariant(section);
      return true;
    }

    function closeTab(section, id) {
      if (!id) return false;
      var wasActive = getActiveTab(section) === id;
      var ok = setWrapOpen(section, id, false);
      if (!ok) return false;
      var s = getSection(section);
      if (wasActive) {
        setActiveTab(section, firstOpenTab(section, id));
      }
      if (s.hooks.onClose) s.hooks.onClose(id);
      syncActivationInvariant(section);
      return true;
    }

    function escapeHtml(str) {
      var map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return String(str == null ? "" : str).replace(/[&<>"']/g, function (ch) { return map[ch]; });
    }

    // Builds one tab row's full markup (wrap + button + close) from a
    // tool-catalog.js entry, matching whichever section's existing wrap/
    // button/close class-and-attribute shape the adapter describes (see
    // adapter.wrapClass/buttonClass/buttonIdAttr/closeClass/closeFlagAttr,
    // set at registerSection() time). Icon is baked into the button's text
    // (e.g. "🤖 AI Assistant"), matching how RS's one existing icon
    // ("assistant") is already written today - not a separate icon span
    // like CS uses, so this stays a pure markup-generation change with no
    // new CSS/DOM shape to support.
    function renderTabRowHtml(section, id, tr) {
      var s = getSection(section);
      var a = s.adapter;
      var entry = (window.NetReconNewUICore.toolCatalog || {})[id] || {};
      var labelKey = (section === "left" && entry.leftLabelKey) ? entry.leftLabelKey : entry.labelKey;
      var label = tr ? tr(labelKey) : (labelKey || id);
      var closeAria = tr ? tr("tabCloseAria") : "Close tab";
      // CS's row shape genuinely differs (icon as its own <span>, no
      // separate wrap - the button itself is both wrap and content host) -
      // rather than force one template to fit every shape, a section can
      // provide its own via adapter.buildRow(id, icon, label, closeAria).
      if (typeof a.buildRow === "function") {
        return a.buildRow(id, entry.icon || "", label, closeAria);
      }
      var iconPrefix = entry.icon ? entry.icon + " " : "";
      return (
        '<div class="' + a.wrapClass + " " + a.closedClass + '" ' + a.idAttr + '="' + id + '" hidden>' +
        '<button class="' + a.buttonClass + '" ' + a.buttonIdAttr + '="' + id + '" type="button">' +
        escapeHtml(iconPrefix + label) +
        "</button>" +
        '<span class="' + a.closeClass + '" ' + a.closeFlagAttr + '="true" data-tool="' + id + '" role="button" tabindex="-1" aria-label="' +
        escapeHtml(closeAria) +
        '">×</span>' +
        "</div>"
      );
    }

    // Renders every registry entry flagged for this section (via
    // tool-catalog.js's ui.showIn*/showAsTab), in order, into the section's
    // tab-strip container. Only replaces the wrap+button+close rows, not
    // any content/pane - those stay whatever's already in the DOM.
    function renderSectionTabs(section, containerSelector, tr) {
      var toolCatalog = window.NetReconNewUICore.toolCatalog || {};
      var container = document.querySelector(containerSelector);
      if (!container) return;
      var flag = section === "left" ? "showInLeftPanel" : section === "right" ? "showInRightPanel" : "showAsTab";
      var orderKey = section === "left" ? "leftOrder" : section === "right" ? "rightOrder" : "order";
      var ids = Object.keys(toolCatalog).filter(function (id) {
        var ui = toolCatalog[id].ui || {};
        return ui[flag] === true;
      });
      ids.sort(function (a, b) {
        var oa = (toolCatalog[a].ui || {})[orderKey];
        var ob = (toolCatalog[b].ui || {})[orderKey];
        if (typeof oa !== "number") oa = (toolCatalog[a].ui || {}).order || 999;
        if (typeof ob !== "number") ob = (toolCatalog[b].ui || {}).order || 999;
        return oa - ob;
      });
      // Preserve any addon-contributed rows already in the container
      // (tagged data-dynamic-extension by syncExtensionToolUi()) instead of
      // wiping them - boot order between that function and this one isn't
      // guaranteed, so this has to be safe whichever runs first.
      var preserved = Array.from(container.children).filter(function (el) {
        return el.hasAttribute("data-dynamic-extension");
      });
      container.innerHTML = ids.map(function (id) { return renderTabRowHtml(section, id, tr); }).join("");
      preserved.forEach(function (el) { container.appendChild(el); });
    }

    // For a language switch, NOT boot: renderSectionTabs() rebuilds every
    // row from scratch (always starting closed), which would silently
    // reset whichever tabs are currently open/active - this instead
    // updates each EXISTING row's label text in place, leaving open/
    // closed/active state untouched.
    function retranslateSectionTabs(section, tr) {
      var s = getSection(section);
      var a = s.adapter;
      var toolCatalog = window.NetReconNewUICore.toolCatalog || {};
      allWraps(section).forEach(function (wrap) {
        var id = idOf(section, wrap);
        var entry = toolCatalog[id];
        if (!entry) return;
        var labelKey = (section === "left" && entry.leftLabelKey) ? entry.leftLabelKey : entry.labelKey;
        var label = tr ? tr(labelKey) : (labelKey || id);
        // CS has no separate wrap - the row IS the button, and its label
        // lives in a child <span> alongside an icon span and close span,
        // not as the button's own textContent (see adapter.retranslateRow).
        if (typeof a.retranslateRow === "function") {
          a.retranslateRow(wrap, entry.icon || "", label);
          return;
        }
        var btn = wrap.querySelector("." + a.buttonClass);
        if (!btn) return;
        var iconPrefix = entry.icon ? entry.icon + " " : "";
        btn.textContent = iconPrefix + label;
      });
    }

    return {
      registerSection: registerSection,
      openTab: openTab,
      closeTab: closeTab,
      setActiveTab: setActiveTab,
      isTabOpen: isTabOpen,
      getOpenTabs: getOpenTabs,
      getActiveTab: getActiveTab,
      firstOpenTab: firstOpenTab,
      syncActivationInvariant: syncActivationInvariant,
      renderTabRowHtml: renderTabRowHtml,
      renderSectionTabs: renderSectionTabs,
      retranslateSectionTabs: retranslateSectionTabs,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.tabRegistry = createTabRegistry();
})();
