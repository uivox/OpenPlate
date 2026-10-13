// Everything lives in app.json. This only adds the web base path when the web build is hosted
// in a sub-folder (GitHub Pages: WEB_BASE_URL=/OpenPlate). Native builds are unaffected.
module.exports = ({ config }) => {
  const baseUrl = (process.env.WEB_BASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
