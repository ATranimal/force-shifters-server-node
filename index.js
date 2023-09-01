"use strict";

const express = require("express");
const path = require("path");
const { createServer } = require("http");

const WebSocket = require("ws");

const app = express();
app.use(express.static(path.join(__dirname, "/public")));

const server = createServer(app);
const wss = new WebSocket.Server({ server });

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
const { getFirestore, collection, getDocs } = require("firebase/firestore");
const { getDatabase, ref, child, get, onValue } = require("firebase/database");

const fbApp = initializeApp(firebaseConfig);
const db = getDatabase(fbApp);

wss.on("connection", function (ws) {
  ws.on("message", function (message) {
    console.log("message", message);
    const parsedMessage = JSON.parse(message);
    console.log("parsedMessage", parsedMessage);

    if (parsedMessage.type === "roomName") {
      const roomName = parsedMessage.roomName;
      const dbRef = ref(db, `${roomName}`);
      onValue(dbRef, (snapshot) => {
        const data = snapshot.val();
        ws.send(JSON.stringify(data), function () {
          //
          // Ignoring errors.
          //
        });
      });
    }
  });

  ws.on("close", function () {
    console.log("stopping client interval");
  });
});

server.listen(8080, function () {
  console.log("Listening on http://0.0.0.0:8080");
});
