//Greedy strategy, i.e. maximising expected increase in opinions spread for the next turn
GameState.prototype.aiTurnSimpleGreedy = function(aiMoves, removeOld){

  //We know at the point one player is AI, this retrieves their previous moves.
  //array of [AI(friendly from this POV), Player(enemy)] moves

  console.log("SimpleGreedy: "+aiMoves);
  var tokensArray;
  tokensArray = [this.playerTwoMoves, this.playerOneMoves];
  friendlyNodeStatus = 0;
  console.log("Prevmovecheck for greedy onetoken");
  console.log(this.prevAiMoves);
  if(removeOld){
    var index = this.worstTokenGreedy(this.prevAiMoves, tokensArray, friendlyNodeStatus);
    this.prevAiMoves.splice(index, 1);
  }
  var peepIndex = this.bestNodeGreedy(tokensArray, friendlyNodeStatus);
  this.prevAiMoves.push(peepIndex);
  this.prevAiMoves.forEach(function(peep){
    aiMoves.push(peep); //TODO: move this to the main AI move function, no need to repeat code for each strategy.
  });
  console.log(aiMoves);
  console.log("DONE");
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

//Returns an array that gives the % increase for each node, given one additional token.
GameState.prototype.createTokenImpactList = function(){
  var infectedStates = []; //Will contain 0 for uninfected, 1 for infected (colour doesn't matter)
  var tokenImpact = []; //Final % change for the node
  var enemySources = []; //Checks if there are enemy sources. If entirely friendly sources, adding will not change %, so has value 0.

  //Initialises some useful variables
  this.formattedPeeps.forEach(function (peep, index){
    //-1 is the value for neutral, so 1 or 0 is infected by either player.
    infectedStates.push(peep[2]);
    tokenImpact.push(0); //adds a value for each node for use later. impact% is 1/(infected neighbours + tokens + 1)
    enemySources.push(0);
  });

  //Accounts for neighbour influences
  this.formattedConnections.forEach(function(connection){
    if(infectedStates[connection[0]] >= 0){ //i.e. is 0 or 1, infected by either player.
      tokenImpact[connection[1]]++; //Adds the infected neighbour to this node's number of infected sources.
      enemySources[connection[1]]+= infectedStates[connection[0]]; //TEST: Should ONLY ever increment. 1 for each enemy source.
    }
    if(infectedStates[connection[1]] >= 0){
      tokenImpact[connection[0]]++; //Does the same for the other node in the pair.
      enemySources[connection[0]]+= infectedStates[connection[1]];
    }
  });

  //Accounts for both players' tokens
  for(var i=0; i < this.prevAiMoves.length; i++){
    var token = this.prevAiMoves[i];
    tokenImpact[token]++;
    enemySources[token]++;
    var playerToken = this.playerOneMoves[i];
    tokenImpact[playerToken]++;
    enemySources[token]++;
  }

  for (var i=0; i<tokenImpact.length; i++){
    if (tokenImpact[i] > 0 && enemySources[i] == 0){ //Node has influences, but all are friendly, so adding more gets 0% increase.
      tokenImpact[i] = 0;
    }
    else{
      tokenImpact[i] = (1 / (1 + tokenImpact[i])); //% increase is 1  (1 + all tokens + all infected connections) E.g. a 0% node with 2 enemy influences becomes 33%. A 0% node with non becomes 100%.
    }
  }

  return tokenImpact;
}

returns the id of the node whose token/s have the worst fitness, using a greedy strategy
GameState.prototype.worstTokenGreedy = function(aiMoves, tokensArray, friendlyNodeStatus){
  var worstTokensID = [];
  var worstTokenValue = 100;
  console.log("worsttokengreedy");

  aiMoves.forEach(function(token){
    var fitness = this.greedyFitnessChange(token, tokensArray, friendlyNodeStatus, false, true);
    console.log(token+"="+fitness);

    if (fitness < worstTokenValue){
      worstTokensID = [token];
      worstTokenValue = fitness;
    }
    else if (fitness == worstTokenValue){
      worstTokensID.push(token);
    }
  },this);
  console.log("Worst token + val:");
  console.log(worstTokensID);
  console.log(worstTokenValue);
  var index = Math.floor(Math.random() * worstTokensID.length); //Selects all equally-bad nodes at random
  return worstTokensID[index];
}

GameState.prototype.greedyFitnessChange = function(nodeID, tokensArray, friendlyNodeStatus, isAdd, recursive){
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
  console.log("NODE: "+ nodeID + recursive + " " + friendlyInfluences + " " + enemyInfluences);

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
  if (recursive && isAdd){
    postFitness = (friendlyInfluences + 1) / (friendlyInfluences + 1) + enemyInfluences;
  }
  else if(recursive && !isAdd){
    if (friendlyInfluences > 1){
      postFitness = (friendlyInfluences - 1) / (friendlyInfluences - 1) + enemyInfluences;
    }
    else{ postFitness = 0;}
  }

  //Should be positive for isAdd=true, negative otherwise
  var fitnessChange = postFitness - fitness;
  //console.log(postFitness);
  //console.log("CHANGE: "+fitnessChange);

  if (recursive){
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
