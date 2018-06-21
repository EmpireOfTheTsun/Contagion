function SimUI(container, color){

	var self = this;
	self.container = container;
	self.container.classList.add("sim_ui");

	// START / NEXT
	var startButton = document.createElement("div");
	startButton.id = "start_button";
	self.container.appendChild(startButton);
	startButton.onclick = function(event){
		publish("sound/button");
		if(!Simulations.inProgress){
			Simulations.IS_RUNNING = true;
			Simulations.requestStart = true;
			publish("sim/start");
		}
	};
	_stopPropButton(startButton);

	//Separating into 2 functions prevents bug that can occur when toggling UI
	//buttons in simple networks
	var _unsetButtonUI = function(){
			startButton.innerHTML = getWords("sim_start");
			self.container.removeAttribute("active");
	}

	var _setButtonUI = function(){
		startButton.innerHTML = getWords("sim_stop");
		self.container.setAttribute("active",true);
	}

	_unsetButtonUI();

	var _handler1 = subscribe("sim/start",_setButtonUI);
	var _handler2 = subscribe("sim/round_over",_unsetButtonUI);
	self.container.kill = function(){
		unsubscribe(_handler1);
		unsubscribe(_handler2);
	};


}
