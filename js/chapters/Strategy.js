SLIDES.push(
{
	chapter: "Strategy",
	clear:true,

	add:[
		// Words
		{
			id:"connections_dialog",
			type:"box",
			text:"sandbox_caption",
			x:660, y:0, w:300, h:40,
			align:"center"
		},
		{
			id:"round_dialog",
			type:"box",
			text:"round_caption",
			x:250, y:0, w:300, h:40,
			align:"center"
		},
		// The fullscreen simulation
		{
			type:"sim",
			x:0, y:0,
			fullscreen: true,
			network: {
				"ai_mode":1,
				"contagion":0.4,
				"peeps":[[500,200,0],[500,350,0],[650,450,0],[800,350,0],[800,200,0],[650,100,0],[650,225,1,1], [650,325,0,1]],
				"connections":[[0,1,1],[1,2,1],[2,3,1],[3,4,1],[4,5,1],[5,0,1]]
			},
		},

		// The Sandbox UI
		{
			type:"box",
			x:0, y:0,
			sandbox:true
		},

		// Simulation UI
		{
			type:"box",
			x:35, y:400,
			sim_ui:"red"
		}




	]

}
);
