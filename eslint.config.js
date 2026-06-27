// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // dist: build output. supabase/functions: Deno runtime (URL imports, Deno globals) —
    // not part of the app's module/lint world. scripts: one-off dev/test scripts.
    ignores: ["dist/*", ".expo/**", "supabase/functions/**", "scripts/**"],
  }
]);
