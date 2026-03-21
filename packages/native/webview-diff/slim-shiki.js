// Slim shiki shim — only bundles languages and themes we actually use.
// Reduces bundle from ~10MB to ~2MB by avoiding shiki's full language/theme imports.
import { createBundledHighlighter, createSingletonShorthands } from "@shikijs/core";
export { codeToHtml, normalizeTheme, createCssVariablesTheme, getTokenStyleObject, stringifyTokenStyle } from "@shikijs/core";
export { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";

// Only include the languages we need
export const bundledLanguages = {
  "javascript": () => import("@shikijs/langs/javascript"),
  "typescript": () => import("@shikijs/langs/typescript"),
  "tsx": () => import("@shikijs/langs/tsx"),
  "jsx": () => import("@shikijs/langs/jsx"),
  "json": () => import("@shikijs/langs/json"),
  "jsonc": () => import("@shikijs/langs/jsonc"),
  "html": () => import("@shikijs/langs/html"),
  "css": () => import("@shikijs/langs/css"),
  "scss": () => import("@shikijs/langs/scss"),
  "markdown": () => import("@shikijs/langs/markdown"),
  "yaml": () => import("@shikijs/langs/yaml"),
  "toml": () => import("@shikijs/langs/toml"),
  "python": () => import("@shikijs/langs/python"),
  "rust": () => import("@shikijs/langs/rust"),
  "go": () => import("@shikijs/langs/go"),
  "ruby": () => import("@shikijs/langs/ruby"),
  "java": () => import("@shikijs/langs/java"),
  "kotlin": () => import("@shikijs/langs/kotlin"),
  "swift": () => import("@shikijs/langs/swift"),
  "c": () => import("@shikijs/langs/c"),
  "cpp": () => import("@shikijs/langs/cpp"),
  "csharp": () => import("@shikijs/langs/csharp"),
  "sql": () => import("@shikijs/langs/sql"),
  "shellscript": () => import("@shikijs/langs/shellscript"),
  "bash": () => import("@shikijs/langs/bash"),
  "diff": () => import("@shikijs/langs/diff"),
  "graphql": () => import("@shikijs/langs/graphql"),
  "dockerfile": () => import("@shikijs/langs/dockerfile"),
  "xml": () => import("@shikijs/langs/xml"),
  "lua": () => import("@shikijs/langs/lua"),
  "php": () => import("@shikijs/langs/php"),
};

export const bundledLanguagesBase = bundledLanguages;
export const bundledLanguagesAlias = {};
export const bundledLanguagesInfo = Object.entries(bundledLanguages).map(
  ([id, imp]) => ({ id, name: id, import: imp })
);

// Only include the themes we need
export const bundledThemes = {
  "github-dark": () => import("@shikijs/themes/github-dark"),
  "github-light": () => import("@shikijs/themes/github-light"),
};

export const bundledThemesInfo = Object.entries(bundledThemes).map(
  ([id, imp]) => ({ id, import: imp })
);

// Build createHighlighter with only our subset of languages/themes
export const createHighlighter = createBundledHighlighter({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => import("@shikijs/engine-javascript").then(m => m.createJavaScriptRegexEngine()),
});

const { codeToTokensBase, codeToTokensWithThemes, codeToTokens, codeToHast, codeToHtml: _codeToHtml, getLastGrammarState, getSingletonHighlighter } = createSingletonShorthands(createHighlighter);
export { getSingletonHighlighter };
