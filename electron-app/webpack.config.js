const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    target: 'electron-renderer',
    entry: './src/renderer/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist/renderer'),
      filename: 'bundle.js',
      clean: true
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: [
            isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
            'css-loader'
          ]
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg)$/,
          type: 'asset/resource',
          generator: {
            filename: 'assets/[name][ext]'
          }
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.js', '.css']
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/renderer/index.html',
        filename: 'index.html'
      }),
      ...(isProduction ? [
        new MiniCssExtractPlugin({
          filename: 'styles.css'
        })
      ] : [])
    ],
    devtool: isProduction ? 'source-map' : 'inline-source-map',
    optimization: {
      minimize: isProduction
    }
  };
}; 