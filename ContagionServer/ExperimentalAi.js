var ctx;
var ws;
var strategyType;
var playerID;
var game;
var moves = [];
var experimentsList = [];
var gamesRemaining = 0;
var gamesPerExperiment = 3000;

var cumScoreServer = 0;
var cumScoreExperiment = 0;
var resultsList = [];

var strategyNames=["Random"];//,"DegreeSensitiveHigh","DegreeSensitiveLow","SimpleGreedy","Equilibrium"]; //NOT 25 exp!

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

    var len = strategyNames.length; //Used to make code more readable
    for (x=0; x<len; x++){
        for(y=x; y<len; y++){
            experimentsList.push([x,y]);
        }
    }

    newExperiment();
}

function newExperiment(){

    if(experimentsList.length > 0){
        console.log("EXP Remaining:"+experimentsList.length);
        cumScoreServer = 0;
        cumScoreExperiment = 0;
        var experimentStrategies = experimentsList.shift();
        ctx.AiStrategy = strategyNames[experimentStrategies[1]];
        strategyType = strategyNames[experimentStrategies[0]];
        playerID = "Exp_AI_"+strategyType;
        gamesRemaining = gamesPerExperiment;
        gameStart(); 
    }
    else{
        console.log("FIN");
        console.log(resultsList);
    }
}


function gameStart(){
    if(gamesRemaining > 0){
        sendServerMessage(new Message(playerID,"NEW_GAME_TOKEN"));
    }
    else{
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
    var myScore = payload[1][9]; //9 is because it's a list of 10 vaules, one for score at each round. 9 is the last.
    var opponentScore = payload[2][9];
    moves = [];
    game = null;
    cumScoreExperiment += myScore;
    cumScoreServer += opponentScore;
    gamesRemaining--;
    gameStart();
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
