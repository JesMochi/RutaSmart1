"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AlertCircle, Home, LoaderCircle, Truck, UserPlus } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  parseNewStaffUserInput,
  PUBLIC_SIGNUP_ROLES,
  type NewStaffUserErrors,
  type StaffRole,
} from "@/lib/users/validation";

const ROLE_OPTIONS: Array<{ value: StaffRole; label: string; detail: string; icon: typeof Home }> = [
  {
    value: "vecino",
    label: "Vecino",
    detail: "Solicito recolecciones y sigo su estado.",
    icon: Home,
  },
  {
    value: "recolector",
    label: "Recolector",
    detail: "Recibo rutas. Requiere aprobación.",
    icon: Truck,
  },
];

export function SignupForm() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<StaffRole>("vecino");
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<NewStaffUserErrors>({});
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setMessage("");

    const payload = { nombre, email, password, rol, honeypot };
    const validation = parseNewStaffUserInput(payload, PUBLIC_SIGNUP_ROLES);
    if (!validation.input) {
      setErrors(validation.errors);
      return;
    }

    setSending(true);
    try {
      const response = await fetch("/api/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: NewStaffUserErrors;
      };
      if (!response.ok) {
        setErrors(body.fields ?? {});
        throw new Error(body.error ?? "No se pudo completar el registro.");
      }

      const { error } = await getSupabaseClient().auth.signInWithPassword({
        email: validation.input.email,
        password: validation.input.password,
      });
      router.replace(error ? "/login" : "/panel");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo completar el registro.");
      setSending(false);
    }
  }

  return (
    <form className="request-form login-card" onSubmit={handleSubmit} noValidate>
      <div>
        <span className="eyebrow">Crear cuenta</span>
        <h1 className="login-title">Regístrate</h1>
        <p className="field-hint">
          ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="field-label">¿Cómo participas?</legend>
        <div className="grid grid-cols-2 gap-2">
          {ROLE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                aria-pressed={rol === option.value}
                className={`material-option material-option--pet${
                  rol === option.value ? " material-option--selected" : ""
                }`}
                key={option.value}
                onClick={() => setRol(option.value)}
                type="button"
              >
                <span className="material-icon">
                  <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
                </span>
                <span className="material-name">{option.label}</span>
                <span className="material-detail">{option.detail}</span>
              </button>
            );
          })}
        </div>
        {errors.rol ? <span className="field-error">{errors.rol}</span> : null}
      </fieldset>

      <label className="field">
        <span className="field-label">Nombre</span>
        <input
          autoComplete="name"
          className="field-input"
          maxLength={80}
          onChange={(event) => setNombre(event.target.value)}
          value={nombre}
        />
        {errors.nombre ? <span className="field-error">{errors.nombre}</span> : null}
      </label>

      <label className="field">
        <span className="field-label">Correo</span>
        <input
          autoComplete="email"
          className="field-input"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
        {errors.email ? <span className="field-error">{errors.email}</span> : null}
      </label>

      <label className="field">
        <span className="field-label">Contraseña</span>
        <input
          autoComplete="new-password"
          className="field-input"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />
        <span className="field-hint">Mínimo 8 caracteres.</span>
        {errors.password ? <span className="field-error">{errors.password}</span> : null}
      </label>

      <label className="honeypot-field" aria-hidden="true">
        Sitio web
        <input
          autoComplete="off"
          name="sitioWeb"
          onChange={(event) => setHoneypot(event.target.value)}
          tabIndex={-1}
          value={honeypot}
        />
      </label>

      {message ? (
        <p className="form-status form-status--error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{message}</span>
        </p>
      ) : null}

      <button className="submit-button" disabled={sending} type="submit">
        {sending ? (
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
        ) : (
          <UserPlus size={17} aria-hidden="true" />
        )}
        <span>{sending ? "Creando cuenta" : "Crear cuenta"}</span>
      </button>
    </form>
  );
}
