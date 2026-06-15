import { Routes } from '@angular/router';
import { Splash } from './features/splash/splash';
import { Login } from './features/auth/login/login';
import { ActualizarPassword } from './features/auth/actualizar-password/actualizar-password';
import { Dashboard } from './features/dashboard/dashboard/dashboard';
import { Ingreso } from './features/ingreso/ingreso';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', component: Splash, pathMatch: 'full' }, // Redirige la raíz al splash
  { path: 'login', component: Login },
  { path: 'actualizar-password', component: ActualizarPassword },
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'ingreso', component: Ingreso, canActivate: [authGuard] }
];
