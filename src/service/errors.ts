/**
 * Thrown when login credentials are invalid (wrong password OR unknown username).
 * The message is deliberately generic to prevent user enumeration.
 */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid username or password");
    this.name = "InvalidCredentialsError";
  }
}

/**
 * Thrown when a JWT is missing, expired, or malformed.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Thrown when the caller does not have sufficient privileges (e.g. non-admin
 * attempting a POST /admin/users).
 */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Thrown on input that passes Zod schema validation but fails business rules
 * (e.g. new password identical to current password, username already taken).
 */
export class ValidationError extends Error {
  readonly fields: Record<string, string>;

  constructor(fields: Record<string, string>) {
    super("Validation failed");
    this.name = "ValidationError";
    this.fields = fields;
  }
}

/**
 * Thrown when a username is already registered.
 */
export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`Username "${username}" is already taken`);
    this.name = "UsernameTakenError";
  }
}
