

// A route is a combination of a URI, a HTTP request method (GET, POST, and so on), and one or more 
// handlers for the endpoint. It takes the following structure app.METHOD(path, [callback...], callback),
// where app is an instance of express, METHOD is an HTTP request method, path is a path on the server, 
// and callback is the function executed when the route is matched.
function registerPeer(request, response) {
  console.log("registerPeer from host: %s", request.ip);
  response.send("thanks for registering");
}

// Returns the peer html file.
function peerApp(request, response) {
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

var express = require('express');
var app = express();

// Routers.
app.use(express.static(__dirname + '/public'));
app.post('/register', registerPeer);
app.get('/app', peerApp);
app.get('/script/:name', publicScriptRouter);

// Listen locally.
app.set('port', (process.env.PORT || 5000));
app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'));
});