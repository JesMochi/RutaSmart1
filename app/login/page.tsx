import type { Metadata } from "next";
import { LoginForm } from "@/components/staff/LoginForm";
import { StaffHeader } from "@/components/staff/StaffHeader";

export const metadata: Metadata = {
  title: "Iniciar sesión · RutaSmart",
};

export default function LoginPage() {
  return (
    <>
      <StaffHeader />
      <main className="staff-main staff-main--center">
        <LoginForm />
      </main>
    </>
  );
}
