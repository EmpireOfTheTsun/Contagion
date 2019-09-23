//TODO: UPDATE DATABASE WITH LONGER NODES FLIPPED LENGTH
Server.LocalMode = true; //Run on local machine or internet-facing
Server.NeutralMode = true; //Supports neutral nodes (this is the default now)
Server.TrialMode = true; //Running controlled trials with people
Server.ExperimentMode = false; //For things like monte carlo...
Server.NumberOfNodes = 20; //Changing this may require some refactoring...
Server.TestMoves = [[ 13, 2, 6, 14, 9, 10, 16, 15, 8, 18 ],
[ 6, 5, 12, 5, 2, 17, 7, 18, 9, 9 ],
[ 7, 12, 9, 13, 13, 1, 4, 19, 10, 19 ],
[ 19, 14, 7, 11, 18, 9, 7, 5, 13, 1]];
Server.playerTopologies = [];
Server.ExponentStrength = 0.35; //Higher = more bias to high/low degree nodes in their respective strategies
Server.ExistingTokensBias = 0; //Increases likelihood of placing tokens on nodes that already have tokens. Negative reduces the likelihood.
//Does not affect random, equilibrium or predetermined strategies.


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
var extMath = require('./math.min');
var seededRNGGenerator = require('./seedrandom.min');

var app = express();
var PORT = process.env.PORT || 5001;
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

configData = require('./NetworkConfigurations.js');
serverConfigs = configData.configs;
laplaciansList = configData.laplacians;

Server.LoadExperiment = function(times){
  if(times > 100){
    console.log("Error Initialising!");
    return;
  }
  if(configData.laplacians.length != 0){
    var experimentAi = require('./ExperimentalAi.js');
    setTimeout(() => {experimentAi.setupExperiment(this);}, 1500);//Debugger needs time to attach
  }
  else{setTimeout(() => {Server.LoadExperiment(times+1);}, 250);}

}

if(Server.ExperimentMode){
  Server.LoadExperiment(0);
}

const Message = require('./Message.js');

