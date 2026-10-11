import type { Plugin } from "vite";

const eventPagePath = "/_social/event.html";
const eventImageAlt =
  "Blue Mons character beside a bubble reading: you’ve been invited to play mons!";
const eventImageTags = [
  '<meta property="og:image" content="https://mons.link/event-og-card-v1.jpg" />',
  '<meta property="og:image:width" content="1200" />',
  '<meta property="og:image:height" content="630" />',
  '<meta property="og:image:type" content="image/jpeg" />',
  `<meta property="og:image:alt" content="${eventImageAlt}" />`,
  '<meta name="twitter:image" content="https://mons.link/event-twitter-card-v1.jpg" />',
  `<meta name="twitter:image:alt" content="${eventImageAlt}" />`,
].join("\n    ");

export const withEventSocialImages = (html: string): string => {
  let replaced = false;
  const result = html.replace(
    /<meta\b[^>]*\b(?:property|name)\s*=\s*["'](?:og:image(?::[^"']*)?|twitter:image(?::[^"']*)?)["'][^>]*>/gi,
    () => {
      if (replaced) {
        return "";
      }
      replaced = true;
      return eventImageTags;
    },
  );
  if (!replaced) {
    throw new Error("The app HTML is missing social image metadata.");
  }
  return result;
};

const isEventPage = (url: string): boolean =>
  new URL(url, "http://localhost").pathname.startsWith("/event/");

export const eventSocialMetadata = (): Plugin => ({
  name: "event-social-metadata",
  enforce: "post",
  transformIndexHtml(html, context) {
    return context.server && isEventPage(context.originalUrl ?? context.path)
      ? withEventSocialImages(html)
      : html;
  },
  generateBundle: {
    order: "post",
    handler(_options, bundle) {
      const index = bundle["index.html"];
      if (index?.type !== "asset") {
        throw new Error("The frontend build is missing index.html.");
      }
      const html =
        typeof index.source === "string"
          ? index.source
          : new TextDecoder().decode(index.source);
      this.emitFile({
        type: "asset",
        fileName: eventPagePath.slice(1),
        source: withEventSocialImages(html),
      });
    },
  },
  configurePreviewServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (request.url && isEventPage(request.url)) {
        const url = new URL(request.url, "http://localhost");
        request.url = `${eventPagePath}${url.search}`;
      }
      next();
    });
  },
});
