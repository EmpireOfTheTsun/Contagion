class ServerToClientPeep {
  constructor(id, infected) { //+ last player's move?
    this.id = id;
    this.infected = infected;
  }
}

/*
See ClientToServerPeep for discussion

Player -> Server = ID, Player Moves
Server -> Player = ID, Infected, Other Player's Last Move?

 */
