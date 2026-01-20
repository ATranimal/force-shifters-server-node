"use strict";

// TODO: Exchange for env variables
const IS_LOCAL = true; // true = lowdb (offline), false = Firebase RTDB (production)

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
    "/etc/letsencrypt/live/forceshifters.website/privkey.pem",
  );
  var certificate = fs.readFileSync(
    "/etc/letsencrypt/live/forceshifters.website/fullchain.pem",
  );

  server = createServer(
    {
      key: privateKey,
      cert: certificate,
    },
    app,
  );
  wss = new WebSocket.Server({ server });
}

//// SECTION FOR LOCAL DEBUG
else {
  wss = new WebSocket.Server({ port: 8082 });
  console.log("were listening 8082");
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

// Import lowdb for offline mode
const {
  getDatabase: getLowdbDatabase,
  ref: lowdbRef,
  onValue: lowdbOnValue,
  set: lowdbSet,
  get: lowdbGet,
  remove: lowdbRemove,
  off: lowdbOff,
} = require("../force-animals/express-server/src/storage/LowdbDatabase");

let firebaseApp;
let db;

// Initialize database based on mode
if (IS_LOCAL) {
  // Use lowdb for local/offline mode
  // Path is relative to working directory - Unity will set this when launching
  // Or use DB_PATH environment variable if provided
  const dbPath = process.env.DB_PATH || "./data/offline-db.json";
  db = getLowdbDatabase(dbPath);
  console.log("Using Lowdb for local/offline mode");
  console.log(`Database path: ${dbPath}`);
} else {
  // Use Firebase RTDB for production
  try {
    firebaseApp = initializeApp(firebaseConfig);
    db = getDatabase(firebaseApp);
    console.log("Using Firebase RTDB (production)");
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
}

// Create abstraction layer to use correct functions based on mode
const dbFunctions = IS_LOCAL
  ? {
      ref: lowdbRef,
      onValue: lowdbOnValue,
      set: lowdbSet,
      get: lowdbGet,
      remove: lowdbRemove,
      off: lowdbOff,
    }
  : { ref, onValue, set, get, remove, off };

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
      battleRef = dbFunctions.ref(db, `${roomName}`);

      dbFunctions.onValue(battleRef, (snapshot) => {
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
      lobbyRef = dbFunctions.ref(db, `lobby`);

      playerInfo = JSON.parse(parsedMessage.playerInfo);

      // Add oneself to the lobby list
      dbFunctions.set(dbFunctions.ref(db, `lobby/${playerInfo.playerName}`), {
        name: playerInfo.playerName,
        shifterAvatar: playerInfo.shifterAvatar,
      });

      dbFunctions.onValue(lobbyRef, (snapshot) => {
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
      const challengeType = parsedMessage.challengeType;

      if (!opponent) {
        return;
      }

      dbFunctions
        .get(dbFunctions.ref(db, `lobby/${opponent}`))
        .then((value) => {
          const opponentExistingLobby = value.val();

          if (opponentExistingLobby != null) {
            const existingChallenges = opponentExistingLobby.challenges || [];
            const challengeAlreadyExists = existingChallenges.some(
              (challenge) => challenge.playerName === playerInfo.playerName,
            );

            if (!challengeAlreadyExists) {
              dbFunctions.set(dbFunctions.ref(db, `lobby/${opponent}`), {
                challenges: [
                  ...existingChallenges,
                  {
                    playerName: playerInfo.playerName,
                    challengeType,
                  },
                ],
                ...opponentExistingLobby,
              });
            }
          }
        });
    }

    if (parsedMessage.type === "enterBattle") {
      const opponent = parsedMessage.opponent;

      if (!opponent) {
        return;
      }
      dbFunctions
        .get(dbFunctions.ref(db, `lobby/${playerInfo.playerName}`))
        .then((value) => {
          const yourLobby = value.val();

          const existingChallenges = yourLobby.challenges || [];
          const thisChallenge = existingChallenges.find(
            (challenge) => challenge.playerName === opponent,
          );

          const randomBattleName = Math.random().toString(36).substring(7);
          // set in battle to both players
          dbFunctions
            .get(dbFunctions.ref(db, `lobby/${playerInfo.playerName}`))
            .then((value) => {
              const yourExistingLobby = value.val();
              dbFunctions.set(
                dbFunctions.ref(db, `lobby/${playerInfo.playerName}`),
                {
                  ...yourExistingLobby,
                  roomName: randomBattleName,
                  challengeType: thisChallenge.challengeType,
                },
              );

              dbFunctions
                .get(dbFunctions.ref(db, `lobby/${opponent}`))
                .then((value) => {
                  const opponentExistingLobby = value.val();
                  dbFunctions.set(dbFunctions.ref(db, `lobby/${opponent}`), {
                    ...opponentExistingLobby,
                    roomName: randomBattleName,
                    challengeType: thisChallenge.challengeType,
                  });
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
        dbFunctions.remove(
          dbFunctions.ref(db, `lobby/${playerInfo.playerName}`),
        );
      }
    }
  });
});

if (!IS_LOCAL) {
  server.listen(8080, function () {
    console.log("Listening on http://0.0.0.0:8080");
  });
}
