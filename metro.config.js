// Default Expo config plus one web fix: zustand's ES module build uses `import.meta`, which the
// web bundle (a classic script) can't run. On the web, resolve zustand to its CommonJS build.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const upstream = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  if (platform === 'web' && (moduleName === 'zustand' || moduleName.startsWith('zustand/'))) {
    return resolve({ ...context, unstable_conditionNames: ['browser', 'require', 'default'] }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
