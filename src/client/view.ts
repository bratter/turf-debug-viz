/**
 * View mode logic and state
 */

import { create } from "d3-selection";

function buildViewMenu(): HTMLElement[] {
  const left = create("ul");
  const right = create("ul");

  // The mode indicator
  left.append("li").text("view");

  // The clear-all button
  right
    .append("li")
    .append("button")
    .text("Clear all")
    .on("click", () => console.log("view - clear all"));

  return [left.node()!, right.node()!];
}

export { buildViewMenu };
