"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, Recycle } from "lucide-react";

interface PublicImpact {
  kg_recolectados: number;
  combustible_ahorrado_litros: number;
}

type ImpactState = "loading" | "ready" | "unavailable";

const numberFormat = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 1,
});

export function ImpactCounter() {
  const [impact, setImpact] = useState<PublicImpact | null>(null);
  const [state, setState] = useState<ImpactState>("loading");

  useEffect(() => {
    let active = true;

    async function refreshImpact() {
      try {
        const response = await fetch("/api/impacto", { cache: "no-store" });
        if (!response.ok) throw new Error("Impacto no disponible.");
        const nextImpact = (await response.json()) as PublicImpact;

        if (
          !Number.isFinite(nextImpact.kg_recolectados) ||
          !Number.isFinite(nextImpact.combustible_ahorrado_litros)
        ) {
          throw new Error("Respuesta de impacto inválida.");
        }

        if (active) {
          setImpact(nextImpact);
          setState("ready");
        }
      } catch {
        if (active) setState("unavailable");
      }
    }

    void refreshImpact();
    const intervalId = window.setInterval(() => void refreshImpact(), 60_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <section className="impact-section" id="impacto" aria-labelledby="impact-title">
      <div className="impact-intro">
        <span className="eyebrow eyebrow--light">
          <Recycle size={15} aria-hidden="true" />
          Impacto de la comunidad
        </span>
        <h2 id="impact-title">Cada kilo vuelve a contar.</h2>
        <p>Datos de recolecciones registradas en la zona.</p>
      </div>

      <div className="impact-values" aria-live="polite" aria-busy={state === "loading"}>
        <div className="impact-value">
          <span className="impact-number">
            {state === "ready" && impact
              ? numberFormat.format(impact.kg_recolectados)
              : state === "loading"
                ? "…"
                : "—"}
          </span>
          <span className="impact-unit">kg recolectados</span>
        </div>
        <div className="impact-divider" aria-hidden="true" />
        <div className="impact-value">
          <span className="impact-number">
            {state === "ready" && impact
              ? numberFormat.format(impact.combustible_ahorrado_litros)
              : state === "loading"
                ? "…"
                : "—"}
          </span>
          <span className="impact-unit">
            <ArrowDownRight size={15} aria-hidden="true" /> litros ahorrados estimados
          </span>
        </div>
        {state === "unavailable" ? (
          <p className="impact-unavailable" role="status">
            Indicadores temporalmente no disponibles.
          </p>
        ) : null}
      </div>
    </section>
  );
}