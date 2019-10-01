var ctx;
var ws;
var strategyType;
var playerID;
var game;
var moves = [];
var experimentsList = [];
var gamesRemaining = 0;
var gamesPerExperiment = 1000;

var cumScoreServer = 0;
var cumFinalPercentageServer = 0;
var cumScoreExperiment = 0;
var cumFinalPercentageExperiment = 0;
var winsServer = 0;
var winsExperiment = 0;
var resultsList = [];

var strategyNames=["Random","DegreeSensitiveHigh","DegreeSensitiveLow","SimpleGreedy","Equilibrium"];
//var strategyNames=["SimpleGreedy"];


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
        cumFinalPercentageServer = 0;
        cumScoreExperiment = 0;
        cumFinalPercentageExperiment = 0;
        winsServer = 0;
        winsExperiment = 0;
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
        resultsWrapper.push(winsExperiment);
        var avgPercentInfectedExperiment = calculateAveragePercantageInfected(cumScoreExperiment);
        resultsWrapper.push(avgPercentInfectedExperiment);
        resultsWrapper.push(Math.round(cumFinalPercentageExperiment*100/gamesPerExperiment) / 100);
        resultsWrapper.push(ctx.AiStrategy);
        resultsWrapper.push(winsServer);
        var avgPercentInfectedServer = calculateAveragePercantageInfected(cumScoreServer);
        resultsWrapper.push(avgPercentInfectedServer);
        resultsWrapper.push(Math.round(cumFinalPercentageServer*100/gamesPerExperiment) / 100);

        resultsList.push(resultsWrapper);
        newExperiment();
    }

}

function calculateAveragePercantageInfected(cumScore){
    var avgScore = cumScore/gamesPerExperiment;
    var avgPercentInfected = avgScore / 20; //20 because over 10 rounds, and a score of 200 maps to 100% for each round. E.g. score of 40 means 20% infected that round.
    return Math.round(avgPercentInfected)/100; //to be from 0-1
}

function updateState(){//We are using the state already held on the server. Function names are preserved from the clientside for consistency.
    //This sends moves back to the main server
    moves.push(game.aiTurn(game.playerOneMoves, 1, strategyType));
    sendServerMessage(new Message(moves, "SUBMIT_MOVES_TOKEN"));
}

function gameOver(payload){//Mostly just for logging final results from this AI's POV to ensure consistency
    var myScore = payload[1][9]; //9 is because it's a list of 10 vaules, one for score at each round. 9 is the last.
    var myFinalPercentage = calculateFinalPercentageInfected(payload[1]);
    var opponentScore = payload[2][9];
    var opponentFinalPercentage = calculateFinalPercentageInfected(payload[2]); //Theoretically could do 1 - myFP as assume no neutral nodes by end, but better to future-proof this.
    moves = [];
    game = null;
    cumScoreExperiment += myScore;
    cumScoreServer += opponentScore;
    cumFinalPercentageExperiment += myFinalPercentage;
    cumFinalPercentageServer += opponentFinalPercentage;
    if(payload[0] == "win"){
        winsExperiment++;
    }
    else if(payload[0] == "lose"){
        winsServer++;
    }
    else{
        console.log("bees");
    }
    gamesRemaining--;
    gameStart();
}

function calculateFinalPercentageInfected(scoresList){
    var lastRoundAdditionalScore= scoresList[9] - scoresList[8];
    var finalRoundPercentage = lastRoundAdditionalScore / 2; //As above, score of 200 maps to 100%, so N maps to N/2%
    return finalRoundPercentage/100;//As above, to be 0-1.
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
