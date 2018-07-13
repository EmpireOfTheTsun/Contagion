function SimUI(container, color){

	var self = this;
	self.container = container;
	self.container.classList.add("sim_ui");

	// START / NEXT
	var startButton = document.createElement("div");
	var roundDisplay = document.getElementById("round_dialog");
	var connectionsDisplay = document.getElementById("connections_dialog");
	var percentageInfectedDisplay = document.getElementById("percent_infected_dialog");
	var roundNumber = 0;

	startButton.id = "start_button";
	self.container.appendChild(startButton);
	startButton.onclick = function(event){
		publish("sound/button");
		if(!Simulations.inProgress){
			//BUG?: Guaranteed to finish AI turn before calcs?
			Simulations.enemy_turn();
			Simulations.IS_RUNNING = true;
			Simulations.requestStart = true;
			publish("sim/start");
		}
	};
	_stopPropButton(startButton);

	//Separating into 2 functions prevents bug that can occur when toggling UI
	//buttons in small networks
	var _roundEnd = function(){
			startButton.innerHTML = getWords("sim_start");
			self.container.removeAttribute("active");
			roundNumber++;
			roundDisplay.innerHTML = getWords("round_caption")+" "+"<b>"+roundNumber+"</b>";
			roundDisplay.style.fontSize = "50px";
			percentageInfectedDisplay.innerHTML = getWords("percentage_infected_caption")+" "+Simulations.PERCENTAGE_INFECTED+"%";
			roundDisplay.style.fontSize = "50px";
	}

	var _roundStart = function(){
		startButton.innerHTML = getWords("sim_stop");
		self.container.setAttribute("active",true);
	}

	var _updateConnectionBox = function(){
		connectionsDisplay.innerHTML = getWords("sandbox_caption")+" "+ConnectorCutter.CONNECTIONS_REMAINING;
		roundDisplay.style.fontSize = "40px";
	}

	var _outOfConnections = function(){
		connectionsDisplay.style.color = "red";
		setTimeout(function(){
			connectionsDisplay.style.color = "black";
		},1000);
	}


	_roundEnd();
	_updateConnectionBox();

	var _handler1 = subscribe("sim/start",_roundStart);
	var _handler2 = subscribe("sim/round_over",_roundEnd);
	var _handler3 = subscribe("sim/connection_update",_updateConnectionBox);
	var _handler4 = subscribe("sim/out_of_connections",_outOfConnections);
	self.container.kill = function(){
		unsubscribe(_handler1);
		unsubscribe(_handler2);
		unsubscribe(_handler3);
		unsubscribe(_handler4);
	};


}
