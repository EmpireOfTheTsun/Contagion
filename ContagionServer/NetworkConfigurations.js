NETWORK_CONFIGS = [];
NETWORK_CONFIGS.Xscale = 1//1200; //Input topologies have x/y coordinates between 0 and 1. This scales it to a typical player's screen.
NETWORK_CONFIGS.Yscale = 1//700;
NETWORK_CONFIGS.Xoffset = 0//75;//-100;
NETWORK_CONFIGS.Yoffset = 0//150;//-25;
const csv=require('csvtojson');
Server = require('./server.js');
const uuidv4 = require('uuid/v4');

// NETWORK_CONFIGS.push({
// 		"peeps":[[500,200,-1],[500,350,-1],[800,350,-1],[800,200,-1]],
// 		"connections":[[0,1,1],[1,2,1],[2,3,1],[3,0,1]]
// });
// NETWORK_CONFIGS.push({
// 		"peeps":[[500,200,-1],[500,350,-1],[650,450,-1],[800,350,-1],[800,200,-1],[650,100,-1]],
// 		"connections":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[4,5,1],[5,0,1]]
// });

processConfigs = async(rawPeeps, rawConnections) =>{
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
		shuffle(randomInfection);
	}

	var peepData = [];
	var connectionData = [];

	for (var i=0; i<rawPeeps.length; i++){
		peepData.push([(rawPeeps[i][0] * NETWORK_CONFIGS.Xscale) + NETWORK_CONFIGS.Xoffset, (rawPeeps[i][1] * NETWORK_CONFIGS.Yscale) + NETWORK_CONFIGS.Yoffset, randomInfection[i]]);
	}
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
	const csvPeeps='ContagionServer/Config_Files/game_test_net_pos.csv';
	const csvConnections='ContagionServer/Config_Files/game_test_net_edge_list.csv';

	var rawPeeps = null;
	var connections = null;
	await csv({noheader:true, output:"csv"}).fromFile(csvPeeps).then((jsonObj) =>{
		rawPeeps = jsonObj;
	});
	await csv({noheader:true, output:"csv"}).fromFile(csvConnections).then((jsonObj) =>{
		connections = jsonObj;
	});
	processConfigs(rawPeeps, connections);
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
