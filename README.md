# ntfy-deploy

Monitor del deploy de `https://viajes.dev.rappi.com/`. Cuando cambia el atributo `version="..."` del HTML raíz, envía una notificación push a un topic de [ntfy.sh](https://ntfy.sh).

## Setup

1. Instalar la app **ntfy** (iOS/Android) y suscribirse al topic configurado en el secret `NTFY_TOPIC`.
2. El workflow corre cada ~5 min (mínimo real de GitHub Actions cron).
3. El estado se persiste en `.last-version` — un commit por cada cambio detectado.

## Secrets

- `NTFY_TOPIC`: nombre del topic (sin la URL, solo el slug).

## Trigger manual

```
gh workflow run "Check Travel DEV deploy"
```
