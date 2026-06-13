const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      // './src/assets' → dist/assets; './src/sommelier/kb' → dist/sommelier/kb
      // (Nx normalizeAssets sets output = relative(sourceRoot, input)). The kb
      // glob is REQUIRED: without it the built main.js has no knowledge base at
      // runtime (works-in-dev/breaks-in-dist). Verified by kb-dist.spec.ts.
      assets: ['./src/assets', './src/sommelier/kb'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
    }),
  ],
};
