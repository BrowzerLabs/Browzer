const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = process.env.NODE_ENV === 'production' || argv.mode === 'production';
  
  return {
    target: 'electron-renderer',
    entry: './src/renderer/index.ts',
    mode: isProduction ? 'production' : 'development',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  output: {
    filename: 'renderer.js',
    path: path.resolve(__dirname, 'dist/renderer'),
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html',
      filename: 'index.html',
    }),
    new HtmlWebpackPlugin({
      template: './src/renderer/onboarding.html',
      filename: 'onboarding.html',
      inject: false, // Don't inject the main renderer.js into onboarding
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    }),
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'development',
    }),
    new CopyWebpackPlugin({
      patterns: [
        // Copy main styles
        {
          from: path.resolve(__dirname, 'src/renderer/styles.css'),
          to: path.resolve(__dirname, 'dist/renderer/styles.css'),
        },
        // Copy entire onboarding directory structure
        {
          from: path.resolve(__dirname, 'src/renderer/onboarding'),
          to: path.resolve(__dirname, 'dist/renderer/onboarding'),
        },
        // Copy legacy onboarding files (for backwards compatibility)
        {
          from: path.resolve(__dirname, 'src/renderer/onboarding.css'),
          to: path.resolve(__dirname, 'dist/renderer/onboarding.css'),
          noErrorOnMissing: true,
        },
        {
          from: path.resolve(__dirname, 'src/renderer/onboarding.js'),
          to: path.resolve(__dirname, 'dist/renderer/onboarding.js'),
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
  devtool: isProduction ? 'source-map' : 'eval-source-map',
  node: {
    __dirname: false,
    __filename: false,
  },
  };
}; 