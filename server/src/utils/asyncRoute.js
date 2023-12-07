// Express 4 ignores rejected promises from handlers; forward them to the error handler.
export const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
