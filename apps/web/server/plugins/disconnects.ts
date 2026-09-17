import { ignoreBenignSocketError, installDisconnectGuard } from "../utils/disconnect-guard";

const flagged = new WeakSet<object>();

// Cursor, browsers, and the loopback proxy RST keep-alive sockets. Nuxt CLI treats
// that unhandledRejection as fatal and restarts the dev fork in a loop.
export default defineNitroPlugin((nitro) => {
  installDisconnectGuard();
  nitro.hooks.hook("request", (event) => {
    const socket = event.node?.req?.socket;
    if (socket && !flagged.has(socket)) {
      flagged.add(socket);
      socket.on("error", ignoreBenignSocketError);
    }
    const res = event.node?.res;
    if (res && !flagged.has(res)) {
      flagged.add(res);
      res.on("error", ignoreBenignSocketError);
    }
  });
});
