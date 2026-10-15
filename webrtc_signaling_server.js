// Cloudflare Worker + Durable Object signaling server for Wild Survival.
// This relays WebRTC offers/answers/ICE candidates only; gameplay packets use WebRTC.
// Deploy as a Worker with the Durable Object binding described in the instructions.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/ws") {
      return new Response("Wild Survival WebRTC signaling is running. Connect to /ws?room=CODE&host=1|0", { status: 200 });
    }
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    const room = (url.searchParams.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    if (room.length < 4) return new Response("Invalid room code", { status: 400 });
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
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ peerId: 0, joined: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, message) {
    let msg;
    try { msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message)); }
    catch { socket.send(JSON.stringify({ type: "error", message: "Invalid JSON message." })); return; }
    const attachment = socket.deserializeAttachment() || { peerId: 0, joined: false };

    if (msg.type === "join") {
      if (attachment.joined) return;
      const sockets = this.ctx.getWebSockets();
      const members = [];
      for (const s of sockets) {
        if (s === socket) continue;
        const a = s.deserializeAttachment() || {};
        if (a.joined && a.peerId) members.push({ socket: s, peerId: a.peerId, host: !!a.host });
      }
      const wantsHost = !!msg.host;
      const hasHost = members.some(m => m.host || m.peerId === 1);
      if (wantsHost && hasHost) {
        socket.send(JSON.stringify({ type: "error", message: "That room already has a host. Choose another room code." }));
        return;
      }
      if (!wantsHost && !hasHost) {
        socket.send(JSON.stringify({ type: "error", message: "Room not found. Ask the host to create it first." }));
        return;
      }
      let peerId = 1;
      if (!wantsHost) {
        peerId = 2;
        for (const m of members) peerId = Math.max(peerId, m.peerId + 1);
      }
      socket.serializeAttachment({ peerId, joined: true, host: wantsHost });
      socket.send(JSON.stringify({ type: "joined", room: msg.room || "", peer_id: peerId, peers: members.map(m => m.peerId) }));
      for (const m of members) {
        try { m.socket.send(JSON.stringify({ type: "peer_joined", peer_id: peerId })); } catch (_) {}
      }
      return;
    }

    if (!attachment.joined) {
      socket.send(JSON.stringify({ type: "error", message: "Join a room before sending signaling messages." }));
      return;
    }
    if (!["offer", "answer", "candidate"].includes(msg.type)) return;
    const to = Number(msg.to);
    if (!Number.isInteger(to) || to < 1 || to === attachment.peerId) return;
    const target = this.ctx.getWebSockets().find(s => {
      const a = s.deserializeAttachment() || {};
      return a.joined && a.peerId === to;
    });
    if (!target) return;
    const forwarded = { ...msg, from: attachment.peerId };
    delete forwarded.to;
    try { target.send(JSON.stringify(forwarded)); } catch (_) {}
  }

  webSocketClose(socket) { this._remove(socket); }
  webSocketError(socket) { this._remove(socket); }

  _remove(socket) {
    const attachment = socket.deserializeAttachment() || {};
    if (!attachment.joined) return;
    for (const other of this.ctx.getWebSockets()) {
      if (other === socket) continue;
      const a = other.deserializeAttachment() || {};
      if (a.joined) {
        try { other.send(JSON.stringify({ type: "peer_left", peer_id: attachment.peerId })); } catch (_) {}
      }
    }
  }
}
