import { ArrowDown, MapPin, Recycle } from "lucide-react";
import Link from "next/link";
import { ImpactCounter } from "@/components/public/ImpactCounter";
import { RequestForm } from "@/components/public/RequestForm";

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="brand-lockup" href="/" aria-label="RutaSmart, inicio">
            <span className="brand-mark">
              <Recycle size={19} strokeWidth={2.1} aria-hidden="true" />
            </span>
            <span>RutaSmart</span>
          </Link>
          <nav className="header-nav" aria-label="Navegación principal">
            <a href="#impacto">Impacto</a>
            <Link className="header-login" href="/login">Entrar</Link>
            <a className="header-cta" href="#solicitud">
              Solicitar recolección <ArrowDown size={15} aria-hidden="true" />
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="hero-band" aria-labelledby="hero-title">
          <div className="hero-inner">
            <div className="hero-copy">
              <span className="hero-kicker">
                <span className="live-dot" aria-hidden="true" />
                Jardines de Morelos · Ecatepec
              </span>
              <h1 id="hero-title">
                Reciclaje de barrio.
                <br />
                <span>Rutas más inteligentes.</span>
              </h1>
              <p>
                Juntamos solicitudes vecinales y organizamos recolecciones para
                recorrer menos y recuperar más.
              </p>
              <a className="hero-link" href="#solicitud">
                Solicitar una recolección <ArrowDown size={17} aria-hidden="true" />
              </a>
            </div>

            <div className="hero-stamp" aria-label="Una zona, hasta dos vehículos, cuatro materiales">
              <span className="stamp-number">01</span>
              <span className="stamp-rule" />
              <span className="stamp-caption">zona activa</span>
              <span className="stamp-meta">hasta 2 vehículos<br />PET · cartón · aluminio · vidrio</span>
              <MapPin className="stamp-pin" size={21} aria-hidden="true" />
            </div>
          </div>
          <div className="hero-baseline" aria-hidden="true">
            <span>COORDINACIÓN LOCAL</span>
            <span>LOGÍSTICA CON PROPÓSITO</span>
            <span>HACKATEC 2026</span>
          </div>
        </section>

        <ImpactCounter />

        <section className="request-section" id="solicitud" aria-labelledby="request-title">
          <div className="request-section-heading">
            <div>
              <span className="eyebrow">Participa en tu zona</span>
              <h2 id="request-title">¿Qué podemos recoger?</h2>
            </div>
            <p>Comparte los datos de tu reciclable y coordinamos el siguiente recorrido.</p>
          </div>
          <RequestForm />
        </section>
      </main>

      <footer className="site-footer">
        <Link className="brand-lockup brand-lockup--footer" href="/">
          <span className="brand-mark">
            <Recycle size={17} aria-hidden="true" />
          </span>
          <span>RutaSmart</span>
        </Link>
        <span>Jardines de Morelos · Ecatepec de Morelos, Edo. Méx.</span>
        <a href="https://www.openstreetmap.org/copyright">Mapa © OpenStreetMap</a>
      </footer>
    </>
  );
}
