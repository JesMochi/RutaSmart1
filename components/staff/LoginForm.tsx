"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, LoaderCircle, LogIn } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useStaffSession } from "./useStaffSession";

export function LoginForm() {
  const router = useRouter();
  const session = useStaffSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (session.status === "ready") router.replace("/panel");
  }, [router, session.status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Escribe tu correo y contraseña.");
      return;
    }

    setSending(true);
    try {
      const { error: signInError } = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(
          signInError.code === "email_not_confirmed"
            ? "La cuenta existe pero su correo no está confirmado. Confírmala en Supabase."
            : signInError.code === "invalid_credentials" || signInError.status === 400
              ? "Correo o contraseña incorrectos."
              : signInError.status === 429
                ? "Demasiados intentos. Espera unos minutos."
                : "No se pudo iniciar sesión. Intenta más tarde.",
        );
        return;
      }
      router.replace("/panel");
    } catch (unexpected) {
      console.error("Error al iniciar sesión", unexpected);
      const detail =
        unexpected instanceof Error ? `${unexpected.name}: ${unexpected.message}` : String(unexpected);
      setError(`El servicio no está disponible (${detail}). Intenta de nuevo.`);
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="request-form login-card" onSubmit={handleSubmit} noValidate>
      <div>
        <span className="eyebrow">Acceso</span>
        <h1 className="login-title">Iniciar sesión</h1>
        <p className="field-hint">
          ¿No tienes cuenta? <Link href="/registro">Regístrate</Link>
        </p>
      </div>

      <label className="field">
        <span className="field-label">Correo</span>
        <input
          autoComplete="email"
          className="field-input"
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
      </label>

      <label className="field">
        <span className="field-label">Contraseña</span>
        <input
          autoComplete="current-password"
          className="field-input"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
      </label>

      {session.status === "no-profile" ? (
        <p className="form-status form-status--error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>Tu cuenta no tiene un rol asignado. Pide a un administrador que lo registre.</span>
        </p>
      ) : null}

      {error ? (
        <p className="form-status form-status--error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : null}

      <button className="submit-button" disabled={sending} type="submit">
        {sending ? (
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
        ) : (
          <LogIn size={17} aria-hidden="true" />
        )}
        <span>{sending ? "Entrando" : "Entrar"}</span>
      </button>
    </form>
  );
}
