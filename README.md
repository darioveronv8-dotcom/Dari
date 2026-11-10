# Territorio 360 — paquete de implementación 0.2

Aplicación web adaptable preparada para conectar con Supabase. Esta entrega es código fuente listo para configuración y despliegue; **todavía no está publicada ni conectada a una base real**.

## Requisitos
- Node.js 20.19+ o 22.12+
- Cuenta Supabase
- Cuenta GitHub (recomendado para versionado y despliegue)
- Cuenta Vercel (o hosting estático equivalente)

## Desarrollo local
1. Descomprimir el paquete.
2. Copiar `.env.example` como `.env.local`.
3. Crear un proyecto en Supabase.
4. Completar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con la URL y clave publicable del proyecto.
5. Ejecutar `npm install`.
6. Revisar y ejecutar `supabase/schema.sql` en el SQL Editor de Supabase.
7. Crear la organización y vincular el primer administrador siguiendo el procedimiento seguro indicado abajo.
8. Ejecutar `npm run dev`.

## Construcción
- `npm run build`
- Directorio de publicación: `dist`
- Comando de build: `npm run build`

## Configuración de Vercel
Importar el repositorio GitHub en Vercel. Configurar las variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

La clave publicable/anon puede estar en el frontend si todas las tablas expuestas tienen RLS correctamente configurado. Nunca publicar `service_role`, secret keys, contraseñas ni cadenas de conexión privilegiadas.

## Alta inicial del administrador
No hay registro público. Primero crear un usuario desde Supabase Auth (invitar por correo o alta administrativa). Después, desde SQL Editor, ejecutar un procedimiento de bootstrap controlado que:
- cree una fila en `profiles` para el UUID del usuario,
- cree una organización,
- agregue al usuario a `organization_members` con role `admin`.
El esquema de base de datos incluido define las tablas y políticas iniciales, pero el bootstrap debe ejecutarse por una persona administradora con acceso al proyecto. No compartir credenciales por chat.

## Antes de usar datos reales
1. Revisar el SQL y probar RLS con cuentas de cada rol.
2. Agregar triggers de auditoría y `updated_at`.
3. Configurar MFA para administradores y reglas de recuperación.
4. Configurar backups automáticos y probar restauración.
5. Revisar privacidad, retención y bajas de usuarios.
6. Verificar que no se ingresen datos sensibles ni perfiles políticos individuales.
7. Configurar dominio y HTTPS cuando esté disponible.

## Funciones de esta primera integración
- Inicio de sesión con Supabase Auth.
- Lectura de organización y rol del usuario.
- Panel de indicadores.
- Consulta de localidades.
- Consulta y alta de actividades (administradores/coordinadores).
- Consulta de tareas.
- Consulta de miembros (administradores/coordinadores).
- Exportación de actividades y tareas a CSV.

La creación de usuarios, asignación de roles, administración de organización y gestión avanzada de tareas requieren completar endpoints/procesos administrativos antes de producción.
