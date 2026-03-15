/**
 * Management of the mode-specific menu <nav> row.
 */

import { Selection, create } from "d3-selection";
import { buildDiffMenu, diffState } from "./diff";
import { buildViewMenu } from "./view";

export enum Mode {
  VIEW = "view",
  DIFF = "diff",
}

let currentMode: Mode = Mode.VIEW;

export function getCurrentMode(): Mode {
  return currentMode;
}

export function changeMode(mode: Mode) {
  if (mode === currentMode) return;
  currentMode = mode;

  window.dispatchEvent(
    new CustomEvent("modechange", {
      detail: mode,
    }),
  );
}

let autoFit = true;

// TODO: Pull this from the checkbox when not in this file?
export function getAutoFit(): boolean {
  return autoFit;
}

function setAutoFit(enabled: boolean): void {
  autoFit = enabled;
}

const container = document.getElementById("mode-menu") as HTMLElement;

// Build the mode trees
const menus = {
  [Mode.VIEW]: buildViewMenu(),
  [Mode.DIFF]: buildDiffMenu(),
};

// Make the common map controls module
const mapControls = makeMapControls();

// Load the initial mode
{
  let htmlValue = menus[container.dataset.mode as Mode];
  if (!htmlValue) {
    container.dataset.mode = Mode.VIEW;
    htmlValue = menus[Mode.VIEW];
  }

  container.append(...htmlValue, mapControls);
}

window.addEventListener("modechange", (e) => {
  // Get the incoming mode and check that it is valid
  const newMode = e.detail;
  const newMenu = menus[newMode];

  if (!newMenu) {
    throw new Error(`Invalid mode menu provided: ${newMode}`);
  }

  container.dataset.mode = newMode;
  container.replaceChildren(...newMenu, mapControls);
});

/**
 * Append a text node without replacing all children.
 *
 * Use with `selection.call(appendText, "text")`, but this only appends the
 * static string to the first node, so has limited general purpose use.
 */
function appendText<E extends Element>(
  sel: Selection<E, any, any, any>,
  text: string,
) {
  sel.node()?.append(text);
}

/**
 * Common map controls.
 */
function makeMapControls(): HTMLElement {
  const controls = create("ul");

  const showVertices = controls.append("li");
  const showVerticesLabel = showVertices.append("label");
  showVerticesLabel.attr("title", "Show all geometry vertices on map");
  showVerticesLabel
    .append("input")
    .attr("type", "checkbox")
    .on("change", function () {
      if (window.map) {
        window.map.showVertices = this.checked;
      }
    });
  showVerticesLabel.call(appendText, "Show vertices");

  const autofit = controls.append("li");
  const autofitLabel = autofit.append("label");
  autofitLabel.attr("title", "Auto-zoom map when active item changes");
  autofitLabel
    .append("input")
    .attr("type", "checkbox")
    .attr("checked", "")
    .property("checked", getAutoFit())
    .on("change", function () {
      const checked = this.checked;
      setAutoFit(checked);
      if (checked) {
        if (currentMode === Mode.DIFF) {
          const diff = diffState.getActiveDiff();
          if (diff)
            window.map?.scheduleFit([diff.from.index, diff.to.index], false);
        } else {
          window.map?.fitAll();
        }
      }
    });
  autofitLabel.call(appendText, "Autofit");

  controls
    .append("li")
    .append("button")
    .attr("title", "Zoom to fit")
    .text("Zoom to fit")
    .on("click", () => {
      if (currentMode === Mode.DIFF) {
        const diff = diffState.getActiveDiff();
        if (diff)
          window.map?.scheduleFit([diff.from.index, diff.to.index], false);
      } else {
        window.map?.fitAll();
      }
    });

  return controls.node() as HTMLElement;
}
