//need nodeJS and uuid on the server
//Use v4 as it is random and therefore hard to predict
//If we want user accounts, perhaps v3 or v5 would be better, as it produces reliable values based on names.
//Cookies are a potential route for tracking players, but rather not, since legal issues.
const uuidv4 = require('uuid/v4');
const WebSocketServer = require('ws').Server;
const wss = new WebSocketServer({ port: 8081 });
var mysql = require('mysql');
var clone = require('clone');
serverConfigs = require('./NetworkConfigurations.js');
const Message = require('./Message.js');

var dbConnection = mysql.createConnection({
  host: "svm-lh9g14-contagion",
  user: "contagion",
  password: "ligma"
});

dbConnection.connect(function(err){
  if (err) {
    console.log(err);
    throw err;
  }
  console.log("Connected to Database.");
});

Server.sendSqlQuery = function(query){
  console.log(query);
  dbConnection.query(query, function(err, result){
    if (err){
      throw err;
    }
    console.log("Result: ");
    console.log(result);
  });
}

module.exports.sendSqlQuery = Server.sendSqlQuery;


//BUG: No connection ended on refresh
function Server(){
  Server.MAX_TOKENS = 5;
  Server.CurrentGames = [];
  Server.WaitingGameConfig = null;
  Server.RoundLimit = 2;
  Server.sendSqlQuery("use contagion;");
}
Server();

