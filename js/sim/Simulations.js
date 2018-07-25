/******************************

An interactive game in the BACKGROUND of the Slideshow...
(if fullscreen, origin is top-left of slideshow)
(if not, allow MULTIPLE canvasses & games.)

NB: While 'Sim' is used in such a way to allow for multiple sims running at once, in practice this is prevented even by the base program
I have made an attempt to refactor things into the overall Simulations class, but much still remains.
This makes for some untidy, but semantically sound code.


TODO: Remove old game logic still in this class & others on client side
******************************/


//SIM DELARED AT 167
function Simulations(){
	var self = this;
	self.dom = $("#simulations");

	self.sims = [];
	Simulations.inProgress= false;
	Simulations.PERCENTAGE_INFECTED = 50;
	//TODO TODO: In Slideshow.js, do a wait for serverResponse to have value, then set serverResponse to null again.
	Simulations.awaitingResponse = false;
	self.recievedConfig = null;

	parseEvent = function(message){
		console.log(message);
		try{
			message = JSON.parse(message.data);
		}
		catch(err){
			console.log("Can't parse JSON:"+message.data);
		}
		console.log(message.status);
		switch(message.status){
			case "CONFIG_TOKEN":
				self.recievedConfig = message.payload;
				console.log(self.recievedConfig);
				Simulations.awaitingResponse = false;
				break;
			case "DEFERRED_START_TOKEN":
				console.log("FIRST Waiting for P2...");
				//TODO: implement waiting?
				break;
			case "UPDATE_STATE_TOKEN":
				console.log("P2 Moves Recieved.");
				Simulations.updateState(message.payload);
				break;
			case "GAME_END_TOKEN":
					Simulations.gameOver();
					break;
		}
	}
	self.serverSetup = function(){
		self.ws = new WebSocket("ws://127.0.0.1:8081");
		self.ws.onopen = function (event) {
		self.ws.send("Connection Recieved.");
		};
		self.ws.onerror = function (err) {
			console.log('err: ', err);
		}
		self.ws.onmessage = function (event) {
			parseEvent(event);
		};

	}
	self.serverSetup();

	Simulations.sendServerMessage = function(msg){
		self.ws.send(JSON.stringify(msg));
	}

	//Sends request to server, then sets awaiting response flag to true, to halt certain other parts of code until the config is returned.
	Simulations.requestConfig = function(){
		Simulations.sendServerMessage(new Message(null,"NEW_GAME_TOKEN"));
		Simulations.awaitingResponse = true;
	}

	Simulations.getConfig = function(){
		//TODO: Implement waiting!!
		console.log("WAITING TEST");
		console.log("FINISHED WAIT");
		console.log(self.recievedConfig);
		return self.recievedConfig;
	}

	Simulations.gameOver = function(){

	}

	// Clear All Sims
	self.clear = function(){

		Simulations.IS_RUNNING = false;
		$("#container").removeAttribute("sim_is_running");

		self.sims.forEach(function(sim){
			self.dom.removeChild(sim.canvas);
			sim.kill();
		});
		self.sims = [];

	};

	// Add Sims
	self.add = function(config){
		config = cloneObject(config);
		config.container = self;
		var sim = new Sim(config);
		self.dom.appendChild(sim.canvas);
		self.sims.push(sim);
	};

	self.beginRound = function(){
		Simulations.awaitingResponse = true;
		Simulations.requestStart = false;
		Simulations.inProgress = true;
			// Step all sims!
			self.sims.forEach(function(sim){

				//Sends moves to the server and waits for a response
				Simulations.sendServerMessage(new Message(sim.formatPeeps(), "SUBMIT_MOVES_TOKEN"));
				Simulations.waitForServerMoves(sim);
			});
	}

	Simulations.waitForServerMoves = function(sim){
			//TODO: change round timings based on server
			if (!Simulations.awaitingResponse){
					Simulations.IS_RUNNING = false;
					publish("sim/round_over");
					Simulations.inProgress = false;
			}
			else{
				console.log("Still Waiting for P2...");
				var testo = setTimeout(Simulations.waitForServerMoves, 1000, sim);
			}
	}

	//Updates the client variables to reflect the enemy's turn and subsequent infections.
	Simulations.updateState = function(gameState){
		var updatedPeeps = gameState[0];
		var enemyMoves = gameState[1];
		self.sims.forEach(function(sim){
			var peepsList = sim.peeps;
			if (peepsList.length !== updatedPeeps.length){
				console.log("ERR! DIFFERRING NUMBER OF PEEPS!");
			}
			console.log(peepsList);
			for (i=0; i<peepsList.length; i++){
				console.log(peepsList[i]);
				sim.removeOrbitConnection(peepsList[i], false);
				if(updatedPeeps[i] == 1){
					peepsList[i].isPastThreshold = true;
				}
				else{ peepsList[i].isPastThreshold = false; }
			}
			enemyMoves.forEach(function(move){
				sim.addOrbitConnection(peepsList[move], false);
			});
			sim.nextStep();
			sim.calculatePercentage();
		});
		Simulations.awaitingResponse = false;
		console.log("READY TO GO");
	}

	// Update
	self.update = function(){
		if(Simulations.requestStart){
			self.beginRound();
		}

		// Update all sims
		self.sims.forEach(function(sim){
			sim.update();

		});
	};

	// Draw
	self.draw = function(){
		self.sims.forEach(function(sim){
			sim.draw();
		});
	};

	////////////////////////
	// SIMULATION RUNNING //
	////////////////////////

	self.CLOCK = -1;
	subscribe("sim/start", function(){
		Simulations.IS_RUNNING = true;
		$("#container").setAttribute("sim_is_running",true);

		self.CLOCK = 0;
		// save for later resetting
		self.sims.forEach(function(sim){
			sim.save();
		});

	});
	subscribe("sim/stop", function(){

		Simulations.IS_RUNNING = false;
		$("#container").removeAttribute("sim_is_running");

		// reload the network pre-sim
		self.sims.forEach(function(sim){
			sim.reload();
		});

	});

	///////////////////////
	// HELPERS AND STUFF //
	///////////////////////

	// Get Child!
	self.getChildByID = function(id){
		return self.sims.find(function(sim){
			return sim.id==id;
		});
	};

}

