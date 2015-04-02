var express = require('express');
var cool =  require("cool-ascii-faces");
var app = express();


// A route is a combination of a URI, a HTTP request method (GET, POST, and so on), and one or more 
// handlers for the endpoint. It takes the following structure app.METHOD(path, [callback...], callback),
// where app is an instance of express, METHOD is an HTTP request method, path is a path on the server, 
// and callback is the function executed when the route is matched.
function registerPeer(request, response) {
  console.log("registerPeer");
  response.send("hello");
}

// Returns the peer html file.
function peerApp(request, response) {
	console.log("request for peer app");
	response.sendFile('../client/rtcpeer.html');
}


app.use(express.static(__dirname + '/public'));
app.get('/register', registerPeer);
app.get('/app', peerApp);

// Listen locally.
app.set('port', (process.env.PORT || 5000));
app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'));
});