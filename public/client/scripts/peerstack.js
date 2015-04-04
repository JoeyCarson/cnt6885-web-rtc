function peerInit(localVideoID)
{
	console.log("starting peer");
	rtcPeer.localVideoID = localVideoID;
	getUserMedia({audio:true, video:true}, gotUserMedia, userMediaFailed);
	initSignalChannel();
}

function gotUserMedia(media)
{
	console.log("user media success");
	console.log("querying for ICE servers");
	
	rtcPeer.localStream = media;
	var url = URL.createObjectURL(media);

	// comment out to conserve battery during development.
	//document.getElementById(rtcPeer.localVideoID).src = url;
	window.turnserversDotComAPI.iceServers(onIceServersReady);
}

function initSignalChannel()
{
	//rtcPeer.channel = new WebSocket("");
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
	rtcPeer.conn.oniceconnectionstatechange = onIceConnStateChange;
}

function createOfferSuccess(offer)
{
	console.log("createOfferSuccess %o", offer);

	// Write the offer to the RTC stack.
	rtcPeer.conn.setLocalDescription(offer);

	// Save the SDP description to the server message.
	rtcPeer.serverMsg.sdp = offer;
}

function createOfferFailure(domError)
{
	console.log("createOfferFailure %o", offer);
}

function onIceCandidate(event)
{

	if ( event.candidate ) {
		console.log("onIceCandidate candidate");
		rtcPeer.serverMsg.iceCandidates[rtcPeer.serverMsg.iceCandidates.length] = event.candidate;
	} else {

		// if we're receiving the null candidate, it appears that the stack has found all it can.
		// this logic may not be sound, but it appears to be consistent for the time being.
		console.log("onIceCandidate candidate is null. dump candidates.");
		for ( var i = 0; i < rtcPeer.serverMsg.iceCandidates.length; i++ ) {
			var candidate = rtcPeer.serverMsg.iceCandidates[i];
			console.log("candidate[%d] = %o", i, candidate);
			rtcPeer.conn.addIceCandidate(candidate);
		}

		if ( rtcPeer.serverMsg.iceCandidates.length > 0 ) {
			// Register back with the server.
			var jsonStr = JSON.stringify( { peerDescription: rtcPeer.serverMsg } );
			$.post("register", jsonStr, function(data, status){ console.log("Data: " + data + "\nStatus: " + status); });
		} else {
			console.log("can't register with server.  no ice candidates");
		}
	}
}

function onIceConnStateChange(event)
{
	console.log("onIceConnStateChange %s", rtcPeer.conn.iceConnectionState);
}

// The rtc peer context object.
var rtcPeer = { 
				conn: null, 
				channel: null, 
				serverMsg: {
					status: "Vegas Baby",
					sdp: null,
					iceCandidates: []
				}
			};







