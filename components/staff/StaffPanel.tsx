"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertCircle, Clock, LoaderCircle } from "lucide-react";
import { AdminPanel } from "./AdminPanel";
import { CollectorPanel } from "./CollectorPanel";
import { NeighborPanel } from "./NeighborPanel";
import { StaffHeader } from "./StaffHeader";
import { UsersPanel } from "./UsersPanel";
import { signOut, useStaffSession } from "./useStaffSession";

const ROLE_LABELS = {
  administrador: "Administración",
  recolector: "Recolector",
  vecino: "Vecino",
} as const;

export function StaffPanel() {
  const router = useRouter();
  const session = useStaffSession();
  const [adminTab, setAdminTab] = useState<"solicitudes" | "usuarios">("solicitudes");

  useEffect(() => {
    if (session.status === "signed-out") router.replace("/login");
  }, [router, session.status]);

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  if (session.status === "ready") {
    return (
      <>
        <StaffHeader
          name={session.profile.nombre}
          roleLabel={ROLE_LABELS[session.profile.rol]}
          onSignOut={handleSignOut}
        />
        <main className="staff-main">
          {session.profile.rol === "administrador" ? (
            <>
              <nav className="staff-tabs" aria-label="Secciones del panel">
                <button
                  aria-pressed={adminTab === "solicitudes"}
                  className="staff-chip"
                  onClick={() => setAdminTab("solicitudes")}
                  type="button"
                >
                  Solicitudes y rutas
                </button>
                <button
                  aria-pressed={adminTab === "usuarios"}
                  className="staff-chip"
                  onClick={() => setAdminTab("usuarios")}
                  type="button"
                >
                  Usuarios
                </button>
              </nav>
              {adminTab === "solicitudes" ? <AdminPanel /> : <UsersPanel />}
            </>
          ) : session.profile.rol === "vecino" ? (
            <NeighborPanel userId={session.user.id} />
          ) : session.profile.aprobado ? (
            <CollectorPanel userId={session.user.id} />
          ) : (
            <div className="staff-main--center">
              <p className="staff-empty">
                <Clock size={18} aria-hidden="true" /> Tu cuenta de recolector está pendiente de
                aprobación. Un administrador debe activarla antes de que puedas recibir rutas.
              </p>
            </div>
          )}
        </main>
      </>
    );
  }

  return (
    <>
      <StaffHeader
        onSignOut={session.status === "no-profile" ? handleSignOut : undefined}
      />
      <main className="staff-main staff-main--center">
        {session.status === "no-profile" ? (
          <p className="form-status form-status--error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>Tu cuenta no tiene un rol asignado. Pide a un administrador que lo registre.</span>
          </p>
        ) : session.status === "error" ? (
          <p className="form-status form-status--error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{session.message}</span>
          </p>
        ) : (
          <p className="staff-loading" role="status">
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
            <span>Cargando…</span>
          </p>
        )}
      </main>
    </>
  );
}
