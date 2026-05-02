import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./lib/auth-context";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Nav } from "./components/Nav";

// Pages — lazy imports keep the initial bundle small
import { LoginPage } from "./pages/LoginPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";

// Placeholder pages — built in later tasks
import { DashboardPage } from "./pages/DashboardPage";
import { ScriptureBrowserPage } from "./pages/ScriptureBrowserPage";
import { ChapterViewPage } from "./pages/ChapterViewPage";
import { ArticleImportPage } from "./pages/ArticleImportPage";
import { ArticleBrowserPage } from "./pages/ArticleBrowserPage";
import { ArticleViewPage } from "./pages/ArticleViewPage";
import { PastEntryPage } from "./pages/PastEntryPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppShell() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Nav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scripture"
            element={
              <ProtectedRoute>
                <ScriptureBrowserPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scripture/:work"
            element={
              <ProtectedRoute>
                <ScriptureBrowserPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scripture/:work/:book"
            element={
              <ProtectedRoute>
                <ScriptureBrowserPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/scripture/:work/:book/:chapter"
            element={
              <ProtectedRoute>
                <ChapterViewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/import"
            element={
              <ProtectedRoute>
                <ArticleImportPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/articles"
            element={
              <ProtectedRoute>
                <ArticleBrowserPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/articles/:articleId"
            element={
              <ProtectedRoute>
                <ArticleViewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/entries/:entryId"
            element={
              <ProtectedRoute>
                <PastEntryPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
