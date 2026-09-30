"use client";

import { useState, type FormEvent } from "react";
import { Check, LoaderCircle, Plus, X } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { RECYCLABLE_MATERIALS, type RecyclableMaterial } from "@/lib/requests/validation";

interface StopRegistrationProps {
  stopId: string;
  requestedMaterial: RecyclableMaterial;
  estimatedKg: number;
  onRegistered: (routeCompleted: boolean) => void;
}

type KilogramsByMaterial = Record<RecyclableMaterial, string>;

export function StopRegistration({
  stopId,
  requestedMaterial,
  estimatedKg,
  onRegistered,
}: StopRegistrationProps) {
  const [kilograms, setKilograms] = useState<KilogramsByMaterial>(() => ({
    PET: "",
    Cartón: "",
    Aluminio: "",
    Vidrio: "",
    [requestedMaterial]: String(estimatedKg),
  }));
  const [showAll, setShowAll] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const visibleMaterials = showAll
    ? RECYCLABLE_MATERIALS
    : RECYCLABLE_MATERIALS.filter((material) => material === requestedMaterial);

  async function registerCollected() {
    setError("");
    const values = Object.fromEntries(
      RECYCLABLE_MATERIALS.map((material) => [
        material,
        kilograms[material].trim() === "" ? 0 : Number(kilograms[material]),
      ]),
    ) as Record<RecyclableMaterial, number>;

    if (Object.values(values).some((kg) => !Number.isFinite(kg) || kg < 0)) {
      setError("Revisa los kilos: deben ser números positivos.");
      return;
    }
    const total = Object.values(values).reduce((sum, kg) => sum + kg, 0);
    if (total <= 0 || total > 10000) {
      setError("Indica kilos reales mayores a 0 y hasta 10,000 en total.");
      return;
    }

    setSending(true);
    const { data, error: rpcError } = await getSupabaseClient().rpc(
      "registrar_recoleccion_materiales",
      {
        p_parada_id: stopId,
        p_kg_pet: values.PET,
        p_kg_carton: values.Cartón,
        p_kg_aluminio: values.Aluminio,
        p_kg_vidrio: values.Vidrio,
      },
    );
    setSending(false);

    if (rpcError || !data) {
      setError(
        rpcError?.code === "PGRST202"
          ? "Falta aplicar la migración 006 en Supabase."
          : (rpcError?.message ?? "No se pudo registrar la parada."),
      );
      return;
    }
    onRegistered(data.ruta_completada);
  }

  async function registerNotCollected() {
    if (!window.confirm("¿Marcar esta parada como no recolectada?")) return;
    setError("");
    setSending(true);
    const { data, error: rpcError } = await getSupabaseClient().rpc("registrar_recoleccion", {
      p_parada_id: stopId,
      p_recolectada: false,
      p_kg_reales: null,
    });
    setSending(false);

    if (rpcError || !data) {
      setError(rpcError?.message ?? "No se pudo registrar la parada.");
      return;
    }
    onRegistered(data.ruta_completada);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void registerCollected();
  }

  return (
    <form className="stop-register" onSubmit={handleSubmit}>
      <div className="stop-materials">
        {visibleMaterials.map((material) => (
          <label className="stop-material" key={material}>
            <span>{material}</span>
            <span className="input-with-unit stop-kg">
              <input
                aria-label={`Kilos reales de ${material}`}
                className="field-input"
                disabled={sending}
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  setKilograms((current) => ({ ...current, [material]: event.target.value }))
                }
                placeholder="0"
                step="0.1"
                type="number"
                value={kilograms[material]}
              />
              <span>kg</span>
            </span>
          </label>
        ))}
        {!showAll ? (
          <button
            className="stop-add-material"
            disabled={sending}
            onClick={() => setShowAll(true)}
            type="button"
          >
            <Plus size={14} aria-hidden="true" /> Otro material
          </button>
        ) : null}
      </div>

      <div className="stop-register-actions">
        <button className="submit-button stop-button" disabled={sending} type="submit">
          {sending ? (
            <LoaderCircle className="spin" size={16} aria-hidden="true" />
          ) : (
            <Check size={16} aria-hidden="true" />
          )}
          <span>Recolectada</span>
        </button>
        <button
          className="location-button stop-button"
          disabled={sending}
          onClick={() => void registerNotCollected()}
          type="button"
        >
          <X size={15} aria-hidden="true" />
          <span>No se pudo</span>
        </button>
      </div>

      {error ? (
        <span className="field-error stop-register-error" role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
