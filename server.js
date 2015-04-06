
// event types.
var SIGNAL_TYPE_PEER_ADDED = "peer_added";

// Update channel endpoint names.
var UPDATE_ENDPOINT_PEERS = "peers";

// A route is a combination of a URI, a HTTP request method (GET, POST, and so on), and one or more 
// handlers for the endpoint. It takes the following structure app.METHOD(path, [callback...], callback),
// where app is an instance of express, METHOD is an HTTP request method, path is a path on the server, 
// and callback is the function executed when the route is matched.
function registerPeer(request, response) 
{

	console.log("ip is: " + request.ip);
	console.log("request is %o", request.body);

	response.send();
}

function addPeer(address, peerObj)
{
	if ( !peers.addresses.indexOf(address) )
	{
		console.log("adding peer at %s", address);

		peers.addresses.push(address);
		peers.descriptions.push(peerObj);

		// 1.  Notify other connected peers, except for the one that we're  adding.
		for ( var i = 0; i < peers.addresses.length; i++ ) {
			var targetAddr = peers.addresses[i];
			if ( targetAddr != address ) {
				sendPeerAdded(targetAddr, peerObj);
			}
		}

		//

	}
}

// Send the peer added signal with the body being peerObj to the peer at targetAddr
function sendPeerAdded(targetAddr, peerObj)
{
	var msg = createSignalMsg();
	msg.signalType = SIGNAL_TYPE_PEER_ADDED;
	msg.peer = peerObj;
}

// Create a signal message with all asociated default properties.
// Signal senders should create this object and update it accordingly when
// building a signal message to send to a peer.
function createSignalMsg()
{
	return { signalType: "unset" };
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
var WebSocketServer = require("ws").Server
var bodyParser = require('body-parser');
var multer = require('multer');

// Tracks connected peers.
var peers = {

				addresses: [], // array of addresses of each peer, determined via request.ip.
				descriptions: [] // array of description objects, ordered according to the addresses list.
			};

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
var httpServer = http.createServer(app);
httpServer.listen( app.get('port') );

// 3.  Create the 
var wss = new WebSocketServer( { server: httpServer } );

wss.on("connection", function(ws) {
  console.log("websocket connection open")

  ws.on("close", function() {
    console.log("websocket connection close")
  })
})



