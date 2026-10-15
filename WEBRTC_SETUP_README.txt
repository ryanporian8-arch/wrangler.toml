WILD SURVIVAL — WEBRTC ONLINE SETUP

Files:
- main.gd: modified online mode to use WebRTC + WebSocket signaling. Direct-IP ENet mode remains available.
- webrtc_signaling_worker.js: signaling service source. It relays room membership and WebRTC offer/answer/ICE messages; it does NOT relay gameplay traffic.
- wrangler.toml: Cloudflare Durable Object binding/migration configuration.

IMPORTANT
The online mode is not plug-and-play until you deploy the signaling Worker and set its URL in main.gd. I could not run the project in Godot here, so test with a backup copy first. Keep your previous main.gd until you verify it launches.

SIGNALING SERVER
1. Open https://dash.cloudflare.com/ and sign in/create an account.
2. Deploy webrtc_signaling_worker.js as a Worker with Durable Object class binding named ROOMS -> RoomSignaling and the SQLite migration from wrangler.toml. Cloudflare's dashboard options can change; if the dashboard does not support the migration, use Cloudflare's documented Wrangler deployment flow.
3. Copy the deployed Worker URL. It should look like https://YOUR-WORKER-NAME.YOUR-ACCOUNT.workers.dev.
4. In main.gd, change WEBRTC_SIGNALING_URL to "wss://YOUR-WORKER-NAME.YOUR-ACCOUNT.workers.dev/ws" (use wss://, not https://).

TURN RELAY
A TURN relay is only needed when direct WebRTC connectivity fails. Provider link: https://www.metered.ca/stun-turn
Create your own credentials in the provider dashboard. Do not share those credentials publicly. In main.gd, fill the optional TURN dictionary in WEBRTC_ICE_SERVERS with the URLs, username, and credential given by the provider. Free usage has limits and can change.

ANDROID
Enable Android INTERNET permission in the export preset. Keep the WebRTC GDExtension and its Android ARM64 library inside the project in the original folder structure. The extension needs to load on the Android build.

TESTING
1. Start a selected world, switch Connection to Online Room, tap Host, and share the six-character code.
2. The other player switches to Online Room, enters the code in the room-code field, and taps Join.
3. Test first with both devices on different networks. If room signaling works but the peer connection fails, check TURN credentials and Android Internet permission.

LIMITATIONS
This is an initial WebRTC integration and has not been compiled or tested against your exact project/export in this environment. The Worker is signaling only; gameplay packets are WebRTC peer-to-peer unless TURN is used. TURN traffic may consume the provider's free quota. Do not delete your old main.gd until you test this version.
