import { createApp } from "../backend/src/app";

// Reuse the Express API and its database client across warm invocations.
// Vercel serves frontend/dist separately; no listener or local data writes here.
export default createApp({ serveFrontend: false }).app;
