"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { AdminPanel } from "./AdminPanel";
import { CollectorPanel } from "./CollectorPanel";
import { StaffHeader } from "./StaffHeader";
import { signOut, useStaffSession } from "./useStaffSession";

const ROLE_LABELS = {
  administrador: "Administración",
  recolector: "Recolector",
} as const;

export function StaffPanel() {
  const router = useRouter();
  const session = useStaffSession();

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
            <AdminPanel />
          ) : (
            <CollectorPanel userId={session.user.id} />
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
