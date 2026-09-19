import { ApiError } from '../utils/ApiError.js';

export function validate(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return next(ApiError.badRequest(issue?.message || 'Invalid request', parsed.error.issues));
    }
    req.validated = parsed.data;
    next();
  };
}
