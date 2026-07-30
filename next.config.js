/** @type {import('next').NextConfig} */
module.exports = {
  // O front continua sendo a SPA em public/. O Next só serve os estáticos e
  // as rotas /api/*; a raiz aponta para o index.html.
  async rewrites() {
    return [{ source: "/", destination: "/index.html" }];
  }
};
