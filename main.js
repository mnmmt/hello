function mtof(f){
  if (f <= -1500) return(0);
  else if (f > 1499) return(mtof(1499));
  else return (8.17579891564 * Math.exp(.0577622650 * f));
}

// set up audio filter stuff

var context = new AudioContext();

function make_filter() {
  var filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(mtof(0), context.currentTime);
  filter.Q.setValueAtTime(2, context.currentTime);
  filter.connect(context.destination);
  return filter;
}

var filters = [0, 1, 2].map(make_filter);

var audiofns = {
  "dial": [0, 1, 2].map(function(i) {
    return function(v) {
      filters[i].frequency.setValueAtTime(mtof(v), context.currentTime);
    }
  })
};

// audio component
var loops = [0, 1, 2].map(function(i) { return new Audio("toodleoo-" + (i + 1) + ".ogg"); });

loops[0].addEventListener('ended', function() {
  loops.map(function(l) {
    l.currentTime = 0;
    l.play();
  });
}, false);

function start_audio() {
  loops[0].play().catch(function() {
    throw("Play did not trigger correctly. Won't hide play button.");
  });

  // check if the loop audio started correctly
  if (!loops[0].paused) {
    // connect loops to filters and start them
    loops.map(function(l, i) {
        var source = context.createMediaElementSource(l);
        source.connect(filters[i]);
        l.play();
    });
    
    document.getElementById("audio").style.display = "none";
    document.getElementById("controller").style.visibility = "visible";
  }
}

nx.onload = function() {

  /* Event listening options */

  /*
   This is the default anyway!
  */
  nx.sendsTo("js");

  /* 
  this code can be useful for logging any interface events
  */
  for (var key in nx.widgets) {
    //nx.widgets[key].set({"value": 0.5});
    with (nx.widgets[key]) {
      on('*', function(data) {
        // code that will be executed
        console.log(canvasID, data)
      })
    }
  } 
  
  /* styles */
  nx.colorize("accent", "#347");
  nx.colorize("border", "#a4a4a4");
  nx.colorize("fill", "#aaa");

  // request MIDI access
  if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess({
          sysex: true
      }).then(onMIDISuccess, onMIDIFailure);
  } else {
      message("No MIDI support in your browser.");
  }
}

var devices = {
  "gamelanator": {
    "name": "The Gamelanenator",
    "patch": ["toggle", "dial", "dial", "dial", "dial"],
  }, "lozenge": {
    "name": "Lozenge",
    "patch": ["dial", "dial", "dial", "dial\n", "dial", "dial", "dial", "dial"],
  }, "p2600": {
    "name": "2600 Paddle",
    "patch": ["dial", "toggle"],
  }, "thumbelina": {
    "name": "thumbelina",
    "patch": ["dial", "toggle", "toggle\n", "dial", "toggle", "toggle\n", "dial", "toggle", "toggle\n", "dial", "toggle", "toggle\n", "toggle", "toggle"],
  }
};

// alias
devices["phonon"] = devices["thumbelina"];

// how android sees the product name
// does not scale to multiple devices
devices["(product id = 0x0485)"] = devices["thumbelina"];

function get_device(name) {
  for (var n in devices) {
    if (n.indexOf(name) == 0 || name.indexOf(n) == 0) {
      return devices[n];
    }
  }
}

function message(msg) {
    document.getElementById("messages").innerHTML = msg;
}

// midi functions
function onMIDISuccess(midiAccess) {
    console.log("MIDI success");
    // when we get a succesful response, run this code
    var midi = midiAccess; // this is our raw MIDI data, inputs, outputs, and sysex status
    var found = [];
    // access to our widget canvas
    var el = document.getElementById("controller");

    setInterval(function() {
        //console.log("checking");
        var inputs = midi.inputs.values();
        // loop over all available inputs and listen for any MIDI input
        for (var input = inputs.next(); input && !input.done; input = inputs.next()) {
            var name = input.value.name;
            var device = get_device(input.value.name);
            //console.log(input);
            //console.log(name, device);
            if (found.indexOf(name) == -1 && device) {
                console.log("Adding MIDI device:", input);
                message("");
                el.className = device.name;
                el.innerHTML = "<p class='device-name'>" + device.name + "</p>";
                found.push(input.value.name);
                for (var w=0; w<device.patch.length; w++) {
                  var kind = device.patch[w].replace("\n", "");
                  if (kind) {
                    var widget = nx.add(kind, {"name": "widget-" + w, "parent": "controller"});
                    widget.max = 127;
                    widget.min = 0;
                    if (audiofns[kind] && audiofns[kind].length) {
                      var fn = audiofns[kind].shift();
                      widget.onchange = fn;
                      widget.on("change", widget.onchange);
                    }
                  }
                  if (device.patch[w].indexOf("\n") != -1) {
                    el.insertAdjacentHTML('beforeend', '<div class="spacer"></div>');
                  }
                }

                // each time there is a midi message call the onMIDIMessage function
                input.value.onmidimessage = onMIDIMessage;

                // enable play button
                document.getElementById("audio").style.display = "block";

                // hide UI
                el.style.visibility = "hidden";

                // try to start the audio only
                start_audio();
            }
        }
    }, 100);
}

function onMIDIFailure(error) {
    // when we get a failed response, run this code
    message("No access to MIDI devices or your browser doesn't support WebMIDI API. Please use WebMIDIAPIShim " + error);
}

function onMIDIMessage(message) {
  // this gives us our [command/channel, note, velocity] data.
  var data = message.data;
  // control message
  if (data[0] == 176) {
    //console.log('MIDI:', data); // MIDI data [144, 63, 73]
    var widget = nx.widgets["widget-" + data[1]];
    if (widget) {
      var v = data[2];
      widget.set({"value": v});
      if (widget.onchange) {
        widget.onchange(v);
      }
    }
  } else if (data[0] == 242) { // song position pointer
    if (!nx.widgets["clock"]) {
      nx.add("matrix", {"name": "clock", "parent": "controller", "columns": 8, "rows": 1});
    }
    var clock = nx.widgets["clock"];
    console.log("SPP", data, clock);
    for (var i=0; i<4; i++) {
      for (var j=0; j<4; j++) {
        clock.matrix[i][j] = ((i + j * 4) == data[1] % 16) * 1;
        clock.click();
      }
    }
  } else {
    console.log(message);
  }
}
