"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, Trash2, UserPlus } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { NewStaffUserErrors, StaffRole } from "@/lib/users/validation";

interface StaffUser {
  user_id: string;
  nombre: string;
  rol: StaffRole;
  email: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; users: StaffUser[]; currentUserId: string };

type Feedback = { kind: "success" | "error"; message: string } | null;

const ROLE_LABELS: Record<StaffRole, string> = {
  administrador: "Administrador",
  recolector: "Recolector",
};

async function callUsersApi(init?: RequestInit & { query?: string }): Promise<Response> {
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");

  return fetch(`/api/usuarios${init?.query ?? ""}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function loadUsers(): Promise<{ users: StaffUser[]; currentUserId: string }> {
  const response = await callUsersApi({ cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response, "No se pudieron cargar los usuarios."));
  const body = (await response.json()) as { usuarios: StaffUser[]; currentUserId: string };
  return { users: body.usuarios, currentUserId: body.currentUserId };
}

export function UsersPanel() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<StaffRole>("recolector");
  const [errors, setErrors] = useState<NewStaffUserErrors>({});
  const [working, setWorking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let active = true;
    loadUsers().then(
      (result) => {
        if (active) setState({ status: "ready", ...result });
      },
      (error: unknown) => {
        if (active) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "No se pudieron cargar los usuarios.",
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFeedback(null);
    setWorking(true);

    try {
      const response = await callUsersApi({
        method: "POST",
        body: JSON.stringify({ nombre, email, password, rol }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          fields?: NewStaffUserErrors;
        };
        setErrors(body.fields ?? {});
        throw new Error(body.error ?? "No se pudo crear el usuario.");
      }

      setFeedback({
        kind: "success",
        message: `Cuenta creada. ${nombre.trim()} ya puede entrar con ${email.trim().toLowerCase()}.`,
      });
      setNombre("");
      setEmail("");
      setPassword("");
      setRol("recolector");
      setReloadKey((key) => key + 1);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo crear el usuario.",
      });
    } finally {
      setWorking(false);
    }
  }

  async function handleDelete(user: StaffUser) {
    if (!window.confirm(`¿Eliminar la cuenta de ${user.nombre}? No se puede deshacer.`)) return;

    setFeedback(null);
    setWorking(true);
    try {
      const response = await callUsersApi({
        method: "DELETE",
        query: `?id=${encodeURIComponent(user.user_id)}`,
      });
      if (!response.ok) throw new Error(await readError(response, "No se pudo eliminar el usuario."));
      setFeedback({ kind: "success", message: `Se eliminó la cuenta de ${user.nombre}.` });
      setReloadKey((key) => key + 1);
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo eliminar el usuario.",
      });
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="staff-stack staff-stack--wide">
      <section className="staff-section" aria-labelledby="users-title">
        <div className="staff-section-heading">
          <div>
            <span className="eyebrow">Administración</span>
            <h1 id="users-title">Usuarios del equipo</h1>
          </div>
        </div>

        {state.status === "loading" ? (
          <p className="staff-loading" role="status">
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
            <span>Cargando usuarios…</span>
          </p>
        ) : state.status === "error" ? (
          <p className="form-status form-status--error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{state.message}</span>
          </p>
        ) : state.users.length === 0 ? (
          <p className="staff-empty">Aún no hay usuarios registrados.</p>
        ) : (
          <ul className="request-list">
            {state.users.map((user) => (
              <li className="request-row" key={user.user_id}>
                <div className="stop-body">
                  <strong>
                    {user.nombre}
                    {user.user_id === state.currentUserId ? " (tú)" : ""}
                  </strong>
                  <span>{user.email || "Sin correo"}</span>
                </div>
                <span className="staff-badge">{ROLE_LABELS[user.rol]}</span>
                {user.user_id !== state.currentUserId ? (
                  <button
                    aria-label={`Eliminar a ${user.nombre}`}
                    className="icon-button"
                    disabled={working}
                    onClick={() => void handleDelete(user)}
                    title="Eliminar usuario"
                    type="button"
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="staff-side">
        <form className="staff-card staff-assign" onSubmit={handleCreate} noValidate>
          <h2>Nuevo usuario</h2>

          <label className="field">
            <span className="field-label">Nombre</span>
            <input
              autoComplete="off"
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
              autoComplete="off"
              className="field-input"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
            {errors.email ? <span className="field-error">{errors.email}</span> : null}
          </label>

          <label className="field">
            <span className="field-label">Contraseña inicial</span>
            <input
              autoComplete="new-password"
              className="field-input"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              type="text"
              value={password}
            />
            <span className="field-hint">Mínimo 8 caracteres. Compártela con la persona de forma privada.</span>
            {errors.password ? <span className="field-error">{errors.password}</span> : null}
          </label>

          <label className="field">
            <span className="field-label">Rol</span>
            <select
              className="field-input"
              onChange={(event) => setRol(event.target.value as StaffRole)}
              value={rol}
            >
              <option value="recolector">Recolector</option>
              <option value="administrador">Administrador</option>
            </select>
            {errors.rol ? <span className="field-error">{errors.rol}</span> : null}
          </label>

          <button className="submit-button" disabled={working} type="submit">
            {working ? (
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
            ) : (
              <UserPlus size={17} aria-hidden="true" />
            )}
            <span>{working ? "Guardando" : "Crear usuario"}</span>
          </button>

          {feedback ? (
            <p
              className={`form-status form-status--${feedback.kind}`}
              role={feedback.kind === "error" ? "alert" : "status"}
            >
              {feedback.kind === "success" ? (
                <CheckCircle2 size={18} aria-hidden="true" />
              ) : (
                <AlertCircle size={18} aria-hidden="true" />
              )}
              <span>{feedback.message}</span>
            </p>
          ) : null}
        </form>
      </aside>
    </div>
  );
}
