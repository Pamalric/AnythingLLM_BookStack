import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { ShellLayout } from "./pages/ShellLayout";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ShellLayout />}>
        <Route index element={<Placeholder title="Tableau de bord" />} />
        <Route path="documents" element={<Placeholder title="Documents" />} />
        <Route path="historique" element={<Placeholder title="Historique" />} />
        <Route path="configuration" element={<Placeholder title="Configuration" />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white/80 p-6 shadow-sm">
      <h1 className="font-display text-2xl text-ink">{title}</h1>
      <p className="mt-2 max-w-2xl text-slate-600">
        Écran prévu aux lots suivants. Le socle (lot 1) fournit navigation, auth et API santé.
      </p>
    </section>
  );
}
