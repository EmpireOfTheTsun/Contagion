Server.LocalMode = false;
Server.NeutralMode = true;
Server.TrialMode = true;
Server.NumberOfNodes = 20; //Changing this may require some refactoring...
Server.TestMoves = [[ 13, 2, 6, 14, 9, 10, 16, 15, 8, 18 ],
[ 6, 5, 12, 5, 2, 17, 7, 18, 9, 9 ],
[ 7, 12, 9, 13, 13, 1, 4, 19, 10, 19 ]];
Server.playerTopologies = [];


console.log("Server starting!");

shuffle = function(a) {
  for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

Server.generatePerm = function(){
  var list = [0,1,2,3];
  list = shuffle(list);
  for (var i=0; i < 4; i++){
    list.push(list[i]);
  }
  return list;
}

//need nodeJS and uuid on the server
//Use v4 as it is random and therefore hard to predict
//If we want user accounts, perhaps v3 or v5 would be better, as it produces reliable values based on names.
//Cookies are a potential route for tracking players, but legal issues.
const uuidv4 = require('uuid/v4');
const WebSocketServer = require('ws').Server;
var http = require("http");
var express = require("express");
var nodemailer = require('nodemailer');
var app = express();
var PORT = process.env.PORT || 5000;
//app.use(express.static(__dirname + "/"));

//Setup mailing to alert if there is a problem with the database
var transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'contagiongamesoton@gmail.com',
    pass: 'southampt0N'
  }
});

var server = http.createServer(app);
server.listen(PORT);

const wss = new WebSocketServer({ server: server });
var client = null;
if(!Server.LocalMode){
  const { Client } = require('pg');
  client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: true,
  });
  console.log(process.env.DATABASE_URL);
  client.connect();
}

var clone = require('clone');
module.exports = {
  initialiseTopologyLayoutIndexes: function() {
    Server.initialiseTopologyLayoutIndexes();
  },
  NeutralMode: Server.NeutralMode,
  LocalMode: Server.LocalMode,
  NumberOfNodes: Server.NumberOfNodes

};
module.exports.NeutralMode = Server.NeutralMode;
module.exports.LocalMode = Server.LocalMode;
//module.exports.NumberOfNodes = Server.NumberOfNodes;

configData = require('./NetworkConfigurations.js');
serverConfigs = configData.configs;
laplaciansList = configData.laplacians; //TODO: INTEGRATE THIS
const Message = require('./Message.js');

Server.sendSqlQuery = function(query, game){
  console.log(query);
  if (!Server.LocalMode){
    try{
      client.query(query, function(err, result){
        if (err){
          Server.databaseFailure(err, game, query);
        }
      });
    }
    catch(err){
      Server.databaseFailure(err, game, query);
    }
  }
}

Server.databaseFailure = function(err, game, query){
  console.log(err);
  console.log(query);

  //only emails at most once per hour
  if (Date.now() - Server.lastAlertTime > 3600000){
    console.log("triggered");
    Server.lastAlertTime = Date.now();
    Server.sendMail("URGENT: Error Adding to Database! "+query, err);
  }

  //Makes players think the other disconnected
  //Suppress errors if either player cannot be reached.
  try{
    Server.sendResults(1, game, "disconnect");
  } catch(err){}
  try{
    Server.sendResults(2, game, "disconnect");
  } catch(err){}

  game.killGame(false, game);
}

Server.sendMail = function(emailSubject, errtext){
  var fullText = "Error: "+errtext;

  var mailOptions = {
    from: 'contagiongamesoton@gmail.com',
    to: 'lh9g14@soton.ac.uk',
    subject: emailSubject,
    text: fullText
  };

  transporter.sendMail(mailOptions, function(error, info){
  if (error) {
    console.log(error);
  } else {
    console.log('Email sent: ' + info.response);
  }
});

}

Server.initialiseTopologyLayoutIndexes = function(){
  var topologyLayoutIndexes = [];
  for (var i=0; i<serverConfigs.length; i++){
    topologyLayoutIndexes.push(0);
  }

  Server.CurrentTopologyLayoutIndexes = topologyLayoutIndexes;
  Server.CurrentTopologyIndex = 0;
}

//BUG: No connection ended on refresh
function Server(){
  Server.MAX_TOKENS = 5;
  Server.CurrentGames = [];
  Server.WaitingGameConfig = null;
  Server.RoundLimit = 10;
  Server.AiMode = true;
  Server.InfectionMode = "wowee"; //"majority" or anything else
  Server.AiStrategy = "Predetermined";//"SimpleGreedy";
  Server.TokenProtocol = "Incremental"; //"AtStart" or "Incremental"
  Server.AiWaiting = false;
  Server.lastAlertTime = 0;
  Server.demoMode = true;
  Server.heartbeatCheckFrequency = 100;
  Server.heartAttackTime = 800;
}

Server();




