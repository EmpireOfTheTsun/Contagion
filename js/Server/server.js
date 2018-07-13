//need nodeJS and uuid on the server
//Use v4 as it is random and therefore hard to predict
//If we want user accounts, perhaps v3 or v5 would be better, as it produces reliable values based on names.
//Cookies are a potential route for tracking players, but I'd rather not, since legal issues.
//Probably need to rework the base networking a tiny bit so we can return msg to those who send them. Extra server obj for each conn..? Stops client getting ID!
//Network configs are stored in chapters/blah.js   Will need to add these.
const uuidv4 = require('uuid/v4');
const WebSocketServer = require('ws').Server;
const wss = new WebSocketServer({ port: 8081 });

serverConfigs = require('./NetworkConfigurations.js');
const Message = require('./Message.js');

//BUG: No connection ended on refresh

function Server(){
  Server.MAX_TOKENS = 3;
  Server.PLAYER_ONE_AI = false;
  Server.PLAYER_TWO_AI = true;
  Server.CurrentGames = [];
}

Server();

class PeepData{
  //not sure if it's already formatted at this point. TODO: Check!
  //we should be able to calculate infection probabilities from this + connections
  constructor(peep) {
    //not sure if ID needed for this.
    id = peep.id;
    x = peep.x;
    y = peep.y;
    infected = peep.infected;
    playerOneOrbits = peep.playerOneOrbits;
    playerTwoOrbits = peep.playerTwoOrbits;
  }
}

class ConnectionData{
  constructor(connection) {
    //from/to contain the IDs of the peeps#
    //OR maybe just their place in the list
    from = connection.from;
    to = connection.to;
  }
}



//TODO: Check the player IDs generated here get sent ok.
//TODO: Make sure players repeating a game get tracked!
class GameState {
  constructor(peeps, connections) {
    this.gameID = uuidv4();
    this.playerOneID = uuidv4();
    this.playerTwoOrbits = uuidv4();
    this.turnData = []
    this.readyPlayers = 0;
    this.formattedPeeps = peeps;
    this.formattedConnections = connections;

  }

  newTurn(){
    readyPlayers = 0;
    formattedPeeps.forEach(function(peep){
      peep.playerOneOrbits = [];
      peep.playerTwoOrbits = [];
    });
    if (Server.PLAYER_ONE_AI || Server.PLAYER_TWO_AI){
      ai_turn();
    }
    //something turnData.push(playerMoves);
  }

  //TODO: Add GUI representation of this on the client side
  aiTurn(){
    var orbiter = "TEMP_ORBITER_TOKEN";
    //pick a random peep
    for(i=0 ; i < Server.MAX_TOKENS; i++){
        var peep = formattedPeeps[Math.floor(Math.random()*peepsList.length)];
        //NOTE: If you wanna discriminate what peeps get orbits, do that here.
        Server.PLAYER_ONE_AI ? peep.playerOneOrbits.push(orbiter) : peep.playerTwoOrbits.push(orbiter);
    }
  }

}

/*Server should store main sim stuff for security and data saving, so:
Peeps: Infected, Location(x,y), playerOrbits, aiOrbits maybe ID? Possibly not though. Percentages - If we're showing the user..?

Should be able to RECREATE game state with as few vars as possible
*/

//TODO: Is this the way I want to go with this?
Server.submitMoves = function(message){
  state = Server.CurrentGames[message.serverID];
  state.readyPlayers++;

}

//TODO: randomize?
Server.getConfig = function(){
  return serverConfigs[0];
}

wss.on('connection', ((ws) => {
  ws.on('message', (message) => {
      console.log(`${message}`);
      Server.ParseMessage(message, ws);
  });
  ws.on('end', () => {
    console.log('Connection ended...');
  });
  ws.send('Successful Connection to Server');
  //need to store this ws now...
}));

Server.sendClientMessage = function(message, ws){
  console.log("SENDING MSG");
  danko = JSON.stringify(message)
  console.log(danko);
  console.log(JSON.parse(danko));
  ws.send(JSON.stringify(message));
}

Server.newGame = function(message){
  console.log("Starting Game...");
  var config = Server.getConfig();
  var game = new GameState(config.peeps, config.connections);
  Server.CurrentGames.push(game);
  return config;
}

//Handles messages from the client
//ws allows us to return a message to the client
Server.ParseMessage = function(message, ws){
  try{
    message = JSON.parse(message); //or message.data? TODO: check
  }
  catch(err){
    //console.log("Can't parse JSON:"+err);
    return;
  }
  Server.CurrentGames.forEach(function(){
    console.log("hm");
  });
  console.log(message.status);
  switch(message.status){
    case "SUBMIT_MOVES_TOKEN":
      Server.submitMoves(message.payload);
      break;
    case "NEW_GAME_TOKEN":
      var config = Server.newGame(message.payload);
      Server.sendClientMessage(new Message(config, "CONFIG_TOKEN"), ws);
      break;
  }
}



//Need to shift infection code here
//Add game state (minus connections, peep locations I guess) to database every turn!
