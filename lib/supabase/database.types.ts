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
        rol: "administrador" | "recolector" | "vecino";
        aprobado: boolean;
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
        usuario_id: string | null;
        es_demo: boolean;
        created_at: string;
        updated_at: string;
      }>;
      rutas: Table<{
        id: string;
        zona_id: string;
        vehiculo_id: string;
        recolector_id: string | null;
        fecha: string;
        estado: "planeada" | "en_curso" | "completada" | "cancelada";
        capacidad_kg: number;
        kg_estimados: number;
        kilometros_totales: number;
        minutos_estimados: number;
        litros_estimados: number;
        costo_combustible: number;
        costo_por_kg: number;
        kg_por_km: number;
        kg_por_hora: number;
        km_base_registro: number;
        km_base_colonia: number;
        es_demo: boolean;
        created_at: string;
        updated_at: string;
      }>;
      paradas: Table<{
        id: string;
        zona_id: string;
        ruta_id: string;
        solicitud_id: string;
        secuencia: number;
        estado: "pendiente" | "recolectada" | "sin_recolectar";
        recolectada_at: string | null;
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
    Functions: {
      registrar_recoleccion: {
        Args: {
          p_parada_id: string;
          p_recolectada: boolean;
          p_kg_reales?: number | null;
        };
        Returns: {
          ruta_id: string;
          paradas_pendientes: number;
          ruta_completada: boolean;
        };
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}