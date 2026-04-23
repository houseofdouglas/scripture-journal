import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { env } from "./env";

const ssmClient = new SSMClient({});

/** Module-level cache — populated once per Lambda instance lifetime. */
let cachedJwtSecret: string | undefined;

/**
 * Returns the JWT signing secret from SSM Parameter Store.
 *
 * The value is fetched exactly once per Lambda instance; subsequent calls
 * return the cached string without any I/O. Lambda cold start is the only
 * time SSM is consulted, so the latency cost is paid once.
 *
 * An SSM failure at cold start propagates as an unhandled rejection, which
 * Lambda surfaces as a 500 to callers. This is intentional — the service
 * must not start without a valid secret.
 */
export async function getJwtSecret(): Promise<string> {
  if (cachedJwtSecret !== undefined) {
    return cachedJwtSecret;
  }

  const paramName = `/scripture-journal/${env.ENV}/jwt-secret`;

  const response = await ssmClient.send(
    new GetParameterCommand({
      Name: paramName,
      WithDecryption: true,
    })
  );

  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error(`[secrets] SSM parameter "${paramName}" returned an empty value`);
  }

  cachedJwtSecret = value;
  return cachedJwtSecret;
}
