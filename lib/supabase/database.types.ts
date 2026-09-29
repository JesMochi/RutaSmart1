type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      zonas: Table<{
        id: string;
        nombre: string;
        municipio: string;
        estado: string;
        acepta_solicitudes: boolean;
        es_demo: boolean;
        created_at: string;
        updated_at: string;
      }>;
      perfiles: Table<{
        user_id: string;
        nombre: string;
        rol: "administrador" | "recolector";
        created_at: string;
        updated_at: string;
      }>;
      vehiculos: Table<{
        id: string;
        zona_id: string;
        nombre: string;
        capacidad_kg: number;
        disponible: boolean;
        es_demo: boolean;
        created_at: string;
        updated_at: string;
      }>;
      parametros: Table<{
        zona_id: string;
        deposito_id: string;
        rendimiento_vehiculo_km_l: number;
        precio_combustible_por_litro: number;
        minutos_fijos_por_parada: number;
        velocidad_respaldo_km_h: number;
        factor_ajuste_linea_recta: number;
        capacidad_por_vehiculo_kg: number;
        deposito_latitud: number;
        deposito_longitud: number;
        es_demo: boolean;
        updated_at: string;
      }>;
      solicitudes: Table<{
        id: string;
        zona_id: string;
        colonia: string;
        direccion: string;
        latitud: number;
        longitud: number;
        material: "PET" | "Cartón" | "Aluminio" | "Vidrio";
        kg_estimados: number;
        telefono: string;
        estado: "pendiente" | "asignada" | "recolectada" | "sin_asignar";
        kg_reales_pet: number;
        kg_reales_carton: number;
        kg_reales_aluminio: number;
        kg_reales_vidrio: number;
        campo_trampa: string | null;
        es_demo: boolean;
        created_at: string;
        updated_at: string;
      }>;
      matriz_distancias: Table<{
        zona_id: string;
        origen_tipo: "deposito" | "solicitud";
        origen_id: string;
        destino_tipo: "deposito" | "solicitud";
        destino_id: string;
        metros: number;
        segundos: number;
        fuente: "osrm" | "haversine";
        es_demo: boolean;
        updated_at: string;
      }>;
    };
    Views: {
      impacto_publico: {
        Row: {
          kg_recolectados: number;
          combustible_ahorrado_litros: number;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}