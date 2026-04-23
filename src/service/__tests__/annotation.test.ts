import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/secrets", () => ({
  getJwtSecret: vi.fn().mockResolvedValue("test-secret-at-least-32-chars-long!!"),
}));

// Mock the repository layer — avoids low-level S3 mock complexity
vi.mock("../../repository/annotation", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../repository/annotation")>();
  return {
    ...real, // keep buildEntryId (pure function, no I/O)
    appendAnnotation: vi.fn(),
  };
});

import { annotate } from "../annotation";
import { ValidationError } from "../errors";
import { WriteConflictError } from "../../repository/errors";
import { buildEntryId, appendAnnotation } from "../../repository/annotation";

const mockAppendAnnotation = vi.mocked(appendAnnotation);

const USER_ID = "00000000-0000-0000-0000-000000000123";
const BASE_REQUEST = {
  date: "2026-04-22",
  contentRef: "content/scripture/book-of-mormon/alma/32.json",
  contentTitle: "Alma 32",
  contentType: "scripture" as const,
  blockId: 5,
  text: "Great verse.",
};

function fakeEntry(annotations: Array<{ blockId: number; text: string; createdAt: string }>) {
  const entryId = buildEntryId(BASE_REQUEST.date, BASE_REQUEST.contentRef);
  return {
    entryId,
    userId: USER_ID,
    date: BASE_REQUEST.date,
    contentRef: BASE_REQUEST.contentRef,
    contentTitle: BASE_REQUEST.contentTitle,
    contentType: BASE_REQUEST.contentType,
    annotations,
    updatedAt: annotations[annotations.length - 1].createdAt,
  };
}

describe("annotate()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns annotation + noteCount on success", async () => {
    const annotation = { blockId: 5, text: "Great verse.", createdAt: "2026-04-22T10:00:00Z" };
    const entry = fakeEntry([annotation]);
    mockAppendAnnotation.mockResolvedValue({ entry, annotation });

    const result = await annotate(USER_ID, BASE_REQUEST);

    expect(result.entryId).toBe(entry.entryId);
    expect(result.annotation.blockId).toBe(5);
    expect(result.noteCount).toBe(1);
  });

  it("returns noteCount = 2 when appending to existing entry", async () => {
    const a1 = { blockId: 1, text: "First.", createdAt: "2026-04-22T09:00:00Z" };
    const a2 = { blockId: 5, text: "Great verse.", createdAt: "2026-04-22T10:00:00Z" };
    const entry = fakeEntry([a1, a2]);
    mockAppendAnnotation.mockResolvedValue({ entry, annotation: a2 });

    const result = await annotate(USER_ID, BASE_REQUEST);

    expect(result.noteCount).toBe(2);
  });

  it("entryId is deterministic for same date + contentRef", () => {
    const id1 = buildEntryId("2026-04-22", BASE_REQUEST.contentRef);
    const id2 = buildEntryId("2026-04-22", BASE_REQUEST.contentRef);
    expect(id1).toBe(id2);
  });

  it("different dates produce different entryIds", () => {
    const id1 = buildEntryId("2026-04-22", BASE_REQUEST.contentRef);
    const id2 = buildEntryId("2026-04-23", BASE_REQUEST.contentRef);
    expect(id1).not.toBe(id2);
  });

  it("throws ValidationError for non-content/ contentRef (never calls repository)", async () => {
    await expect(
      annotate(USER_ID, {
        ...BASE_REQUEST,
        contentRef: "users/other-user-id/entries/something.json",
      })
    ).rejects.toThrow(ValidationError);

    expect(mockAppendAnnotation).not.toHaveBeenCalled();
  });

  it("createdAt is server-assigned (ISO 8601 timestamp)", async () => {
    const before = new Date().toISOString();

    mockAppendAnnotation.mockImplementation(async (_uid, _eid, annotation) => ({
      entry: fakeEntry([annotation]),
      annotation,
    }));

    const result = await annotate(USER_ID, BASE_REQUEST);
    const after = new Date().toISOString();

    expect(result.annotation.createdAt >= before).toBe(true);
    expect(result.annotation.createdAt <= after).toBe(true);
  });

  it("propagates WriteConflictError from repository", async () => {
    mockAppendAnnotation.mockRejectedValue(new WriteConflictError("some-key"));
    await expect(annotate(USER_ID, BASE_REQUEST)).rejects.toThrow(WriteConflictError);
  });

  it("passes the caller userId to appendAnnotation (not from request body)", async () => {
    const annotation = { blockId: 5, text: "Note.", createdAt: "2026-04-22T10:00:00Z" };
    mockAppendAnnotation.mockResolvedValue({ entry: fakeEntry([annotation]), annotation });

    await annotate(USER_ID, BASE_REQUEST);

    expect(mockAppendAnnotation).toHaveBeenCalledWith(
      USER_ID,
      expect.any(String),
      expect.any(Object),
      expect.any(Object)
    );
  });
});
