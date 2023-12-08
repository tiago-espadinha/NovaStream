// Local development server. On Vercel, api/index.js serves the same app as a function.
import { app } from './app.js';

const port = process.env.PORT || 4000;
if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set: sign-in and saved media are disabled (see server/.env.example).');
}
app.listen(port, () => {
  console.log(`Nova Stream API listening on http://localhost:${port}`);
});
