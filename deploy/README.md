# Running the Relay server

The server is a single NestJS process (REST API, WebSocket `/realtime`, pg-boss workers for sync, IMAP IDLE, reminders, scheduled sends and server-side AI) plus Postgres. Everything runs with Docker Compose on one Linux machine.

## Requirements

- Linux box with Docker Engine 24+ and the Compose plugin.
- About 1 GB RAM for the server and Postgres, more if you run AI CLIs on the server.
- Outbound access to your mail servers (IMAP 993 / SMTP 465 or 587) and to Google if you use Gmail.

## First start

```sh
cd relay
cp deploy/.env.example deploy/.env
```

Fill in `deploy/.env`:

| Variable                                               | What to put there                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                    | a long random hex password (`openssl rand -hex 24`). It goes unencoded into `DATABASE_URL`, so use only letters, digits, `-`, `_`, `.` and `~` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`              | two different random secrets, at least 32 characters (`openssl rand -base64 48`)                                                               |
| `CREDENTIALS_ENCRYPTION_KEY`                           | 32 random bytes as base64 (`openssl rand -base64 32`). Encrypts mail passwords and OAuth tokens. Back it up.                                   |
| `PUBLIC_URL`                                           | the URL clients use, e.g. `https://relay.example.com`                                                                                          |
| `REGISTRATION_ENABLED`                                 | `true` while you create accounts, then `false` to close the server                                                                             |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | the Google OAuth client used by the desktop app (see Gmail below). Leave empty if you don't use Gmail.                                         |
| `RELAY_BIND_ADDRESS`, `RELAY_PORT`                     | where the server port is published on the host. Default `127.0.0.1:3000` (only reachable locally / by the tunnel)                              |

Start it:

```sh
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml ps
curl http://127.0.0.1:3000/health
```

Database migrations run automatically when the server starts. Both containers restart on failure and on reboot (`restart: unless-stopped`) and have health checks; the server waits for a healthy Postgres.

In the desktop app choose "Pripojiť k serveru", enter the server URL and register. Afterwards set `REGISTRATION_ENABLED=false` and run `docker compose -f deploy/docker-compose.yml up -d` again if nobody else should register.

## Exposing the server with Cloudflare Tunnel

Cloudflare Tunnel gives you HTTPS from anywhere without opening ports on your router.

1. In the Cloudflare dashboard go to Zero Trust -> Networks -> Tunnels -> Create a tunnel (type `cloudflared`), name it `relay` and copy the tunnel token.
2. Add a public hostname to the tunnel, e.g. `relay.example.com`, service type `HTTP`, URL `server:3000`. WebSockets are proxied by default, which `/realtime` needs.
3. Put the token into `deploy/.env` as `CLOUDFLARE_TUNNEL_TOKEN` and set `PUBLIC_URL=https://relay.example.com`.
4. Start the stack with the `tunnel` profile:

   ```sh
   docker compose -f deploy/docker-compose.yml --profile tunnel up -d
   ```

The `cloudflared` service from the compose file:

```yaml
cloudflared:
  image: cloudflare/cloudflared:2025.10.1
  profiles: ['tunnel']
  restart: unless-stopped
  command: tunnel --no-autoupdate run
  environment:
    TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN}
  depends_on:
    server:
      condition: service_healthy
```

Do not put Cloudflare Access in front of the hostname. Relay has its own login (argon2id passwords, short-lived access tokens, rotating refresh tokens per device), and the desktop app can't pass an Access login page. Keep `RELAY_BIND_ADDRESS=127.0.0.1` so the port is only reachable through the tunnel.

## Gmail

Gmail accounts use OAuth. The desktop app runs the browser consent with PKCE on a loopback redirect, then sends the authorization code to the server, which exchanges it with Google. Server and desktop must use the same OAuth client:

1. Google Cloud Console -> APIs & Services -> Credentials -> Create credentials -> OAuth client ID, type "Desktop app".
2. Enable the Gmail API for the project and add the `https://mail.google.com/` scope on the consent screen.
3. Put the client ID and secret into `deploy/.env` (server) and configure the same client ID in the desktop app.

## AI on the server

When a user sets AI location to "server", AI jobs run on this machine with the Claude Code or Codex CLI.

```sh
INSTALL_AI_CLIS=true docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml exec server claude
docker compose -f deploy/docker-compose.yml exec server codex login
```

Log in once inside the container. The CLI credentials live in the `relay-ai-home` volume (`/home/node`) and survive restarts and image updates. `GET /ai/runners` (Settings -> AI in the app) shows whether the CLIs are installed and logged in.

## Operations

- Logs: `docker compose -f deploy/docker-compose.yml logs -f server`
- Update: `git pull && docker compose -f deploy/docker-compose.yml up -d --build`
- Backup: `docker compose -f deploy/docker-compose.yml exec postgres pg_dump -U relay relay > relay-$(date +%F).sql`. Keep `deploy/.env` (especially `CREDENTIALS_ENCRYPTION_KEY`) with the backup, otherwise stored mail credentials can't be decrypted.
- Restore: `docker compose -f deploy/docker-compose.yml exec -T postgres psql -U relay relay < relay-YYYY-MM-DD.sql`
