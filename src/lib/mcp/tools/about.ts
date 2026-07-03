import { defineTool } from "@lovable.dev/mcp-js";

export default defineTool({
  name: "about_app",
  title: "About this app",
  description:
    "Return a description of Jermspray Stencil Maker and the features it provides for turning images into layered cuttable stencils.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [
      {
        type: "text",
        text: "Jermspray Stencil Maker converts uploaded images into multi-layer cuttable stencils (SVG/PNG/ZIP) with color quantization, background removal, bleed, white tolerance, auto-bridging, detail cleanup, and per-layer registration markers. Load the web app to upload an image and export stencil layers.",
      },
    ],
  }),
});
