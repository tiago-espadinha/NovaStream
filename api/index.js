// Vercel serverless function: every /api/* request is rewritten here (see vercel.json)
// and handled by the same Express app that server/src/index.js runs locally.
export { app as default } from '../server/src/app.js';
