SLIDES.push(
{
	chapter: "Strategy",
	clear:true,
	contagion: 0.5,

	add:[
		// Words
		{
			id:"connections_dialog",
			type:"box",
			text:"sandbox_caption",
			x:200, y:-125, w:300, h:40,
			align:"center"
		},
		{
			id:"percent_infected_dialog",
			type:"box",
			text:"percentage_infected_caption",
			x: 600, y:-125, w:300, h:40,
			align:"center"
		},
		{
			id:"round_dialog",
			type:"box",
			text:"round_caption",
			x:-375, y:-125, w:300, h:40,
			align:"center"
		},
		{
			id:"score_dialog",
			type:"box",
			text:"score_caption",
			x:800, y:-125, w:300, h:40,
			align:"center"
		},
		// Simulation UI
		{
			type:"box",
			x:-100, y:-135,
			sim_ui:"red"
		}
	]
}
);
