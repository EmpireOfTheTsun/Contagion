var LocalMode = true;

NETWORK_CONFIGS = [];
NETWORK_CONFIGS.Xscale = 1//1200; //Input topologies have x/y coordinates between 0 and 1. This scales it to a typical player's screen.
NETWORK_CONFIGS.Yscale = 1//700;
NETWORK_CONFIGS.Xoffset = 0//75;//-100;
NETWORK_CONFIGS.Yoffset = 0//150;//-25;
const csv=require('csvtojson');
Server = require('./server.js');
const uuidv4 = require('uuid/v4');
const fs = require('fs');


processConfig = async(rawPeeps, rawConnections) =>{
	//validate input configs
	if (rawPeeps.length % 2 !== 0){
		console.log("ERR! Must be even number of peeps!");
		return;
	}

	var randomInfection = [];
	if (Server.NeutralMode){
		console.log("Neutral success");
		//makes all nodes neutral to start
		for (var x=0; x<rawPeeps.length; x++){
			randomInfection.push(-1);
		}
	}
	else{
		console.log("NOT NEUTRAL");
		for (var x=0; x<rawPeeps.length/2; x++){
			randomInfection.push(0);
			randomInfection.push(1);
		}
		shuffle(randomInfection); //shuffles the list so the initial layout is random
	}

	var peepData = [];
	var connectionData = [];

	//Scales the x and y co-ordinates of the nodes to fit the container. This could possibly be implemented on client side.
	for (var i=0; i<rawPeeps.length; i++){
		peepData.push([(rawPeeps[i][0] * NETWORK_CONFIGS.Xscale) + NETWORK_CONFIGS.Xoffset, (rawPeeps[i][1] * NETWORK_CONFIGS.Yscale) + NETWORK_CONFIGS.Yoffset, randomInfection[i]]);
	}

	//Isn't this just recreating the list? This was from a while ago so not too sure if needed.
	for (var i=0; i<rawConnections.length; i++){
		connectionData.push(rawConnections[i]);
	}

	NETWORK_CONFIGS.push({
			"peeps": peepData,
			"connections": connectionData,
	});
}


//TODO expand this to do multiple files (ez, just get directory, get all files, do for each file...)
async function loadConfigs() {
	var csvPeeps=null;
	var csvConnections=null;
	if (!LocalMode){
		csvPeepsDirectory='ContagionServer/Config_Files/';
	}
	else{ //depending where it's started from, can be already inside ContagionServer
	console.log("oofie");
		csvPeepsDirectory='Config_Files/';
	}

	var topologies = [];
	//from https://stackoverflow.com/questions/2727167/how-do-you-get-a-list-of-the-names-of-all-files-present-in-a-directory-in-node-j?rq=1
	fs.readdirSync(csvPeepsDirectory).forEach(file => {
			topologies.push(csvPeepsDirectory+file);
	});
	console.log("types="+topologies);

	for (var i=0; i < topologies.length; i++){
		var positionsPath = topologies[i]+"positions_"+i;
		var edgesPath = topologies[i]+"edges_"+i;

		var rawPeeps = null;
		var connections = null;
		await csv({noheader:true, output:"csv"}).fromFile(positionsPath).then((jsonObj) =>{
			rawPeeps = jsonObj;
		});
		await csv({noheader:true, output:"csv"}).fromFile(positionsPath).then((jsonObj) =>{
			connections = jsonObj;
		});
		processConfig(rawPeeps, connections);
	}


	console.log("ready");

}

//Fisher-Yates shuffle. Credit: https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array
function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

loadConfigs();


module.exports = NETWORK_CONFIGS;
