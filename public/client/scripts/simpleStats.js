// Original implementation by:
// Muaz Khan     - www.MuazKhan.com
// MIT License   - www.WebRTC-Experiment.com/licence
// Source Code   - https://github.com/muaz-khan/getStats
// an abstraction layer runs top over RTCPeerConnection.getStats API
// http://dev.w3.org/2011/webrtc/editor/webrtc.html#dom-peerconnection-getstats
//
// Essentially 3 steps:
//  - prepare stats as the come from navigator for packageStats
//  - packageStats wraps them in a "simple"
//  - return the "simple" stats (via callback)
//
(function () {
  function simpleStats(callback, interval) {

    var pc = this,
        mediaTrack;

    var stats = {
      timestamp: 0,
      results: [],
      channels: [],
      audio: { inbound: { local:{}, remote:{} }, outbound: { local:{}, remote:{} } },
      video: { inbound: { local:{}, remote:{} }, outbound: { local:{}, remote:{} } }
    };

    if (navigator.mozGetUserMedia) {
      // var videoTrack = pc.getLocalStreams()[0].getVideoTracks()[0];
      // pc.getStats(videoTrack, prepareFirefoxStats, failureCallback);

      // var audioTrack = pc.getLocalStreams()[0].getAudioTracks()[0];
      // pc.getStats(audioTrack, prepareFirefoxStats, failureCallback);
      pc.getStats(null, prepareFirefoxStats, failureCallback);
    } else if (navigator.webkitGetUserMedia) {
      pc.getStats(prepareChromeStats);
    } else {
      console.log('Browser does not support WebRTC.');
    }

    function prepareChromeStats(nativeStats) {
      nativeStats.result().forEach(function (RTCStatReport) {
        var result = {};
        RTCStatReport.names().forEach(function (name) {
          result[name] = RTCStatReport.stat(name);
        });
        result.id = RTCStatReport.id;
        result.type = RTCStatReport.type;
        result.timestamp = RTCStatReport.timestamp;

        stats.results.push(result);
      });

      packageStats();
    }

    function prepareFirefoxStats(nativeStats) {
      nativeStats.forEach(function (RTCStatReport) {
        stats.results.push(RTCStatReport);
      });

      packageStats();
    }

    function failureCallback(e) {
      console.error(e);
    }

    /*
     * stats.channels obj will contain information about the channels
     * when both clients use webrtc -> one channel
     * when client does not multiplex -> four channels two for each audio and video
     * stats.audio most interesting (for my purposes) stats for audio
     * stats.video most interesting (for my purposes) stats for video
     */
    function packageStats() {
      var idx,
          res;

      // console.log("simpleStats: common: begin packageStats");
      for (idx = 0; idx < stats.results.length; idx++) {
        res = stats.results[idx];

        // seems like inactive timestamps are init with unix epoch
        if (new Date(res.timestamp).getTime() != 0 && stats.timestamp == 0) {
          stats.timestamp = res.timestamp;
        }

        // Channels - Chrome
        if (res.type == 'googCandidatePair' && res.googActiveConnection == 'true') {
          stats.channels.push({
            id: res.googChannelId,
            local: {
              candidateType: res.googLocalCandidateType,
              ipAddress: res.googLocalAddress
            },
            remote: {
              candidateType: res.googRemoteCandidateType,
              ipAddress: res.googRemoteAddress
            },
            transport: res.googTransportType
          });
        }

        // Channels - Firefox
        if (res.type == 'candidatepair' && res.state == 'succeeded'){
          // not really helpful?
        }

        // Audio - Chrome
        if (res.googCodecName == 'opus' && res.bytesSent) {
          merge(stats.audio, {
            inputLevel: res.audioInputLevel,
            packetsLost: res.packetsLost,
            rtt: res.googRtt,
            packetsSent: res.packetsSent,
            bytesSent: res.bytesSent
          });
        }

        // Audio - Firefox
        if (res.mediaType == 'audio') {
          parseStdRTPStats(res, stats.audio);
        }

        // Video - Chrome
        if (res.googCodecName == 'VP8') {
          merge(stats.video, {
            frameHeightInput: parseInt(res.googFrameHeightInput),
            frameWidthInput: parseInt(res.googFrameWidthInput),
            rtt: parseInt(res.googRtt),
            packetsLost: parseInt(res.packetsLost),
            packetsSent: parseInt(res.packetsSent),
            frameRateInput: parseInt(res.googFrameRateInput),
            frameRateSent: parseInt(res.googFrameRateSent),
            frameHeightSent: parseInt(res.googFrameHeightSent),
            frameWidthSent: parseInt(res.googFrameWidthSent),
            bytesSent: parseInt(res.bytesSent)
          });
        }

        // Video - Firefox
        if (res.mediaType == 'video') {
          parseStdRTPStats(res, stats.video);
        }
      }

      callback(stats);
    }


    /**
     * Parse the WebRTC Standard (Firefox) Statistics from the given result object
     * and write them to the appropriate properties of the targetStats object.
     * @param res - The RTCRTPStats object generated from RTCPeerConnection.getStats().
     * @param targetStats - The statistics object to write the standard properties to.
     */
    function parseStdRTPStats(res, targetStats)
    {
      if (res.type == 'inboundrtp') {
        // Parse remote statistics.
        var newStats = {
          bytesReceived: res.bytesReceived,
          jitter: res.jitter,
          rtt: res.mozRtt,
          packetsLost: res.packetsLost,
          packetsReceived: res.packetsReceived,
          timestamp: res.timestamp
        };

        //console.log("simpleStats: firefox: update remote video stats %o", newStats);
        if ( res.isRemote ) {
          targetStats.inbound.remote = newStats;
        } else {
          targetStats.inbound.local = newStats;
        }

      } else if (res.type == 'outboundrtp' ) {
        // Parse remote statistics.
        var localVideo = document.getElementById('localVideo');

        var newStats = {
          bytesSent: res.bytesSent,              
          packetsSent: res.packetsSent,
          timestamp: res.timestamp //,              
          // frameHeightInput: localVideo.videoHeight,
          // frameWidthInput: localVideo.videoWidth,
          // frameRateInput: Math.round(res.framerateMean),
          // frameRateSent: -1,  //'?',
          // frameHeightSent: -1,  //'?',
          // frameWidthSent: -1  //'?',
        };

        //console.log("simpleStats: firefox: update local video stats %o", newStats);
        if ( res.isRemote ) {
          targetStats.outbound.remote = newStats;
        } else {
          targetStats.outbound.local = newStats;
        }
      }
    }

    /*
     * Thanks to @Moak
     * http://stackoverflow.com/a/171256/980524
     */
    function merge(obj1, obj2) {
      for (var prop in obj2) { 
        if ( obj2[prop] ) { 
          obj1[prop] = obj2[prop]; 
        } 
        //else console.log("not adding %s to obj3. it's undefined", prop);
      }
    }
  }

  RTCPeerConnection = window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
  RTCPeerConnection.prototype.getSimpleStats = simpleStats;
})();
