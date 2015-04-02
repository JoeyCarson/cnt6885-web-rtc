function peerInit()
{
	console.log("starting peer");
	getUserMedia({audio:true, video:true}, gotUserMedia, userMediaFailed);
}

function gotUserMedia(media)
{
	console.log("user media success");
	console.log("querying for ICE servers");
	rtcPeer.localStream = media;
	window.turnserversDotComAPI.iceServers(onIceServersReady);
}

function userMediaFailed(error)
{
	console.log("user media failed");
}

function onIceServersReady(data)
{
	console.log("onIceServersReady: %o", data);
	initConn(data);
}

function initConn(rtcConfig)
{
	// 1.  Create the RTCPeerConnection
	rtcPeer.conn = new RTCPeerConnection({ iceServers: rtcConfig });

	// 2.  Add the local stream.
	rtcPeer.conn.addStream(rtcPeer.localStream);

	// 3.  Create your offer.
	rtcPeer.conn.createOffer(createOfferSuccess, createOfferFailure);
}

function createOfferSuccess(offer)
{
	console.log("createOfferSuccess %o", offer);
	rtcPeer.conn.setLocalDescription(offer);

	// Register back with the server.
	$.post("register", { sdp: offer }, function(data, status){ alert("Data: " + data + "\nStatus: " + status); });

}

function createOfferFailure(domError)
{
	console.log("createOfferFailure %o", offer);
}

var rtcPeer = {};