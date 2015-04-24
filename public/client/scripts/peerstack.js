

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

// Anything associated with the server context should be added here.
var host = {
	channel: null,
	channelIntervalID: -1,
	iceServers: []
}


// TODO:  Get rid of this!  The self peer is not a connection, it's 
// simply a local client context object.  This was a mistake at the time
// to get multiple connections working, moving them out of this local
// context into their own object.  Change it!!
var selfPeer = createPeerConn(); 


// TODO:  Aggregate both into a single list.  Having two lists is another
// result of the meantime workflow to get multiple connections working, by
// putting them into their own specific container.  All peers should be
// in one object with connection state flags or something to identify
// which ones are connected, not just putting them into a separate list.
var remotePeers = { }; 		// Object for tracking remote peers that are registerd with the host.
var peerConnections = { };	// Object for tracking open connections to remote peers.



function createClientMsg(type)
{
	var msg = { signalType: type };
	if ( type == C2H_SIGNAL_TYPE_REGISTER ) {
		msg.peerDescription = selfPeer.description;
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

	host.channel = new WebSocket( location.origin.replace(/^http/, 'ws') + "/peers" );
	host.channel.onmessage = updateChannelMessage;
	
	host.channel.onopen = function(event) { 
		console.log("remote socket opened");

		// We need to consistently send a heartbeat to keep the connection open.
		host.channelIntervalID = setInterval(sendHeartbeat, 40000);
	}

	host.channel.onclose = function(event) {
		console.log("host closed remote socket.");
		if ( host.channelIntervalID >= 0 ) {
			clearInterval(host.channelIntervalID);
			host.channelIntervalID = -1;
		}
	}
}

// Send the server the heartbeat message to keep the socket
// connection open.  
function sendHeartbeat()
{
	console.log("sendHeartbeat");
	host.channel.send( JSON.stringify( createClientMsg( C2H_SIGNAL_TYPE_HEARTBEAT ) ) );
}


function updateChannelMessage(event) {

	var msgObj = JSON.parse(event.data);

	if ( !msgObj || !msgObj.signalType ) {
		
		console.log("updateChannelMessage: malformed response!! %o", msgObj );

	} else if ( msgObj.signalType == H2C_SIGNAL_TYPE_WELCOME ) {

		console.log("updateChannelMessage: received welcome from host.");
		handleWelcome(msgObj);

	} else if ( msgObj.signalType == H2C_SIGNAL_TYPE_PEER_ADDED ) {

		console.log("updateChannelMessage: received peer_joined from host.");

		if ( msgObj.peer.id == selfPeer.description.id ) {
			// Acknowledge that we've been added to the group.
			console.log("updateChannelMessage: peer_joined: received notification that I've been added to the room. " + msgObj.peer.id);
			console.log(msgObj);
		} else {
			// A new peer has joined.  Add their UI.
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

		var peerConn = getPeerConn(msgObj.peer);
		if ( peerConn ) {
			console.log("updateChannelMessage: received accept response from peer: %s", msgObj.peer);
			peerConn.conn.setRemoteDescription( new RTCSessionDescription(msgObj.sdp ) );
		} else {
			console.log("updateChannelMessage: accept: no pending connection for peer %s", msgObj.peer);
		}

	} else if ( msgObj.signalType == H2C_SIGNAL_TYPE_ICE ) {

		var peerConn = getPeerConn(msgObj.peer);
		if ( peerConn ) {
			for ( var i = 0; i < msgObj.candidates.length; i++ ) {
				peerConn.conn.addIceCandidate( new RTCIceCandidate( msgObj.candidates[i] ) );
			}
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
	// Remove the peer button from the UI, if it exists.
	var peerUI = findPeerUIObj(peerID);
	if ( peerUI ) {
		$(peerUI).remove();
	}

	// Clean up the video stream if it exists.
	var pc = getPeerConn(peerID);
	if ( pc ) {
		// Close the connection.
		pc.conn.close();

		// Clean up the video stream if it exists.
		var peerVideoUI = getPeerVideo(peerID);
		if ( peerVideoUI ) {
			$(peerVideoUI).remove();
		}
	}

	stopTrackingPeer(peerID);
}

function stopTrackingPeer(peerID)
{
	// Remove it from our tracking.  This could be done in the 
	// but that makes assumptions.  It's not a stretch to just 
	// remove it from the object here.
	if ( remotePeers[peerID] ) {
		delete remotePeers[peerID];
	}	

	if ( peerConnections[peerID] ) {
		clearInterval( peerConnections[peerID].statsIntervalID );
		delete peerConnections[peerID];
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
	host.channel.send( JSON.stringify( msg ) );
}

function sendAcceptToPeer(remotePeer, desc) {
	var msg = createClientMsg( C2H_SIGNAL_TYPE_ACCEPT );
	msg.sdp = desc;
	msg.peer = remotePeer.id;
	host.channel.send( JSON.stringify( msg ) );
}

/**
 * Send the list of candidates to each of the given peers in the list.
 */
function sendICECandidates(candidates, toPeers)
{
	var msg = createClientMsg( C2H_SIGNAL_TYPE_ICE_DIST );
	msg.candidates = candidates;
	msg.peers = toPeers;
	host.channel.send( JSON.stringify( msg ) );
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
	
		console.log("updateChannelMessage: welcome: received id from host. %s peers: %o", msgObj.id, JSON.stringify(msgObj.peers))	;
		console.log(msgObj);
		selfPeer.description.id = msgObj.id;

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
	selfPeer.localVideoID = localVideoID;
	initSignalChannel();
	getUserMedia({audio:true, video:true}, gotUserMedia, userMediaFailed);
}

function gotUserMedia(media)
{
	console.log("user media success");
	console.log("querying for ICE servers");
	
	selfPeer.localStream = media;
	var url = URL.createObjectURL(media);

	document.getElementById(selfPeer.localVideoID).src = url;

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
	data[data.length] = {url: "stun:stun.phoneserve.com:3478"};

	// Copy all ice servers from the data into the rtcPeer context.
	for ( var i = 0; i < data.length; i++ ) {
		host.iceServers[host.iceServers.length] = data[i];
	}

	// Register back with the server.
	var jsonStr = JSON.stringify( createClientMsg( C2H_SIGNAL_TYPE_REGISTER ) );
	host.channel.send(jsonStr);
}

function initCall(toPeer)
{

	if ( !peerConnections[toPeer.id] ) {

		// We're not connected to the peer.  Initialize a connection
		// to the peer.
		var peerConn = initConn(toPeer);
		if ( peerConn ) {

			// It worked.  Create the SDP offer and track the connection.
			// TODO:  Remember to remove the connection inside the failure handler.  Need to wrap it with a closure.
			peerConn.conn.createOffer( function(desc) { createOfferSuccess(peerConn, desc, toPeer, true) }, createOfferFailure );
			peerConnections[ toPeer.id ] = peerConn;
		}
 
	} else {
		console.log("initCall: already tracking a connection to peer %s", toPeer.id);
	}
}

function answerCall(fromPeer, peerOffer)
{
	// If we know about this peer, initialize a connection for it.
	if ( remotePeers[fromPeer.id] ) {

		// Create a connection to the caller.
		var callerConn = initConn(fromPeer);
		if ( callerConn ) {

			// It worked.  Set the SDP as the remote description.  Call create answer.
			callerConn.conn.setRemoteDescription( new RTCSessionDescription( peerOffer ) );
			callerConn.conn.createAnswer( function(desc) { createOfferSuccess(callerConn, desc, fromPeer, false) }, createOfferFailure );
			peerConnections[ fromPeer.id ] = callerConn;
		}

	} else {
		console.log("received call from unknown peer %s", fromPeer.id);
	}
}

// Initializes an RTCPeerConnection workflow to the given peer.
// If no connection to the peer currently exists, this method will
// create a new one, wire the appropriate callbacks, and return it.
// If 
function initConn(toPeer)
{

	// Generate a peer object.
	var peerConn = createPeerConn();

	// 1.  Create the RTCPeerConnection
	peerConn.conn = new RTCPeerConnection( { iceServers: host.iceServers } );

	// 2.  Hook up various callbacks.
	peerConn.conn.onicecandidate = function(event) { sendIceCandidate(event, toPeer); };
	peerConn.conn.onaddstream = function(event) { gotRemoteStream(event, toPeer); };
	peerConn.conn.onremovestream = function(event) { removeRemoteStream(event, toPeer); };
	peerConn.conn.oniceconnectionstatechange = function(event) { onIceConnStateChange(event, toPeer); };

	// 3.  Add the local stream.
	peerConn.conn.addStream(selfPeer.localStream);

	// 4.  Remember the remote peer associated with the connection.
	peerConn.remotePeerID = toPeer.id;

	return peerConn;
}

function createOfferSuccess(peerConn, desc, peer, isCaller)
{
	console.log("createOfferSuccess %o", desc);

	// Write the offer to the RTC stack.
	peerConn.conn.setLocalDescription(desc);

	if ( isCaller ) {
		sendInviteToPeer(peer, desc);
	} else {
		sendAcceptToPeer(peer, desc);
	}
}

function createOfferFailure(domError)
{
	// TODO: Trash the connection here.  Need to pass the connection down through here.
	console.log("createOfferFailure %o", domError);
}

// Sends the ice candidate to the given peer.
function sendIceCandidate(event, toPeer)
{
	if ( event.candidate ) 
	{
		// TODO:  This kind of sucks in the case of multiple connections
		// because we're going to be sending ICE candidates to all peers
		// even though they've received it already.  Or perhaps we can
		// simply target the target peer.
		sendICECandidates([event.candidate], [toPeer.id]);
	}
}

function onIceConnStateChange(event, peer)
{
	var pc = getPeerConn(peer.id);
	if ( pc ) {
		console.log("onIceConnStateChange %s", pc.conn.iceConnectionState);
	}
}

// Callback to add the remote stream.
function gotRemoteStream(event, fromPeer)
{
	console.log("got remote stream");
	var remoteVideoRoot = $("<div class='peerVideo'></div>");
	var remoteVideo = $("<video autoplay/></video>");
	var videoStats = createStatsUI(fromPeer);

	remoteVideoRoot.data("peer_id", fromPeer.id);
	remoteVideo.attr("src", URL.createObjectURL( event.stream ));

	remoteVideoRoot.append( remoteVideo );
	remoteVideoRoot.append( videoStats );

	$("#peerVideos").append( remoteVideoRoot );
}

function createStatsUI(peer)
{
	var ui = $("<h1>stats</h1>");
	var peerObj = getPeerConn(peer.id);
	if ( peerObj && peerObj.conn ) {
		console.log("scheduling stats");
		var vTrack = peerObj.conn.getRemoteStreams()[0].getVideoTracks()[0];
		peerObj.statsIntervalID = setInterval( function() { peerObj.conn.getSimpleStats( function(response) { updateStatsUI(ui, response); }, 1000 ); }, 5000);
	}


	return ui;
}

function updateStatsUI(ui, statsReport)
{
	//var statsMap = parseStatsReport(statsReport);
	console.log("report: %o", statsReport);
}


function removeRemoteStream(event, fromPeer)
{
	console.log("remove remote stream");
}


// Creates a new peer object.
function createPeerConn()
{

	var peer = {
		conn: null, 
		remotePeerID: "", // ID of the remote peer associated with the connection.
		statsIntervalID: -1,
		description: {
			status: "Vegas Baby"
		}
	};

	return peer;
}

function getPeerConn(id)
{
	if ( peerConnections[id] ) {
		return peerConnections[id];
	}

	return null;
}

// Returns the root object containing the 
// video and other controls assocaited with
// the given peer id.
function getPeerVideo(id)
{
	var peerVids = $("#peerVideos").children();
	for ( var i = 0; i < peerVids.length; i++ ) {
		if ( $(peerVids[i]).data("peer_id") == id ) {
			return peerVids[i];
		}
	}

	return null;
}

// 
window.onbeforeunload = function() {
	console.log("user is closing");
	// disable onclose handler first to prevent
	// potential reconnect attempts.
    websocket.onclose = function () {}; 
    host.channel.close()
};




