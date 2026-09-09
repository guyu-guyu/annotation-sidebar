import esbuild from "esbuild";
import process from "node:process";

const production = process.argv[2] === "production";

const context = await esbuild.context({
  banner: {
    js: "/* Annotation Sidebar - generated from TypeScript source */",
  },
  bundle: true,
  entryPoints: ["src/main.ts"],
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
  ],
  format: "cjs",
  logLevel: "info",
  outfile: "main.js",
  platform: "browser",
  sourcemap: production ? false : "inline",
  target: "es2018",
  treeShaking: true,
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}

