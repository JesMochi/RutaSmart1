"use client";

import { CircleDot, Package, Recycle, Wine } from "lucide-react";
import {
  RECYCLABLE_MATERIALS,
  type RecyclableMaterial,
} from "@/lib/requests/validation";

const MATERIAL_DETAILS: Record<
  RecyclableMaterial,
  { label: string; detail: string; color: string; icon: typeof Recycle }
> = {
  PET: { label: "PET", detail: "Botellas y envases", color: "pet", icon: Recycle },
  Cartón: { label: "Cartón", detail: "Cajas limpias", color: "cardboard", icon: Package },
  Aluminio: { label: "Aluminio", detail: "Latas y piezas", color: "aluminum", icon: CircleDot },
  Vidrio: { label: "Vidrio", detail: "Frascos y botellas", color: "glass", icon: Wine },
};

interface MaterialsSelectorProps {
  value: RecyclableMaterial | null;
  onChange: (material: RecyclableMaterial) => void;
  error?: string;
}

export function MaterialsSelector({ value, onChange, error }: MaterialsSelectorProps) {
  return (
    <fieldset className="space-y-3" aria-describedby={error ? "material-error" : undefined}>
      <legend className="field-label">¿Qué material tienes?</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {RECYCLABLE_MATERIALS.map((material) => {
          const detail = MATERIAL_DETAILS[material];
          const Icon = detail.icon;
          const selected = value === material;

          return (
            <button
              key={material}
              type="button"
              className={`material-option material-option--${detail.color}${
                selected ? " material-option--selected" : ""
              }`}
              aria-pressed={selected}
              onClick={() => onChange(material)}
            >
              <span className="material-icon">
                <Icon aria-hidden="true" size={21} strokeWidth={1.8} />
              </span>
              <span className="material-name">{detail.label}</span>
              <span className="material-detail">{detail.detail}</span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p id="material-error" className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}