(function () {
  // In-app Markdown viewer CS tab. bootstrap-runtime.js's global external-
  // link click handler checks isMarkdownLink() before routing an <a href>
  // to the system browser - a link that clearly points to a .md file opens
  // here instead. Same module-scope "selected" var + switchTool() pattern
  // community-catalog-detail-runtime.js uses for its detail tab (refreshActiveUI()
  // rebuilds the CS tab's whole subtree on every switch, so state can't
  // live in the DOM).
  //
  // Vendored from https://cdn.jsdelivr.net/npm/marked/marked.min.js and
  // https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js - bump the
  // versions in this comment and js/new-ui/vendor/markdown/ together when
  // upgrading. marked() alone does NOT sanitize its output (raw HTML in the
  // source markdown passes straight through) - since this renders third-
  // party GitHub content (addon READMEs, arbitrary linked docs), every
  // parsed result is run through DOMPurify.sanitize() before it ever
  // touches innerHTML.
  var VENDOR_BASE = "js/new-ui/vendor/markdown/";
  var enginePromise = null;

  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement("script");
      el.src = src;
      el.onload = function () { resolve(); };
      el.onerror = function () { reject(new Error("failed to load " + src)); };
      document.head.appendChild(el);
    });
  }

  // GitHub-style heading slugs (lowercase, spaces -> hyphens, punctuation
  // dropped) so a table-of-contents link like [Tools](#41-mail-xss-tester)
  // actually has something to jump to. This vendored marked (v5+) dropped
  // automatic heading ids from core entirely - confirmed by hand, a plain
  // `## Heading` renders as `<h2>Heading</h2>` with no id attribute at all,
  // so #fragment links silently did nothing. slugCounts is reset at the
  // start of every render() call (see below) - duplicate heading text
  // within one document gets -1/-2/... suffixes, same as GitHub.
  var slugCounts = null;

  function slugify(rawText) {
    var base = String(rawText || "").toLowerCase().trim()
      .replace(/[^a-z0-9_\- ]/g, "")
      .replace(/\s+/g, "-");
    if (!slugCounts) return base;
    var count = slugCounts[base] || 0;
    slugCounts[base] = count + 1;
    return count === 0 ? base : base + "-" + count;
  }

  // Registered once (marked.use() mutates its module-level default
  // renderer, not a per-call option) rather than on every render. The
  // heading override intentionally uses the legacy 3-arg signature
  // (text, level, raw) instead of the token-object one the DEFAULT
  // renderer uses internally - tried the token/parser.parseInline() form
  // first and it threw deep inside marked's parser for every call; this
  // vendored build accepts the old positional-args shape fine (marked's
  // own backward-compat path for renderer overrides), and `raw` conveniently
  // comes back as the heading's plain text with markdown syntax already
  // stripped, exactly what a slug needs.
  function installHeadingIds(markedInstance) {
    markedInstance.use({
      renderer: {
        heading: function (text, level, raw) {
          var id = slugify(raw);
          return "<h" + level + ' id="' + id + '">' + text + "</h" + level + ">\n";
        }
      }
    });
  }

  function loadEngine() {
    if (enginePromise) return enginePromise;
    enginePromise = Promise.all([
      injectScript(VENDOR_BASE + "marked.min.js"),
      injectScript(VENDOR_BASE + "purify.min.js")
    ]).then(function () {
      if (typeof window.marked === "undefined" || typeof window.DOMPurify === "undefined") {
        throw new Error("markdown engine not available after loading vendor scripts");
      }
      installHeadingIds(window.marked);
      return { marked: window.marked, DOMPurify: window.DOMPurify };
    }).catch(function (err) {
      enginePromise = null;
      throw err;
    });
    return enginePromise;
  }

  function isMarkdownLink(href) {
    try {
      var url = new URL(href, window.location.href);
      return /\.md$/i.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  // A github.com/<owner>/<repo>/blob/<branch>/<path> link splits into its
  // parts so relative links/images inside the rendered doc can be resolved
  // against the right directory - null for anything else (raw.githubusercontent.com
  // links, or non-GitHub hosts), which render with no relative-link rewrite.
  function parseGithubBlobUrl(href) {
    try {
      var url = new URL(href, window.location.href);
      if (url.hostname !== "github.com") return null;
      var m = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
      if (!m) return null;
      var path = decodeURIComponent(m[4]);
      var dir = path.indexOf("/") === -1 ? "" : path.slice(0, path.lastIndexOf("/") + 1);
      return { owner: m[1], repo: m[2], branch: m[3], path: path, dir: dir };
    } catch (_) {
      return null;
    }
  }

  function resolveRawUrl(href, blob) {
    if (blob) {
      return "https://raw.githubusercontent.com/" + blob.owner + "/" + blob.repo + "/" + blob.branch + "/" + blob.path;
    }
    return href;
  }

  function isAbsoluteUrl(value) {
    return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.indexOf("//") === 0;
  }

  function rewriteRelativeUrls(containerEl, blob) {
    if (!blob) return;
    var githubBase = "https://github.com/" + blob.owner + "/" + blob.repo + "/blob/" + blob.branch + "/" + blob.dir;
    var rawBase = "https://raw.githubusercontent.com/" + blob.owner + "/" + blob.repo + "/" + blob.branch + "/" + blob.dir;

    containerEl.querySelectorAll("a[href]").forEach(function (a) {
      var href = a.getAttribute("href") || "";
      if (!href || href.indexOf("#") === 0 || isAbsoluteUrl(href)) return;
      try { a.setAttribute("href", new URL(href, githubBase).href); } catch (_) { /* leave as-is */ }
    });
    containerEl.querySelectorAll("img[src]").forEach(function (img) {
      var src = img.getAttribute("src") || "";
      if (!src || isAbsoluteUrl(src)) return;
      try { img.setAttribute("src", new URL(src, rawBase).href); } catch (_) { /* leave as-is */ }
    });
  }

  function createMarkdownViewerRuntime(deps) {
    var tr = deps.tr;
    var setStatusLine = deps.setStatusLine;
    var switchTool = deps.switchTool;

    var selectedUrl = "";

    function render(mount) {
      mount.innerHTML = "";
      if (!selectedUrl) {
        var empty = document.createElement("p");
        empty.className = "v1-import-empty";
        empty.textContent = tr("mdViewerEmpty");
        mount.appendChild(empty);
        return;
      }

      var url = selectedUrl;
      var blob = parseGithubBlobUrl(url);
      var rawUrl = resolveRawUrl(url, blob);

      var header = document.createElement("div");
      header.className = "v1-md-viewer-header";
      var sourceLink = document.createElement("a");
      sourceLink.href = url;
      sourceLink.target = "_blank";
      sourceLink.rel = "noopener noreferrer";
      // Without this marker the link's own .md href would just re-trigger
      // isMarkdownLink() and reopen the same doc in this same tab instead
      // of actually leaving the app - see bootstrap-runtime.js's click
      // handler, which checks for it before the .md interception.
      sourceLink.setAttribute("data-force-external", "1");
      sourceLink.textContent = tr("mdViewerOpenInBrowser");
      header.appendChild(sourceLink);
      mount.appendChild(header);

      var body = document.createElement("div");
      body.className = "v1-md-viewer-body";
      body.textContent = tr("communityCatalogLoading");
      mount.appendChild(body);

      Promise.all([
        loadEngine(),
        fetch(rawUrl).then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.text();
        })
      ]).then(function (results) {
        if (selectedUrl !== url) return; // a newer doc was opened meanwhile
        var engine = results[0];
        var text = results[1];
        slugCounts = {};
        var html = engine.DOMPurify.sanitize(engine.marked.parse(text));
        body.innerHTML = html;
        rewriteRelativeUrls(body, blob);
      }).catch(function (err) {
        if (selectedUrl !== url) return;
        body.textContent = tr("mdViewerError") + (err && err.message ? " (" + err.message + ")" : "");
        if (setStatusLine) setStatusLine(tr("menuPrefix") + ": " + tr("mdViewerError") + " - " + url);
      });
    }

    function openDoc(href) {
      selectedUrl = href;
      switchTool("md-viewer");
    }

    function wireMarkdownViewer(rootEl) {
      var mount = (rootEl || document).querySelector(".v1-md-viewer-root");
      if (!mount) return;
      render(mount);
    }

    return {
      openDoc: openDoc,
      wireMarkdownViewer: wireMarkdownViewer,
      isMarkdownLink: isMarkdownLink,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createMarkdownViewerRuntime = createMarkdownViewerRuntime;
})();
