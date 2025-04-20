
/** @odoo-module **/

import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";

export const webSocketService = {
  dependencies: ["notification", "dialog"],
  start(env, { notification, dialog }) {
    let websocket;
    let checkInterval;
    let checkTimeout;
    let messageCallback;
    let isDisconnect = false;

    // function startPeriodicCheck() {
    //   if (checkInterval) {
    //     clearInterval(checkInterval);
    //   }
    //   checkInterval = setInterval(() => {
    //     if (websocket && websocket.readyState === WebSocket.OPEN) {
    //       websocket.send("GetConnect");
    //     }
    //   }, 1000);
    // }

    function connect() {
      if (isDisconnect) return;
      const wsUri = "ws://localhost:5000";
      try {
        websocket = new WebSocket(wsUri);
      } catch (error) {
        console.error("WebSocket connection error:", error);
        setTimeout(connect, 1000);
        return;
      }

      websocket.onopen = function () {
        notification.add(_t("Kết nối thành công"), {
          type: "success",
        });
        // websocket.send("GetConnect");
        // startPeriodicCheck();
        if (messageCallback) {
          websocket.onmessage = messageCallback;
        }
      };

      websocket.onclose = function (e) {
        // if (checkInterval) {
        //   clearInterval(checkInterval);
        // }
        checkTimeout = setTimeout(connect, 1000);
      };
    }

    return {
      connect: () => {
        isDisconnect = false;
        connect();
      },
      disconnect: () => {
        if (checkTimeout) clearTimeout(checkTimeout);
        isDisconnect = true;
      },
      send: (message) => {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
          websocket.send(message);
        } else {
          console.warn("WebSocket is not open. Message not sent.");
        }
      },
      onMessage: (callback) => {
        messageCallback = callback;
        if (websocket) {
          websocket.onmessage = callback;
        }
      },
      isConnect: () => {
        return websocket ? websocket.readyState : WebSocket.CLOSED;
      },
    };
  },
};

registry.category("services").add("webSocket", webSocketService);
