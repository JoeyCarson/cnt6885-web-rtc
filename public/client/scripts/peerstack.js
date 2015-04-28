

// Clear all properties of the object.
Object.prototype.clear = function()
{
	for ( var p in this ) {
		//console.log("clearing property: %s", p);
		delete this[p];
	}
}

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
var remotePeers = { }; 		// Object for tracking remote peers that are registerd with the host.  Each object is more of a server message description.
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
		// The remote socket is openened. Huzzah!!  Start setting up the party.
		console.log("remote socket opened");

		// We need to consistently send a heartbeat to keep the connection open.
		// We don't want the party ending because we haven't pinged the server.
		host.channelIntervalID = setInterval(sendHeartbeat, 40000);

		// Now that the server is aware that we're here and we're cool, lets start
		// getting the vide set up.  That way, when we get the video sent up, we
		// will tell the server that we're here and ready to market ourselves to
		// the ::Barry White's Voice:: laaadiees.
		getUserMedia({audio:true, video:true}, gotUserMedia, userMediaFailed);
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
	//console.log("sendHeartbeat");
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
		} else {
			console.log("updateChannelMessage: can't handle ice distribution to peer: %s", msgObj.peer);
		}

	} else if ( msgObj.signalType == H2C_SIGNAL_TYPE_ERROR ) {
		// TODO: dump better error messages in here.
		console.log("updateChannelMessage: received error: ");	
	}

}

function addRemotePeer(peerObj)
{
	// Start a call with this punk ass bitch.
	initCall(peerObj);
}

