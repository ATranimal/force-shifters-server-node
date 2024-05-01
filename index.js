"use strict";

const express = require("express");
const path = require("path");
const { createServer } = require("https");
const fs = require("fs");
const WebSocket = require("ws");

const app = express();
app.use(express.static(path.join(__dirname, "/public")));

var privateKey = fs.readFileSync(
  "/etc/letsencrypt/live/forceshifters.website/privkey.pem"
);
var certificate = fs.readFileSync(
  "/etc/letsencrypt/live/forceshifters.website/fullchain.pem"
);

const server = createServer(
  {
    key: privateKey,
    cert: certificate,
  },
  app
);
const wss = new WebSocket.Server({ server });
// const wss = new WebSocket.Server({ port: 8080 });
// console.log("were listening 8080");

const firebaseConfig = {
  apiKey: "AIzaSyBfBpOoGPFuvqRrPGOyQanqVXwybLDnu_g",
  authDomain: "force-animals.firebaseapp.com",
  databaseURL: "https://force-animals-default-rtdb.firebaseio.com",
  projectId: "force-animals",
  storageBucket: "force-animals.appspot.com",
  messagingSenderId: "814210828116",
  appId: "1:814210828116:web:198d0ef603361e2a07aac1",
  measurementId: "G-CT61X87ZSV",
};

const { initializeApp } = require("firebase/app");
const {
  getDatabase,
  ref,
  onValue,
  connectDatabaseEmulator,
  set,
  get,
  remove,
  off,
} = require("firebase/database");

let firebaseApp;
let db;

try {
  const emulatorUrl = "http://127.0.0.1:9000/?ns=force-animals";
  // firebaseConfig.databaseURL = emulatorUrl;
  firebaseApp = initializeApp(firebaseConfig);
  db = getDatabase(firebaseApp);
} catch (error) {
  /*
   * We skip the "already exists" message which is
   * not an actual error when we're hot-reloading.
   */
  console.log("other error", error);
  if (!/already exists/u.test(error.message)) {
    // eslint-disable-next-line no-console
    console.error("Firebase admin initialization error", error.stack);
  }
}

wss.on("connection", function (ws) {
  let battleRef;
  let lobbyRef;
  let userName;

  ws.on("message", function (message) {
    const parsedMessage = JSON.parse(message);
    console.log("parsedMessage", parsedMessage);

    if (parsedMessage.type === "roomName") {
      const { roomName } = parsedMessage;
      battleRef = ref(db, `${roomName}`);

      onValue(battleRef, (snapshot) => {
        const data = snapshot.val();
        console.log(JSON.stringify(data));
        ws.send(JSON.stringify(data), function () {
          //
          // Ignoring errors.
          //
        });
      });
    }

    if (parsedMessage.type === "lobby") {
      lobbyRef = ref(db, `lobby`);
      userName = parsedMessage.userName;
      console.log(userName);

      // Add oneself to the lobby list
      set(ref(db, `lobby/${userName}`), {
        name: userName,
        status: "idle",
      });

      onValue(lobbyRef, (snapshot) => {
        const data = snapshot.val();
        console.log(JSON.stringify(data));
        ws.send(JSON.stringify(data), function () {
          //
          // Ignoring errors.
          //
        });
      });
    }

    if (parsedMessage.type === "challenge") {
      const opponent = parsedMessage.opponent;

      get(ref(db, `lobby/${opponent}`)).then((value) => {
        const opponentExistingLobby = value.val();

        set(ref(db, `lobby/${opponent}`), {
          status: "idle",
          challenges: [userName],
          ...opponentExistingLobby,
        });
      });
    }

    if (parsedMessage.type === "enterBattle") {
      const opponent = parsedMessage.opponent;

      const randomBattleName = Math.random().toString(36).substring(7);
      // set in battle to both players
      get(ref(db, `lobby/${userName}`)).then((value) => {
        const yourExistingLobby = value.val();
        set(ref(db, `lobby/${userName}`), {
          ...yourExistingLobby,
          status: "inBattle",
          roomName: randomBattleName,
        });

        get(ref(db, `lobby/${opponent}`)).then((value) => {
          const opponentExistingLobby = value.val();
          set(ref(db, `lobby/${opponent}`), {
            ...opponentExistingLobby,
            status: "inBattle",
            roomName: randomBattleName,
          });
        });
      });
    }
  });

  ws.on("close", function () {
    remove(ref(db, `lobby/${userName}`));

    console.log("stopping client interval");

    if (battleRef) {
      off(battleRef);
    }
    if (lobbyRef) {
      off(lobbyRef);
    }
  });
});

server.listen(8080, function () {
  console.log("Listening on http://0.0.0.0:8080");
});
