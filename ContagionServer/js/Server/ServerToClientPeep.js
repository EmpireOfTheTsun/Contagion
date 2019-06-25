class ServerToClientPeep {
  constructor(infected, enemyMove) { //+ last player's move?
    this.infected = infected;
    this.enemyMove = enemyMove;
  }
}

/*
See ClientToServerPeep for discussion

Player -> Server = ID, Player Moves
Server -> Player = ID, Infected, Other Player's Last Move?

 */
