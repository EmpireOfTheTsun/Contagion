//Greedy strategy, i.e. maximising expected increase in opinions spread for the next turn
var ctx;

function aiTurnSimpleGreedy(aiMoves, removeOld, context){

  //We know at the point one player is AI, this retrieves their previous moves.
  //array of [AI(friendly from this POV), Player(enemy)] moves
  ctx = context;
  console.log("SimpleGreedy: "+aiMoves);
  friendlyNodeStatus = 0;
  console.log("Prevmovecheck for greedy onetoken");
  console.log(ctx.prevAiMoves);

  var tokenInfluences = createTokenInfluencesList();

  if(removeOld){
    greedyNodeSelection(friendlyNodeStatus, tokenInfluences, true); //true to remove worst
  }
  else{
    greedyNodeSelection(friendlyNodeStatus, tokenInfluences, false); //false to just add best
  }
  console.log("DONE");
}

//returns the id of the best node by fitness, using a greedy strategy
function greedyNodeSelection(friendlyNodeStatus, tokenInfluences, findWorst){
  var bestNodesID = [-1];
  var bestNodeValue = -1;

  if (findWorst){
    var worstTokensID = [-1];
    var worstTokenValue = 100;
    console.log("worsttokengreedy");
  }
  console.log("bestgreedy");
  for(i=0; i<ctx.formattedPeeps.length; i++){
    var fitness = greedyFitnessChange(i, friendlyNodeStatus, tokenInfluences, true, true, false); //3rd last is 'isAdd', 2nd is recursive, last is a modifier for primary node changing from enemy to friendly (not needed here)
    console.log(i+"="+fitness);

    if (fitness > bestNodeValue){
      bestNodesID = [i];
      bestNodeValue = fitness;
    }
    else if (fitness == bestNodeValue){
      bestNodesID.push(i);
    }
    if (findWorst && ctx.prevAiMoves.includes(i)){ //If we're looking for the worst token & the node inspected has a token.
      fitness = greedyFitnessChange(i, friendlyNodeStatus, tokenInfluences, false, true, false); //false to show we are removing a token
      if (fitness < worstTokenValue){
        worstTokensID = [i];
        worstTokenValue = fitness;
      }
      else if (fitness == worstTokenValue){
        worstTokensID.push(i);
      }
    }
  }
  console.log("Best IDs + val:");
  console.log(bestNodesID);
  console.log(bestNodeValue);

  //picks a random node from those with equal fitness
  var index = bestNodesID[Math.floor(Math.random() * bestNodesID.length)];
  ctx.prevAiMoves.push(index);
  ctx.prevAiMoves.forEach(function(peep){
    aiMoves.push(peep);
  });
  console.log(aiMoves);

  if(findWorst){
    console.log("Worst token + val:");
    console.log(worstTokensID);
    console.log(worstTokenValue);
    var worstToken = worstTokensID[Math.floor(Math.random() * worstTokensID.length)]; //Selects all equally-bad nodes at random
    var index = ctx.prevAiMoves.indexOf(worstToken);
    ctx.prevAiMoves.splice(index,1);
  }

}

//Returns two arrays containing the friendly and enemy influences for each node.
function createTokenInfluencesList(){
  var infectedStates = []; //Will contain 0 for uninfected, 1 for infected (colour doesn't matter)
  var friendlySources = []; //Final % change for the node
  var enemySources = []; //Checks if there are enemy sources. If entirely friendly sources, adding will not change %, so has value 0.

  //Initialises some useful variables
  ctx.formattedPeeps.forEach(function (peep, index){
    //-1 is the value for neutral, so 1 or 0 is infected by either player.
    infectedStates.push(peep[2]);
    friendlySources.push(0); //adds a value for each node for use later. impact% is 1/(infected neighbours + tokens + 1)
    enemySources.push(0);
  });

  //Accounts for neighbour influences
  ctx.formattedConnections.forEach(function(connection){
    if(infectedStates[connection[0]] == 0){ //i.e. is 0 or 1, infected by either player.
      friendlySources[connection[1]]++; //Adds the infected neighbour to this node's number of infected sources.
    }
    else if(infectedStates[connection[0]] == 1){
      enemySources[connection[1]]++;
    }
    if(infectedStates[connection[1]] == 0){ //i.e. is 0 or 1, infected by either player.
      friendlySources[connection[0]]++; //Adds the infected neighbour to this node's number of infected sources.
    }
    else if(infectedStates[connection[1]] == 1){
      enemySources[connection[0]]++;
    }
  });

  //Accounts for both players' tokens
  for(var i=0; i < ctx.prevAiMoves.length; i++){
    var token = ctx.prevAiMoves[i];
    friendlySources[token]++;
    var playerToken = ctx.playerOneMoves[i];
    enemySources[playerToken]++;
  }

  return [friendlySources, enemySources];
}

function greedyFitnessChange(nodeID, friendlyNodeStatus, tokenInfluences, isAdd, recursive, primaryFlipped){ //accounts for increase in fitness of surrounding nodes here
  //primaryFlipped lets the fitnessChangeCalculation know to subtract one enemy source.
  var fitness = fitnessChangeCalculation(nodeID, isAdd, tokenInfluences, primaryFlipped);
  var additionalFitness = 0;
  if (recursive){
    var isFlippedModifier = false;
    if(ctx.formattedPeeps[nodeID][2] != friendlyNodeStatus){ //we adjust the influences for the surrounding nodes if the primary node converts to friendly
      isFlippedModifier = true;
    }
    additionalFitness = fitness; //accounts for the increase in the primary node for both rounds
    var connectedNodes = [];

    //increments influences from neighbours
    ctx.formattedConnections.forEach(function (connection){
      if (connection[0] == nodeID){
        additionalFitness += (fitness * greedyFitnessChange(connection[1], friendlyNodeStatus, tokenInfluences, isAdd, false, primaryFlipped));
      }
      else if (connection[1] == nodeID){
        additionalFitness += (fitness * greedyFitnessChange(connection[0], friendlyNodeStatus, tokenInfluences, isAdd, false, primaryFlipped));
      }
    });
  }

  return fitness + additionalFitness;
}

function fitnessChangeCalculation(nodeID, isAdd, tokenInfluences, primaryFlipped){
  var modifier = (primaryFlipped ? 1 : 0);
  var initialFitness = tokenInfluences[0][nodeID] / (tokenInfluences[0][nodeID] + tokenInfluences[1][nodeID]);
  var finalFitness;
  if (isAdd){
    finalFitness = (tokenInfluences[0][nodeID] + 1) / (tokenInfluences[0][nodeID] + tokenInfluences[1][nodeID] + 1 - modifier);
  }
  else{
    if (tokenInfluences[0][nodeID] < 2){ //prevents /0 error
      finalFitness = 0;
    }
    else{
      finalFitness = tokenInfluences[0][nodeID] - 1 / (tokenInfluences[0][nodeID] + tokenInfluences[1][nodeID] - 1 - modifier);
    }
  }
  console.log("F"+finalFitness+"_"+initialFitness);
  return finalFitness - initialFitness;
}

module.exports = aiTurnSimpleGreedy;
