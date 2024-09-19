"use strict";

// TODO: Exchange for env variables
const IS_LOCAL = false;

const express = require("express");
const path = require("path");
const { createServer } = require("https");
const fs = require("fs");
const WebSocket = require("ws");

const app = express();
app.use(express.static(path.join(__dirname, "/public")));

//// SECTION FOR SERVER

let wss;
let server;
if (!IS_LOCAL) {
  var privateKey = fs.readFileSync(
    "/etc/letsencrypt/live/forceshifters.website/privkey.pem"
  );
  var certificate = fs.readFileSync(
    "/etc/letsencrypt/live/forceshifters.website/fullchain.pem"
  );

  server = createServer(
    {
      key: privateKey,
      cert: certificate,
    },
    app
  );
  wss = new WebSocket.Server({ server });
}

//// SECTION FOR LOCAL DEBUG
else {
  wss = new WebSocket.Server({ port: 8080 });
  console.log("were listening 8080");
}

//// END SECTION

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
  set,
  get,
  remove,
  off,
} = require("firebase/database");

let firebaseApp;
let db;

try {
  if (IS_LOCAL) {
    const emulatorUrl = "http://127.0.0.1:9000/?ns=force-animals";
    firebaseConfig.databaseURL = emulatorUrl;
  }
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
  console.log("client connected");

  let battleRef;
  let lobbyRef;
  // {
  //   playerName: string;
  //   shifterAvatar: string;
  // }

  let playerInfo;

  ws.on("message", function (message) {
    const parsedMessage = JSON.parse(message);
    console.log("parsedMessage", parsedMessage);

    if (parsedMessage.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }), function () {
        //
        // Ignoring errors.
        //
      });
    }

    if (parsedMessage.type === "roomName") {
      const { roomName } = parsedMessage;
      battleRef = ref(db, `${roomName}`);

      onValue(battleRef, (snapshot) => {
        const data = snapshot.val();

        const battleData = {
          type: "battle",
          data,
        };

        ws.send(JSON.stringify(battleData), function () {
          //
          // Ignoring errors.
          //
        });
      });
    }

    if (parsedMessage.type === "lobby") {
      lobbyRef = ref(db, `lobby`);

      playerInfo = JSON.parse(parsedMessage.playerInfo);

      // Add oneself to the lobby list
      set(ref(db, `lobby/${playerInfo.playerName}`), {
        name: playerInfo.playerName,
        shifterAvatar: playerInfo.shifterAvatar,
      });

      onValue(lobbyRef, (snapshot) => {
        const data = snapshot.val();

        const lobbyData = {
          type: "lobby",
          data: {
            players: data,
          },
        };

        ws.send(JSON.stringify(lobbyData), function () {
          //
          // Ignoring errors.
          //
        });
      });
    }

    if (parsedMessage.type === "challenge") {
      const opponent = parsedMessage.opponent;

      if (!opponent) {
        return;
      }

      get(ref(db, `lobby/${opponent}`)).then((value) => {
        const opponentExistingLobby = value.val();

        if (opponentExistingLobby != null) {
          //TODO: add check if the challenge exists already or not
          // if (
          //   !!playerInfo.challenges &&
          //   playerInfo.challenges.some((name) => name === opponent)
          // ) {
          //   return;
          // }

          set(ref(db, `lobby/${opponent}`), {
            challenges: !!playerInfo.challenges
              ? [playerInfo.playerName]
              : [...playerInfo.challenges, playerInfo.playerName],
            ...opponentExistingLobby,
          });
        }
      });
    }

    if (parsedMessage.type === "enterBattle") {
      const opponent = parsedMessage.opponent;

      if (!opponent) {
        return;
      }

      const randomBattleName = Math.random().toString(36).substring(7);
      // set in battle to both players
      get(ref(db, `lobby/${playerInfo.playerName}`)).then((value) => {
        const yourExistingLobby = value.val();
        set(ref(db, `lobby/${playerInfo.playerName}`), {
          ...yourExistingLobby,
          roomName: randomBattleName,
        });

        get(ref(db, `lobby/${opponent}`)).then((value) => {
          const opponentExistingLobby = value.val();
          set(ref(db, `lobby/${opponent}`), {
            ...opponentExistingLobby,
            roomName: randomBattleName,
          });
        });
      });
    }
  });

  ws.on("close", function () {
    console.log(`"stopping client interval for ${playerInfo}`);

    // if (battleRef) {
    //   off(battleRef);
    // }
    // if (lobbyRef) {
    //   off(lobbyRef);
    // }

    if (playerInfo == undefined || playerInfo == null) {
      return;
    } else {
      // lobby cleanup
      if (!!playerInfo && !!playerInfo.playerName) {
        remove(ref(db, `lobby/${playerInfo.playerName}`));
      }
    }
  });
});

if (!IS_LOCAL) {
  server.listen(8080, function () {
    console.log("Listening on http://0.0.0.0:8080");
  });
}
