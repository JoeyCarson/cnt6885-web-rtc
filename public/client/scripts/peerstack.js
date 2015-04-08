function peerInit(localVideoID)
{
	console.log("starting peer");
	rtcPeer.localVideoID = localVideoID;
	initSignalChannel();
	getUserMedia({audio:true, video:true}, gotUserMedia, userMediaFailed);
}

function gotUserMedia(media)
{
	console.log("user media success");
	console.log("querying for ICE servers");
	
	rtcPeer.localStream = media;
	var url = URL.createObjectURL(media);

	document.getElementById(rtcPeer.localVideoID).src = url;

	// Find some TURN servers to help out if we're behind a corporate network.
	window.turnserversDotComAPI.iceServers(onIceServersReady);
}

function initSignalChannel()
{
	rtcPeer.channel = new WebSocket( location.origin.replace(/^http/, 'ws') + "/peers" );
	rtcPeer.channel.onmessage = updateChannelMessage;  
	rtcPeer.channel.onopen = function(event) { 
		//rtcPeer.channel.send(JSON.stringify({bull:"shit"})); }
		console.log("remote socket opened");
	}
}

function updateChannelMessage(event) {

	var msgObj = JSON.parse(event.data);

	if ( !msgObj || !msgObj.signalType ) {
		
		console.log("updateChannelMessage: malformed response!! %o", msgObj );

	} else if ( msgObj.signalType == "welcome" ) {

		console.log("updateChannelMessage: received welcome from host.");
		handleWelcome(msgObj);
	} else if ( msgObj.signalType == "peer_joined" ) {
		console.log("updateChannelMessage: received peer_joined from host.");
		if ( msgObj.peer.id == rtcPeer.description.id ) {
			console.log("updateChannelMessage: peer_joined: received notification that I've been added to the room. " + msgObj.peer.id);
		} else {
			console.log("updateChannelMessage: peer_joined: peer %s is now online.", msgObj.peer.id);
		}
	}

}

function handleWelcome(msgObj)
{
	if ( msgObj.id ) {
	
		console.log("updateChannelMessage: welcome: received id from host. " + msgObj.id);
		rtcPeer.description.id = msgObj.id;
	
	} else {
		console.log("updateChannelMessage: malformed response.  no id.");
	}
}

function userMediaFailed(error)
{
	console.log("user media failed");
}

function onIceServersReady(data)
{
	console.log("onIceServersReady: %o", data);

	data[data.length] = {url: "stun:stun.stunprotocol.org:3478"};

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
	rtcPeer.conn.oniceconnectionstatechange = onIceConnStateChange;
}

function createOfferSuccess(offer)
{
	console.log("createOfferSuccess %o", offer);

	// Write the offer to the RTC stack.
	rtcPeer.conn.setLocalDescription(offer);

	// Save the SDP description to the server message.
	rtcPeer.description.sdp = offer;
}

function createOfferFailure(domError)
{
	console.log("createOfferFailure %o", offer);
}

function onIceCandidate(event)
{

	if ( event.candidate ) {
		console.log("onIceCandidate candidate");
		rtcPeer.description.iceCandidates[rtcPeer.description.iceCandidates.length] = event.candidate;
	} else if ( rtcPeer.description.iceCandidates.length > 0 ) {

		// if we're receiving the null candidate, it appears that the stack has found all it can.
		// this logic may not be sound, but it appears to be consistent for the time being.
		// this is sort of the null termination of the list.
		console.log("onIceCandidate candidate is null. dump candidates.");
		for ( var i = 0; i < rtcPeer.description.iceCandidates.length; i++ ) {
			var candidate = rtcPeer.description.iceCandidates[i];
			console.log("candidate[%d] = %o", i, candidate);
			rtcPeer.conn.addIceCandidate(candidate);
		}

		// Register back with the server.
		var jsonStr = JSON.stringify( { signalType: "register", peerDescription: rtcPeer.description } );
		rtcPeer.channel.send(jsonStr);

		// Legacy...
		//$.post("register", jsonStr, function(data, status){ console.log("Data: " + data + "\nStatus: " + status); });
	} else {
		console.log("can't register with server.  no ice candidates");
	}
}

function onIceConnStateChange(event)
{
	console.log("onIceConnStateChange %s", rtcPeer.conn.iceConnectionState);
}

// 
window.onbeforeunload = function() {
	console.log("user is closing");
    websocket.onclose = function () {}; // disable onclose handler first
    rtcPeer.channel.close()
};

// The rtc peer context object.
var rtcPeer = { 
				conn: null, 
				channel: null,
				description: {
					status: "Vegas Baby",
					sdp: null,
					iceCandidates: []
				}
			};







