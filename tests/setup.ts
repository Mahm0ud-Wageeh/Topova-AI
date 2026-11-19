// Global test setup. The engine and route tests are pure/offline, so no
// DOM bootstrapping is required here. Add shared mocks or config below.
export {};
// Tests are offline unless a specific provider test explicitly stubs its environment.
process.env.GEMINI_API_KEY = "";
process.env.GROQ_API_KEY = "";
process.env.OPENROUTER_API_KEY = "";
