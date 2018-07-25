NETWORK_CONFIGS = [];

NETWORK_CONFIGS.push({
		"peeps":[[500,200,0],[500,350,1],[650,450,1],[800,350,1],[800,200,0],[650,100,0]],
		"connections":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[4,5,1],[5,0,1]],
});
NETWORK_CONFIGS.push({
	network: {
		"peeps":[[500,200,0],[500,350,1],[800,350,1],[800,200,0]],
		"connections":[[0,1,1],[1,2,1],[2,3,1],[3,0,1]]
	}
});

module.exports = NETWORK_CONFIGS;
