import { z } from "zod";

// ── Stored entities ───────────────────────────────────────────────────────────

export const UserProfileSchema = z.object({
  userId: z.string().uuid(),
  username: z.string().min(1), // always lowercase-normalized before storage
  passwordHash: z.string().min(1), // bcrypt hash, cost >= 12
  createdAt: z.string().datetime(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

/** S3 key: auth/users-by-name.json  — map of lowercase username → userId */
export const UsersByNameSchema = z.record(z.string(), z.string());
export type UsersByName = z.infer<typeof UsersByNameSchema>;

// ── JWT ───────────────────────────────────────────────────────────────────────

export const JwtPayloadSchema = z.object({
  sub: z.string().uuid(), // userId
  username: z.string().min(1), // lowercase
  iat: z.number().int(),
  exp: z.number().int(), // iat + 86400
});
export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

// ── API request schemas ───────────────────────────────────────────────────────

export const LoginRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string().datetime(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from your current password",
    path: ["newPassword"],
  });
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const CreateUserRequestSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username may only contain letters, numbers, hyphens, and underscores"),
  password: z.string().min(8),
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

// ── API error response shapes ─────────────────────────────────────────────────

export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.string()).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
