# Remote DSH Web over SSH

This is the decision record for Den task 7117. The normal way to use DSH from another trusted workstation is an SSH local port forward, not an all-interface bind or a replacement connection plugin.

## Decision

Keep DSH on its shipped loopback address on the agent box:

```sh
pnpm dsh web --no-open --port 3080
```

Forward a workstation loopback port to that remote loopback socket:

```sh
ssh -N \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L 127.0.0.1:3080:127.0.0.1:3080 \
  agent@den-k8
```

Open `http://127.0.0.1:3080` on the workstation. If that local port is occupied, forward another local port such as `13080` to remote port `3080` and open `http://127.0.0.1:13080`.

The first address in `-L` belongs to the workstation. The second is interpreted by the SSH server on the agent box. DSH remains unreachable through the agent box's LAN interfaces.

## Why this fits current DSH

The current [CLI reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md) says an SSH launch suppresses browser opening because the SSH client or editor owns the forwarded address. The [Web runner](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/web-app/src/index.ts) implements that behavior explicitly.

The browser genuinely uses a loopback URL. The [browser connection plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/connection/src/client/index.ts) therefore reports a loopback connection, and the [request trust fence](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/connection/src/api-request-trust.ts) receives a loopback `Host` with a matching `Origin`. Ordinary APIs, administrative APIs, and the relative WebSocket endpoints all travel through the same tunnel without changing DSH's policy.

SSH authenticates the remote host and encrypts the forwarded TCP stream. There is no HTTPS interception: the browser deliberately speaks HTTP to its own loopback socket, and SSH carries that stream to DSH's remote loopback socket.

## Service arrangement

Run the DSH command as a user service on the agent box and keep the SSH tunnel on the workstation. The service should use the current source checkout's package-native launch rather than a global wrapper or a copied installation. User lingering lets the service survive logout.

After updating the moving DSH checkout, run its documented install and build steps, restart the service, and perform one focused Web startup check. A changed revision is normal maintenance, not a compatibility gate.

## Product boundary

The browser is local, but DSH remains hosted on the agent box. Filesystem access, commands, sessions, settings, credentials, and host-native actions belong to that remote process. A true desktop client could project local native integrations differently; the SSH route does not pretend to provide that split.

## Rejected default: direct LAN exposure

A Cordis patch can bind the Web server to `0.0.0.0`, and a trusted-host value can admit an HTTPS reverse-proxy authority. That path still creates a separate remote administrative-policy problem and is unnecessary for the one-operator topology here.

Do not maintain a copied connection row, LAN-only source patch, or shadow transport plugin for ordinary remote use. Revisit direct LAN serving only for a product need that SSH forwarding cannot satisfy.

This decision follows the local [working principles](working-principles.md): use the current upstream surface, prefer the smallest durable seam, and do not build procedural machinery around a solved deployment problem.