//TODO: Make sure players repeating a game get tracked! I am 99% this is fine, but will need to check
class GameState {
  constructor(peeps, connections, playerOneLayoutID, playerTwoLayoutID, laplacianID, ws) {
    this.gameID = uuidv4();
    this.playerOne = ws;
    this.playerOne.id = ws.id;
    this.playerOneScore = 0;
    this.playerTwo = null;
    this.formattedPeeps = peeps;
    this.formattedConnections = connections;
    this.playerOneLayoutID = playerOneLayoutID;
    this.playerTwoLayoutID = playerTwoLayoutID;
    this.playerOneMoves = [];
    this.playerTwoMoves = [];
    this.roundNumber = 0;
    this.flippedNodes = [];
    this.playerOneTime = -1; //Starts just before sending config or updated state, ends as we identify whose moves we recieved.
    this.playerTwoTime = -1;
    this.playerTwoTimeOffset = 10000000000 //large value for debug, should only appear if something has gone wrong.
    this.playerOneLastHeartbeat = Date.now();
    this.playerTwoLastHeartbeat = -1;
    this.timer = setInterval(this.heartbeatHandler, Server.heartbeatCheckFrequency, this);
    this.prevAiMoves = [];
    this.gameStartTime = Date.now();
    this.aiCheckTimer = null;
    this.playerOneScoreList = [];
    this.playerTwoScoreList = [];
    this.laplacianID = laplacianID;
    if (Server.TrialMode){
      this.predeterminedAIMoves = Server.TestMoves[laplacianID];
    }
    //
  }

}

  GameState.prototype.addGameToDatabase = function(query){
    var timestamp = new Date();
    timestamp = timestamp.toISOString().slice(0, -1); //removes the Z from the timestamp. Not strictly necessary as the DB will truncate, but this avoids a warning being produced.
    var infectedPeepsString = "";
    this.formattedPeeps.forEach(function (peep, index){
      if(peep[2] == 1){
        infectedPeepsString = infectedPeepsString + index + "_";
      }
    });
    //sets ID to "AI" if they aren't a human player
    var p1id = (this.playerOne != null && this.playerOne != "AI") ? this.playerOne.id : "AI";
    var p2id = (this.playerTwo != null && this.playerTwo != "AI") ? this.playerTwo.id : "AI";
    if (p2id == "AI"){
      this.playerTwoLayoutID = "";
    }
    var query = `INSERT INTO master_games_table VALUES ('${this.gameID}', '${timestamp}', '${p1id}', '${p2id}', '${infectedPeepsString}',  '${this.playerOneLayoutID}', '${this.playerTwoLayoutID}');`;
    Server.sendSqlQuery(query, this);
  }

  //updates the state if P1 or P2 changes
  GameState.prototype.updateGameDatabaseEntry = function(){
    var p1id = (this.playerOne != null && this.playerOne != "AI") ? this.playerOne.id : "AI";
    var p2id = (this.playerTwo != null && this.playerTwo != "AI") ? this.playerTwo.id : "AI";
    var query = `UPDATE master_games_table SET player_one_id = '${p1id}', player_two_id = '${p2id}' WHERE game_id = '${this.gameID}';`;
    Server.sendSqlQuery(query, this);
  }

  GameState.prototype.addMovesToDatabase = function(){
    var flippedString = "";
    this.flippedNodes.forEach(function(nodeIndex){
      flippedString = flippedString + nodeIndex + "_";
    });
    flippedString = flippedString.slice(0, -1); //removes trailing underscore

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
    Server.sendSqlQuery(query, this);
    this.flippedNodes = [];
  }

  GameState.prototype.addPlayerMoves = function(moves, isPlayerOne, opponentReady){

    //Performs AI moves before recording player moves (to prevent bias)
    this.aiCheck();
    isPlayerOne ? (this.playerOneMoves = moves) : (this.playerTwoMoves = moves);
    if (opponentReady){
      if (Server.AiWaiting == true && (this.playerTwo == "AI" || this.playerOne == "AI")){
        this.fakeAiWait();
      }
      else{
        this.newTurn();
      }
    }
    else{
      var recipient = isPlayerOne ? this.playerOne : this.playerTwo;
      Server.sendClientMessage(new Message(null, "DEFERRED_STATE_TOKEN"), recipient);
    }
  }

  //This is a very naive version that might wait a few seconds. Should be enough to convince users, but can revisit if not.
  GameState.prototype.fakeAiWait = function(){
    var rand = Math.random();
    //60% chance of waiting, to make players not feel too rushed
    if (rand > 0.4){
      rand = Math.random();
      //wait up to 4 seconds, avg. wait of 2s.
      setTimeout(() => {this.newTurn();}, rand*4000);
    }
    //Simulates the other player having submitted before you
    else{
      this.newTurn();
    }
  }

  GameState.prototype.addPlayerOneMoves = function(moves){
    clearTimeout(this.playerOneTimer);
    this.playerOneTime = Date.now() - this.gameStartTime;
    this.addPlayerMoves(moves, true, (this.playerTwo == "AI" || this.playerTwoMoves.length > 0));
    if (this.roundNumber == 0){
      //No P2 present
      if(this.playerTwo == null){
        //Replaces the game-ending timer with a soft timer for the remaining duration+10s that will add an AI if nobody is present
        this.addPlayerOneTimer(70 - (Date.now() - this.gameStartTime));
      }
      //P2 present, but not submitted yet
      else if (this.playerTwo != "AI" && this.playerTwoMoves.length == 0){
        //Calculates the time P2 has remaining
        this.addPlayerOneTimer(60 + this.playerTwoTimeOffset - (Date.now() - this.gameStartTime));
      }
    }
  }

  GameState.prototype.addPlayerOneTimer = function(duration){
    if(duration < 1){
      duration = 1;
    }
    this.aiCheckTimer = setTimeout(() => {this.addPlayerTwoAI();}, duration);
    Server.sendClientMessage(new Message([1, duration-1], "TIMER_TOKEN"), game.playerOne);
  }

  GameState.prototype.addPlayerTwoMoves = function(moves){
    clearTimeout(this.playerTwoTimer);
    this.playerTwoTime = (Date.now() - this.gameStartTime) - this.playerTwoTimeOffset;
    this.addPlayerMoves(moves, false, (this.playerOne == "AI" || this.playerOneMoves.length > 0));
  }

  //returns the AI player's moves if is present, else false.
  //returns null if the game is run only by AI, and should be shut down.
  GameState.prototype.aiCheck = function(){
    var oneAI = this.playerOne == "AI";
    var twoAI = this.playerTwo == "AI";
    if (oneAI || twoAI){
      if (oneAI && twoAI){
        //both AI. kill game.
        this.killGame(false, this);
      }
      else{
        var aiPlayer = this.playerTwoMoves; //WARN: Assumes P2 always AI.
        this.aiTurn(aiPlayer);
      }
    }
    //no AI players, so do nothing
  }

  GameState.prototype.heartbeatHandler = function(game){
    var now = Date.now();
    if (now - game.playerOneLastHeartbeat > Server.heartAttackTime){
      console.log("Heart attack1!");
      try{
        Server.sendResults(2, game, "disconnect");
      }
      catch(e){
        console.log("Error when sending gameend msg: "+e);
      }
      game.killGame(false, game);
    }
    if(game.playerTwo !== "AI" && game.playerTwo !== null && now-game.playerTwoLastHeartbeat > Server.heartAttackTime){
      console.log("Heart attack2!");
      try{
        Server.sendResults(1, game, "disconnect");
      }
      catch(e){
        console.log("Error when sending gameend msg: "+e);
      }
      game.killGame(false, game);
    }
  }

  GameState.prototype.registerClick = function(playerID, nodeID, action){
    var timestamp = Date.now() - this.gameStartTime;
    var query = `INSERT INTO player_clicks_table VALUES ('${this.gameID}', '${playerID}', '${nodeID}', '${action}', '${timestamp}');`;
    Server.sendSqlQuery(query, this);
  }


  GameState.prototype.removeGame = async(game) => {
    var index = Server.CurrentGames.indexOf(game);
    Server.CurrentGames.splice(index, 1);
    console.log("SEE ME No. games:"+Server.CurrentGames.length);
  }

  //naturalEnd is true when the game ends by reaching the max number of rounds.
  GameState.prototype.killGame = function(naturalEnd, game, causer){
    ("game over");
    if(causer != null){
      try{
        if (causer == "p1"){
          Server.sendResults(2, game, "disconnect");
        }
        else if(causer == "p2"){
          Server.sendResults(2, game, "disconnect");
        }
      }
      catch(err){} //Suppresses error if other player is an AI
      if(causer != "p1" && causer != "p2"){
        console.log("wtf! "+causer);
        Server.sendMail("URGENT: Unknown cause of game failure!",causer);
      }
    }
    if (naturalEnd){
      //send score, etc.
      console.log("P1SCORE: "+game.playerOneScore);
      console.log("P2SCORE: "+game.playerTwoScore);
      if (game.playerTwo == "AI"){
        if (game.playerOneScore > game.playerTwoScore){
          Server.sendResults(1, game, "win");
        }
        else if (game.playerOneScore < game.playerTwoScore){
          Server.sendResults(1, game, "lose");
        }
        else{
          Server.sendResults(1, game, "draw");
        }
      }
      else{
        if(game.playerOneScore > game.playerTwoScore){
          Server.sendResults(1, game, "win");
          Server.sendResults(2, game, "lose");
        }
        else if (game.playerOneScore < game.playerTwoScore){
          Server.sendResults(1, game, "lose");
          Server.sendResults(2, game, "win");
        }
        else{
          Server.sendResults(1, game, "draw");
          Server.sendResults(2, game, "draw");
        }
      }

    }
    clearInterval(game.timer);
    clearTimeout(game.playerOneTimer);
    clearTimeout(game.playerTwoTimer);

    this.removeGame(game);
  }

  GameState.prototype.newTurn = function(){
    this.roundNumber++;
    this.performInfections();
    this.addMovesToDatabase();
    this.updateScores();
    this.updateClients();
    if (this.roundNumber >= Server.RoundLimit){
      this.killGame(true, this);
    }
    else{
      //gives players 31s to make a move
      if (this.playerOne != "AI"){
        Server.startTimer(this, 0, 31, true);
      }
      if (this.playerTwo != "AI"){
        Server.startTimer(this, 0, 31, false);
      }
    }
  }

  GameState.prototype.updateScores = function(){
    var playerOnePeepsCount = 0;
    var playerTwoPeepsCount = 0;
    this.formattedPeeps.forEach(function(peep){
      if (peep[2] == 1){
        playerOnePeepsCount++;
      }
      else if(peep[2] == 0){
        playerTwoPeepsCount++;
      }
    });
    var p1additionalScore = playerOnePeepsCount * 10;
    var p2additionalScore = playerTwoPeepsCount * 10;
    this.playerOneScore += p1additionalScore;
    this.playerOneScoreList.push(this.playerOneScore);
    this.playerTwoScore += p2additionalScore;
    this.playerTwoScoreList.push(this.playerTwoScore);
  }

  //Sends the clients an array of length equal to the number of peeps
  //Each element is a pair of (infectedState, enemytokens)
  //Where infectedState = 1 if infected, 0 if not (from player 1's perspective)
  //-1 is neutral for everyone
  //enemytokens is the number of tokens the enemy put on that peep, showing their last move.
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

      var payload = [peepsToSend, movesToSend, this.playerOneScore];
      Server.sendClientMessage(new Message(payload, "UPDATE_STATE_TOKEN"), this.playerOne);
    }
    if (this.playerTwo !== "AI" && this.playerTwo !== null){
      //Clears these so we can populate them with the game state from player 2's perspective
      peepsToSend = [];
      movesToSend = [];

      this.formattedPeeps.forEach(function(peep){
        if (peep[2] == -1){
          peepsToSend.push(peep[2]);
        }
        //1 - infected status from P1's POV gives infected state for P2's POV
        else{
          peepsToSend.push(1 -peep[2]);
        }
      })
      this.playerOneMoves.forEach(function(move){
        movesToSend.push(move);
      })

      var payload = [peepsToSend, movesToSend, this.playerTwoScore];
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
      if(peep2[2] != -1){
        //Ignore peep if in neutral state
        peep1[3] += peep2[2];
        peep1[4]++;
      }
      if(peep1[2] != -1){
        peep2[3] += peep1[2];
        peep2[4]++;
      }
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

    updatedPeeps.forEach(function(peep, index){
      //prevents / by 0 error for peeps surrounded by neutral peeps
      if (peep[4] > 0){
        var ratio = peep[3]/peep[4];
        if(Server.InfectionMode == "majority"){
          //If more friendly sources than enemy
          if (ratio > 0.5){
            peep[2] = 1;
          }
          //If more enemy sources than friendly
          else if(ratio < 0.5){
            peep[2] = 0;
          }
        }
        else{
          var rand = Math.random();
          //console.log(peep + " " + ratio + " " + rand); //use me for validation
          if(ratio>=rand){ //Adding random element for voter model
            peep[2] = 1;
          }
          else{
            peep[2] = 0;
          }
        }
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

  GameState.prototype.aiTurn = function(aiMoves){
    var oneNodeOnly = (this.prevAiMoves.length == 0) ? false : true;
    if (Server.TrialMode){
      this.aiTurnPredetermined(aiMoves, oneNodeOnly);
      return;
    }
    switch(Server.AiStrategy){
      case "SimpleGreedy":
        this.aiTurnSimpleGreedy(aiMoves, oneNodeOnly);
        break;
      case "Equilibrium":
        this.aiTurnEquilibrium(aiMoves, oneNodeOnly);
        break;
      default:
        this.aiTurnRandom(aiMoves, oneNodeOnly);
        break;
    }
    console.log("AIII:"+aiMoves);
  }

  //random strategy
  GameState.prototype.aiTurnRandom = function(aiMoves, oneNodeOnly){
    //adds one token when the token protocol is incremental
    if(Server.TokenProtocol == "Incremental"){
      var peepIndex = Math.floor(Math.random()*this.formattedPeeps.length);
      this.prevAiMoves.push(peepIndex);
      this.prevAiMoves.forEach(function(move){
        aiMoves.push(move);
      });
      return;
    }
    if (!oneNodeOnly){
      for(i=0 ; i < Server.MAX_TOKENS; i++){
          var peepIndex = Math.floor(Math.random()*this.formattedPeeps.length);
          aiMoves.push(peepIndex);
          this.prevAiMoves.push(peepIndex);
      }
    }
    else{
      var index = Math.floor(Math.random()*Server.MAX_TOKENS);
      var peepIndex = Math.floor(Math.random()*this.formattedPeeps.length);
      console.log("PrevAI"+this.prevAiMoves);
      this.prevAiMoves.splice(index, 1);
      this.prevAiMoves.push(peepIndex);
      this.prevAiMoves.forEach(function(peep){
        aiMoves.push(peep);
      });
    }
  }

  //Greedy strategy, i.e. maximising expected increase in opinions spread for the next turn
  GameState.prototype.aiTurnSimpleGreedy = function(aiMoves, oneNodeOnly){ //BUG: AI only evey submits 1 node.

    //We know at the point one player is AI, this retrieves their previous moves.
    //array of [AI(friendly from this POV), Player(enemy)] moves

    console.log("SimpleGreedy: "+aiMoves + " - "+oneNodeOnly);
    var tokensArray;
    //Allows us to identify whether the infection state of 1 or 0 is infected from the AI's POV
    var friendlyNodeStatus;
    if(this.playerTwo == "AI"){
      tokensArray = [this.playerTwoMoves, this.playerOneMoves];
      friendlyNodeStatus = 0;
    }
    else{
      tokensArray = [this.playerOneMoves, this.playerTwoMoves];
      friendlyNodeStatus = 1;
    }
    console.log(tokensArray);

    if (!oneNodeOnly){
      var bestNode;
      for(var i=0 ; i < 2/*Server.MAX_TOKENS*/; i++){
        bestNode = this.bestNodeGreedy(tokensArray, friendlyNodeStatus);
        aiMoves.push(bestNode);
        this.prevAiMoves.push(bestNode);
        console.log("MEMEO?????????????????????????????"+i);
      }
    }
    else{
      console.log("Prevmovecheck for greedy onetoken");
      console.log(this.prevAiMoves);
      var index = this.worstTokenGreedy(this.prevAiMoves, tokensArray, friendlyNodeStatus);
      //remove this token before calculating next one, as it will have an impact on the decision process.
      this.prevAiMoves.splice(index, 1);
      var peepIndex = this.bestNodeGreedy(tokensArray, friendlyNodeStatus);
      this.prevAiMoves.push(peepIndex);
      this.prevAiMoves.forEach(function(peep){
        aiMoves.push(peep); //TODO: move this to the main AI move function, no need to repeat code for each strategy.
      });
      console.log("HMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM");
    }
    console.log(aiMoves);
  }

  //returns the id of the best node by fitness, using a greedy strategy
  GameState.prototype.bestNodeGreedy = function(tokensArray, friendlyNodeStatus){
    var bestNodesID = [-1];
    var bestNodeValue = -1;
    console.log("bestgreedy");
    for(i=0; i<this.formattedPeeps.length; i++){
      var fitness = this.greedyFitnessChange(i, tokensArray, friendlyNodeStatus, true, true);
      console.log("?????????????COMPARISON: "+fitness + " VS "+bestNodeValue);
      if (fitness > bestNodeValue){
        console.log(i + " IS BETTER THAN " +bestNodesID);
        bestNodesID = [i];
        bestNodeValue = fitness;
      }
      else if (fitness == bestNodeValue){
        bestNodesID.push(i);
      }
    }
    console.log("Best IDs + val:");
    console.log(bestNodesID);
    console.log(bestNodeValue);
    //picks a random node from those with equal fitness
    var index = Math.floor(Math.random() * bestNodesID.length);
    return bestNodesID[index];

  }

  //returns the id of the node whose token/s have the worst fitness, using a greedy strategy
  GameState.prototype.worstTokenGreedy = function(aiMoves, tokensArray, friendlyNodeStatus){
    var worstTokensID = [-1];
    var worstTokenValue = 1;
    console.log("worsttokengreedy");

    aiMoves.forEach(function(token){
      console.log(token);
      var fitness = this.greedyFitnessChange(token, tokensArray, friendlyNodeStatus, false, true);
      if (fitness < worstTokenValue){
        worstTokensID = [token];
        worstTokenValue = fitness;
      }
      else if (fitness == worstTokenValue){
        worstTokensID.push(token);
      }
    },this);
    console.log("Worst token + val:");
    console.log(bestNodeID);
    console.log(bestNodeValue);
    var index = Math.floor(Math.random() * worksTokensID.length);
    return worstTokensID[index];
  }

  GameState.prototype.greedyFitnessChange = function(nodeID, tokensArray, friendlyNodeStatus, isAdd, isPrimaryNode){
    var friendlyInfluences = 0;
    var enemyInfluences = 0;
    var friendlyTokens = tokensArray[0];
    var enemyTokens = tokensArray[1];

    //increments number of friendly influences from tokens
    friendlyTokens.forEach(function (token){
      if (token == nodeID){
        friendlyInfluences++;
      }
    });

    //increments number of enemy influences from tokens
    enemyTokens.forEach(function (token){
      if (token == nodeID){
        enemyInfluences++;
      }
    });

    var connectedNodes = [];

    //increments influences from neighbours
    this.formattedConnections.forEach(function (connection){
      if (connection[0] == nodeID){
        connectedNodes.push(connection[1]);

        //connection[n][2] retrieves the infected status.
        if(this.formattedPeeps[connection[1]][2] == friendlyNodeStatus){
          friendlyInfluences++;
        }
        //cannot use ternary here, as -1 represents neutral, which we want to ignore.
        else if(this.formattedPeeps[connection[1]][2] == (1 - friendlyNodeStatus)){
          enemyInfluences++;
        }
      }
      else if (connection[1] == nodeID){
        connectedNodes.push(connection[0]);

        if(this.formattedPeeps[connection[0]][2] == friendlyNodeStatus){
          friendlyInfluences++;
        }
        else if(this.formattedPeeps[connection[0]][2] == (1 - friendlyNodeStatus)){
          enemyInfluences++;
        }

      }
    },this);
    //console.log("PARTWAY CHECK: " +friendlyInfluences + " " + enemyInfluences);
    console.log("NODE: "+ nodeID + isPrimaryNode + " " + friendlyInfluences + " " + enemyInfluences);

    //represent fitness before adding/removing token
    var fitness = 0;
    //prevent divide by 0
    if(friendlyInfluences == 0 && enemyInfluences == 0){
      fitness = 0;
    }

    else{
      fitness = friendlyInfluences / friendlyInfluences + enemyInfluences; //TODO: consider secondary own function. bc not 'adding' if we're treating conn as friendly.
    }

    //Fitness AFTER adding or removing a token
    var postFitness;
    if (isPrimaryNode && isAdd){
      postFitness = (friendlyInfluences + 1) / (friendlyInfluences + 1) + enemyInfluences;
    }
    else if(isPrimaryNode && !isAdd){
      if (friendlyInfluences > 1){
        postFitness = (friendlyInfluences - 1) / (friendlyInfluences - 1) + enemyInfluences;
      }
      else{ postFitness = 0;}
    }

    //Should be positive for isAdd=true, negative otherwise
    var fitnessChange = postFitness - fitness;
    //console.log(postFitness);
    //console.log("CHANGE: "+fitnessChange);

    if (isPrimaryNode){
      var originalValue = this.formattedPeeps[nodeID][2];
      this.formattedPeeps[nodeID][2] = friendlyNodeStatus;
      var secondaryFitness = 0;
      connectedNodes.forEach((secondaryNodeID) => {
        //false to show that we are calculating the fitness for the primary node's neighbours
        secondaryFitness += this.greedyFitnessChange(secondaryNodeID, tokensArray, friendlyNodeStatus, isAdd, false);
      });
      this.formattedPeeps[nodeID][2] = originalValue;

      //accumulates:
      //primary node fitness change
      //secondary node fitness change IF primary change
      //primary fitness change for next round if failed to infect this round.
      console.log("PRIOR: " + fitnessChange);
      console.log("SECONDARY:" +secondaryFitness);
      fitnessChange = fitnessChange + (fitnessChange * secondaryFitness) + (1 - fitnessChange * (fitnessChange));
      console.log("FINALCHANGE: "+fitnessChange);
    }

    else{
      console.log("CONTRIBUTION: "+fitnessChange);
    }

    return fitnessChange;
  }

  //TODO: remove & rework into GFC
  //function that captures edge cases where the chance of infection is 100% for the AI, therefore no token should be used
  //If not, allows us to use the computationally cheap peepDegrees variable
  GameState.prototype.tokenHasImpact = function(nodeID, tokensArray, friendlyNodeStatus){
    if (tokensArray.indexOf(nodeID) != -1){
    //The enemy has a token on this node, therefore we can increase chance of success
      return true;
    }
    this.formattedConnections.forEach(function (connection){
      console.log(connection);
      console.log(nodeID);
      if (connection[0] == nodeID){
        console.log("------------------------");

        if(this.formattedPeeps[connection[1]][2] != friendlyNodeStatus){
          //the node is connected to an enemy node, therefore we can increase the chance of success
          return true;
        }
      }
      else if (connection[1] == nodeID){
        console.log("------------------------");
        if(this.formattedPeeps[connection[0]][2] != friendlyNodeStatus){
          return true;
        }
      }
    },this);
    //This node already has 100% chance to be infected. A token is not needed here.
    return false;
  }

  //Strategy to maximise score at some time-insensitive equilibrium
  GameState.prototype.aiTurnEquilibrium = function(aiMoves, oneNodeOnly){
    //adds one token when the token protocol is incremental
    console.log("PARAMETERCHECK");
    console.log(aiMoves);
    console.log(oneNodeOnly);
    if(Server.TokenProtocol == "Incremental"){
      var aiVector; //We want to find the best value for this, as we are playing as the AI here.
      var playerVector;

      if(this.playerTwo == "AI"){
        aiVector = this.playerTwoMoves;
        playerVector = this.playerOneMoves;
      }
      else{
        aiVector = this.playerOneMoves;
        playerVector = this.playerTwoMoves;
      }

      var laplacian = clone(laplacianList[this.laplacianID]);

      for (var i=0; i < aiVector.length; i++){
        laplacian.increment(aiVector[i],aiVector[i]);
        laplacian.increment(playerVector[i],playerVector[i]);
      } //TODO INVERSE MATRIXC
      console.log("FINAL LAPLACIAN TEST");
      console.log(laplacian);

      var maxScore = 0;
      for (var i=0; i < Server.NumberOfNodes; i++){

      }

      var probabilitiesVector = this.createProbabilitiesVector(laplacian, aiVector, playerVector);
      var selectionFitness = this.calculateFitness(probabilitiesVector);


      var peepIndex = maxScore;
      this.prevAiMoves.push(peepIndex);
      this.prevAiMoves.forEach(function(move){
        aiMoves.push(move);
      });
      return;
    }
    else{
      console.log("ERROR! This algorithm hasn't been developed for non-incremental token protocol yet!");
    }
  }

  GameState.prototype.createProbabilitiesVector = function(laplacian, aiVector, playerVector){
    for (var i=0; i < Server.NumberOfNodes; i++){
      for (var j=0; j < Server.NumberOfNodes; j++){
        if (i=j){

        }
        else{

        }
      }
    }
  }

  GameState.prototype.calculateFitness = function(probabilitiesVector){

  }

  GameState.prototype.aiTurnPredetermined = function(aiMoves, oneNodeOnly){
    var peepIndex = this.predeterminedAIMoves[this.roundNumber];
    console.log(this.predeterminedAIMoves);
    console.log(peepIndex);
    console.log("---------CHECKME-------------");
    this.prevAiMoves.push(peepIndex);
    this.prevAiMoves.forEach(function(move){
      aiMoves.push(move);
    });
    return;
  }

  GameState.prototype.addPlayerTwo = function(ws){
    this.PLAYER_TWO_AI = false;
    this.playerTwo = ws;
    this.playerTwo.id = ws.id;
    this.playerTwoScore = 0;
    this.playerTwoLastHeartbeat = Date.now();
    //adds the game to the database now we have a full game.
    this.updateGameDatabaseEntry();
  }

  GameState.prototype.addPlayerTwoAI = function(){
    this.aiCheckTimer = null;
    this.playerTwo = "AI";
    this.playerTwoScore = 0;
  }

  GameState.prototype.outOfTime = function(isPlayerOne){
    console.log("!!!!OUTTATIME: "+isPlayerOne);
    if(!Server.demoMode){
      if (isPlayerOne){
        Server.sendResults(1, game, "time");
        Server.sendResults(2, game, "disconnect");
      }
      else{
        Server.sendResults(1, game, "time");
        Server.sendResults(2, game, "disconnect");
      }
      this.killGame(false, this);
    }
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
    return null;
  }
  if (game.length < 1){
    return null;
  }

  game = game[0];
  if (game.roundNumber > 10){
    console.log("ERR: User submit moves but game already over.");
  }

  else return game;
}

Server.submitMoves = function(message, ws){
  game = Server.validateGame(ws);
  if (game == null){
    return;
  }
  console.log("Test"+message.length+ " "+game.roundNumber+" "+Server.TokenProtocol);
  if(Server.TokenProtocol == "Incremental" && message.length != game.roundNumber+1){
    console.log("ERR ERR WRONG NO OF TOKENS!"+message.length+ " "+game.roundNumber+1);
  }
  if (game.playerOne === ws){
    game.addPlayerOneMoves(message);
  }
  else{
    game.addPlayerTwoMoves(message);
  }
}

Server.getConfig = function(twoPlayerMode, mixedTopologyID){
  if (mixedTopologyID == undefined){
    //picks a topology at random
      var topologyID = Server.CurrentTopologyIndex;
      Server.CurrentTopologyIndex = (Server.CurrentTopologyIndex + 1) % serverConfigs.length;
    //P1 Topology
    console.log("CHECK"+Server.CurrentTopologyLayoutIndexes);
    var layoutID = Server.CurrentTopologyLayoutIndexes[topologyID];
    Server.CurrentTopologyLayoutIndexes[topologyID] = (Server.CurrentTopologyLayoutIndexes[topologyID] + 1) % serverConfigs[topologyID].length;
    var p2LayoutID = Server.CurrentTopologyLayoutIndexes[topologyID];
    }
  else{
    var topologyID = Math.floor(mixedTopologyID / serverConfigs.length);
    var layoutID = mixedTopologyID % serverConfigs.length;
    var p2LayoutID = layoutID; //TODO: make this work outside the trial
    console.log("Mix:"+mixedTopologyID);
    console.log("Top:"+topologyID);
    console.log("Lay:"+layoutID);
  }
  console.log(serverConfigs);
  if(twoPlayerMode){
    //For a 2 player game, we want them to use the same topology but different layout. If there's no player two, the assignment on the previous line won't have any effect.
    Server.CurrentTopologyLayoutIndexes[topologyID] = (Server.CurrentTopologyLayoutIndexes[topologyID] + 1) % serverConfigs[topologyID].length;
  }
  var config = {
    type:"sim",
    x: 0,
    y: 0,
    fullscreen: true,
    network: clone(serverConfigs[topologyID][layoutID]),
    playerTwoNetwork: clone(serverConfigs[topologyID][p2LayoutID]),
    playerOneLayoutID: serverConfigs[topologyID][layoutID].uniqueLayoutID,
    playerTwoLayoutID: serverConfigs[topologyID][p2LayoutID].uniqueLayoutID,
    laplacianID:serverConfigs[topologyID][layoutID].laplacianID,
    tokenProtocol: Server.TokenProtocol
  }
  return config;
}

wss.on('connection', ((ws) => {
  ws.id = uuidv4();
  console.log("new connection"+ws.id);
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
  try{
    ws.send(JSON.stringify(message));
  }
  catch(err){
    console.log("ERR ERR ERR SENDING MESSAGE FAILURE:");
    console.log(err);
  }
}

Server.processUsername = function(username, ws){
  if (username == undefined){
    username = uuidv4();
  }
  if (username == null){
    username = uuidv4();
  }
  if (!username.length > 0){
    username = uuidv4();
  }
  console.log(Server.playerTopologies);
  var found = Server.playerTopologies.find(function(item){
    console.log("ITEM");
    console.log(item);
    if (item[0] == username){
      console.log("USER FOUND");
      ws.permutation = item[1];
    }
  });
  console.log("HELLOCHECKME");
  console.log(found);
  if (found == undefined){
    var perm = Server.generatePerm();
    ws.permutation = perm;
    Server.playerTopologies.push([username, perm]);
  }

  console.log("Player "+username+" Topology Order:");
  console.log(ws.permutation);
  // for (int i=0; i<Server.playerTopologies.length){
  //   if(Server.playerTopologies)
  // }
  // if(!usernameExists(username)){

}

Server.newGame = function(username, ws){
  console.log("Checking username "+username);
  if (username != null && username.length > 0){
    Server.processUsername(username, ws);
    ws.id = username; //just in case of collisions. Substring as database can only hold strings of certain length
    if (ws.id.length > 36){
      ws.id = ws.id.substring(0,36); //prevent too long usernames from making the db fail to record games. Should be fine if we stick to uuid
    }
  }
  let gameTest = Server.CurrentGames.filter(gameState => {
    return (gameState.playerOne == ws || gameState.playerTwo == ws);
  });
  if (gameTest.length != 0){

    if(gameTest.length > 1){
      Server.sendMail("User in many games at once!!");
    }
    if(gameTest[0].playerOne == ws){
      gameTest[0].killGame(false, gameTest, "p1");
    }
    else{
      gameTest[0].killGame(false, gameTest, "p2");
    }
    return;
  }
  //If nobody's waiting for a player 2
  console.log("WGC "+Server.WaitingGameConfig);
  if (Server.AiMode || Server.WaitingGameConfig == null){// || Server.CurrentGames.length == 0){ pretty sure commented out code is wrong! Will break when 2 human games occur
    if (!Server.AiMode){
      var config = Server.getConfig(true);
      Server.WaitingGameConfig = config;
    }
    else{
      console.log("Previous Permutation (should shift)"+ws.permutation);
      var config = Server.getConfig(false, ws.permutation[0]); //Don't need to retain the config for the next player if its vs the AI.
      ws.permutation.push(ws.permutation.shift());
      console.log("Post-Shift Permutation"+ws.permutation);
    }
    var game = new GameState(config.network.peeps, config.network.connections, config.playerOneLayoutID, config.playerTwoLayoutID, config.laplacianID, ws);
    console.log("Laplaciantest:"+config.laplacianID);
    Server.CurrentGames.push(game);
    if(Server.AiMode){
      game.addPlayerTwoAI();
    }
    game.gameStartTime = Date.now();
    game.addGameToDatabase();
    config.maxConnections = (Server.TokenProtocol == "Incremental") ? 1 : Server.MAX_TOKENS;
    console.log(config.maxConnections);
    config.gameID = game.gameID;
    console.log(config.gameID);
    delete config.playerTwoNetwork;
    delete config.playerTwoLayoutID;
    delete config.playerOneLayoutID; //Don't want to give player any idea of if they're player 1 or 2
    Server.sendClientMessage(new Message(config, "CONFIG_TOKEN"), ws);
    Server.startTimer(game, 0, 61, true);

  }
  //Matches a player when somebody is waiting
  else{
    var config = Server.getConfig(false); //false means we don't use this same config next time //clone(Server.WaitingGameConfig); THIS WAS THE PREVIOUS SETTING!
    Server.WaitingGameConfig = null;
    config.network.peeps.forEach(function(peep){
      //reverses the infected state for P2
      if(peep[2] != -1){
        peep[2] = 1 - peep[2];
      }
    });
    var game = Server.CurrentGames[Server.CurrentGames.length-1];
    game.addPlayerTwo(ws);
    game.playerTwoTimeOffset = Date.now() - game.gameStartTime;
    config.network = clone(config.playerTwoNetwork);
    delete config.playerTwoNetwork;
    delete config.playerTwoLayoutID;
    delete config.playerOneLayoutID;
    Server.sendClientMessage(new Message(config, "CONFIG_TOKEN"), ws);
    Server.startTimer(game, 0, 61, false);
  }
}

Server.sendResults = function(playerNo, game, result){
  try{
    if (playerNo == 1){
      Server.sendClientMessage(new Message([result, game.playerOneScoreList, game.playerTwoScoreList], "GAME_END_TOKEN"), game.playerOne);
    }
    else if (playerNo == 2){
      Server.sendClientMessage(new Message([result, game.playerTwoScoreList, game.playerTwoScoreList], "GAME_END_TOKEN"), game.playerTwo);

    }
    else{
      console.log("ERROR WHEN SENDING RESULTS!");
    }
  }
  catch(err){
    console.log("ERROR WHEN SENDING RESULTS2!");
    console.log(err);
  }
}

Server.startTimer = function(game, status, duration, isPlayerOne){
  //status - 0 is regular round message, 1 is waiting for P2
  //*1000 so we only need to pass the number of seconds in
  if (isPlayerOne){
    game.playerOneTimer = setTimeout((isPlayerOne) => {game.outOfTime(isPlayerOne);}, duration*1000, isPlayerOne);
    Server.sendClientMessage(new Message([0, duration-1], "TIMER_TOKEN"), game.playerOne);
  }
  else{
    game.playerTwoTimer = setTimeout((isPlayerOne) => {game.outOfTime(isPlayerOne);}, duration*1000, !isPlayerOne);
    Server.sendClientMessage(new Message([0, duration-1], "TIMER_TOKEN"), game.playerTwo);

  }
}

//makes sure both players still in game
Server.registerHeartbeat = function(ws){
  game = Server.validateGame(ws);
  if (game == null){
    //console.log("Heartbeat w/ no game");
    return;
  }
  else if (game.playerOne === ws){
    game.playerOneLastHeartbeat = Date.now();
  }
  else{
    game.playerTwoLastHeartbeat = Date.now();
  }
}

Server.registerClick = function(payload, ws){
  game = Server.validateGame(ws);
  if (game == null){
    return;
  }
  var playerID;
  if (game.playerOne === ws){
    playerID = 1;
  }
  else{
    playerID = 2;
  }
  try{
  var nodeID = payload[0];
  var action = payload[1];
  game.registerClick(playerID, nodeID, action);
  }
  catch(err){} //NYCON why does this fail on AI?
}

//Handles messages from the client
//ws allows us to return a message to the client
Server.ParseMessage = function(message, ws){
  try{

    message = JSON.parse(message);
  }
  catch(err){
    //console.log(err);
    return;
  }
  Server.CurrentGames.forEach(function(){
  });
  switch(message.status){
    case "SUBMIT_MOVES_TOKEN":
      Server.submitMoves(message.payload, ws);
      break;
    case "NEW_GAME_TOKEN":
      //Server.AiMode = false;
      console.log("MSGCHECK");
      console.log(message);
      Server.newGame(message.payload, ws);
      break;
    case "EMERGENCY_AI":
      Server.AiMode = true;
      Server.newGame(message.payload, ws);
    case "CLICK_TOKEN":
      Server.registerClick(message.payload, ws);
      break;
    case "HEARTBEAT":
      Server.registerHeartbeat(ws);
      break;
  }
}

//Discontinued but may be useful later
// Server.generatePerm = function(){ //This was made with 3 sets of 3 in mind but can be converted to more general without much issue
//   var perm = [];
//   var set1 = [0,1,2];
//   var set2 = [3,4,5];
//   var set3 = [6,7,8];
//   var setSet = [set1, set2, set3];
//   var direction = (Math.random() > 0.5? 0 : 1);
//   var nextset = Math.floor(3 * Math.random());
//   for (var i=0; i < 9; i++){
//     var index = Math.floor(setSet[nextSet].length * Math.random());
//     perm.push(setSet[nextSet].splice(index,1));
//     if (direction == 0){
//       nextSet++;
//       nextSet = nextSet % 3;
//     }
//     else{
//       nextSet--;
//       if (nextSet < 0){
//         nextSet += 3;
//       }
//     }
//   }
// }
