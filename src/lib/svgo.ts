import * as svgo from "svgo";

export function optimizeSvg(svg: string): string {
  const result = svgo.optimize(svg, {
    multipass: true,
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            removeViewBox: false,
          },
        },
      },
      { name: "removeComments" },
      { name: "removeMetadata" },
    ],
  });

  return result.data;
}