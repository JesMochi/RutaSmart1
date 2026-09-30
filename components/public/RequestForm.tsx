"use client";

import dynamic from "next/dynamic";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  MapPin,
  Navigation,
  Send,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { MaterialsSelector } from "./MaterialsSelector";
import type { MapLocation } from "./LocationMap";
import {
  parsePublicRequestInput,
  type PublicRequestErrors,
  type RecyclableMaterial,
} from "@/lib/requests/validation";
import { getSupabaseClient } from "@/lib/supabase/client";

const LocationMap = dynamic(() => import("./LocationMap"), {
  ssr: false,
  loading: () => <div className="map-loading">Cargando mapa…</div>,
});

/** Si hay sesión, la solicitud queda ligada a la cuenta; si no, se envía como anónima. */
async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

interface ApiErrorResponse {
  error?: string;
  fields?: PublicRequestErrors;
}

export function RequestForm() {
  const [material, setMaterial] = useState<RecyclableMaterial | null>(null);
  const [colonia, setColonia] = useState("");
  const [direccion, setDireccion] = useState("");
  const [kilograms, setKilograms] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState<MapLocation | null>(null);
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<PublicRequestErrors>({});
  const [message, setMessage] = useState("");
  const [submissionState, setSubmissionState] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [locating, setLocating] = useState(false);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("Este navegador no permite obtener la ubicación.");
      setSubmissionState("error");
      return;
    }

    setLocating(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocating(false);
      },
      () => {
        setMessage("No pudimos obtener tu ubicación. Puedes marcarla en el mapa.");
        setSubmissionState("error");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setMessage("");

    const payload = {
      zonaId: process.env.NEXT_PUBLIC_RUTA_ZONA_ID ?? "",
      colonia,
      direccion,
      latitud: location?.latitude ?? null,
      longitud: location?.longitude ?? null,
      material,
      kgEstimados: Number(kilograms),
      telefono: phone,
      honeypot,
    };
    const validation = parsePublicRequestInput(payload);

    if (!validation.input) {
      setErrors(validation.errors);
      setMessage("Revisa los campos marcados para continuar.");
      setSubmissionState("error");
      return;
    }

    setSubmissionState("sending");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const accessToken = await getAccessToken();
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const response = await fetch("/api/solicitudes", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as ApiErrorResponse;

      if (!response.ok) {
        setErrors(result.fields ?? {});
        throw new Error(result.error ?? "No se pudo enviar la solicitud.");
      }

      setMessage("¡Listo! Recibimos tu solicitud de recolección.");
      setSubmissionState("success");
      setMaterial(null);
      setColonia("");
      setDireccion("");
      setKilograms("");
      setPhone("");
      setLocation(null);
      setHoneypot("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No fue posible conectar con el servicio. Intenta más tarde.",
      );
      setSubmissionState("error");
    }
  }

  return (
    <form className="request-form" onSubmit={handleSubmit} noValidate>
      {errors.zonaId ? (
        <p className="field-error" role="alert">
          No hay una zona válida configurada. Define NEXT_PUBLIC_RUTA_ZONA_ID.
        </p>
      ) : null}
      <div className="form-section form-materials">
        <MaterialsSelector
          value={material}
          onChange={(nextMaterial) => {
            setMaterial(nextMaterial);
            setErrors((current) => ({ ...current, material: undefined }));
          }}
          error={errors.material}
        />
      </div>

      <div className="form-grid">
        <label className="field">
          <span className="field-label">Colonia</span>
          <input
            autoComplete="address-level3"
            className="field-input"
            maxLength={120}
            name="colonia"
            onChange={(event) => setColonia(event.target.value)}
            placeholder="Ej. Jardines de Morelos"
            required
            value={colonia}
          />
          {errors.colonia ? <span className="field-error">{errors.colonia}</span> : null}
        </label>

        <label className="field">
          <span className="field-label">Dirección de recolección</span>
          <input
            autoComplete="street-address"
            className="field-input"
            maxLength={240}
            name="direccion"
            onChange={(event) => setDireccion(event.target.value)}
            placeholder="Calle, número y referencias"
            required
            value={direccion}
          />
          {errors.direccion ? <span className="field-error">{errors.direccion}</span> : null}
        </label>
      </div>

      <div className="field location-field">
        <div className="location-heading">
          <div>
            <span className="field-label">¿Dónde recogemos?</span>
            <p className="field-hint">Toca el mapa para marcar el punto exacto.</p>
          </div>
          <button
            className="location-button"
            disabled={locating}
            onClick={useCurrentLocation}
            type="button"
          >
            {locating ? (
              <LoaderCircle size={16} className="spin" aria-hidden="true" />
            ) : (
              <Navigation size={16} aria-hidden="true" />
            )}
            <span>{locating ? "Buscando" : "Usar mi ubicación"}</span>
          </button>
        </div>
        <div className="map-frame">
          <LocationMap location={location} onSelect={setLocation} />
          {!location ? (
            <span className="map-empty-hint">
              <MapPin size={15} aria-hidden="true" />
              <span>Selecciona un punto</span>
            </span>
          ) : null}
        </div>
        {location ? (
          <p className="coordinate-caption">
            Punto marcado: {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
          </p>
        ) : null}
        {errors.latitud || errors.longitud ? (
          <span className="field-error" role="alert">
            {errors.latitud ?? errors.longitud}
          </span>
        ) : null}
      </div>

      <div className="form-grid form-grid--compact">
        <label className="field">
          <span className="field-label">Cantidad aproximada</span>
          <span className="input-with-unit">
            <input
              className="field-input"
              inputMode="decimal"
              max="10000"
              min="0.1"
              name="kgEstimados"
              onChange={(event) => setKilograms(event.target.value)}
              placeholder="5"
              required
              step="0.1"
              type="number"
              value={kilograms}
            />
            <span>kg</span>
          </span>
          {errors.kgEstimados ? <span className="field-error">{errors.kgEstimados}</span> : null}
        </label>

        <label className="field">
          <span className="field-label">Teléfono de contacto</span>
          <input
            autoComplete="tel"
            className="field-input"
            inputMode="tel"
            maxLength={20}
            name="telefono"
            onChange={(event) => setPhone(event.target.value)}
            placeholder="55 1234 5678"
            required
            type="tel"
            value={phone}
          />
          {errors.telefono ? <span className="field-error">{errors.telefono}</span> : null}
        </label>
      </div>

      <label className="honeypot-field" aria-hidden="true">
        Sitio web
        <input
          autoComplete="off"
          name="sitioWeb"
          onChange={(event) => setHoneypot(event.target.value)}
          tabIndex={-1}
          value={honeypot}
        />
      </label>

      <div className="form-submit-row">
        <p className="privacy-note">
          Tu teléfono se guarda de forma privada y solo lo consulta el equipo de recolección.
        </p>
        <button className="submit-button" disabled={submissionState === "sending"} type="submit">
          {submissionState === "sending" ? (
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
          ) : (
            <Send size={17} aria-hidden="true" />
          )}
          <span>{submissionState === "sending" ? "Enviando" : "Solicitar recolección"}</span>
        </button>
      </div>

      {message ? (
        <div
          className={`form-status form-status--${submissionState}`}
          role={submissionState === "error" ? "alert" : "status"}
        >
          {submissionState === "success" ? (
            <CheckCircle2 size={18} aria-hidden="true" />
          ) : submissionState === "error" ? (
            <AlertCircle size={18} aria-hidden="true" />
          ) : null}
          <span>{message}</span>
        </div>
      ) : null}
    </form>
  );
}