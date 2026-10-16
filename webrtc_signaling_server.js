
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/ws") {
      return new Response(
        "Wild Survival signaling server is running."
      );
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }

    const room = (url.searchParams.get("room") || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12);

    if (room.length < 4) {
      return new Response("Invalid room code", { status: 400 });
    }

    const id = env.ROOMS.idFromName(room);
    return env.ROOMS.get(id).fetch(request);
  }
};

export class RoomSignaling {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket required", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ peerId: 0, joined: false });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  webSocketMessage(socket, message) {
    let msg;

    try {
      msg = JSON.parse(
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message)
      );
    } catch {
      socket.send(JSON.stringify({
        type: "error",
        message: "Invalid JSON"
      }));
      return;
    }

    const attachment = socket.deserializeAttachment() || {
      peerId: 0,
      joined: false
    };

    if (msg.type === "join") {
      if (attachment.joined) return;

      const members = [];

      for (const s of this.ctx.getWebSockets()) {
        if (s === socket) continue;

        const a = s.deserializeAttachment() || {};
        if (a.joined && a.peerId) {
          members.push({
            socket: s,
            peerId: a.peerId,
            host: !!a.host
          });
        }
      }

      const wantsHost = !!msg.host;
      const hasHost = members.some(m => m.host);

      if (wantsHost && hasHost) {
        socket.send(JSON.stringify({
          type: "error",
          message: "Room already has a host"
        }));
        return;
      }

      if (!wantsHost && !hasHost) {
        socket.send(JSON.stringify({
          type: "error",
          message: "Room not found"
        }));
        return;
      }

      let peerId = 1;

      if (!wantsHost) {
        peerId = 2;
        for (const m of members) {
          peerId = Math.max(peerId, m.peerId + 1);
        }
      }

      socket.serializeAttachment({
        peerId,
        joined: true,
        host: wantsHost
      });

      socket.send(JSON.stringify({
        type: "joined",
        room: msg.room || "",
        peer_id: peerId,
        peers: members.map(m => m.peerId)
      }));

      for (const m of members) {
        m.socket.send(JSON.stringify({
          type: "peer_joined",
          peer_id: peerId
        }));
      }

      return;
    }

    if (!attachment.joined) return;

    if (!["offer", "answer", "candidate"].includes(msg.type)) {
      return;
    }

    const to = Number(msg.to);
    if (!Number.isInteger(to) || to < 1 ||
        to === attachment.peerId) return;

    const target = this.ctx.getWebSockets().find(s => {
      const a = s.deserializeAttachment() || {};
      return a.joined && a.peerId === to;
    });

    if (!target) return;

    const forwarded = {
      ...msg,
      from: attachment.peerId
    };
    delete forwarded.to;

    target.send(JSON.stringify(forwarded));
  }

  webSocketClose(socket) {
    this._remove(socket);
  }

  webSocketError(socket) {
    this._remove(socket);
  }

  _remove(socket) {
    const attachment = socket.deserializeAttachment() || {};
    if (!attachment.joined) return;

    for (const other of this.ctx.getWebSockets()) {
      if (other === socket) continue;

      const a = other.deserializeAttachment() || {};
      if (a.joined) {
        other.send(JSON.stringify({
          type: "peer_left",
          peer_id: attachment.peerId
        }));
      }
    }
  }
  }
          
