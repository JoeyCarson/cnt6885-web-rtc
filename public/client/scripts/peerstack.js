function peerInit(localVideoID)
{
	console.log("starting peer");
	rtcPeer.localVideoID = localVideoID;
	getUserMedia({audio:true, video:true}, gotUserMedia, userMediaFailed);
}

function gotUserMedia(media)
{
	console.log("user media success");
	console.log("querying for ICE servers");
	
	rtcPeer.localStream = media;
	var url = URL.createObjectURL(media);

	document.getElementById(rtcPeer.localVideoID).src = url;
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

	// 4.  Hook up various callbacks.
	rtcPeer.conn.onicecandidate = onIceCandidate;
}

function onIceCandidate(event)
{
	console.log("onIceCandidate %o", event.candidate);
}

function createOfferSuccess(offer)
{
	console.log("createOfferSuccess %o", offer);
	rtcPeer.conn.setLocalDescription(offer);

	// Register back with the server.
	$.post("register", { sdp: offer, status:"Vegas Baby!!" }, function(data, status){ console.log("Data: " + data + "\nStatus: " + status); });
}

function createOfferFailure(domError)
{
	console.log("createOfferFailure %o", offer);
}

var rtcPeer = {};