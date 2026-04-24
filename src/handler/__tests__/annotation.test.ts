import { describe, it, expect, vi, beforeEach } from "vitest";


vi.mock("../../service/auth", () => ({
  verifyToken: vi.fn(),
  isAdmin: vi.fn(),
}));

vi.mock("../../service/annotation", () => ({
  annotate: vi.fn(),
}));

import * as authService from "../../service/auth";
import * as annotationService from "../../service/annotation";
import { ValidationError } from "../../service/errors";
import { WriteConflictError } from "../../repository/errors";
import { createApp } from "../app";
import { registerAnnotationRoutes } from "../annotation";

const mockVerifyToken = vi.mocked(authService.verifyToken);
const mockAnnotate = vi.mocked(annotationService.annotate);

const FAKE_PAYLOAD = { sub: "user-uuid", username: "peter", iat: 1000000, exp: 9999999 };

function buildApp() {
  const app = createApp();
  registerAnnotationRoutes(app);
  return app;
}

async function req(
  app: ReturnType<typeof buildApp>,
  body?: unknown,
  token?: string
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return app.request("/api/entries/annotate", {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : (undefined as any),
  });
}

const VALID_BODY = {
  date: "2026-04-22",
  contentRef: "content/scripture/book-of-mormon/alma/32.json",
  contentTitle: "Alma 32",
  contentType: "scripture",
  blockId: 5,
  text: "Great verse.",
};

describe("POST /entries/annotate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without a JWT", async () => {
    const app = buildApp();
    const res = await req(app, VALID_BODY);
    expect(res.status).toBe(401);
  });

  it("returns 200 with annotation on success", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockAnnotate.mockResolvedValue({
      entryId: "2026-04-22_abc123",
      annotation: { blockId: 5, text: "Great verse.", createdAt: "2026-04-22T10:00:00Z" },
      noteCount: 1,
    });

    const app = buildApp();
    const res = await req(app, VALID_BODY, "valid-token");

    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.entryId).toBe("2026-04-22_abc123");
    expect(body.noteCount).toBe(1);
  });

  it("returns 422 on Zod validation failure", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);

    const app = buildApp();
    const res = await req(app, { ...VALID_BODY, text: "" }, "valid-token");

    expect(res.status).toBe(422);
  });

  it("returns 422 when contentRef uses a user-scoped path", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockAnnotate.mockRejectedValue(new ValidationError({ contentRef: "Must start with content/" }));

    const app = buildApp();
    const res = await req(app, { ...VALID_BODY, contentRef: "users/other/entries/x.json" }, "valid-token");

    expect(res.status).toBe(422);
  });

  it("returns 409 on write conflict", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockAnnotate.mockRejectedValue(new WriteConflictError("test-key"));

    const app = buildApp();
    const res = await req(app, VALID_BODY, "valid-token");

    expect(res.status).toBe(409);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("WRITE_CONFLICT");
  });

  it("userId comes from JWT sub, not request body", async () => {
    mockVerifyToken.mockResolvedValue(FAKE_PAYLOAD);
    mockAnnotate.mockResolvedValue({
      entryId: "2026-04-22_abc123",
      annotation: { blockId: 5, text: "Note.", createdAt: "2026-04-22T10:00:00Z" },
      noteCount: 1,
    });

    const app = buildApp();
    await req(app, VALID_BODY, "valid-token");

    // Verify annotate() was called with JWT sub, not any userId from the request body
    expect(mockAnnotate).toHaveBeenCalledWith(
      FAKE_PAYLOAD.sub,
      expect.objectContaining({ contentRef: VALID_BODY.contentRef })
    );
  });
});
