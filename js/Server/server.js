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
  Server.CurrentGames = [];
  Server.WaitingGameConfig = null;
  Server.RoundLimit = 10;
}
Server();

//TODO: Check the player IDs generated here get sent ok.
//TODO: Make sure players repeating a game get tracked!
class GameState {
  constructor(peeps, connections, ws) {
    this.gameID = uuidv4();
    this.playerOne = ws;
    this.playerTwo = null;
    this.formattedPeeps = peeps;
    this.formattedConnections = connections;
    this.playerOneMoves = [];
    this.playerTwoMoves = [];
    this.roundNumber = 0; //use me to validate number of orbits!
  }

}

  GameState.prototype.addPlayerMoves = function(moves, isPlayerOne, opponentReady){
    //TODO: When doing the only-one-token-at-a-time thing, do here - if [0] it's an add. If [1] it's a remove.
    //TODO: Validate you're only removing ones that are currently in though!
    //TODO: Detect when BOTH players are AI!
    isPlayerOne ? (this.playerOneMoves = moves) : (this.playerTwoMoves = moves);
    if (opponentReady){
      this.newTurn();
    }
    else{
      var recipient = isPlayerOne ? this.playerOne : this.playerTwo;
      Server.sendClientMessage(new Message(null, "DEFERRED_STATE_TOKEN"), recipient);
    }
  }

  GameState.prototype.addPlayerOneMoves = function(moves){
    this.addPlayerMoves(moves, true, (this.playerTwo == "AI" || this.playerTwoMoves.length > 0));
  }

  GameState.prototype.addPlayerTwoMoves = function(moves){
    this.addPlayerMoves(moves, false, (this.playerOne == "AI" || this.playerOneMoves.length > 0));
  }

  //returns the AI player if is present, else false.
  //returns null if the game is run only by AI, and should be shut down.
  GameState.prototype.aiCheck = function(){
    var oneAI = this.playerOne == "AI";
    var twoAI = this.playerTwo == "AI";
    if (oneAI || twoAI){
      if (oneAI && twoAI){
        return null;
      }
      else{
        var aiPlayer = oneAI ? this.playerOneMoves : this.playerTwoMoves;
        return aiPlayer;
      }
    }
    return false;
  }

  //naturalEnd is true when the game ends by reaching the max number of rounds.
  GameState.prototype.killGame = function(naturalEnd){
    if (naturalEnd){
      //send score, etc.
      Server.sendClientMessage(new Message(payload, "GAME_END_TOKEN"), this.playerOne);
      Server.sendClientMessage(new Message(payload, "GAME_END_TOKEN"), this.playerTwo);

    }
    var index = Server.CurrentGames.indexOf(this);
    Server.CurrentGames.splice(index, 1);

  }

  GameState.prototype.newTurn = function(){
    this.roundNumber++;
    var aiStatus = this.aiCheck();
    if (aiStatus == null){
      this.killGame(false);
      return;
    }
    //Passes a representation of the AI player to the AI move creation function
    else if(aiStatus){
      this.aiTurn(aiStatus);
    }
    //TODO: log moves in DB
    this.performInfections();
    this.updateDatabase();
    this.updateClients();
    console.log("Round:" + this.roundNumber + "/" + Server.RoundLimit);
    if (this.roundNumber >= Server.RoundLimit){
      this.killGame(true);
    }
    //something turnData.push(playerMoves);
  }

  GameState.prototype.updateDatabase = function(){
    console.log("IMPLEMENT DATABASE UPDATE");
  }

  //Sends the clients an array of length equal to the number of peeps
  //Each element is a pair of (infectedState, enemyTokens)
  //Where infectedState = 1 if infected, 0 if not (from player 1's perspective)
  //enemyTokens is the number of tokens the enemy put on that peep, showing their last move.
  GameState.prototype.updateClients = function(){
    var peepsToSend = [];
    var movesToSend = [];
    if (this.playerOne !== "AI" && this.playerOne !== null){

      this.formattedPeeps.forEach(function(peep){
        peepsToSend.push(peep[2]);
      })
      this.playerTwoMoves.forEach(function(move){
        movesToSend.push(move);
      })

      var payload = [peepsToSend, movesToSend];
      Server.sendClientMessage(new Message(payload, "UPDATE_STATE_TOKEN"), this.playerOne);
    }
    if (this.playerTwo !== "AI" && this.playerTwo !== null){
      //Clears these so we can populate them with the game state from player 2's perspective
      peepsToSend = [];
      movesToSend = [];

      this.formattedPeeps.forEach(function(peep){
        //1 - infected status from P1's POV gives infected state for P2's POV
        peepsToSend.push(1 -peep[2]);
      })
      this.playerOneMoves.forEach(function(move){
        movesToSend.push(move);
      })

      var payload = [peepsToSend, movesToSend];
      Server.sendClientMessage(new Message(payload, "UPDATE_STATE_TOKEN"), this.playerTwo);
    }
    this.playerOneMoves = [];
    this.playerTwoMoves = [];
  }

  //NB: INFECTED/UNINFECTED IS FROM POV OF PLAYER1!
  GameState.prototype.performInfections = function(){
    var updatedPeeps = JSON.parse(JSON.stringify(this.formattedPeeps));
    updatedPeeps.forEach(function(peep){
      peep.push(0);
      peep.push(0);
    });
    //required as using 'this' in the loop uses the loop's scope, and can't access the variable needed
    var originalPeeps = this.formattedPeeps;

    //Adds to the 'infected friends' ([3]) and 'total friends' ([4]) counts based on the peeps connected via lines.
    this.formattedConnections.forEach(function(connection){
      var peep1 = updatedPeeps[connection[0]];
      var peep2 = updatedPeeps[connection[1]];
      //NB: It's ok to use the infection stats of updatedPeeps here because we're only calculating the likelihood of infection here.
      //The actual infecting step takes place after, which is the only thing that could cause a difference in calculations.
      //The third item in the peep array is the infected state. 1 = infected, 0 = not infected
      peep1[3] += peep2[2];
      peep2[3] += peep1[2];
      peep1[4]++;
      peep2[4]++;
    });

    //Adds to friends based on player one's tokens (i.e. always adds to both infected and total friends)
    this.playerOneMoves.forEach(function(move){
      updatedPeeps[move][3]++;
      updatedPeeps[move][4]++;
    });

    //Adds to friends based on player two's tokens (i.e. always adds to just total friends)
    this.playerTwoMoves.forEach(function(move){
      updatedPeeps[move][4]++;
    });

    updatedPeeps.forEach(function(peep){
      var ratio = peep[3]/peep[4];
      var rand = Math.random();
      if(ratio>=rand){ //Adding random element for voter model
        peep[2] = 1;
      }
      else{
        peep[2] = 0;
      }
    });
    console.log("----");
    console.log(updatedPeeps);
    console.log(originalPeeps);

    originalPeeps.forEach(function(peep, index){
      peep[2] = updatedPeeps[index][2];
    });


  }

  //TODO: Add GUI representation of this on the client side
  GameState.prototype.aiTurn = function(aiMoves){
    //pick a random peep
    for(i=0 ; i < Server.MAX_TOKENS; i++){
        var peepIndex = Math.floor(Math.random()*this.formattedPeeps.length);
        aiMoves.push(peepIndex);
    }
  }

  GameState.prototype.addPlayerTwo = function(ws){
    this.PLAYER_TWO_AI = false;
    this.playerTwo = ws;
  }


