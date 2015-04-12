
// Changes to implement.
// 1.  Create a sendObject(webSocket, obj) - Should call JSON.stringify() on object and call webSocket.send(jsonStr).

// Client <-> Host Protocol functions.  Move to a different file so that they can be shared.
var C2H_SIGNAL_TYPE_REGISTER = "register";
var C2H_SIGNAL_TYPE_HEARTBEAT = "heartbeat";
var C2H_SIGNAL_TYPE_INVITE = "invite";

var H2C_SIGNAL_TYPE_WELCOME = "welcome";
var H2C_SIGNAL_TYPE_ERROR = "error";
var H2C_SIGNAL_TYPE_PEER_ADDED = "peer_joined";
var H2C_SIGNAL_TYPE_PEER_LEFT = "peer_left";
var H2C_SIGNAL_TYPE_INVITE = "conversation_invite";

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
			//console.log("addr " + addr);
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
var httpServer = http.createServer(app);
httpServer.listen( app.get('port') );

// 3.  Create one of these for all socket endpoints.
var WebSocketServer = require("ws").Server
var wss = new WebSocketServer( { server: httpServer, path: UPDATE_ENDPOINT_PEERS } );

// Hook up callback for socket server connection.  When we have a connection, we will have a unique socket.
// Hook up callbacks to that unqiue socket.
wss.on("connection", function(webSocket) {

	// 1.  Associate the socket with the remote address it came from.
	var clientConnID = buildConnID(webSocket);

	var exists = clients[clientConnID] != null;
	if ( exists ) {
		// This probably should never happen.  Before when we were using ajax to register, it was possible.  Now everything
		// is all websocket.  Registration requires initial connection first.
		console.log("[LEGACY PATH] socket server connection: associating new connection from %s with registered peer.", clientConnID);
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

		handleBadPDU(socket);

	} else if ( msg.signalType == C2H_SIGNAL_TYPE_REGISTER ) {

		handleRegistration(socket, msg);

	} else if ( msg.signalType == C2H_SIGNAL_TYPE_INVITE ) {

		handleSendInvite(socket, msg);

	} else if ( msg.signalType == C2H_SIGNAL_TYPE_HEARTBEAT ) {

		console.log("processMessage: received heartbeat from client: %s", connID);

	} else {

		console.log("received malformed signal from : %s", connID);
		handleBadPDU(socket);
	}
}

function handleBadPDU(webSocket)
{
	var msg = createHostMsg( H2C_SIGNAL_TYPE_ERROR );
	msg.errStr = "message_malformed";
	webSocket.send( JSON.stringify( msg ) );	
}

function handleSendInvite(webSocket, obj) 
{
	var connID = buildConnID(webSocket);

	if ( connID != "" ) {

		//console.log("handleSendInvite: connID: %s", connID);
		
		var callerPeer = clients[connID];
		var receiverPeer = findPeerByID( obj.invitee );

		if ( receiverPeer ) {
			console.log("handleSendInvite: caller %s initiating a call to %s", callerPeer.description.id, receiverPeer.description.id);
			
			var msg = createHostMsg( H2C_SIGNAL_TYPE_INVITE );
			msg.peer = callerPeer.description.id;
			receiverPeer.socket.send( JSON.stringify( msg ) );
		}
	}
}

function findPeerByID(peerID)
{
	for ( addr in clients ) {
		var c = clients[addr];
		//console.log("c: %s %o", addr, c);
		if ( c && c.description && c.description.id == peerID ) {
			console.log("findPeerByID: found peerID: %s at address %s", peerID, addr);
			return c;
		}
	}

	console.log("findPeerByID: unable to locate client for peerID: %s", peerID);
	return null;
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
		// This is another path that probably shouldn't ever occur.  This was plausible when
		// ajax was being used to register but all updates went over web socket.  The client
		// should always exist if we're calling addPeer.
		console.log("[LEGACY PATH] addPeer: adding new peer description at %s", connID);
		clients[connID] = { description: peerObj, socket: null };
	}

	// 1.  Notify all peers.
	for ( var addr in clients ) {
		var c = clients[addr];
		var socket = c.socket;
		if ( socket ) {
			sendPeerAdded(socket, peerObj);
		} else if ( c.description != peerObj ) {
			console.log("[BAD] NULL SOCKET WHEN TRYING TO SEND UPDATE.");
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
	return webSocket._socket.remoteAddress + ":" + webSocket._socket.remotePort;
}