Server.sendSqlQuery = function(query, game){
  //console.log(query);
  if (!Server.LocalMode && !Server.ExperimentMode){
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

function Server(){
  Server.MAX_TOKENS = 5;
  Server.CurrentGames = [];
  Server.WaitingGameConfig = null;
  Server.RoundLimit = 10;
  Server.AiMode = true;
  Server.InfectionMode = "wowee"; //"majority" or anything else
  Server.AiStrategy = "Random";//"SimpleGreedy";//"DegreeSensitiveHigh";//"Equilibrium";//"Predetermined";//"SimpleGreedy";
  Server.TokenProtocol = "Incremental"; //"AtStart" or "Incremental"
  Server.AiWaiting = false;
  Server.lastAlertTime = 0;
  Server.demoMode = true;
  Server.heartbeatCheckFrequency = 100;
  Server.heartAttackTime = 800;
}

Server();

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
    //created rng with random seedword to make it deterministic
    //We create this at the game level to prevent multiple games from affecting others' random number generation
    this.rngThreshold = seededRNGGenerator("Waluigi");
    //uses two RNGs because different strategies use different number of calls to random
    this.rngStrategy = seededRNGGenerator("Shrek II");
    this.rngStratCount=0;
    this.rngThreshCount=0;
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
    this.playerTwoMoves.forEach(function (move){
      p2MovesString = p2MovesString + move + "_";
    });
    p2MovesString = p2MovesString.slice(0, -1);

    var query = `INSERT INTO player_actions_table VALUES ('${this.gameID}', ${this.roundNumber}, '${this.flippedNodes}', '${this.playerOneMoves}' ,'${this.playerTwoMoves}', ${this.playerOneTime}, ${this.playerTwoTime});`;
    Server.sendSqlQuery(query, this);
    this.flippedNodes = [];
  }

  GameState.prototype.addPlayerMoves = function(moves, isPlayerOne, opponentReady){
    //Performs AI moves before recording new player moves (to prevent bias)
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
        this.aiTurn(aiPlayer, 0, Server.AiStrategy);
      }
    }
    //no AI players, so do nothing
  }

  GameState.prototype.heartbeatHandler = function(game){
    var now = Date.now();
    if (!Server.demoMode && !Server.ExperimentMode){
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
  }

  GameState.prototype.registerClick = function(playerID, nodeID, action){
    var timestamp = Date.now() - this.gameStartTime;
    var query = `INSERT INTO player_clicks_table VALUES ('${this.gameID}', '${playerID}', '${nodeID}', '${action}', '${timestamp}');`;
    Server.sendSqlQuery(query, this);
  }


  GameState.prototype.removeGame = async(game) => {
    var index = Server.CurrentGames.indexOf(game);
    Server.CurrentGames.splice(index, 1);
  }

  //naturalEnd is true when the game ends by reaching the max number of rounds.
  GameState.prototype.killGame = function(naturalEnd, game, causer){
    console.log("game over");
    console.log(game.playerTwoMoves);
    console.log(game.rngThreshCount);
    console.log(game.rngStratCount);
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

    if(this.roundNumber == 10){
      p1additionalScore = p1additionalScore * 5;
      p2additionalScore = p2additionalScore * 5;
    }

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
      //The third item in the peep array is the infected state. 1 = infected by player, 0 = infected by enemy, -1 = neutral
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
      var rand = this.game.randThreshold(); //we need to call a rand for each node regardless of whether or not we use it to make sure the random numbers generated are the same each time

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
        if (updatedPeeps[index][2] == 1){
          flippedNodes.push(index+"p");
        }
        else{
          flippedNodes.push(index);
        }
      }
      peep[2] = updatedPeeps[index][2];
    });


  }

  GameState.prototype.aiTurn = function(aiMoves, friendlyNodeStatus, strategy){
    aiMoves = [];
    var oneNodeOnly = (this.prevAiMoves.length == 0) ? false : true; //for a previous version where there would be 5 tokens to start, then 1 token moved each time.
    if (Server.TrialMode){
      this.aiTurnPredetermined(aiMoves, oneNodeOnly);
      return;
    }
    //console.log("FFFF "+this.playerOneMoves);
    switch(strategy){
      case "SimpleGreedy":
        var aiTurnSimpleGreedy = require('./MyopicGreedy.js');
        var ctx = this;
        aiTurnSimpleGreedy(aiMoves, false, ctx, friendlyNodeStatus); //don't need to remove worst token, so just false
        break;
      case "Equilibrium":
        this.aiTurnEquilibrium(aiMoves, oneNodeOnly, friendlyNodeStatus);
        break;
      case "DegreeSensitiveLow":
        this.aiTurnDegreeSensitive(aiMoves, oneNodeOnly, true, friendlyNodeStatus); //True for low degree preference
        break;
      case "DegreeSensitiveHigh":
        this.aiTurnDegreeSensitive(aiMoves, oneNodeOnly, false, friendlyNodeStatus);
        break;
      default:
        this.aiTurnRandom(aiMoves, oneNodeOnly, friendlyNodeStatus);
        break;
    }
    //console.log("AIII:"+aiMoves);
    if(this.isServerPlayer(friendlyNodeStatus)){
      this.playerTwoMoves = aiMoves;
    }
    else{
      return aiMoves[0];
    }
  }

  //Simple wrapper to determine whether we are playing from the server AI's POV (used in regular games)
  //or the experiment opposing AI(fake opponent played by the same type of ai)
  GameState.prototype.isServerPlayer = function(friendlyNodeStatus){ 
    if(friendlyNodeStatus == 0){
      return true;
    }
    else{
      return false;
    }
  }

  //random strategy
  GameState.prototype.aiTurnRandom = function(aiMoves, oneNodeOnly, friendlyNodeStatus){
    //adds one token when the token protocol is incremental
    if(Server.TokenProtocol == "Incremental"){
      var peepIndex = Math.floor(Math.random()*this.formattedPeeps.length);
      if(this.isServerPlayer(friendlyNodeStatus)){
        this.prevAiMoves.push(peepIndex);
        this.prevAiMoves.forEach(function(move){
          aiMoves.push(move);
        });
      }
      else{
        aiMoves.push(peepIndex);
      }
      return;
    }
    if (!oneNodeOnly){
      for(i=0 ; i < Server.MAX_TOKENS; i++){
          var peepIndex = Math.floor(Math.random()*this.formattedPeeps.length);
          aiMoves.push(peepIndex);
          if(this.isServerPlayer(friendlyNodeStatus)){
            this.prevAiMoves.push(peepIndex);
          }
      }
    }
    else{
      var index = Math.floor(Math.random()*Server.MAX_TOKENS);
      var peepIndex = Math.floor(Math.random()*this.formattedPeeps.length);
      if(this.isServerPlayer(friendlyNodeStatus)){
        this.prevAiMoves.splice(index, 1);
        this.prevAiMoves.push(peepIndex);
        this.prevAiMoves.forEach(function(peep){
          aiMoves.push(peep);
        });
      }
      else{
        console.log("ERROR: NOT DEVELOPED FOR EXPERIMENTAL AI YET!");
      }
    }
  }



  //Strategy to maximise score at some time-insensitive equilibrium
  GameState.prototype.aiTurnEquilibrium = function(aiMoves, oneNodeOnly, friendlyNodeStatus){
    //adds one token when the token protocol is incremental
    if (this.roundNumber == 0){
      this.aiTurnRandom(aiMoves, oneNodeOnly, friendlyNodeStatus);
      return;
    }
    // console.log("PARAMETERCHECK");
    // console.log(this.prevAiMoves);
    // console.log(this.playerOneMoves);
    if(Server.TokenProtocol == "Incremental"){
      var friendlyMoves;
      var enemyMoves; //TODO: Is this actually a vector?

      if(this.isServerPlayer(friendlyNodeStatus)){
        friendlyMoves = this.playerTwoMoves; //We want to find the best value for this, as we are playing as the AI here.
        enemyMoves = this.playerOneMoves;
      }
      else{
        friendlyMoves = this.playerOneMoves; //TODO: Check we're getting an appropriate amount of info here. Does the server AI get the experiment AI's latest move? It shouldnt
        enemyMoves = this.playerTwoMoves;
      }

      var friendlyMovesVector = [];
      var enemyMovesVector = [];
      for (var i = 0; i < Server.NumberOfNodes; i++){
        friendlyMovesVector.push(0);
        enemyMovesVector.push(0);
      }

      var laplacian = clone(laplaciansList[this.laplacianID]);

      for (var i=0; i < friendlyMoves.length; i++){
        laplacian[friendlyMoves[i]][friendlyMoves[i]]++; //adds p_b for the AI player's ith token
        laplacian[enemyMoves[i]][enemyMoves[i]]++; //p_a for player's ith token
        friendlyMovesVector[friendlyMoves[i]]++; //Also creates the vector of ai moves at the same time
        enemyMovesVector[enemyMoves[i]]++;
        //This is required as friendlyMoves is length n-1, where n is the round number. We need length 20 for matrix.
      }

      var maxScore = 0;
      var bestNode = -1;

      for (var i=0; i < Server.NumberOfNodes; i++){
        var probabilitiesVector = this.createProbabilitiesVector(laplacian, friendlyMovesVector, i, false);
        var selectionFitness = this.calculateFitness(probabilitiesVector);
        if (selectionFitness > maxScore){
          maxScore = selectionFitness;
          bestNode = i;
        }
      }
      //console.log("BEST IS "+bestNode);
      this.createProbabilitiesVector(laplacian, friendlyMovesVector, bestNode, true); //This outputs the best one's details. Can remove if needed!
      var peepIndex = bestNode;

      if(this.isServerPlayer(friendlyNodeStatus)){
        this.prevAiMoves.push(peepIndex);
        this.prevAiMoves.forEach(function(move){
          aiMoves.push(move);
        });
      }
      else{
        aiMoves.push(peepIndex);
      }
      return;
    }
    else{
      console.log("ERROR! This algorithm hasn't been developed for non-incremental token protocol yet!");
    }
  }

  GameState.prototype.createProbabilitiesVector = function(laplacian, friendlyMovesVector, i, isLogging){
    laplacian[i][i]++;
    friendlyMovesVector[i]++; //adds the token to test to the node. This affects both L and p_b (ai moves)

    var invLaplacian = extMath.inv(laplacian);
    var probVector = extMath.multiply(friendlyMovesVector, invLaplacian);
    // if (isLogging == true){
    //   console.log("Pa:");
    //   console.log(friendlyMovesVector);
    //   console.log("Ua:");
    //   console.log(probVector);
    //   console.log("Inverted Matrix:");
    //   console.log(invLaplacian);
    // }

    laplacian[i][i]--;
    friendlyMovesVector[i]--; //reverts the change to this var to avoid an expensive clone operation
    return probVector;

  }

  GameState.prototype.calculateFitness = function(probabilitiesVector){
    return extMath.sum(probabilitiesVector); //adds all values in the array
  }

  GameState.prototype.aiTurnDegreeSensitiveTest = function(aiMoves, oneNodeOnly, lowDegreeSensitivity, friendlyNodeStatus){
    console.log("ERROR! Don't use this until verified correct!");
    return;
    var monteOrig = [];
    for (var i=0; i < Server.NumberOfNodes; i++){
      monteOrig.push(0);
    }

    for (var i=0; i < 6; i++){
      Server.ExponentStrength = 0.25 + i*0.05;
      for (var j=0; j < 5; j++){
        Server.ExistingTokensBias = 0 - 0.5*j;
        var monte = clone(monteOrig);
        for (var iter=0; iter < 10000; iter++){
          this.prevAiMoves = [];
          for (var round=0; round < 10; round++){
            this.aiTurnDegreeSensitive(aiMoves, oneNodeOnly, lowDegreeSensitivity, friendlyNodeStatus, monte);
          }
        }
        console.log("STR="+Server.ExponentStrength+" BIAS="+Server.ExistingTokensBias);
        for (var x=0; x < Server.NumberOfNodes; x++){
          monte[x] = monte[x] / 10000;
        }
        console.log(monte);
      }

    }
  }

  GameState.prototype.aiTurnDegreeSensitive = function(aiMoves, oneNodeOnly, lowDegreeSensitivity, friendlyNodeStatus, monte){
    if(Server.TokenProtocol == "Incremental"){
      var nodeWeights = [];
      var laplacian = clone(laplaciansList[this.laplacianID]);
      if (Server.ExistingTokensBias != 0){
        if(this.isServerPlayer(friendlyNodeStatus)){
          for(var i=0; i < this.prevAiMoves.length; i++){//Is agnostic of opponent's moves
            var token = this.prevAiMoves[i];
            laplacian[token][token] += Server.ExistingTokensBias;
          }
        }
        else{//This is the above but for when the experimental opposition AI is playing.
          for(var i=0; i < this.length; i++){
            var token = this.playerOneMoves[i];
            laplacian[token][token] += Server.ExistingTokensBias;
          }
        }
      }
      for (var i=0; i < Server.NumberOfNodes; i++){
        var nodeDegree = laplacian[i][i];

        if(lowDegreeSensitivity){
          var nodeWeight = extMath.exp(Server.ExponentStrength*nodeDegree*-1); //negative exponent weights high degree nodes lower
        }
        else{
          var nodeWeight = extMath.exp(Server.ExponentStrength*nodeDegree);
        }
        nodeWeights.push(nodeWeight);
      }
      var max = extMath.sum(nodeWeights);

      //nodeWeights[i] = nodeWeights[i] * 100 / max; //normalises the list, becomes % chance to pick

      //console.log(nodeWeights);
      // for (var i=0; i < 10000; i++){
      //     monte[this.chooseFromDistribution(nodeWeights, 100)]++;
      // }
      //console.log(monte);
      var peepIndex = this.chooseFromDistribution(nodeWeights, max);
      if(this.isServerPlayer(friendlyNodeStatus)){
        this.prevAiMoves.push(peepIndex); //TODO: This is different to the others. Still valid?
      }
      else{
        aiMoves.push(peepIndex);
      }
      //monte[peepIndex]++;
      // this.prevAiMoves.forEach(function(move){
      //   aiMoves.push(move);
      // });
      return;
    }
    else{
      console.log("ERROR! This algorithm hasn't been developed for non-incremental protocol yet!");
    }
  }

  GameState.prototype.chooseFromDistribution = function(distribution, maxValue){
    var rand = Math.random() * maxValue;
    for (var i=0; i<distribution.length; i++){
      rand -= distribution[i];
      if (rand < 0){
        return i;
      }
    }
    console.log("ERROR CHOOSING FROM DISTRIBUTION!");
  }


  GameState.prototype.aiTurnPredetermined = function(aiMoves, oneNodeOnly){
    console.log("WARNING: NOT UPDATED FOR EXPERIMENTAL AI");
    var peepIndex = this.predeterminedAIMoves[this.roundNumber];
    this.prevAiMoves.push(peepIndex);
    this.prevAiMoves.forEach(function(move){
      aiMoves.push(move);
    });
    //NOTE: Hack because its an insidious problem and this is just needed for the trial
    this.playerTwoMoves = this.prevAiMoves;
    return;
  }

  GameState.prototype.randStrategy = function(){
    this.rngStratCount++;
    return this.rngStrategy();
  }

  GameState.prototype.randThreshold = function(){
    this.rngThreshCount++;
    return this.rngThreshold();
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
    if(!Server.demoMode){
      console.log("!!!!OUTTATIME: "+isPlayerOne);
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
  if(Server.TokenProtocol == "Incremental" && message.length != game.roundNumber+1){
    console.log("ERR ERR WRONG NO OF TOKENS!"+message.length+ " "+game.roundNumber);
  }
  if (game.playerOne === ws){
    game.addPlayerOneMoves(message);
  }
  else{
    game.addPlayerTwoMoves(message);
  }
}

Server.getConfig = function(twoPlayerMode, perm){
  if (perm == undefined){
    //picks a topology at random
      var topologyID = Server.CurrentTopologyIndex;
      Server.CurrentTopologyIndex = (Server.CurrentTopologyIndex + 1) % serverConfigs.length;
    //P1 Topology
    //console.log("CHECK"+Server.CurrentTopologyLayoutIndexes);
    var layoutID = Server.CurrentTopologyLayoutIndexes[topologyID];
    Server.CurrentTopologyLayoutIndexes[topologyID] = (Server.CurrentTopologyLayoutIndexes[topologyID] + 1) % serverConfigs[topologyID].length;
    var p2LayoutID = Server.CurrentTopologyLayoutIndexes[topologyID];
  }
  else{
    var mixedTopologyID = perm[0];
    var topologyID = Math.floor(mixedTopologyID / serverConfigs.length);
    var layoutID = mixedTopologyID % serverConfigs.length;
    var p2LayoutID = layoutID; //TODO: make this work outside the trial
  }
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
  console.log(message);
  try{
    ws.send(JSON.stringify(message));
  }
  catch(err){
    console.log("ERR ERR ERR SENDING MESSAGE FAILURE:");
    console.log(err);
  }
}

Server.processUsername = function(username, ws){
  var complete = false;
  if (username == undefined){
    console.log("fuc1");
    username = uuidv4();
  }
  if (username == null){
    console.log("fuc2");
    username = uuidv4();
  }
  if (!username.length > 0){
    console.log("fuc3");
    username = uuidv4();
  }
  var found = Server.playerTopologies.find(function(item){
    if (item[0] == username){
      ws.permutation = item[1];
      complete = true;
    }
  });
  if (complete == false){
    var perm = Server.generatePerm();
    ws.permutation = perm;
    Server.playerTopologies.push([username, perm]);
    console.log(Server.playerTopologies);
  }
  // for (int i=0; i<Server.playerTopologies.length){
  //   if(Server.playerTopologies)
  // }
  // if(!usernameExists(username)){

}

Server.newGame = function(username, ws){
  //console.log("Checking username "+username);
  Server.processUsername(username, ws);
  ws.id = username; //just in case of collisions. Substring as database can only hold strings of certain length
  if (ws.id.length > 36){
    ws.id = ws.id.substring(0,36); //prevent too long usernames from making the db fail to record games. Should be fine if we stick to uuid
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
  if (Server.AiMode || Server.WaitingGameConfig == null){// || Server.CurrentGames.length == 0){ pretty sure commented out code is wrong! Will break when 2 human games occur
    if (!Server.AiMode){
      var config = Server.getConfig(true);
      Server.WaitingGameConfig = config;
    }
    else{
      try{
        var config = Server.getConfig(false, ws.permutation); //Don't need to retain the config for the next player if its vs the AI.
      }
      catch(e){
        console.log("TRIGGERED FAILSAFE WITH GETTING CONFIG!");
        config = Server.getConfig(false);
      }
      ws.permutation.push(ws.permutation.shift());
    }
    var game = new GameState(config.network.peeps, config.network.connections, config.playerOneLayoutID, config.playerTwoLayoutID, config.laplacianID, ws);
    //console.log("Laplaciantest:"+config.laplacianID); TODO: This had strange value before, pls check
    Server.CurrentGames.push(game);
    if(Server.AiMode){
      game.addPlayerTwoAI();
    }
    game.gameStartTime = Date.now();
    game.addGameToDatabase();
    config.maxConnections = (Server.TokenProtocol == "Incremental") ? 1 : Server.MAX_TOKENS;
    config.gameID = game.gameID;
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
  if(Server.ExperimentMode){
    return;
  }
  //status - 0 is regular round message, 1 is waiting for P2
  //*1000 so we only need to pass the number of seconds in
  //WARN: This assumes that AI is always P2 (and experimental AI is P1)
  if (isPlayerOne){
    if(!game.playerOne.id.startsWith("Exp_AI_")){ //doesn't set timers for the experiments. They shouldn't be an issue, but just in case!
      game.playerOneTimer = setTimeout((isPlayerOne) => {game.outOfTime(isPlayerOne);}, duration*1000, isPlayerOne);
    }
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
    return;
  }
  switch(message.status){
    case "SUBMIT_MOVES_TOKEN":
      Server.submitMoves(message.payload, ws);
      break;
    case "NEW_GAME_TOKEN":
      message.payload = message.payload.toString();
      if(message.payload.length > 0){
        Server.newGame(message.payload, ws);
      }
      else{ console.log("Somebody's fucked it!");
          Server.newGame(Math.random()*10000, ws); //TODO FIND WHY THIS FAILED
      }
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
