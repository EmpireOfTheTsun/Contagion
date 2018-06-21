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
			Simulations.inProgress = true;
			publish("sim/start");
		}
	};
	_stopPropButton(startButton);

	// Update button UI
	var _updateButtonUI = function(){
		if(!Simulations.IS_RUNNING){
			startButton.innerHTML = getWords("sim_start");
			self.container.removeAttribute("active");
		}else{
			startButton.innerHTML = getWords("sim_stop");
			self.container.setAttribute("active",true);
		}
	};
	_updateButtonUI();

	var _handler1 = subscribe("sim/start",_updateButtonUI);
	var _handler2 = subscribe("sim/stop",_updateButtonUI);
	self.container.kill = function(){
		unsubscribe(_handler1);
		unsubscribe(_handler2);
	};


}
