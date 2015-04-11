


// Client <-> Host Protocol functions.  Move to a different file so that they can be shared.
var C2H_SIGNAL_TYPE_REGISTER = "register";
var C2H_SIGNAL_TYPE_HEARTBEAT = "heartbeat";

var H2C_SIGNAL_TYPE_WELCOME = "welcome";
var H2C_SIGNAL_TYPE_ERROR = "error";
var H2C_SIGNAL_TYPE_PEER_ADDED = "peer_joined";
var H2C_SIGNAL_TYPE_PEER_LEFT = "peer_left";

// Update channel endpoint names.
var UPDATE_ENDPOINT_PEERS = "/peers";

// Create a signal message with all asociated default properties.
// Signal senders should create this object and update it accordingly when
// building a signal message to send to a peer.
function createHostMsg(type)
{
	var msg = { signalType: type };
	
	if ( type == H2C_SIGNAL_TYPE_WELCOME ) {
		// Since we're sending a welcome message, we need to provide a list
		// of currently connected clients.
		msg.peers = {};
		for ( var addr in clients ) {
			console.log("addr " + addr);
			var c = clients[addr].description;
			if ( c && c.id ) {
				msg.peers[c.id] = c;
			}
		}
	}

	return msg;
}


// Returns the peer html file.
function peerApp(request, response) 
{
	console.log("request for peer app");
	response.sendFile('client/rtcpeer.html', {root: __dirname + "/public"});
}

function publicScriptRouter(request, response)
{
	if ( request.params.name ) {
		console.log("peer requesting script: " + request.params.name);
		response.sendFile(request.params.name, {root: __dirname + "/public/client/scripts"});
	}
}

// require modules.	
var express = require('express');
var http = require('http');
var bodyParser = require('body-parser');
var multer = require('multer');

// Tracks connected peers.
var clients = { };

// 1.  Configure the application context settings.
var app = express();
app.enable('trust proxy');
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json()); // parse json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(multer()); // for parsing multipart/form-data

// a. configure http routers.  these will handle requests coming from app.
app.set('port', (process.env.PORT || 5000));
app.get('/app', peerApp);
app.get('/script/:name', publicScriptRouter);

// 2.  Create the http server itself, passing app to be the request handler.
// app will handle routing and multiplexing of incoming requests to different
// route middleware handlers.
var http = require('http');
var WebSocketServer = require("ws").Server
var httpServer = http.createServer(app);
httpServer.listen( app.get('port') );

// 3.  Create one of these for all socket endpoints.
var wss = new WebSocketServer( { server: httpServer, path: UPDATE_ENDPOINT_PEERS } );

wss.on("connection", function(webSocket) {

	// 1.  Associate the socket with the remote address it came from.
	var clientConnID = buildConnID(webSocket);

	var exists = clients[clientConnID] != null;
	if ( exists ) {
		console.log("socket server connection: associating new connection from %s with registered peer.", clientConnID);
		clients[clientConnID].socket = webSocket;
	} else {
		console.log("socket server connection: associating new connection from %s with unregistered peer.", clientConnID);
		clients[clientConnID] = { description: null, socket: webSocket };
	}	

	// 2.  Hook up handlers for communication over this particular socket.
	webSocket.on("message", function(data, flags) {
		processMessage(webSocket, data, flags);
	});

	webSocket.on("close", function() {
		// Praise satin for closures!!
		removePeer(clientConnID);
	});

});

// Transduce the message and handle it accordingly.
function processMessage(socket, data, flags)
{
	var msg = JSON.parse(data);
	var connID = buildConnID(socket);
	if ( !msg.signalType ) {

		var msg = createHostMsg( H2C_SIGNAL_TYPE_ERROR );
		msg.errStr = "message_malformed";
		socket.send( JSON.stringify( msg ) );

	} else if ( msg.signalType == C2H_SIGNAL_TYPE_REGISTER ) {
		handleRegistration(socket, msg);
	} else if ( msg.signalType == C2H_SIGNAL_TYPE_HEARTBEAT ) {
		console.log("processMessage: received heartbeat from client: %s", connID);
	} else {
		console.log("received malformed signal from : %s", connID);
	}
}

function handleRegistration(webSocket, obj)
{
	// Create an ID for the peer.  Just use a timestamp for now.
	var uid = "" + new Date().getTime();
	var peer = obj.peerDescription;
	peer.id = uid;

	// First respond to the caller with a welcome message.
	var msg = createHostMsg( H2C_SIGNAL_TYPE_WELCOME );
	msg.id = uid;
	webSocket.send( JSON.stringify( msg ) );

	// Next, add the peer into the list.
	var clientConnID = buildConnID(webSocket);

	addPeer(clientConnID, peer);
}


function addPeer(connID, peerObj)
{
	var exists = clients[connID] != null;
	if ( exists ) {
		console.log("addPeer: updating peer description at %s", connID);
		clients[connID].description = peerObj;	
	} else {
		console.log("addPeer: adding new peer description at %s", connID);
		clients[connID] = { description: peerObj, socket: null };
	}

	// 1.  Notify all peers.
	for ( var addr in clients ) {
		var c = clients[addr];
		var socket = c.socket;
		if ( socket ) {
			sendPeerAdded(socket, peerObj);
		} else if ( c.description != peerObj ) {
			console.log("BAD!!  NULL SOCKET WHEN TRYING TO SEND UPDATE.");
		}
	}
}

function removePeer(connID) {
	
	// Remove the peer.
	if ( clients[connID] ) {

		// If the client we're removing has only connected to the server, but not yet registered,
		// then no other clients are aware of them.  We can simply remove them from tracking.
		var pDesc = clients[connID].description;

		if ( pDesc ) {
			// The client registered a peer description.  
			// Let us notify the others that they're gone.
			var peerID = pDesc.id;
			for ( var addr in clients ) {
				var cli = clients[addr];
				var sock = cli.socket;
				if ( cli.id ) {
					sendPeerRemoved(sock, peerID);
				}
			}
		}

		var wasDeleted = delete clients[connID];
		console.log("websocket: close: %s connection closed for client %s wasDeleted: %s", UPDATE_ENDPOINT_PEERS, connID, wasDeleted);	
	}
}

// Send the peer added signal with the body being peerObj to the peer at targetAddr
function sendPeerAdded(targetSocket, peerObj)
{
	var msg = createHostMsg(H2C_SIGNAL_TYPE_PEER_ADDED);
	msg.peer = peerObj;
	targetSocket.send(JSON.stringify(msg));
}

function sendPeerRemoved(targetSocket, peerID)
{
	var msg = createHostMsg(H2C_SIGNAL_TYPE_PEER_LEFT);
	msg.peerID = peerID;
	targetSocket.send( JSON.stringify( msg ) );
}

function buildConnID(webSocket)
{
	var remoteAddress = webSocket._socket.remoteAddress;
	var remotePort = webSocket._socket.remotePort;
	var clientConnID = remoteAddress + ":" + remotePort;

	return clientConnID;	
}



