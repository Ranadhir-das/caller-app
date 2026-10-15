const { PRODUCTION_API_BASE_URL } = require('./scripts/android-build-config.cjs');

// Same public variable Expo inlines into src/services/api.ts; all existing config is preserved.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || PRODUCTION_API_BASE_URL,
  },
});
