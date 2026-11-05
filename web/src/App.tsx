import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Loading } from "./components/ui";
import { safePath } from "./lib/util";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import { ForgotPasswordPage, LinkErrorPage, LoginPage, ResetPasswordPage, SignupPage } from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import HistoryPage from "./pages/History";
import InvitePage from "./pages/Invite";
import ResidencesPage from "./pages/Residences";
import ResidenceDetail from "./pages/ResidenceDetail";
import TempKeysPage from "./pages/TempKeys";
import DevicesPage from "./pages/Devices";
import OrganizationsPage from "./pages/Organizations";
import AuditPage from "./pages/Audit";
import AccountPage from "./pages/Account";
import GuestKeyPage from "./pages/GuestKey";
import { PrivacyPage, TermsPage } from "./pages/Legal";
import { ApprovalsPage, ResidentsPage } from "./pages/People";
import ReportsPage from "./pages/Reports";
import AnnouncementsPage from "./pages/Announcements";
import AdminsPage from "./pages/Admins";
import HomeSetupPage from "./pages/HomeSetup";
import OrgRequestPage from "./pages/OrgRequest";
import { lazy, Suspense } from "react";
const InstallDevicePage = lazy(() => import("./pages/InstallDevice"));
import { MfaVerifyPage } from "./pages/Mfa";
import { UnlockProvider } from "./components/UnlockProvider";
import LandingPage from "./pages/Landing";
const PrivacyCenterPage = lazy(() => import("./pages/PrivacyCenter"));

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, needsMfa } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace state={loc.pathname === "/" ? undefined : { from: loc.pathname }} />;
  if (needsMfa) {
    sessionStorage.setItem("dc.voltar", loc.pathname);
    return <Navigate to="/verificar-2fa" replace />;
  }
  return <>{children}</>;
}

function Guard({ allow, children }: { allow: (a: ReturnType<typeof useAuth>) => boolean; children: ReactNode }) {
  const auth = useAuth();
  return allow(auth) ? <>{children}</> : <Navigate to="/" replace />;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (session) return <Navigate to={safePath((loc.state as { from?: string } | null)?.from)} replace />;
  return <>{children}</>;
}

function MfaGate() {
  const { session, loading, needsMfa } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  if (!needsMfa) return <Navigate to="/" replace />;
  return <MfaVerifyPage />;
}

// Link do e-mail vencido/usado: o Supabase volta com "#error=..." na URL. Mostramos uma tela que explica.
(function linkErrorFromHash() {
  const h = new URLSearchParams(window.location.hash.slice(1));
  if (h.get("error") || h.get("error_code")) {
    const code = h.get("error_code") ?? "";
    window.history.replaceState(null, "", "/link-invalido?codigo=" + encodeURIComponent(code));
  }
})();

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route path="/cadastro" element={<PublicOnly><SignupPage /></PublicOnly>} />
          <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
          <Route path="/link-invalido" element={<LinkErrorPage />} />
          <Route path="/redefinir-senha" element={<RequireAuth><ResetPasswordPage /></RequireAuth>} />
          <Route path="/k/:token" element={<GuestKeyPage />} />
          <Route path="/verificar-2fa" element={<MfaGate />} />
          <Route path="/privacidade" element={<PrivacyPage />} />
          <Route path="/termos" element={<TermsPage />} />
          <Route path="/sobre" element={<LandingPage />} />
          <Route path="/bem-vindo" element={<Navigate to="/sobre" replace />} />

          <Route element={<RequireAuth><UnlockProvider><Layout /></UnlockProvider></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="historico" element={<HistoryPage />} />
            <Route path="convite" element={<InvitePage />} />
            <Route path="convite/:code" element={<InvitePage />} />
            <Route path="conta" element={<AccountPage />} />
            <Route path="seguranca" element={<Suspense fallback={<Loading />}><PrivacyCenterPage /></Suspense>} />
            <Route path="comunicados" element={<AnnouncementsPage />} />
            <Route path="configurar-casa" element={<HomeSetupPage />} />
            <Route path="solicitar-cadastro" element={<OrgRequestPage />} />
            <Route path="aprovacoes" element={<Guard allow={(a) => a.isAdmin || a.isTitular}><ApprovalsPage /></Guard>} />
            <Route path="moradores" element={<Guard allow={(a) => a.isAdmin || a.isTitular}><ResidentsPage /></Guard>} />
            <Route path="relatorios" element={<Guard allow={(a) => a.isAdmin}><ReportsPage /></Guard>} />
            <Route path="administradores" element={<Guard allow={(a) => a.isAdmin}><AdminsPage /></Guard>} />
            <Route path="residencias" element={<Guard allow={(a) => a.isAdmin || a.isTitular}><ResidencesPage /></Guard>} />
            <Route path="residencias/:id" element={<Guard allow={(a) => a.isAdmin || a.isTitular}><ResidenceDetail /></Guard>} />
            <Route path="chaves" element={<Guard allow={(a) => a.isAdmin || a.isTitular}><TempKeysPage /></Guard>} />
            <Route path="dispositivos" element={<Guard allow={(a) => a.isAdmin}><DevicesPage /></Guard>} />
            <Route path="instalar" element={<Guard allow={(a) => a.isAdmin}><Suspense fallback={<Loading />}><InstallDevicePage /></Suspense></Guard>} />
            <Route path="auditoria" element={<Guard allow={(a) => a.isAdmin}><AuditPage /></Guard>} />
            <Route path="organizacoes" element={<Guard allow={(a) => a.isSuper}><OrganizationsPage /></Guard>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
