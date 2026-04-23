import { useNavigate } from "react-router-dom";
import { ArticleImportModal } from "../components/ArticleImportModal";

/**
 * T19 — Article Import.
 * The modal is triggered from the nav; this page hosts it as a full-page overlay.
 * Navigating away from /import closes the modal.
 */
export function ArticleImportPage() {
  const navigate = useNavigate();

  return <ArticleImportModal onClose={() => navigate(-1)} />;
}