//########################################################################################END GAMESTATE

/*Server should store main sim stuff for security and data saving, so:
Peeps: Infected, Location(x,y), playerOrbits, aiOrbits maybe ID? Possibly not though. Percentages - If we're showing the user..?

Should be able to RECREATE game state with as few vars as possible
*/

//TODO: Is this the way I want to go with this?
//MAP of websocket to game ID..? Will that work with 2 players?
Server.submitMoves = function(message, ws){
  let game = Server.CurrentGames.filter(gameState => {
    return (gameState.playerOne == ws || gameState.playerTwo == ws);
  });
  if (game.length > 1){
    console.log("ERR: USER IS IN MUPLTIPLE GAMES.");
    return; //TODO: kill game?
  }
  if (game.length < 1){
    console.log("ERR: USER DOES NOT APPEAR TO BE IN ANY GAMES.");
    return;
  }
  game = game[0];
  if (game.playerOne === ws){
    console.log("P1:" + message);
    game.addPlayerOneMoves(message);
    //Send Player2 message
  }
  else{
    console.log("P2:" + message);
    game.addPlayerTwoMoves(message);
    //Send Player1 message
  }


}

//TODO: randomize?
Server.getConfig = function(){
  var config = {
    type:"sim",
    x: 0,
    y: 0,
    fullscreen: true,
    network: serverConfigs[0]
  }
  return config;
}

wss.on('connection', ((ws) => {
  ws.id = uuidv4();
  ws.on('message', (message) => {
      Server.ParseMessage(message, ws);
  });
  ws.on('end', () => {
    console.log('Connection ended...');
  });
  ws.send('Successful Connection to Server');
  //need to store this ws now...
}));

Server.sendClientMessage = function(message, ws){
  ws.send(JSON.stringify(message));
}

Server.newGame = function(ws){
  //If nobody's waiting for a player 2
  if (Server.WaitingGameConfig == null){
    var config = Server.getConfig();
    Server.WaitingGameConfig = config;

    var game = new GameState(config.network.peeps, config.network.connections, ws);
    Server.CurrentGames.push(game);
    Server.sendClientMessage(new Message(config, "CONFIG_TOKEN"), ws);

  }
  //Matches a player when somebody is waiting
  else{
    var config = Server.WaitingGameConfig;
    Server.WaitingGameConfig = null;
    console.log(config);
    console.log(config.network.peeps);
    config.network.peeps.forEach(function(peep){
      //reverses the infected state for P2
      peep[2] = 1 - peep[2];
    });
    var game = Server.CurrentGames[Server.CurrentGames.length-1];
    game.addPlayerTwo(ws);
    Server.sendClientMessage(new Message(config, "CONFIG_TOKEN"), ws);
    //TODO: Maybe have state for game where rejects P1 inputs before P2 joins?
  }
}

//Handles messages from the client
//ws allows us to return a message to the client
Server.ParseMessage = function(message, ws){
  try{
    message = JSON.parse(message); //or message.data? TODO: check
  }
  catch(err){
    return;
  }
  Server.CurrentGames.forEach(function(){
  });
  switch(message.status){
    case "SUBMIT_MOVES_TOKEN":
      Server.submitMoves(message.payload, ws);
      break;
    case "NEW_GAME_TOKEN":
      Server.newGame(ws);
      break;
  }
}



//Need to shift infection code here
//Add game state (minus connections, peep locations I guess) to database every turn!
