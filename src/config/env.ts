import { z } from "zod";

const EnvSchema = z.object({
  /** S3 bucket for all app data (content, users, auth) */
  BUCKET_NAME: z.string().min(1),
  /** Deployment environment, e.g. "dev" or "prod" */
  ENV: z.string().min(1),
  /** Username that is granted admin privileges (defaults to "peter") */
  ADMIN_USERNAME: z.string().min(1).default("peter"),
  /** CloudFront domain used for CORS origin restriction.
   *  Optional — defaults to "*" on first deploy before CloudFront exists,
   *  and for local dev (where there is no CloudFront). */
  CLOUDFRONT_DOMAIN: z.string().default(""),
});

type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join(", ");
    throw new Error(`[config] Invalid environment configuration: ${missing}`);
  }
  return result.data;
}

// Eagerly validated at module load time — Lambda cold start fails fast if misconfigured.
export const env: Readonly<Env> = loadEnv();
