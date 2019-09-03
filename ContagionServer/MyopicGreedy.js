//Greedy strategy, i.e. maximising expected increase in opinions spread for the next turn
GameState.prototype.aiTurnSimpleGreedy = function(aiMoves, removeOld){

  //We know at the point one player is AI, this retrieves their previous moves.
  //array of [AI(friendly from this POV), Player(enemy)] moves

  console.log("SimpleGreedy: "+aiMoves);
  friendlyNodeStatus = 0;
  console.log("Prevmovecheck for greedy onetoken");
  console.log(this.prevAiMoves);

  var tokenInfluences = this.createTokenInfluencesList();

  if(removeOld){
    this.greedyNodeSelection(friendlyNodeStatus, tokenInfluences, true); //true to remove worst
  }
  else{
    this.greedyNodeSelection(friendlyNodeStatus, tokenInfluences, false); //false to just add best
  }
  console.log("DONE");
}

//returns the id of the best node by fitness, using a greedy strategy
GameState.prototype.greedyNodeSelection = function(friendlyNodeStatus, tokenInfluences, findWorst){
  var bestNodesID = [-1];
  var bestNodeValue = -1;

  if (findWorst){
    var worstTokensID = [-1];
    var worstTokenValue = 100;
    console.log("worsttokengreedy");
  }
  console.log("bestgreedy");
  for(i=0; i<this.formattedPeeps.length; i++){
    var fitness = this.greedyFitnessChange(i, friendlyNodeStatus, tokenInfluences, true, true); //penultimate is 'isAdd', 2nd is recursive
    console.log(i+"="+fitness);

    if (fitness > bestNodeValue){
      bestNodesID = [i];
      bestNodeValue = fitness;
    }
    else if (fitness == bestNodeValue){
      bestNodesID.push(i);
    }
    if (findWorst){
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
  this.prevAiMoves.push(index);
  this.prevAiMoves.forEach(function(peep){
    aiMoves.push(peep); //TODO: move this to the main AI move function, no need to repeat code for each strategy.
  });
  console.log(aiMoves);

  if(findWorst){
    console.log("Worst token + val:");
    console.log(worstTokensID);
    console.log(worstTokenValue);
    var index = worstTokensID[Math.floor(Math.random() * worstTokensID.length)]; //Selects all equally-bad nodes at random
    for(var x=0; x<this.prevAiMoves.length; x++){
      if (prevAiMoves[x] == index){
        this.prevAiMoves.splice(x,1);
        return;
      }
    }
    console.log("ERROR GREEDY #4");
  }

}

//Returns two arrays containing the friendly and enemy influences for each node.
GameState.prototype.createTokenInfluencesList = function(){
  var infectedStates = []; //Will contain 0 for uninfected, 1 for infected (colour doesn't matter)
  var friendlySources = []; //Final % change for the node
  var enemySources = []; //Checks if there are enemy sources. If entirely friendly sources, adding will not change %, so has value 0.

  //Initialises some useful variables
  this.formattedPeeps.forEach(function (peep, index){
    //-1 is the value for neutral, so 1 or 0 is infected by either player.
    infectedStates.push(peep[2]);
    friendlySources.push(0); //adds a value for each node for use later. impact% is 1/(infected neighbours + tokens + 1)
    enemySources.push(0);
  });

  //Accounts for neighbour influences
  this.formattedConnections.forEach(function(connection){
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
  for(var i=0; i < this.prevAiMoves.length; i++){
    var token = this.prevAiMoves[i];
    friendlySources[token]++;
    var playerToken = this.playerOneMoves[i];
    enemySources[playerToken]++;
  }

  return [friendlySources, enemySources];
}

GameState.prototype.greedyFitnessChange = function(nodeID, friendlyNodeStatus, tokenInfluences, isAdd, recursive){
  var fitness = 0;

  // for (var i=0; i<tokenInfluences.length; i++){
  //   if (tokenInfluences[i] > 0 && enemySources[i] == 0){ //Node has influences, but all are friendly, so adding more gets 0% increase.
  //     tokenInfluences[i] = 0;
  //   }
  //   else{
  //     tokenInfluences[i] = (1 / (1 + tokenInfluences[i])); //% increase is 1  (1 + all tokens + all infected connections) E.g. a 0% node with 2 enemy influences becomes 33%. A 0% node with non becomes 100%.
  //   }
  // }

  if (isAdd){

  }

  else{

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

    //TODO: If enemy influence becomes positive!
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
