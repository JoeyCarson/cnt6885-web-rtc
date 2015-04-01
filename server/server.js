function onRequest(request, response) {

	console.log("request received");  

	response.writeHead(200, {"Content-Type": "text/plain"});
	response.write("Hello World");
	response.end();
}


var http = require("http");
console.log("starting server");
http.createServer(onRequest).listen(8888);