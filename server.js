
// event types.
var SIGNAL_TYPE_PEER_ADDED = "peer_joined";
var SIGNAL_TYPE_PEER_LEFT = "peer_left";

// Update channel endpoint names.
var UPDATE_ENDPOINT_PEERS = "/peers";

// A route is a combination of a URI, a HTTP request method (GET, POST, and so on), and one or more 
// handlers for the endpoint. It takes the following structure app.METHOD(path, [callback...], callback),
// where app is an instance of express, METHOD is an HTTP request method, path is a path on the server, 
// and callback is the function executed when the route is matched.
function registerPeer(request, response) 
{
	var uid = new Date().getTime();
	var peer = request.body;

	// accept the request.
	response.send( JSON.stringify( { peerID: uid } ) );

	// add the new peer.
	peer.id = uid;
	addPeer(request.ip, peer);
}

function addPeer(address, peerObj)
{
	var exists = clients[address] != null;
	if ( exists ) {
		console.log("addPeer: updating peer description at %s", address);
		clients[address].description = peerObj;	
	} else {
		console.log("addPeer: adding new peer description at %s", address);
		clients[address] = { description: peerObj, socket: null };
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

function removePeer(address) {
	
	// Remove the peer.
	var peerID = clients[address].id;
	var wasDeleted = delete clients[address];
	console.log("websocket: close: %s connection closed for client %s wasDeleted: %s", UPDATE_ENDPOINT_PEERS, address, wasDeleted);	

	// Let other clients know.
	for ( var addr in clients ) {
		var cli = clients[addr];
		var sock = cli.socket;
		if ( sock, id ) {
			sendPeerRemoved(sock, peerID);
		}
	}
}

// Send the peer added signal with the body being peerObj to the peer at targetAddr
function sendPeerAdded(targetSocket, peerObj)
{
	var msg = createHostMsg(SIGNAL_TYPE_PEER_ADDED);
	msg.peer = peerObj;
	targetSocket.send(JSON.stringify(msg));
}

function sendPeerRemoved(targetSocket, peerID)
{
	var msg = createHostMsg(SIGNAL_TYPE_PEER_LEFT);
	msg.peerID = peerID;
	targetSocket.send( JSON.stringify( msg ) );
}

// Create a signal message with all asociated default properties.
// Signal senders should create this object and update it accordingly when
// building a signal message to send to a peer.
function createHostMsg(type)
{
	return { signalType: type };
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
app.post('/register', registerPeer);
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
	var remoteAddress = webSocket._socket.remoteAddress;
	var exists = clients[remoteAddress] != null;
	if ( exists ) {
		console.log("socket server connection: associating new connection from %s with registered peer.", remoteAddress);
		clients[remoteAddress].socket = webSocket;
	} else {
		console.log("socket server connection: associating new connection from %s with unregistered peer.", remoteAddress);
		clients[remoteAddress] = { description: null, socket: webSocket };
	}	

	webSocket.on("message", function(data, flags) {
		var obj = JSON.parse(data);
		console.log("websocket: message: obj is %o", obj);
		webSocket.send("thanks!!");
	});

	webSocket.on("close", function() {
		// Praise satin for closures!!
		removePeer(remoteAddress);
	});

});

