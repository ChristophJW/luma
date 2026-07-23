// Metro needs explicit help in an npm-workspaces monorepo: by default it only
// watches this package, so imports from @luma/tokens resolve to nothing.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Watch the whole workspace so changes in packages/tokens trigger a reload.
config.watchFolders = [workspaceRoot];

// Resolve from this package first, then the hoisted root node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Without this, Metro walks up the tree and can pick up two copies of React.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
