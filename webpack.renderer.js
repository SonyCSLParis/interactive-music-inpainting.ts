const merge = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = function(config) {
  const finalConfiguration = merge(merge(config, common), {
    target: (config.mode === 'production' ? "electron-preload" : "electron-renderer"),

    devServer: {
      proxy: {
        // TODO(theis): create subtree /api in flask-server to group all commands together as e.g. /api/erase
        context: ['/erase', '/timerange-change',
          '/generate', '/get-midi', '/musicxml-to-midi',
          '/sample-from-dataset', '/get-audio',
          '/get-spectrogram-image', '/analyze-audio'],
        // expects the inference model to be served locally on port 5000
        target: "http://[::1]:5000",
      },
      // publicPath: 'static/'
    },

    output: (config.mode === 'production' ? {filename: 'renderer.prod.js'} : {}),
  });
  return finalConfiguration
};
