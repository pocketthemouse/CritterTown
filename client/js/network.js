let socket;

const SERVERSPECIES = "0000/0001"

function connect() {
  say('Connecting to server...', SERVERSPECIES, "Determined")
  socket = new WebSocket(`ws://${location.hostname}:12550`)
  
  socket.onopen = function (event) {
    say('Connected!', SERVERSPECIES, "Happy")

    let idn_args = {
      "features": {}
    };

    sendCmd("IDN", idn_args);
  }

  socket.onerror = function (event) {
    say("Socket error", 'error_message');
  }

  socket.onclose = function (event) {
    say("Connection closed", 'error_message');
  }

  socket.onmessage = handleMessage;
}

function sendCmd(type, args) {
  console.log(">>", type, args);
  if(args) 
    socket.send(`${type} ${JSON.stringify(args)}`)
  else
    socket.send(type)
}

function handleMessage(message) {
  let cmd = message.data.slice(0, 3)
  let args = message.data.length > 3 ? JSON.parse(message.data.slice(4)) : {}
  console.log( "<<", cmd, args )

  if (cmd in messageHandlers)
    messageHandlers[cmd](args)
}

let messageHandlers = {
  CMD: msgHandler,
  MSG: msgHandler,
  WHO: whoHandler,
  MOV: movHandler,
  PIN: pinHandler,
  MAP: mapHandler,
  MAI: maiHandler,
  IMG: imgHandler
}

function msgHandler(args) {
  let species = SERVERSPECIES
  let portrait = args.portrait || "Normal"

  if ( args.id ) {
    species = objects[args.id].species
    objects[args.id].cry.play()
  }

  if ( args.name ) {
    say( `${args.name}: ${args.text}`, species, portrait, args.class )
  } else {
    say( `Server Message: ${args.text}`, species, portrait, args.class )
  }
}

function whoHandler(args) {
  if (args.list) {
    Object.values(args.list).forEach((objData) => {
      objects[objData.id] = new Critter(objData)
    })
  }
  if (args.add) {
    objects[args.add.id] = new Critter(args.add)
  }
  if (args.remove) {
    delete objects[args.remove]
  }
  if (args.you) {
    me = args.you
  }
  if (args.new_id) {
    objects[args.new_id.new_id] = objects[args.new_id.id]
    delete objects[args.new_id.id]

    if (me == args.new_id.id) {
      me = args.new_id.new_id
    }
  }
}

function movHandler(args) {
  if (args.animation) {
    objects[args.id]?.queueAnimation(args.animation)
  }

  objects[args.id]?.moveTo({
    x: args?.to?.[0],
    y: args?.to?.[1],
    facing: Facing.fromTilemapIndex(args.dir)
  })
}

function pinHandler(args) {
  sendCmd("PIN")
}

function mapHandler(args) {
  let map = townmaps[args.id || here]
  if (!map) { return }

  worldDirty = true

  args.turf.forEach((tile) => {
    map.setTile({
      x: tile[0],
      y: tile[1],
      tile: tile[2]
    })
  })
}

function maiHandler(args) {
  let map = new TownMap({
    id: args.id,
    width: args.size[0],
    height: args.size[1],
    name: args.name,
    defaultTile: args.default
  })

  townmaps[map.id] = map
  here = map.id
}

function imgHandler(args) {
  if (!iconSheets[args.id]) {
    iconSheets[args.id] = new Image()
  } 

  iconSheets[args.id].src = args.url
}
