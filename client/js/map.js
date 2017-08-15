var AtomTypes = {
  NONE      : 0, // no special behavior
  SIGN      : 1, // display a message upon being bumped into
  DOOR      : 2,
  CONTAINER : 3,
  ICE       : 4,
  ESCALATOR : 5,
};

var AtomLayers = {
  TURF      : 0,
  OBJ       : 1,
  MOB       : 2,
  FLY       : 3,
};

// world map
var MapTiles  = [];
var MapWidth  = 60;
var MapHeight = 60;
var MapObjs   = [];
var IconSheets = [];

var AtomFields = {

};

function CloneAtom(atom) {
  return JSON.parse(JSON.stringify(atom));
}

function initMap() {
  IconSheets[0] = document.getElementById("potluck");

  // Initialize the map
  for(var i=0; i<MapWidth; i++) {
    MapTiles[i] = [];
    MapObjs[i] = [];
    for(var j=0; j<MapHeight; j++) {
      MapTiles[i][j] = Predefined.grass;
      MapObjs[i][j] = [];
    }
  }
}
