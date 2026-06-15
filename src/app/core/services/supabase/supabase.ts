import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  // 1. Cambiamos de 'private' a 'public' para dar acceso total a la API desde los componentes
  public supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  // 2. Mantenemos el helper de Autenticación (usado en el Login)
  get auth() {
    return this.supabase.auth;
  }

  // 3. Mantenemos el helper de Base de Datos (usado en el Dashboard)
  get db() {
    return this.supabase.from.bind(this.supabase);
  }

  // 4. Helper opcional para el Storage (imágenes, gifs)
  get storage() {
    return this.supabase.storage;
  }
}
