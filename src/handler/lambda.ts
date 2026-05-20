import { handle } from "hono/aws-lambda";
import { createApp } from "./app";
import { registerAuthRoutes } from "./auth";
import { registerArticleRoutes } from "./article";
import { registerAnnotationRoutes } from "./annotation";
import { registerProjectRoutes } from "./project";

const app = createApp();

registerAuthRoutes(app);
registerArticleRoutes(app);
registerAnnotationRoutes(app);
registerProjectRoutes(app);

// Export the Lambda handler
export const handler = handle(app);
