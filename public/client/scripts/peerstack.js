

var C2H_SIGNAL_TYPE_REGISTER = "register";
var C2H_SIGNAL_TYPE_HEARTBEAT = "heartbeat";
var C2H_SIGNAL_TYPE_INVITE = "invite";
var C2H_SIGNAL_TYPE_ACCEPT = "accept";
var C2H_SIGNAL_TYPE_ICE_DIST = "distribute_ice";

var H2C_SIGNAL_TYPE_WELCOME = "welcome";
var H2C_SIGNAL_TYPE_ERROR = "error";
var H2C_SIGNAL_TYPE_PEER_ADDED = "peer_joined";
var H2C_SIGNAL_TYPE_PEER_LEFT = "peer_left";
var H2C_SIGNAL_TYPE_INVITE = "conversation_invite";
var H2C_SIGNAL_TYPE_ACCEPT = "conversation_accept";
var H2C_SIGNAL_TYPE_ICE = "add_ice_candidates";

function createClientMsg(type)
{
	var msg = { signalType: type };
	if ( type == C2H_SIGNAL_TYPE_REGISTER ) {
		msg.peerDescription = rtcPeer.description;
	} else if ( type == C2H_SIGNAL_TYPE_HEARTBEAT ) {
		// do we need anything here?
	} else if ( type == C2H_SIGNAL_TYPE_INVITE ) { 
		// do we need anything here?
	} else if ( type == C2H_SIGNAL_TYPE_ACCEPT ) { 
		// do we need anything here?
	} else if ( type == C2H_SIGNAL_TYPE_ICE_DIST ) {
		// do we need anything here?
	} else {
		console.log("createClientMsg: invalid type given : %s.  expect to get an error response.", type);
		msg = {};
	}

	return msg;
}

function initSignalChannel()
{

	rtcPeer.channel = new WebSocket( location.origin.replace(/^http/, 'ws') + "/peers" );
	rtcPeer.channel.onmessage = updateChannelMessage;
	
	rtcPeer.channel.onopen = function(event) { 
		console.log("remote socket opened");

		// We need to consistently send a heartbeat to keep the connection open.
		rtcPeer.channelIntervalID = setInterval(sendHeartbeat, 40000);
	}

	rtcPeer.channel.onclose = function(event) {
		console.log("host closed remote socket.");
		if ( rtcPeer.channelIntervalID >= 0 ) {
			clearInterval(rtcPeer.channelIntervalID);
		}
	}
}

function sendHeartbeat()
{
	console.log("sendHeartbeat");
	rtcPeer.channel.send( JSON.stringify( createClientMsg( C2H_SIGNAL_TYPE_HEARTBEAT ) ) );
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
			console.log(msgObj);
			// add self to UI when testing UI interaction
			// without another connected peer.
			//addRemotePeer( msgObj.peer );
		} else {
			console.log("updateChannelMessage: peer_joined: peer %s is now online.", msgObj.peer.id);
			console.log(msgObj);
			addRemotePeer( msgObj.peer );
		}

	} else if ( msgObj.signalType == H2C_SIGNAL_TYPE_PEER_LEFT ) {

		console.log("updateChannelMessage: peer_left: %s", msgObj.peer);
		removeRemotePeer(msgObj.peer);

	} else if ( msgObj.signalType == H2C_SIGNAL_TYPE_INVITE ) {

		if ( remotePeers[msgObj.peer] ) {

			console.log("updateChannelMessage: conversation_invite from %s sdp: %o", msgObj.peer, msgObj.sdp);

			// Hi there.  I accept.
			answerCall( remotePeers[msgObj.peer], msgObj.sdp );

		} else {

			console.log("updateChannelMessage: conversation_invite couldn't resolve %s", msgObj.peer);
		}

	} else if ( msgObj.signalType == H2C_SIGNAL_TYPE_ACCEPT ) {

		rtcPeer.conn.setRemoteDescription( new RTCSessionDescription(msgObj.sdp ) );

	} else if ( msgObj.signalType == H2C_SIGNAL_TYPE_ICE ) {

		for ( var i = 0; i < msgObj.candidates.length; i++ ) {
			rtcPeer.conn.addIceCandidate( new RTCIceCandidate( msgObj.candidates[i] ) );
		}

	} else if ( msgObj.signalType == H2C_SIGNAL_TYPE_ERROR ) {
		// TODO: dump better error messages in here.
		console.log("updateChannelMessage: received error: ");	
	}

}

function addRemotePeer(peerObj)
{
	remotePeers[peerObj.id] = peerObj;
	var ui = createPeerUIObj(peerObj);
	$("#connectedPeerList").append( ui );
	ui.click(function(event) { 
		var id = $(ui).data("peer_id");
		if ( id ) {
			var p = remotePeers[id];
			console.log("selected peer %o", p);
			initCall(p);
		}
	});
}

function removeRemotePeer(peerID)
{
	// Remove it from the UI, if it exists.
	var peerUI = findPeerUIObj(peerID);
	if ( peerUI ) {
		$(peerUI).remove();
	}

	// Remove it from our tracking.  This ccould be done in the 
	// but that makes assumptions.  It's not a stretch to just 
	// remove it from the object here.
	if ( remotePeers[peerID] ) {
		delete remotePeers[peerID];
	} 
}

function findPeerUIObj(peerID)
{

	if ( remotePeers[peerID] ) 
	{
		var uiObjects = $("#connectedPeerList").children();
		for ( var i = 0; i < uiObjects.length; i++ ) {
			if ( $(uiObjects[i]).data("peer_id") == peerID ) {
				console.log("found peer with id: %s", peerID);
				return uiObjects[i];
			}
		}
	}

	return null;
}

