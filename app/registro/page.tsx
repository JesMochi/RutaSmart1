import type { Metadata } from "next";
import { SignupForm } from "@/components/staff/SignupForm";
import { StaffHeader } from "@/components/staff/StaffHeader";

export const metadata: Metadata = {
  title: "Registro · RutaSmart",
};

export default function SignupPage() {
  return (
    <>
      <StaffHeader />
      <main className="staff-main staff-main--center">
        <SignupForm />
      </main>
    </>
  );
}
