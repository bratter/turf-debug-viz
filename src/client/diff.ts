/**
 * Diff mode logic and state
 */

import { create } from "d3-selection";

// TODO: Build up the diff state
const diffState = {};

function buildDiffMenu(): HTMLElement[] {
  const left = create("ul");
  const right = create("ul");

  // The mode indicator
  left.append("li").text("diff");

  right
    .append("li")
    .append("button")
    .text("New diff")
    .on("click", () => console.log("diff - new diff"));

  return [left.node()!, right.node()!];
}

export { buildDiffMenu };
