import { defineMcp } from "@lovable.dev/mcp-js";
import aboutTool from "./tools/about";
import echoTool from "./tools/echo";

export default defineMcp({
  name: "jermspray-stencil-maker-mcp",
  title: "Jermspray Stencil Maker",
  version: "0.1.0",
  instructions:
    "Tools for the Jermspray Stencil Maker app. Use `about_app` to learn what the app does, and `echo` to verify connectivity.",
  tools: [aboutTool, echoTool],
});
