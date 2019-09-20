var ctx;
var ws;
var strategyType;
var playerID;
var game;
var moves = [];
var experimentNumber = 0;
var gamesRemaining = 0;
var gamesPerExperiment = 5;

var cumScoreServer = 0;
var cumScoreExperiment = 0;
var resultsList = [];

var strategyNames=["Random","DegreeSensitiveHigh","DegreeSensitiveLow","SimpleGreedy","Equilibrium"]; //NOT 25 exp!

const Message = require('./Message.js');
Server = require('./server.js');
module.exports.setupExperiment = setupExperiment;

//Wrapper for each pairwise experiment
function setupExperiment(context){ //COULD do this without websockets. Not sure of the value of rewriting though.
    var serverStrategy;
    var experimentStrategy;
    ctx = context;

    //Sets up websocket connection in same way that a normal player would
    const WebSocket = require('ws'); //Required here as we don't otherwise need websockets

    ws = new WebSocket("ws://127.0.0.1:5001");//"wss://stark-atoll-77422.herokuapp.com/"
    ws.onopen = function (event) {
        ws.send("Connection Recieved from Experiment AI.");
    };
    ws.onerror = function (err) {
        console.log('err Experimental: ', err);
    }
    ws.onmessage = function (event) {
        parseEventExperiment(event);
    };

    newExperiment();
}

function newExperiment(){
    var len = strategyNames.length; //Used to make code more readable
    var experimentLimit = len * len;
    if(experimentNumber < experimentLimit){
        console.log("EXPERIMENT#"+experimentNumber);
        serverStrategyIndex = experimentNumber % len;// Remainder operator. E.g. 7 % 5 = 2
        experimentStrategyIndex = Math.floor(experimentNumber/len);// These two will go 0-0,1-0,2-0,3-0,4-0,0-1,etc. for a 5-strategy selection.
        cumScoreServer = 0;
        cumScoreExperiment = 0;
        gamesRemaining = gamesPerExperiment;
        ctx.AiStrategy = strategyNames[serverStrategyIndex];
        beginPairwiseExperiment(strategyNames[experimentStrategyIndex]); //IS GREMAIN BEST VAR
    }
    else{
        console.log("FIN");
        console.log(resultsList);
    }
}

function beginPairwiseExperiment(strategy){ //COULD do this without websockets. Not sure of the value of rewriting though.
    strategyType = strategy;
    playerID = "Exp_AI_"+strategyType;
    gameStart(gamesRemaining);
}

function gameStart(gamesRemaining){
    if(gamesRemaining > 0){
        sendServerMessage(new Message(playerID,"NEW_GAME_TOKEN"));
    }
    else{
        experimentNumber++;
        var resultsWrapper = [];
        resultsWrapper.push(strategyType);
        resultsWrapper.push(cumScoreExperiment/gamesPerExperiment);
        resultsWrapper.push(ctx.AiStrategy);
        resultsWrapper.push(cumScoreServer/gamesPerExperiment);
        resultsList.push(resultsWrapper);
        newExperiment();
    }

}

function updateState(){//We are using the state already held on the server. Function names are preserved from the clientside for consistency.
    //This sends moves back to the main server
    moves.push(game.aiTurn(game.playerOneMoves, 1, strategyType));
    sendServerMessage(new Message(moves, "SUBMIT_MOVES_TOKEN"));
}

function gameOver(payload){//Mostly just for logging final results from this AI's POV to ensure consistency
    var myScore = payload[1][9];
    var opponentScore = payload[2][9];
    moves = [];
    cumScoreExperiment += myScore;
    cumScoreServer += opponentScore;
    gamesRemaining--;
    gameStart(gamesRemaining);
}

function parseEventExperiment(message){
    try{
        message = JSON.parse(message.data);
    }
    catch(err){
        return;
    }
    switch(message.status){
        case "CONFIG_TOKEN":
            game = ctx.CurrentGames[0];
            updateState();
            break;
        case "UPDATE_STATE_TOKEN":
            updateState();
            break;
        case "GAME_END_TOKEN":
            gameOver(message.payload);
            break;
    }
}

function sendServerMessage(msg){
    if (ws.readyState == 0){ //This version connects too quickly to the server! Must have a short wait at beginning.
        setTimeout(() => {sendServerMessage(msg)}, 250);        
    }
    else{
        try{
            ws.send(JSON.stringify(msg));
        }
        catch(err){
            console.log(err);
            setTimeout(() => {sendServerMessage(msg)}, 250);
            return;
        }
    }
}