//TODO: Check the player IDs generated here get sent ok.
//TODO: Make sure players repeating a game get tracked!
class GameState {
  constructor(peeps, connections, topologyInstanceID, ws) {
    this.gameID = uuidv4();
    this.playerOne = ws;
    this.playerOne.score = 0;
    this.playerTwo = null;
    this.formattedPeeps = peeps;
    this.formattedConnections = connections;
    this.topologyInstanceID = topologyInstanceID;
    this.playerOneMoves = [];
    this.playerTwoMoves = [];
    this.roundNumber = 0;
    this.flippedNodes = [];
    this.playerOneTime = 0; //Starts just before sending config or updated state, ends as we identify whose move we recieved.
    this.playerTwoTime = 0;
  }

}

  GameState.prototype.addGameToDatabase = function(query){
    var timestamp = new Date();
    timestamp = timestamp.toISOString().slice(0, -1); //removes the Z from the timestamp. Not strictly necessary as the DB will truncate, but this avoids a warning being produced.
    var query = `INSERT INTO master_games_table VALUES ('${this.gameID}', '${timestamp}', '${this.playerOne.id}', '${this.playerTwo.id}', '${this.topologyInstanceID}');`;
    Server.sendSqlQuery(query);
  }

  GameState.prototype.addMovesToDatabase = function(){
    console.log(this.flippedNodes);
    var flippedString = "";
    this.flippedNodes.forEach(function(nodeIndex){
      flippedString = flippedString + nodeIndex + "_";
    });
    flippedString = flippedString.slice(0, -1); //removes trailing comma

    var p1MovesString = "";
    this.playerOneMoves.forEach(function (move){
      p1MovesString = p1MovesString + move + "_";
    });
    p1MovesString = p1MovesString.slice(0, -1);

    var p2MovesString = "";
    this.playerOneMoves.forEach(function (move){
      p2MovesString = p2MovesString + move + "_";
    });
    p2MovesString = p2MovesString.slice(0, -1);

    var query = `INSERT INTO player_actions_table VALUES ('${this.gameID}', ${this.roundNumber}, '${this.flippedNodes}', '${this.playerOneMoves}' ,'${this.playerTwoMoves}', ${this.playerOneTime}, ${this.playerTwoTime});`;
    Server.sendSqlQuery(query);
    this.flippedNodes = [];
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
    this.playerOneTime = Date.now() - this.playerOneTime;
    this.addPlayerMoves(moves, true, (this.playerTwo == "AI" || this.playerTwoMoves.length > 0));
  }

  GameState.prototype.addPlayerTwoMoves = function(moves){
    this.playerTwoTime = Date.now() - this.playerTwoTime;
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

  GameState.prototype.calculateWinner = function(){


  }

  //naturalEnd is true when the game ends by reaching the max number of rounds.
  GameState.prototype.killGame = async(naturalEnd, game) => {
    ("game over");
    if (naturalEnd){
      //send score, etc.
      var winner;
      var loser;
      if(game.playerOne.score > game.playerTwo.score){
        winner = game.playerOne;
        loser = game.playerTwo;
      }
      else if (game.playerOne.score < game.playerTwo.score){
        winner = game.playerTwo;
        loser = game.playerOne;
      }
      else{
        Server.sendClientMessage(new Message(["draw", game.playerOne.score], "GAME_END_TOKEN"), game.playerOne);
        Server.sendClientMessage(new Message(["draw", game.playerTwo.score], "GAME_END_TOKEN"), game.playerTwo);
        var index = Server.CurrentGames.indexOf(this);
        Server.CurrentGames.splice(index, 1);
        console.log(Server.CurrentGames.length);
        return;
      }
      Server.sendClientMessage(new Message(["win", winner.score], "GAME_END_TOKEN"), winner);
      Server.sendClientMessage(new Message(["lose", loser.score], "GAME_END_TOKEN"), loser);
    }
    var index = Server.CurrentGames.indexOf(this);
    Server.CurrentGames.splice(index, 1);
    console.log(Server.CurrentGames.length);
  }

  GameState.prototype.newTurn = function(){
    this.roundNumber++;
    var aiStatus = this.aiCheck();
    if (aiStatus == null){
      this.killGame(false, this);
      return;
    }
    //Passes a representation of the AI player to the AI move creation function
    else if(aiStatus){
      this.aiTurn(aiStatus);
    }
    this.performInfections();
    this.addMovesToDatabase();
    this.updateScores();
    this.updateClients();
    console.log("Round:" + this.roundNumber + "/" + Server.RoundLimit);
    if (this.roundNumber >= Server.RoundLimit){
      this.killGame(true, this);
    }
    //something turnData.push(playerMoves);
  }

  GameState.prototype.updateScores = function(){
    var playerOnePeepsCount = 0;
    this.formattedPeeps.forEach(function(peep){
      if (peep[2] == 1){
        playerOnePeepsCount++;
      }
    });
    var playerTwoPeepsCount = this.formattedPeeps.length - playerOnePeepsCount;
    var p1additionalScore = playerOnePeepsCount * 10;
    var p2additionalScore = playerTwoPeepsCount * 10;
    this.playerOne.score += p1additionalScore;
    this.playerTwo.score += p2additionalScore;
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

      var payload = [peepsToSend, movesToSend, this.playerOne.score];
      this.playerOneTime = Date.now();
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

      var payload = [peepsToSend, movesToSend, this.playerTwo.score];
      this.playerTwoTime = Date.now();
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
    var flippedNodes = this.flippedNodes;
    originalPeeps.forEach(function(peep, index){
      if (peep[2] != updatedPeeps[index][2]){
        flippedNodes.push(index);
      }
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
    this.playerTwo.score = 0;
    //adds the game to the database now we have a full game. TODO: do this when we've confirmed there's an AI player!
    this.addGameToDatabase();
  }


//########################################################################################END GAMESTATE

/*Server should store main sim stuff for security and data saving, so:
Peeps: Infected, Location(x,y), playerOrbits, aiOrbits maybe ID? Possibly not though. Percentages - If we're showing the user..?

Should be able to RECREATE game state with as few vars as possible
*/
Server.validateGame = function(ws){
  let game = Server.CurrentGames.filter(gameState => {
    return (gameState.playerOne == ws || gameState.playerTwo == ws);
  });
  if (game.length > 1){
    console.log("ERR: USER IS IN MUPLTIPLE GAMES.");
    return null; //TODO: kill game?
  }
  if (game.length < 1){
    console.log("ERR: USER DOES NOT APPEAR TO BE IN ANY GAMES.");
    return null;
  }
  else return game[0];
}

Server.submitMoves = function(message, ws){
  game = Server.validateGame(ws);
  if (game == null){
    return;
  }
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
  var topologyID = 2; //TODO
  var config = {
    type:"sim",
    x: 0,
    y: 0,
    fullscreen: true,
    network: clone(serverConfigs[topologyID])
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
  console.log(ws.id);
  let gameTest = Server.CurrentGames.filter(gameState => {
    return (gameState.playerOne == ws || gameState.playerTwo == ws);
  });
  if (gameTest.length != 0){
    console.log("ERR: User trying to make game, but already in game.");
    return;
  }
  //If nobody's waiting for a player 2
  console.log("WGC "+Server.WaitingGameConfig);
  if (Server.WaitingGameConfig == null){
    var config = Server.getConfig();
    Server.WaitingGameConfig = config;

    var game = new GameState(config.network.peeps, config.network.connections, config.network.instanceID, ws);
    console.log("MEMEMEME"+config.network.instanceID);
    Server.CurrentGames.push(game);
    this.playerOneTime = Date.now();
    Server.sendClientMessage(new Message(config, "CONFIG_TOKEN"), ws);

  }
  //Matches a player when somebody is waiting
  else{
    var config = Server.WaitingGameConfig;
    Server.WaitingGameConfig = null;
    console.log(config.network.peeps);
    config.network.peeps.forEach(function(peep){
      //reverses the infected state for P2
      peep[2] = 1 - peep[2];
    });
    var game = Server.CurrentGames[Server.CurrentGames.length-1];
    game.addPlayerTwo(ws);
    this.playerTwoTime = Date.now();
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
