"use client";

import Link from "next/link";
import { LogOut, Recycle } from "lucide-react";

interface StaffHeaderProps {
  name?: string;
  roleLabel?: string;
  onSignOut?: () => void;
}

export function StaffHeader({ name, roleLabel, onSignOut }: StaffHeaderProps) {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link className="brand-lockup" href="/" aria-label="RutaSmart, inicio">
          <span className="brand-mark">
            <Recycle size={19} strokeWidth={2.1} aria-hidden="true" />
          </span>
          <span>RutaSmart</span>
        </Link>
        {onSignOut ? (
          <div className="staff-user">
            <span className="staff-user-name">
              {name}
              {roleLabel ? <small>{roleLabel}</small> : null}
            </span>
            <button className="location-button" onClick={onSignOut} type="button">
              <LogOut size={15} aria-hidden="true" />
              <span>Salir</span>
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
