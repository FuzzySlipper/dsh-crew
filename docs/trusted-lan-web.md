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

## Windows workstation

Current Windows 10 and Windows 11 installations normally include the Microsoft OpenSSH client. Open PowerShell and check:

```powershell
ssh.exe -V
```

With DSH already running on the agent box, keep this PowerShell window open:

```powershell
ssh.exe -N -T `
  -o ExitOnForwardFailure=yes `
  -o ServerAliveInterval=30 `
  -o ServerAliveCountMax=3 `
  -L 127.0.0.1:3080:127.0.0.1:3080 `
  agent@AGENT_BOX
```

Replace `agent@AGENT_BOX` with the SSH user and hostname or IP address of the agent box, then open `http://127.0.0.1:3080`. The terminal staying blank is normal; closing it stops the tunnel. If local port 3080 is occupied, change only the first port after `-L`, for example `127.0.0.1:13080:127.0.0.1:3080`, and open `http://127.0.0.1:13080`.

For a shorter repeat command, put this in `%USERPROFILE%\.ssh\config`:

```sshconfig
Host dsh-agent-box
  HostName AGENT_BOX
  User agent
  LocalForward 127.0.0.1:3080 127.0.0.1:3080
  ExitOnForwardFailure yes
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

Then the workstation command is only:

```powershell
ssh.exe -N -T dsh-agent-box
```

An agent configuring the workstation should first confirm `ssh.exe -V`, discover the supplied host/user and existing SSH key arrangement, test an ordinary `ssh.exe dsh-agent-box` login, add the config entry without replacing unrelated SSH configuration, start the tunnel, and verify that `http://127.0.0.1:3080` loads. It should not copy private keys from the agent box or alter the remote DSH service unless separately asked.

## Service arrangement

Run the DSH command as a user service on the agent box and keep the SSH tunnel on the workstation. The service should use the current source checkout's package-native launch rather than a global wrapper or a copied installation. User lingering lets the service survive logout.

After updating the moving DSH checkout, run its documented install and build steps, restart the service, and perform one focused Web startup check. A changed revision is normal maintenance, not a compatibility gate.

## Product boundary

The browser is local, but DSH remains hosted on the agent box. Filesystem access, commands, sessions, settings, credentials, and host-native actions belong to that remote process. A true desktop client could project local native integrations differently; the SSH route does not pretend to provide that split.

## Current direct-LAN status

Checked against DSH `0.1.1-rc.2`: the underlying [`dsh-host-webserver`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/webserver/src/index.ts) now explicitly supports both `127.0.0.1` and `0.0.0.0`, and [`dsh-client-connection`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/connection/src/index.ts) accepts declared `trustedHosts`. A Cordis patch can therefore create an intentional LAN deployment without modifying DSH source.

The ordinary CLI is not that deployment interface yet. [`dsh web --host 0.0.0.0`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/web-app/src/startup.ts) still exits with an intentional remote-code-execution warning. `--trusted-host` adds request authorities but does not override the bind rejection.

Direct LAN access is also incomplete for normal administration. Even on a declared trusted host, the current connection plugin pins settings, credentials, host-native directory/path actions, preset administration, and model discovery to loopback. `trustedHosts` is a DNS-rebinding fence, not authentication. A reverse proxy can provide HTTPS, but it does not by itself make those loopback-only methods remotely available.

For a trusted single-user network, a small deployment overlay remains a reasonable experiment when partial remote administration is acceptable. Do not maintain a copied connection row, LAN-only source patch, or shadow transport plugin. For a nontechnical workstation that should behave exactly like a local DSH browser, use the SSH forwarding setup above until upstream ships an authenticated remote-administration path or a client-managed tunnel.

This decision follows the local [working principles](working-principles.md): use the current upstream surface, prefer the smallest durable seam, and do not build procedural machinery around a solved deployment problem.
