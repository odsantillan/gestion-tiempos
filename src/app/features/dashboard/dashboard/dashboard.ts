import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { trigger, transition, style, animate } from '@angular/animations';
import { SupabaseService } from '../../../core/services/supabase/supabase';

// Interfaz para tipar los datos de la sesión
export interface SesionJuego {
  id: string;
  nombreNino: string;
  nombreTutor: string;
  whatsapp: string;
  horaIngreso: Date;
  horaSalidaEstimada: Date;
  minutosRestantes: number;
  tiempoRestanteStr: string;
  estadoAlerta: 'normal' | 'advertencia' | 'expirado';
  costoBase: number;
  minutosExtra: number;
  costoExtra: number;
  costoTotal: number;
  adultosAdicionales: number;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  host: {
    '[@slideLeftRight]': '',
    style: 'display: block; width: 100%;'
  },
  animations: [
    trigger('slideLeftRight', [
      transition(':enter', [
        style({ transform: 'translateX(-100%)', opacity: 0 }),
        animate('400ms cubic-bezier(0.25, 1, 0.5, 1)', style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        style({ position: 'absolute', top: 0, left: 0, width: '100%', zIndex: -1 }),
        animate('400ms cubic-bezier(0.25, 1, 0.5, 1)', style({ transform: 'translateX(-100%)', opacity: 0 }))
      ])
    ])
  ]
})
export class Dashboard implements OnInit, OnDestroy {

  // Inyectamos nuestro servicio real y el enrutador
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  sesiones: SesionJuego[] = [];
  userGreeting: string = 'Cargando...';
  private timerSubscription?: Subscription;
  private realtimeChannel: any;

  async ngOnInit() {
    await this.establecerSaludoPorRol();
    await this.cargarSesionesActivas();
    this.cdr.detectChanges(); // Forzamos actualización inicial al terminar la carga
    this.iniciarTemporizador();
    this.suscribirseCambiosEnVivo();
  }

