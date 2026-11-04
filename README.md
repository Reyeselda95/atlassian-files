# Atlassian Case Files

Aplicación web para una dinámica de investigación Atlassian. Incluye selección exclusiva de roles en tiempo real, panel de administración, publicación automática y manual de pistas, entrega de resoluciones y clasificación automática.

## Despliegue en Portainer

1. Copia esta carpeta a un repositorio Git accesible por Portainer o súbela al servidor donde ejecutes Docker.
2. En Portainer, entra en **Stacks → Add stack**.
3. Selecciona **Web editor** y pega el contenido de `docker-compose.yml`, o utiliza **Repository** apuntando al repositorio.
4. Antes de desplegar, cambia `ADMIN_PIN` por un PIN largo y privado.
5. Despliega el stack. La aplicación quedará disponible en `http://IP_DEL_SERVIDOR:3080`.
6. Para publicarla mediante Traefik/Nginx Proxy Manager, crea un proxy hacia el servicio/host en el puerto `3080`.

## Persistencia y tiempo real

- Socket.IO distribuye los cambios de perfiles, pistas y resultados a todos los navegadores conectados.
- El servidor valida la reserva de roles para impedir que dos participantes ocupen el mismo rol.
- El estado se persiste en `/data/state.json`, dentro del volumen Docker `atlassian_case_data`.
- Un único proceso Node gestiona las mutaciones y serializa las escrituras. No escales este contenedor a varias réplicas sin migrar el estado a una base de datos compartida.

## Panel de administración

Pulsa **Admin** e introduce el valor configurado en `ADMIN_PIN`. Desde el panel puedes iniciar la investigación, adelantar la siguiente pista, finalizarla, consultar resultados y reiniciar la partida.

## Reglas de puntuación

- Precisión: 70 puntos.
- Tiempo: hasta 20 puntos; se mide desde el inicio común y solo puntúa si la precisión alcanza 35/70.
- Evidencias: 10 puntos.
- El máximo es 100 puntos.

## Variables de entorno

| Variable | Predeterminado | Descripción |
|---|---|---|
| `ADMIN_PIN` | `1234` en fallback | PIN de administrador; configúralo obligatoriamente |
| `PORT` | `3000` | Puerto interno |
| `DATA_DIR` | `/data` | Directorio persistente |
| `GAME_DURATION_MINUTES` | `15` | Ventana máxima para entregar respuestas |

## Nota

La vista previa incluida en ChatGPT funciona en modo demostración local para que puedas probar la interfaz. El despliegue Docker es la versión multiusuario real con sincronización mediante Socket.IO.

## Mecánica de la partida

- Antes del inicio, cada participante introduce su propio nombre y elige uno de los ocho roles profesionales disponibles (por ejemplo, Developer o Jira Owner). Los roles reservados son visibles, pero los nombres de los participantes permanecen ocultos para los demás.
- Al comenzar se revelan los nombres asociados a cada rol, se inicia el cronómetro y se publica inmediatamente la primera pista para todos. No hay roles obligatorios: puede comenzar con cualquier combinación de participantes.
- El servidor publica cada pista restante cada 90 segundos, en orden. El organizador puede usar **Adelantar siguiente pista** o **Publicar ahora**; cada adelanto reinicia el contador de 90 segundos desde el momento de la publicación. La programación sigue funcionando aunque se cierre el navegador del organizador.
- El formulario de resolución aparece desde el inicio de la investigación. Cada participante puede modificarlo hasta enviarlo, pero el servidor acepta una única entrega por participante.
- La interfaz usa modo oscuro fijo y alto contraste.

## Privacidad de resultados y cierre

- Durante la investigación, las puntuaciones, las respuestas y la clasificación no se envían a los participantes.
- El administrador puede consultar los resultados detallados desde el panel protegido por PIN antes de finalizar.
- Al finalizar la investigación, la clasificación se publica para todos los participantes y aparece automáticamente la resolución del misterio.
- La solución revela que Javier coordinó la manipulación del proceso de aprobación en Confluence mediante un token personal, Daniel realizó el commit `a84f91c` para omitir la validación y el pipeline desplegó la versión 4.8.0 usando `release-automation`.
