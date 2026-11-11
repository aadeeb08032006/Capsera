export class AppError extends Error {
  /**
   * @param {number} statusCode - HTTP status code
   * @param {string} code - Error code identifier
   * @param {string} message - Human-readable error message
   */
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = 'AppError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export default AppError;
