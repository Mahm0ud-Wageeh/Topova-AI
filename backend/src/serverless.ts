import { createApp } from "./app";

// The CDN hosts the SPA. Reuse the API and Prisma client on warm invocations.
export default createApp({ serveFrontend: false }).app;
