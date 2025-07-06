// postcss.config.js
module.exports = {
  plugins: [
    require('@tailwindcss/postcss'),  // the Tailwind PostCSS wrapper
    require('autoprefixer'),
  ]
};