// Metro needs explicit help in an npm-workspaces monorepo: by default it only
// watches this package, so imports from @luma/tokens resolve to nothing.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Watch only what this app can actually import.
//
// Watching the whole workspace root makes Metro crawl every directory in the
// repo — including api/.venv, infra/.terraform, and anything Docker owns —
// which is slow and crashes with EACCES on directories the container wrote as
// root. The host app needs the shared packages and the hoisted node_modules,
// and nothing else.
config.watchFolders = [
  path.resolve(workspaceRoot, "packages"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Resolve from this package first, then the hoisted root node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Belt and braces: if watchFolders is ever widened again, these stay excluded.
config.resolver.blockList = [
  /\/\.data\/.*/, // docker volumes, should no longer exist
  /\/api\/\.venv\/.*/, // python environment
  /\/\.git\/.*/,
  /\/\.terraform\/.*/,
  /\/guest\/dist\/.*/, // the other bundle's build output
];

// Without this, Metro walks up the tree and can pick up two copies of React.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