// On resize, adjust the fullscreen sim (if any).
window.addEventListener("resize", function(){
	if(slideshow.simulations.sims.length>0){
		slideshow.simulations.sims[0].resize();
	}
}, false);

function Sim(config){
	var self = this;
	self.config = config;
	self.networkConfig = cloneObject(config.network);
	self.container = config.container;
	self.options = config.options || {};

	// CONTAGION SOUND
	//var _CONTAGION_SOUND = 0;
	var _PLAY_CONTAGION_SOUND = function(){
		//_CONTAGION_SOUND = (_CONTAGION_SOUND+1)%3;
		//SOUNDS["contagion"+_CONTAGION_SOUND].play();
		SOUNDS.contagion.volume(0.75);
		SOUNDS.contagion.play();
	};

	// Canvas
	var container = $("#simulations_container");
	self.canvas = createCanvas(container.clientWidth, container.clientHeight);

	//self.canvas.style.border = "1px solid #ccc";
	self.ctx = self.canvas.getContext('2d');

	// Mouse, offset!
	self.mouse = {x:0, y:0};

	// Connector-Cutter
	self.connectorCutter = new ConnectorCutter({sim:self});

	// Resize
	var simOffset;

//TODO: remove me when not needed
	self.check = function(obj) {
	  var seenObjects = [];

	  function detect (obj) {
	    if (obj && typeof obj === 'object') {
	      if (seenObjects.indexOf(obj) !== -1) {
	        return true;
	      }
	      seenObjects.push(obj);
	      for (var key in obj) {
	        if (obj.hasOwnProperty(key) && detect(obj[key])) {
	          console.log(obj, 'cycle at ' + key);
	          return true;
	        }
	      }
	    }
	    return false;
	  }

	  return detect(obj);
	}

	//TODO: Change 'aiorbits' when multiplayer properly implemented
	//This returns the ID for each orbit. If node has 2 orbits, will appear twice, etc.
	self.formatPeeps = function(){
		var formattedPeeps = []
		self.peeps.forEach(function(peep){
			//TODO: are the IDs the same on the server?
			for(i=0; i<peep.playerOrbits.length; i++){
				formattedPeeps.push(peep.id);
			}
		});
		return formattedPeeps;
	}

	self.resize = function(){

		var container = $("#simulations_container");
		simOffset = _getBoundingClientRect(self.container.dom);
		self.canvas.style.left = (-simOffset.x) + "px";
		self.canvas.style.top = (-simOffset.y) + "px";

		// Set difference in width & height
		var width = container.clientWidth;
		var height = container.clientHeight;
		self.canvas.width = width*2;
		self.canvas.height = height*2;
		self.canvas.style.width = (width) + "px";
		self.canvas.style.height = (height) + "px";

	};
	self.resize();

	// Networks... clear/init
	self.clear = function(){
		self.peeps = [];
		self.connections = [];
		self.contagion = 0;
	};
	self.init = function(){

		// Clear!
		self.clear();

		// Peeps
		self.networkConfig.peeps.forEach(function(p){
			var x = p[0],
				y = p[1],
				infected = p[2];
			self.addPeep(x, y, infected);
		});

		// Connections
		self.networkConfig.connections.forEach(function(c){
			var from = self.peeps[c[0]],
				to = self.peeps[c[1]],
				uncuttable = c[2]||false
			self.addConnection(from, to, uncuttable);
		});


	};

	// Update
	self.onupdate = config.onupdate || function(){};
	self.update = function(){

		// "Mouse", offset!
		var canvasBounds = _getBoundingClientRect(self.canvas);
		self.mouse = cloneObject(Mouse);
		self.mouse.x -= canvasBounds.x;
		self.mouse.y -= canvasBounds.y;
		self.mouse.lastX -= canvasBounds.x;
		self.mouse.lastY -= canvasBounds.y;
		if(config.fullscreen){
			var fullscreenOffsetX = config.x + simOffset.x;
			var fullscreenOffsetY = config.y + simOffset.y;
			self.mouse.x -= fullscreenOffsetX;
			self.mouse.y -= fullscreenOffsetY;
			self.mouse.lastX -= fullscreenOffsetX;
			self.mouse.lastY -= fullscreenOffsetY;
		}

		// Connector-Cutter
		self.connectorCutter.update();

		// Connections & Peeps
		self.connections.forEach(function(connection){
			connection.update();
		});
		self.peeps.forEach(function(peep){
			peep.update();
		});

		// secret editor...
		// drag Peep
		if(_draggingPeep){
			_draggingPeep.x = self.mouse.x+_draggingOffset.x;
			_draggingPeep.y = self.mouse.y+_draggingOffset.y;
			_draggingPeep.velocity.x = 0;
			_draggingPeep.velocity.y = 0;
		}

		// update confetti & winword...
		self.confetti.forEach(function(confetti){

			confetti.x += confetti.vx;
			confetti.y += confetti.vy;
			confetti.spin += confetti.spinSpeed;

			confetti.vy += confetti.g;

			confetti.vx *= 0.95;
			confetti.vy *= 0.95;

		});
		if(self.winWord.ticker>=0){
			self.winWord.ticker += 1/60;
			if(self.winWord.ticker>3){
				self.winWord.ticker = -1;
			}
		}

		// On update! (for arbitrary sim-specific logic)
		self.onupdate(self);

	};

	// Draw
	self.draw = function(){

		// Retina
		var ctx = self.ctx;
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		// todo: smarter redraw coz, wow, retina.
		ctx.save();
		ctx.scale(2,2);
		if(config.fullscreen){
			var fullscreenOffsetX = config.x + simOffset.x;
			var fullscreenOffsetY = config.y + simOffset.y;
			ctx.translate(fullscreenOffsetX, fullscreenOffsetY);
		}

		// Draw all of it!
		self.connectorCutter.draw(ctx);
		self.connections.forEach(function(connection){
			connection.draw(ctx);
		});
		self.peeps.forEach(function(peep){
			peep.draw(ctx);
		});

		ctx.restore();

		// Draw confetti - NOT AFFECTED BY TRANSFORMS.
		self.confetti.forEach(function(confetti){
			ctx.save();
				var offsetX = -Math.sin(confetti.spin)*9;
				ctx.translate(confetti.x+offsetX, confetti.y);
				ctx.rotate(Math.sin(confetti.spin)*0.2);
				if(confetti.flip) ctx.scale(-1,1);
				self.confettiSprite.gotoFrame(confetti.frame);
				self.confettiSprite.draw(ctx);
			ctx.restore();
		});

		// Draw WIN WORD
		if(self.winWord.ticker>=0){

			ctx.save();
			ctx.translate(self.winWord.x, self.winWord.y);
			ctx.scale(2,2); // retina

			// expand
			if(self.winWord.ticker<0.2){
				var scale = self.winWord.ticker/0.2;
				ctx.scale(scale,scale);
			}

			// fade away
			if(self.winWord.ticker>2){
				var alpha = -(self.winWord.ticker-3);
				ctx.globalAlpha = alpha;
			}

			ctx.font = '100px PatrickHand';
			ctx.fillStyle = "#000";
			ctx.textBaseline = "middle";
			ctx.fontWeight = "bold";
			ctx.textAlign = "center";
			var label = getWords("WIN");
			ctx.fillText(label, 0, 0);

			ctx.restore();

		}

	};

	// Kill
	self.kill = function(){

		self.clear();

		// key handlers, too
		_keyHandlers.forEach(function(_handler){
			unsubscribe(_handler);
		});

	};

	///////////////////
	// WINNER WINNER //
	///////////////////

	self.wonBefore = false;
	self.confetti = [];
	self.winWord = {x:0, y:0, ticker:-1};

	// Confetti Sprite
	self.confettiSprite = new Sprite({
		img: "confetti",
		frames:3, sw:100, sh:50,
	});
	self.confettiSprite.pivotX = 50;
	self.confettiSprite.pivotY = 50;
	self.confettiSprite.scale = 0.5;

	self.win = function(bounds){

		// ONLY ONCE
		if(self.wonBefore) return;
		self.wonBefore = true;

		// SOUND!
		if(bounds && bounds.small){
			SOUNDS.party_short.play();
		}else{
			SOUNDS.party.play();
		}

		// AMOUNT OF CONFETTI
		var AMOUNT_OF_CONFETTI = 100;
		if(bounds && bounds.small){
			AMOUNT_OF_CONFETTI = 50;
		}

		// Get center of peeps
		var fullscreenOffsetX = config.x + simOffset.x;
		var fullscreenOffsetY = config.y + simOffset.y;
		if(!bounds || !bounds.x) bounds = getBoundsOfPoints(self.peeps); // OPTIONAL BOUNDS
		var cx = bounds.x + bounds.width/2;
		var cy = bounds.y + bounds.height/2;
		cx += fullscreenOffsetX;
		cy += fullscreenOffsetY;
		cx *= 2; // retina
		cy *= 2; // retina

		// Place Win Word
		self.winWord.x = cx;
		self.winWord.y = cy;
		self.winWord.ticker = 0;

		// Place confetti
		for(var i=0; i<AMOUNT_OF_CONFETTI; i++){
			var angle = Math.random()*Math.TAU;
			var burst = bounds.width/15;
			var frame = Math.floor(Math.random()*5);
			var spinSpeed = 0.03+Math.random()*0.03;
			var confetti = {
				x: cx,
				y: cy,
				vx: Math.cos(angle)*Math.random()*burst,
				vy: Math.sin(angle)*Math.random()*burst - burst*0.25,
				frame: frame,
				spinSpeed: spinSpeed,
				spin: Math.random()*Math.TAU,
				g: 0.10+Math.random()*0.10,
				flip: (Math.random()<0.5)
			};
			self.confetti.push(confetti);
		}

	};

	////////////////////////
	// SIMULATION RUNNING //
	////////////////////////

	self.STEP = 0;

	self.save = function(){
		self.STEP = 0;
		self.networkConfig = self.getCurrentNetwork();
	};

	self._canPlayBonkSound = true;

	self.reload = function(){
		var contagionLevel = self.contagion; // hack for sandbox: keep contagion the same
		self.STEP = 0;
		self._canPlayBonkSound = true;
		self.init();
		self.contagion = contagionLevel;
	};

	self.nextStep = function(){

		// SOUND! If anyone can be infected, play Contagion sound.
		// Otherwise play Bonk sound ONCE
		var canBeInfected = self.peeps.filter(function(peep){
			return !peep.infected && peep.isPastThreshold;
		}).length;
		var isEveryoneInfected = true;
		self.peeps.forEach(function(peep){
			if(!peep.infected) isEveryoneInfected=false;
		});
		if(canBeInfected>0){
			_PLAY_CONTAGION_SOUND();
		}else if(self._canPlayBonkSound && !isEveryoneInfected){
			self._canPlayBonkSound = false;

			if(!self.options.NO_BONK){
				SOUNDS.bonk.play();
			}

		}

		// "Infect" the peeps who need to get infected
		setTimeout(function(){
			self.STEP++;
		},400);

		// CONNECTIONS: IF one is INFECTED and the other is PAST THRESHOLD, then ANIMATE
		self.connections.forEach(function(c){
			c.animate();
		});

		// PEEPS: If not already infected & past threshold, infect
		self.peeps.forEach(function(peep){
			if(!peep.infected && peep.isPastThreshold){
				// timeout for animation
				setTimeout(function(){
					peep.infect();
				},333);
			}
			else if (peep.infected && !peep.isPastThreshold && peep.numFriends !== 0){
				setTimeout(function(){
					peep.uninfect();
				},333);
			}
		});

		// PEEPS: If NOT infected, NOT past threshold, and a friend IS INFECTED, then SHAKE
		self.peeps.forEach(function(peep){
			if(!peep.infected && !peep.isPastThreshold){
				var friends = self.getFriendsOf(peep);
				var infectedFriends = friends.filter(function(f){
					return f.infected;
				});
				if(infectedFriends.length>0){
					peep.shake();
				}
			}
		});

	};

	self.calculatePercentage = function(){
		var totalInfected = 0;
		self.peeps.forEach(function(peep){
			if (peep.isPastThreshold){
				totalInfected++;
			}
		});
		Simulations.PERCENTAGE_INFECTED =  Math.round(100 * (totalInfected / self.peeps.length));
	}

	///////////////////////////////
	// secret keyboard interface //
	///////////////////////////////

	// todo: active only when mouse is over MY CANVAS.

	var _draggingPeep = null;
	var _draggingOffset = {x:0,y:0};
	var _keyHandlers = [];
	var _resetConnectorCutter = function(){
		self.connectorCutter.sandbox_state = 0;
	};
	_keyHandlers.push(subscribe("key/down/space",function(){
		_resetConnectorCutter();
		self._startMove();
	}));
	self._startMove = function(){
		if(!_draggingPeep){ // prevent double-activation
			var hoveredPeep = self.getHoveredPeep(0);
			if(hoveredPeep){
				_draggingPeep = hoveredPeep;
				_draggingOffset.x = _draggingPeep.x-self.mouse.x;
				_draggingOffset.y = _draggingPeep.y-self.mouse.y;

				// Sound!
				SOUNDS.squeak_down.volume(0.6);
				SOUNDS.squeak_down.play();

			}
		}
	};
	_keyHandlers.push(subscribe("key/up/space",function(){
		self._stopMove();
	}));
	self._stopMove = function(){

		// Sound!
		SOUNDS.squeak_up.volume(0.6);
		SOUNDS.squeak_up.play();

		_draggingPeep = null;

	};
	_keyHandlers.push(subscribe("key/down/1",function(){
		//_resetConnectorCutter(); //NOTE: Uncomment these if you want to add the shortcuts back for testing
		//self._addPeepAtMouse(false);
	}));
	_keyHandlers.push(subscribe("key/down/2",function(){
		//_resetConnectorCutter();
		//self._addPeepAtMouse(true);
	}));
	self._addPeepAtMouse = function(infected){

		// SOUND
		SOUNDS.pop.play();

		self.addPeep(self.mouse.x, self.mouse.y, infected);

	};
	_keyHandlers.push(subscribe("key/down/delete",function(){
		//_resetConnectorCutter();
		//self._deletePeep();
	}));
	self._deletePeep = function(){

		// SOUND
		SOUNDS.trash.play();

		var toDeletePeep = self.getHoveredPeep(0);
		if(toDeletePeep) self.removePeep(toDeletePeep);

	};

	self.getCurrentNetwork = function(){
		var savedNetwork = {
			contagion: self.contagion,
			peeps: [],
			connections: []
		};
		self.peeps.forEach(function(peep){
			savedNetwork.peeps.push([Math.round(peep.x), Math.round(peep.y), peep.infected?1:0]);
		});
		self.connections.forEach(function(c){
			var fromIndex = self.peeps.indexOf(c.from);
			var toIndex = self.peeps.indexOf(c.to);
			var uncuttable = c.uncuttable ? 1 : 0;
			savedNetwork.connections.push([fromIndex, toIndex, uncuttable]);
		});
		return savedNetwork;
	};
	self.serialize = function(){
		var savedNetwork = self.getCurrentNetwork();
		return '{\n'+
		'\t"contagion":'+savedNetwork.contagion+",\n"+
		'\t"peeps":'+JSON.stringify(savedNetwork.peeps)+",\n"+
		'\t"connections":'+JSON.stringify(savedNetwork.connections)+"\n"+
		'}';
	};

	////////////////
	// HELPERS... //
	////////////////

	// Add Peeps/Connections
	self.addPeep = function(x, y, infected){
		//ID of peep is the nth one added to the network, zero indexed.
		var peepID = self.peeps.length;
		var peep = new Peep({ x:x, y:y, infected:infected, id:peepID, sim:self });
		self.peeps.push(peep);
		return peep;
	};
	self.removePeep = function(peep){
		self.removeAllConnectedTo(peep); // delete all connections
		removeFromArray(self.peeps, peep); // BYE peep
	};
	self.addConnection = function(from, to, uncuttable){

		// Don't allow connecting to self...
		if(from==to) return;

		// ...or if already exists, in either direction
		for(var i=0; i<self.connections.length; i++){
			var c = self.connections[i];
			if(c.from==from && c.to==to) return;
			if(c.from==to && c.to==from) return;
		}

		// Otherwise, go ahead and add it!
		var connection = new Connection({ from:from, to:to, uncuttable:uncuttable, sim:self });
		self.connections.push(connection);
		return connection;
	};

	self.orbitStartPosition = function(target, isPlayer){
		var playerOrbitLength = target.playerOrbits.length;
		var enemyOrbitLength = target.aiOrbits.length;
		//+1 to represent newest addition, also avoids divide by zero later
		var totalLength = 1 + playerOrbitLength + enemyOrbitLength;
		if (totalLength == 2){
			var existingNodeLocation = (playerOrbitLength == 1 ? target.playerOrbits[0].a : target.aiOrbits[0].a);
			return 3.142 + existingNodeLocation;
		}
		var counter = 0;
		for(; counter < playerOrbitLength; counter++ ){
			//places each orbit equally around the peep
			target.playerOrbits[counter].a = 3.142 - (6.284 * counter / totalLength);
		}
		var returnValue = 3.142 - (6.284 * counter / totalLength);
		counter++;
		//calculate this in the middle, as in between the two players' peeps, the middle peep can justifiably be either player's.
		for(; counter < totalLength; counter++ ){
			//places each orbit equally around the peep
			target.aiOrbits[counter - (playerOrbitLength + 1)].a = 3.142 - (6.284 * counter / totalLength);
		}
		return returnValue;
	}

	self.addOrbitConnection = function(target, isPlayer){
		var orbiter = {
	    elt: null
	    ,a:  self.orbitStartPosition(target, isPlayer)        // in radian. original position. pi=north
	    ,r: 45         // radius
	    ,da: 0.05     // in radian. speed of orbit
	    ,x: 0
	    ,y: 0
	    // Center is actualy center (100, 100) minus
	    // half the size of the orbiting object 15x15
	    ,center: { x: (-10), y: (-10) }
		}
		if(isPlayer){
			target.playerOrbits.push(orbiter);
			//console.log(target);
		}
		else target.aiOrbits.push(orbiter);
	}

	//removes one orbits if player, removes all if enemy
	//this is because player can only change one at a time, but we need to clear all enemy tokens to show the new state.
	self.removeOrbitConnection = function(target, isPlayer){
		if(isPlayer){
			target.playerOrbits.pop();
		}
		else target.aiOrbits = [];
	}


	self.getFriendsOf = function(peep){
		var friends = [];
		for(var i=0; i<self.connections.length; i++){ // in either direction
			var c = self.connections[i];
			if(c.from==peep) friends.push(c.to);
			if(c.to==peep) friends.push(c.from);
		}
		return friends;
	};
	self.getHoveredPeep = function(mouseBuffer){
		mouseBuffer = mouseBuffer || 0;
		return self.peeps.find(function(peep){
			return peep.hitTest(self.mouse.x, self.mouse.y, mouseBuffer);
		});
	};
	self.tryCuttingConnections = function(line){//TODO HERE
		var wasLineCut = 0;
		for(var i=self.connections.length-1; i>=0; i--){ // going BACKWARDS coz killing connections
			var c = self.connections[i];
			if(c.hitTest(line)){
				if(c.uncuttable){ // can't cut uncuttables!
					wasLineCut = -1;
					c.shake();
				}else{
					wasLineCut = 1;
					self.connections.splice(i,1);
				}
			}
		}
		return wasLineCut;
	};
	self.removeAllConnectedTo = function(peep){
		for(var i=self.connections.length-1; i>=0; i--){ // backwards index coz we're deleting
			var c = self.connections[i];
			if(c.from==peep || c.to==peep){ // in either direction
				self.connections.splice(i,1); // remove!
			}
		}
	};


	//////////////
	// INIT NOW //
	//////////////

	// Start Uncuttable?
	if(self.options.startUncuttable){
		self.networkConfig.connections.forEach(function(c){
			c[2] = 1;
		});
	}

	self.init();

	// Start randomize positions?
	if(self.options.randomStart){
		var r = {
			x:self.options.randomStart,
			y:0
		};
		self.peeps.forEach(function(peep){
			var randomPush = rotateVector(r, Math.random()*Math.TAU);
			peep.x += randomPush.x;
			peep.y += randomPush.y;
		});
	}

}
