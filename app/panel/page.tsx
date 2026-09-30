import type { Metadata } from "next";
import { StaffPanel } from "@/components/staff/StaffPanel";

export const metadata: Metadata = {
  title: "Panel · RutaSmart",
  robots: { index: false },
};

export default function PanelPage() {
  return <StaffPanel />;
}
