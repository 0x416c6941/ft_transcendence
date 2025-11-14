// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract TournamentStorage {
    mapping(string => string) private tournaments;
    
    event TournamentSaved(string uuid);
    
    function saveTournament(string memory uuid, string memory data) public {
        require(bytes(tournaments[uuid]).length == 0, "Tournament already exists - cannot overwrite");
        tournaments[uuid] = data;
        emit TournamentSaved(uuid);
    }
    
    function getTournament(string memory uuid) public view returns (string memory) {
        return tournaments[uuid];
    }
    
    function tournamentExists(string memory uuid) public view returns (bool) {
        return bytes(tournaments[uuid]).length > 0;
    }
}
