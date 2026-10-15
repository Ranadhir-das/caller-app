const path = require('node:path');

const PRODUCTION_API_BASE_URL = 'https://vaaniapp.co.in/api/v1';

function assertProductionApiUrl(value) {
  // Exact allowlist rejects HTTP, localhost, LAN/private IPs, credentials, and alternate origins.
  if (value !== PRODUCTION_API_BASE_URL) {
    throw new Error('Production API must resolve to the approved HTTPS CRM endpoint.');
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid production API configuration.');
  }
}

function resolveBuildConfig(root, mode, dependencies) {
  if (!['development', 'production'].includes(mode)) throw new Error('Invalid Android build mode.');
  const env = dependencies?.env || process.env;
  env.NODE_ENV = mode;
  if (mode === 'production') env.EXPO_PUBLIC_API_BASE_URL = PRODUCTION_API_BASE_URL;
  if (!dependencies) {
    const expoDirectory = path.dirname(require.resolve('expo/package.json', { paths: [root] }));
    dependencies = {
      loadEnv: require(require.resolve('@expo/env', { paths: [expoDirectory] })).load,
      getConfig: require(require.resolve('@expo/config', { paths: [expoDirectory] })).getConfig,
    };
  }
  // Use Expo's own dotenv loader and dynamic-config resolution, not a separate dotenv parser.
  dependencies.loadEnv(root, { silent: true });
  const { exp } = dependencies.getConfig(root);
  if (mode === 'production') {
    assertProductionApiUrl(exp.extra?.apiBaseUrl);
    // Also verify the actual public variable used by the API client after config evaluation.
    assertProductionApiUrl(env.EXPO_PUBLIC_API_BASE_URL);
  }
  return exp;
}

module.exports = { PRODUCTION_API_BASE_URL, assertProductionApiUrl, resolveBuildConfig };

if (require.main === module) {
  try {
    resolveBuildConfig(path.join(__dirname, '..'), process.argv[2]);
    console.log('Expo Android build configuration validated.');
  } catch {
    // Config/plugin errors can include environment contents; do not print them.
    console.error('Expo Android build configuration validation failed. Gradle was not started.');
    process.exitCode = 1;
  }
}