function removeRemotePeer(peerID)
{

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

// function findPeerUIObj(peerID)
// {

// 	if ( remotePeers[peerID] ) 
// 	{
// 		var uiObjects = $("#connectedPeerList").children();
// 		for ( var i = 0; i < uiObjects.length; i++ ) {
// 			if ( $(uiObjects[i]).data("peer_id") == peerID ) {
// 				console.log("found peer with id: %s", peerID);
// 				return uiObjects[i];
// 			}
// 		}
// 	}

// 	return null;
// }

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
	// Hmmm, fuzzing tests?
	if ( msgObj.id ) {
	
		console.log("updateChannelMessage: welcome: received id from host. %s peers: %o", msgObj.id, JSON.stringify(msgObj.peers));
		console.log(msgObj);
		selfPeer.description.id = msgObj.id;

		// Don't call everyone in the room when you log on.  They'll call you
		// when they realize that you're new to the room.
		for ( var p in msgObj.peers ) {
			// 	addRemotePeer(msgObj.peers[p]);
			remotePeers[p] = msgObj.peers[p];
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

function initCall(serverPeer)
{

	if ( !peerConnections[serverPeer.id] ) {

		// We're not connected to the peer.  Initialize a connection
		// to the peer.
		var peerConn = initConn(serverPeer);
		if ( peerConn ) {

			// It worked.  Create the SDP offer and track the connection.
			// TODO:  Remember to remove the connection inside the failure handler.  Need to wrap it with a closure.
			peerConn.conn.createOffer( function(desc) { createOfferSuccess(peerConn, desc, serverPeer, true) }, createOfferFailure );
			peerConnections[ serverPeer.id ] = peerConn;
		}
 
	} else {
		console.log("initCall: already tracking a connection to peer %s", serverPeer.id);
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
	/// TODO:  Fix the function interface.  We're passing the actual generated connection
	// to gotRemoteStream but the server message to every other function.  It works, but
	// it seems unclear for all others to not take the actual connection.  Doing that will
	// also help with not needing two different objects to track the peers, since we're now
	// doing multiple automatic connections.
	peerConn.conn.onicecandidate = function(event) { sendIceCandidate(event, toPeer); };
	peerConn.conn.onaddstream = function(event) { gotRemoteStream(event, peerConn); };
	peerConn.conn.onremovestream = function(event) { removeRemoteStream(event, toPeer); };
	peerConn.conn.oniceconnectionstatechange = function(event) { onIceConnStateChange(event, toPeer); };

	// 3.  Add the local stream.
	peerConn.conn.addStream(selfPeer.localStream);

	// 4.  Remember the remote peer associated with the connection.
	peerConn.id = toPeer.id;

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
function gotRemoteStream(event, peer)
{
	console.log("got remote stream");
	var remoteVideoRoot = $("<div class='peerVideo'></div>");
	// remove the muted attribute!! Just need to get rid of feedback while locally testing.
	var remoteVideo = $("<video autoplay /></video>");
	var videoStats = createStatsUI(peer);

	remoteVideoRoot.data("peer_id", peer.id);
	remoteVideo.attr("src", URL.createObjectURL( event.stream ));
	videoStats.attr("id", createStatsID(peer));

	remoteVideoRoot.append( remoteVideo );
	remoteVideoRoot.append( videoStats );

	// Append the video and iniitalize the performance statistics update callback.
	$("#peerVideos").append( remoteVideoRoot );


	peer.statsIntervalID = setInterval( function() { 
		// TODO:  Observe the 1000 passed as the second argument.  The getSimpleStats API is an open source
		// wrapper that is not quite fully baked yet.  The value doesn't actually do anything, though one would
		// expect it to be a method of scheduling an interval statistic update.  Perhaps I can implement this
		// change and push to the open source repo.  In the meantime, we've got a show to do.

		// The RTCP reporting interval is randomized to prevent unintended synchronization of reporting.
		// The recommended minimum RTCP report interval per station is 5 seconds. 
		// Stations should not transmit RTCP reports more often than once every 5 seconds.
		peer.conn.getSimpleStats( function(response) { updateStats(peer, response); }, 1000 ); 
	}, 1000);
}

function createAudioStatsID(peerObj)
{
	return createStatsID(peerObj) + "_audio_";
}

function createVideoStatsID(peerObj)
{
	return createStatsID(peerObj) + "_video_";
}

// Creates a unique ID for the stats element associated with the given peerObj.
function createStatsID(peerObj)
{
	var id = "";
	if ( peerObj && peerObj.id ) {
		id = "peerStats_" + peerObj.id;
	} else {
		console.log("createStatsID: can't generate peer stats ID.  peerObj: %o", peerObj);
	}

	return id;
}

function createStatsUI(peer)
{
	var ui = $("<div class='statsSetGroup'><div>");

	var audioTable = createCommonStatsTable(peer.stats.delta.audio.inbound.local, createAudioStatsID(peer), "Audio");
	var videoTable = createCommonStatsTable(peer.stats.delta.video.inbound.local, createVideoStatsID(peer), "Video");

	ui.append(audioTable);
	ui.append(videoTable);

	return ui;
}

// Creates a table of statistics based on the given common commonStatsObj
function createCommonStatsTable(commonStatsObj, idPrefix, title)
{
	var wrapper = $("<div class='statsSet'></div>");

	var titlePara = $("<p></p>");
	titlePara.append(title + ":");

	var table = $("<table></table>");
	
	var keys = Object.getOwnPropertyNames(commonStatsObj);

	for ( var k = 0; k < keys.length; k++ ) {
		
		var property = keys[k];

		// Create the row.
		var row = $("<tr></tr>");

		// Create the td with the property name.
		var td_name = $("<td></td>");
		td_name.append(property + ":");

		// Create the value td.
		var td_val = $("<td></td>");
		td_val.attr("id", idPrefix + "_" + property);

		// Add all td's to the row.
		row.append(td_name);
		row.append(td_val);

		// Add the row to the table.
		table.append(row);
	}

	wrapper.append(titlePara);
	wrapper.append(table);

	return wrapper;
}

// Updates the statistics of the peer object.  The peer statistics are StreamStats
// objects, but they end up containing extra dynamic properties that come from the
// statsReport object.
function updateStats(peer, statsReport)
{

	if ( statsReport ) {

		// 0. Tick the statistic count once.
		peer.stats.count++;

		// 1. Copy the current stats to the current object.
		// console.log("updateStats: peer: %o statsReport: %o", peer, statsReport);
		var currentStats = peer.stats.current;
		$.extend(true, currentStats.audio, statsReport.audio);
		$.extend(true, currentStats.video, statsReport.video);

		var aIn = currentStats.audio.inbound.local;
		console.log("updateStats: audio: bytesReceived: %s packetsLost: %s packetsReceived: %s",
								  		 aIn.bytesReceived, aIn.packetsLost, aIn.packetsReceived);

		var vIn = currentStats.video.inbound.local;
		console.log("updateStats: video: bytesReceived: %s packetsLost: %s packetsReceived: %s",
								  		 vIn.bytesReceived, vIn.packetsLost, vIn.packetsReceived);


		// 2. Crunch the deltas.
		var prevStats = peer.stats.prev;
		var delta = peer.stats.delta;
	 	crunchCommonDelta(delta.audio.inbound.local, aIn, prevStats.audio.inbound.local);
	 	crunchCommonDelta(delta.video.inbound.local, vIn, prevStats.video.inbound.local);

	 	// 3. Update the previous stats to what current is now.
	 	prevStats.clear();
	 	$.extend(true, prevStats, currentStats);

	 	// Stats are updated.  Apply the changes to the UI.
	 	updateStatsUIForPeer(peer);
	}
}

// Crunches the common delta properties (e.g. properties that are common among video and audio).
function crunchCommonDelta(delta, current, prev)
{
 	delta.bytesReceived = current.bytesReceived - prev.bytesReceived;
 	delta.packetsLost = current.packetsLost - prev.packetsLost;
 	delta.packetsReceived = current.packetsReceived - prev.packetsReceived; 
 	delta.jitter = current.jitter;
 	// aggregate.bytesSent += current.bytesSent;	
 	// aggregate.bytesReceived += current.bytesReceived;
 	// aggregate.packetsLost += current.packetsLost;
 	// aggregate.packetsSent += current.packetsSent;
 	// aggregate.packetsReceived += current.packetsReceived;
}

function updateStatsUIForPeer(peerObj)
{
	// 1. Look up each delta property UI element and set the inner html to the associated values.
	updatePropertiesUI(peerObj.stats.delta.video.inbound.local, createVideoStatsID(peerObj));
	updatePropertiesUI(peerObj.stats.delta.audio.inbound.local, createAudioStatsID(peerObj));
}

function updatePropertiesUI(deltaStats, idPrefix)
{
	var keys = Object.getOwnPropertyNames(deltaStats);

	for ( var k = 0; k < keys.length; k++ ) {
		
		var property = keys[k];
		var propID = "#" + idPrefix + "_" + property;

		var td_val = $(propID);
		if ( td_val ) {
			td_val.html( deltaStats[property] );
		}
	}
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
		id: "", // ID of the remote peer associated with the connection.
		statsIntervalID: -1,
		stats: {
			count: 0,
			prev: createStatsObj(),
			current: createStatsObj(),
			aggregate: createStatsObj(),
			delta: createStatsObj()
		},
		description: {
			status: "Vegas Baby"
		}
	};

	return peer;
}

function createInboundStatsObj() {
	return { bytesReceived: 0, jitter: 0, packetsLost: 0, packetsReceived: 0 };
}

function createStreamStats()
{
	return { 
			inbound:  { local: createInboundStatsObj(), remote: createInboundStatsObj() }, 
			outbound: { local: createInboundStatsObj(), remote: createInboundStatsObj() } 
		  };
 
}


function createStatsObj()
{
	var a = createStreamStats();
	var v = createStreamStats();
	return { audio: a, video: v };
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




