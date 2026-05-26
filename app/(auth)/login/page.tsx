import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Login - Obras FG",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Obras FG</h1>
          <p className="text-slate-300 mt-1 text-sm">
            FG Construcoes & Reformas
          </p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
