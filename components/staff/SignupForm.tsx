"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AlertCircle, Home, LoaderCircle, MailCheck, Truck, UserPlus } from "lucide-react";
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
  const [confirmationSent, setConfirmationSent] = useState(false);

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

    // Los bots llenan el campo oculto; se simula éxito sin crear la cuenta.
    if (honeypot.trim()) {
      setConfirmationSent(true);
      return;
    }

    setSending(true);
    try {
      // El perfil lo crea el trigger perfiles_crear_al_registrarse con este rol y nombre.
      const { data, error } = await getSupabaseClient().auth.signUp({
        email: validation.input.email,
        password: validation.input.password,
        options: {
          data: { nombre: validation.input.nombre, rol: validation.input.rol },
          emailRedirectTo: `${window.location.origin}/panel`,
        },
      });

      if (error) {
        if (error.code === "user_already_exists" || error.code === "email_exists") {
          setErrors({ email: "Ya existe una cuenta con ese correo." });
          throw new Error("Ya existe una cuenta con ese correo. Inicia sesión.");
        }
        if (error.code === "weak_password") {
          setErrors({ password: "Usa una contraseña más segura." });
          throw new Error("La contraseña es demasiado débil.");
        }
        if (error.code === "signup_disabled") {
          throw new Error("El registro está desactivado en Supabase.");
        }
        if (error.status === 429) {
          throw new Error("Demasiados registros seguidos. Espera unos minutos.");
        }
        throw new Error("No se pudo completar el registro. Intenta más tarde.");
      }

      // Con confirmación por correo activa, un correo ya registrado devuelve un usuario sin identidades.
      if (data.user && data.user.identities?.length === 0) {
        setErrors({ email: "Ya existe una cuenta con ese correo." });
        throw new Error("Ya existe una cuenta con ese correo. Inicia sesión.");
      }

      if (data.session) {
        router.replace("/panel");
        return;
      }
      setConfirmationSent(true);
      setSending(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo completar el registro.");
      setSending(false);
    }
  }

  if (confirmationSent) {
    return (
      <div className="request-form login-card">
        <span className="eyebrow">Revisa tu correo</span>
        <h1 className="login-title">Confirma tu cuenta</h1>
        <p className="form-status form-status--success" role="status">
          <MailCheck size={18} aria-hidden="true" />
          <span>
            Te enviamos un enlace de confirmación a {email.trim().toLowerCase()}. Ábrelo y luego
            inicia sesión.
          </span>
        </p>
        <Link className="submit-button" href="/login">
          Ir a iniciar sesión
        </Link>
      </div>
    );
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
