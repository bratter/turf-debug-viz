/**
 * Management of the mode-specific menu <nav> row.
 */

import { Selection, create } from "d3-selection";

const STORAGE_KEY_AUTOFIT = "turf-debug-autofit";

enum Mode {
  VIEW = "view",
  DIFF = "diff"
}

/**
 * Append a text node without replacing all children.
 *
 * Use with `selection.call(appendText, "text")`, but this only appends the
 * static string to the first node, so has limited general purpose use.
 */
function appendText<E extends Element>(sel: Selection<E, any, any, any>, text: string) {
  sel.node()?.append(text);
}

function changeMode(mode: Mode) {
  window.dispatchEvent(new CustomEvent("modechange", {
    detail: { mode },
  }));
}

// TODO: Pull this from the checkbox when not in this file?
function getAutoFit(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY_AUTOFIT);
  return stored !== "false"; // Default to true
}

function setAutoFit(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY_AUTOFIT, enabled.toString());
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

  container.append(htmlValue, mapControls);
}

window.addEventListener("modechange", (e) => {
  // Get the incoming mode and check that it is valid
  const newMode = (e as CustomEvent).detail.mode;
  const newMenu = menus[newMode] as HTMLElement | undefined;

  if (!newMenu) {
    throw new Error(`Invalid mode menu provided: ${newMode}`);
  }

  const currentMode = container.dataset.mode;

  if (newMode !== currentMode) {
    container.dataset.mode = newMode;
    container.replaceChildren(newMenu, mapControls);
  }
});

function buildViewMenu(): HTMLElement {
  const left = create("ul");

  // The mode indicator
  left.append("li").text("view");

  return left.node() as HTMLElement;
}

function buildDiffMenu(): HTMLElement {
  const left = create("ul");

  // The mode indicator
  left.append("li").text("diff");

  return left.node() as HTMLElement;
}

/**
 * Common map controls.
 */
function makeMapControls(): HTMLElement {
  const controls = create("ul");

  const showVertices = controls.append("li");
  const showVerticesLabel = showVertices.append("label");
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
  autofitLabel
    .append("input")
    .attr("type", "checkbox")
    .property("checked", getAutoFit())
    .on("change", function () {
      const checked = this.checked;
      setAutoFit(checked);
      if (checked) window.map?.fitAll();
    });
  autofitLabel.call(appendText, "Autofit");

  controls
    .append("li")
    .append("button")
    .text("Zoom to fit")
    .on("click", () => window.map?.fitAll());

  return controls.node() as HTMLElement;
}

export { Mode, changeMode, getAutoFit };
