(function () {
  var STEP_SEQUENCE = [0, 1, 2, 5, 4, 3];
  var STEP_MS = 200;

  function clearCells(cells) {
    cells.forEach(function (cell) {
      cell.classList.remove("is-active");
    });
  }

  function createStatusbarLoaderRuntime() {
    var busyCount = 0;
    var timerId = 0;
    var stepIndex = 0;
    var resetPending = false;

    function stop(cells) {
      if (timerId) {
        window.clearInterval(timerId);
        timerId = 0;
      }
      stepIndex = 0;
      resetPending = false;
      clearCells(cells);
    }

    function tick(cells) {
      if (resetPending) {
        clearCells(cells);
        stepIndex = 0;
        resetPending = false;
        return;
      }

      var seqIndex = STEP_SEQUENCE[stepIndex];
      var cell = cells[seqIndex];
      if (cell) {
        cell.classList.add("is-active");
      }
      stepIndex += 1;

      if (stepIndex >= STEP_SEQUENCE.length) {
        resetPending = true;
      }
    }

    function start(cells) {
      if (timerId) return;
      tick(cells);
      timerId = window.setInterval(function () {
        tick(cells);
      }, STEP_MS);
    }

    function applyBusyState(cells) {
      if (busyCount > 0) {
        start(cells);
      } else {
        stop(cells);
      }
    }

    function init() {
      var loader = document.getElementById("v1StatusLoader");
      if (!loader) return;

      var cells = Array.from(loader.querySelectorAll(".v1-status-loader-cell"));
      if (cells.length < 6) return;

      stop(cells);

      document.addEventListener("newui:busy-state", function (event) {
        var detail = event && event.detail ? event.detail : {};

        if (typeof detail.delta === "number" && Number.isFinite(detail.delta)) {
          busyCount += detail.delta;
        } else if (typeof detail.busy === "boolean") {
          busyCount = detail.busy ? Math.max(1, busyCount) : 0;
        }

        if (busyCount < 0) busyCount = 0;
        applyBusyState(cells);
      });
    }

    return {
      init: init,
    };
  }

  window.NetReconNewUICore = window.NetReconNewUICore || {};
  window.NetReconNewUICore.newUiRuntimes = window.NetReconNewUICore.newUiRuntimes || {};
  window.NetReconNewUICore.newUiRuntimes.createStatusbarLoaderRuntime = createStatusbarLoaderRuntime;

  var runtime = createStatusbarLoaderRuntime();
  if (runtime && typeof runtime.init === "function") {
    runtime.init();
  }
})();