  ngOnDestroy() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
    // La forma correcta de apagar el canal en Supabase v2 es directamente desde el cliente:
    if (this.realtimeChannel) {
      this.supabaseService.supabase.removeChannel(this.realtimeChannel);
    }
  }

  // OBTENER ROL DEL USUARIO Y ESTABLECER SALUDO
  async establecerSaludoPorRol() {
    try {
      const { data: { user }, error: authError } = await this.supabaseService.supabase.auth.getUser();
      if (authError) throw authError;

      if (user) {
        const { data: perfil, error: profileError } = await this.supabaseService.supabase
          .from('perfiles')
          .select('rol')
          .eq('id', user.id)
          .single();

        if (profileError) throw profileError;

        if (perfil) {
          const rolUsuario = perfil.rol?.toUpperCase();
          if (rolUsuario === 'ADMINISTRADOR') {
            this.userGreeting = 'Hola, Administrador';
          } else if (rolUsuario === 'ENCARGADO') {
            this.userGreeting = 'Hola, Encargado';
          } else {
            this.userGreeting = 'Hola, Usuario';
          }
        }
      }
    } catch (error) {
      console.error('Error al obtener el perfil del usuario:', error);
      this.userGreeting = 'Hola';
    } finally {
      this.cdr.detectChanges(); // Informamos a Angular que la variable userGreeting ha cambiado
    }
  }

  // CERRAR SESIÓN
  async cerrarSesion() {
    const { error } = await this.supabaseService.auth.signOut();
    if (error) {
      console.error('Error al cerrar sesión:', error);
    } else {
      this.router.navigate(['/login']);
    }
  }

  // 1. CONSULTA REAL A LA BASE DE DATOS
  async cargarSesionesActivas() {
    // Usamos la potencia de PostgREST para hacer el JOIN de las 3 tablas
    const { data, error } = await this.supabaseService.db('sesiones_juego')
      .select(`
        id,
        ingreso_at,
        salida_estimada_at,
        costo_base,
        minutos_extra,
        costo_extra,
        adultos_adicionales,
        ninos (
          nombres_apellidos,
          tutores (
            nombres_apellidos,
            whatsapp
          )
        )
      `)
      .eq('estado', 'ACTIVO'); // Solo traemos los que están jugando

    if (error) {
      console.error('Error al cargar las sesiones:', error);
      return;
    }

    // Mapeamos los datos de Supabase a nuestra interfaz visual de Angular
    if (data) {
      this.sesiones = data.map((item: any) => ({
        id: item.id,
        nombreNino: item.ninos?.nombres_apellidos || 'Desconocido',
        nombreTutor: item.ninos?.tutores?.nombres_apellidos || 'Desconocido',
        whatsapp: item.ninos?.tutores?.whatsapp || '',
        horaIngreso: new Date(item.ingreso_at),
        horaSalidaEstimada: new Date(item.salida_estimada_at),
        minutosRestantes: 0,
        tiempoRestanteStr: '00:00',
        estadoAlerta: 'normal',
        costoBase: item.costo_base || 30, // Fallback si no está seteado
        minutosExtra: item.minutos_extra || 0,
        costoExtra: item.costo_extra || 0,
        adultosAdicionales: item.adultos_adicionales || 0,
        costoTotal: (item.costo_base || 30) + (item.costo_extra || 0)
      }));

      this.actualizarTiempos(); // Calculamos el tiempo inmediatamente
      this.cdr.detectChanges(); // Informamos a Angular sobre el cambio de sesiones
    }
  }

  // 2. MAGIA EN TIEMPO REAL (WEBSOCKETS)
  suscribirseCambiosEnVivo() {
    this.realtimeChannel = this.supabaseService.supabase.channel('cambios-sesiones')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sesiones_juego' },
        (payload) => {
          console.log('¡Cambio detectado en la base de datos!', payload);
          // Si hay cualquier cambio (INSERT, UPDATE), recargamos la lista
          this.cargarSesionesActivas();
        }
      )
      .subscribe();
  }

  // 3. LA MATEMÁTICA DEL TIEMPO (Se mantiene igual que antes)
  iniciarTemporizador() {
    this.timerSubscription = interval(1000).subscribe(() => {
      this.actualizarTiempos();
    });
  }

  actualizarTiempos() {
    const ahora = new Date().getTime();

    this.sesiones.forEach(sesion => {
      const salida = sesion.horaSalidaEstimada.getTime();
      const diffMs = salida - ahora;

      if (diffMs <= 0) {
        sesion.minutosRestantes = 0;
        sesion.tiempoRestanteStr = '00:00';
        sesion.estadoAlerta = 'expirado';
      } else {
        const diffSecs = Math.floor(diffMs / 1000);
        const totalMins = Math.floor(diffSecs / 60);
        
        const horas = Math.floor(totalMins / 60);
        const mins = totalMins % 60;
        const secs = diffSecs % 60;

        sesion.minutosRestantes = totalMins;

        // Formato condicional: añade horas solo si es mayor a 59 minutos
        const hStr = horas > 0 ? `${horas.toString().padStart(2, '0')}:` : '';
        const mStr = mins.toString().padStart(2, '0');
        const sStr = secs.toString().padStart(2, '0');
        
        sesion.tiempoRestanteStr = `${hStr}${mStr}:${sStr}`;

        // La advertencia debe saltar a los 5 minutos exactos (300 segundos)
        if (diffSecs <= 300) {
          sesion.estadoAlerta = 'advertencia';
        } else {
          sesion.estadoAlerta = 'normal';
        }
      }
    });

    this.cdr.detectChanges(); // Forzamos a la UI a refrescar el temporizador cada segundo
  }

  // 4. GENERADOR DE WHATSAPP
  enviarWhatsApp(sesion: SesionJuego) {
    let mensaje = '';
    if (sesion.estadoAlerta === 'expirado') {
      mensaje = `Hola, te informamos que el tiempo de juego de *${sesion.nombreNino}* ha concluido. ¿Deseas extender el paquete? (Opciones de pago: transferencia o efectivo en caja).`;
    } else {
      mensaje = `Hola, te informamos que el tiempo de juego de *${sesion.nombreNino}* terminará en aproximadamente ${sesion.minutosRestantes} minutos. ¿Deseas extender el paquete?`;
    }

    const mensajeCodificado = encodeURIComponent(mensaje);
    const url = `https://wa.me/${sesion.whatsapp}?text=${mensajeCodificado}`;
    window.open(url, '_blank');
  }

  // 5. AGREGAR 5 MINUTOS A LA SESIÓN
  async agregarCincoMinutos(sesion: SesionJuego) {
    // Calculamos la nueva fecha de salida estimada sumando 5 minutos (5 * 60000 milisegundos)
    const nuevaSalidaEstimada = new Date(sesion.horaSalidaEstimada.getTime() + 5 * 60000);
    const nuevosMinutosExtra = sesion.minutosExtra + 5;
    const nuevoCostoExtra = sesion.costoExtra + 1.50; // Aumentar $1.50 por cada 5 minutos extras

    const { error } = await this.supabaseService.db('sesiones_juego')
      .update({ 
        salida_estimada_at: nuevaSalidaEstimada.toISOString(),
        minutos_extra: nuevosMinutosExtra,
        costo_extra: nuevoCostoExtra
      })
      .eq('id', sesion.id);

    if (error) {
      console.error('Error al agregar 5 minutos:', error);
      alert('Hubo un error al intentar agregar 5 minutos. Por favor, intenta de nuevo.');
    } else {
      console.log('Se agregaron 5 minutos exitosamente a la sesión.');
      // Update local state temporarily so UI is instantly updated, real-time sync will overwrite it
      sesion.horaSalidaEstimada = nuevaSalidaEstimada;
      sesion.minutosExtra = nuevosMinutosExtra;
      sesion.costoExtra = nuevoCostoExtra;
      sesion.costoTotal = sesion.costoBase + sesion.costoExtra;
      this.actualizarTiempos();
    }
  }
}