function sendInviteToPeer(remotePeer, desc) {

	var msg = createClientMsg( C2H_SIGNAL_TYPE_INVITE );
	msg.invitee = remotePeer.id;
	msg.sdp = desc;
	rtcPeer.channel.send( JSON.stringify( msg ) );
}

function sendAcceptToPeer(remotePeer, desc) {
	var msg = createClientMsg( C2H_SIGNAL_TYPE_ACCEPT );
	msg.sdp = desc;
	msg.peer = remotePeer.id;
	rtcPeer.channel.send( JSON.stringify( msg ) );
}

/**
 * Send the list of candidates to each of the given peers in the list.
 */
function sendICECandidates(candidates, toPeers)
{
	var msg = createClientMsg( C2H_SIGNAL_TYPE_ICE_DIST );
	msg.candidates = candidates;
	msg.peers = toPeers;
	rtcPeer.channel.send( JSON.stringify( msg ) );
}

function createPeerUIObj(peerObj)
{
	var ui = null;
	if ( peerObj ) {
		ui = $("<li></li>");
		var a = $("<a></a>");

		a.append("peer " + peerObj.id);

		ui.data("peer_id", peerObj.id);
		ui.append(a);
	}

	return ui;
}

function handleWelcome(msgObj)
{
	if ( msgObj.id ) {
	
		console.log("updateChannelMessage: welcome: received id from host. " + msgObj.id);
		console.log(msgObj);
		rtcPeer.description.id = msgObj.id;

		for ( var p in msgObj.peers ) {
			addRemotePeer(msgObj.peers[p]);
		}
	
	} else {
		console.log("updateChannelMessage: malformed response.  no id.");
	}
}

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
	//window.turnserversDotComAPI.iceServers(onIceServersReady);
	onIceServersReady(null); // turn servers domain is not resolved.  they must be down?
}

function userMediaFailed(error)
{
	console.log("user media failed");
}

function onIceServersReady(data)
{

	if ( !data ) {
		data = [];
	}

	// We've got the necessary ICE servers.  We can now
	// feel comfortable about creating the RTCPeerConnection.
	console.log("onIceServersReady: %o", data);

	// Remember to add in the the public stun server to the TURN
	// server list we got from the turnservers web service.
	data[data.length] = {url: "stun:stun.stunprotocol.org:3478"};

	// Copy all ice servers from the data into the rtcPeer context.
	for ( var i = 0; i < data.length; i++ ) {
		rtcPeer.iceServers[rtcPeer.iceServers.length] = data[i];
	}

	// Register back with the server.
	var jsonStr = JSON.stringify( createClientMsg( C2H_SIGNAL_TYPE_REGISTER ) );
	rtcPeer.channel.send(jsonStr);
}

function initCall(toPeer)
{
	initConn(toPeer);
	rtcPeer.conn.createOffer( function(desc){ createOfferSuccess(desc, toPeer, true) }, createOfferFailure );
}

function answerCall(fromPeer, peerOffer)
{
	initConn(fromPeer);
	rtcPeer.conn.setRemoteDescription( new RTCSessionDescription( peerOffer ) );
	rtcPeer.conn.createAnswer( function(desc){ createOfferSuccess(desc, fromPeer, false) }, createOfferFailure );
}

function initConn(peer)
{
	// 1.  Create the RTCPeerConnection
	rtcPeer.conn = new RTCPeerConnection( { iceServers: rtcPeer.iceServers } );

	// 2.  Hook up various callbacks.
	rtcPeer.conn.onicecandidate = onIceCandidate;
	rtcPeer.conn.oniceconnectionstatechange = onIceConnStateChange;
	rtcPeer.conn.onaddstream = gotRemoteStream;

	// 3.  Add the local stream.
	rtcPeer.conn.addStream(rtcPeer.localStream);

	// 4.  Remember the remote peer associated with the connection.
	rtcPeer.remotePeerID = peer.id;
}

function createOfferSuccess(desc, peer, isCaller)
{
	console.log("createOfferSuccess %o", desc);

	// Write the offer to the RTC stack.
	rtcPeer.conn.setLocalDescription(desc);

	if ( isCaller ) {
		sendInviteToPeer(peer, desc);
	} else {
		sendAcceptToPeer(peer, desc);
	}
}

function createOfferFailure(domError)
{
	console.log("createOfferFailure %o", domError);
	rtcPeer.conn = null;
}

function onIceCandidate(event)
{
	if ( event.candidate ) 
	{
		sendICECandidates([event.candidate], [rtcPeer.remotePeerID]);
	}
}

function onIceConnStateChange(event)
{
	console.log("onIceConnStateChange %s", rtcPeer.conn.iceConnectionState);
}

function gotRemoteStream(event)
{
	console.log("got remote stream");
	var remoteVideo = $("<video class='peerVideo' autoplay muted/></video>");
	remoteVideo.attr("src", URL.createObjectURL( event.stream ));
	$("#peerVideos").append( remoteVideo );
}

// 
window.onbeforeunload = function() {
	console.log("user is closing");
	// disable onclose handler first to prevent
	// potential reconnect attempts.
    websocket.onclose = function () {}; 
    rtcPeer.channel.close()
};

// The rtc peer context object.
var rtcPeer = {
				conn: null, 
				channel: null,
				channelIntervalID: -1,
				iceServers: [],
				remotePeerID: "", // ID of the remote peer associated with the connection.
				description: {
					status: "Vegas Baby"
				}
			};

// Object for tracking remote peers.
var remotePeers = {  };





